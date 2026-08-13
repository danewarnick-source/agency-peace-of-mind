// Org-level compliance document cards, gated by which service codes the
// org actually runs (prompts 18/19/23):
//   - OL Residential Support License / Certification — RHS orgs only.
//   - USOR Approved Vendor — Job Coaching — SEI orgs only.
import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-org";
import { useOrgActiveServiceCodes } from "@/hooks/use-org-service-codes";
import { OrgComplianceDocCard } from "@/components/settings/org-compliance-doc-card";
import { listUpiAttestations, recordUpiAttestation } from "@/lib/upi-attestations.functions";

const SEI_CUTOVER = "2026-07-01"; // DHHS91172 effective date
const USOR_FALLBACK_DEADLINE = "2027-01-31T23:59:59";

export function OrgComplianceDocumentsSection() {
  const { codes, isLoading } = useOrgActiveServiceCodes();
  const hasRhs = codes.has("RHS");
  const hasSei = codes.has("SEI");

  if (isLoading || (!hasRhs && !hasSei)) return null;

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {hasRhs && (
        <>
          <OrgComplianceDocCard
            title="Office of Licensing — Residential Support License"
            subtitle="Required for organizations providing RHS. Flags missing or expiring within 60 days."
            documentType="ol_residential_license"
          />
          <OrgComplianceDocCard
            title="Office of Licensing — Residential Support Certification"
            subtitle="For providers with 3 or fewer residential Persons. Flags missing or expiring within 60 days."
            documentType="ol_residential_certification"
          />
        </>
      )}
      {hasSei && <UsorVendorCard />}
    </div>
  );
}

function UsorVendorCard() {
  const { data: org } = useCurrentOrg();
  const orgId = org?.organization_id;
  const qc = useQueryClient();
  const listFn = useServerFn(listUpiAttestations);
  const attestFn = useServerFn(recordUpiAttestation);

  const attestQ = useQuery({
    enabled: !!orgId,
    queryKey: ["upi-attestations", orgId, "usor_vendor"],
    queryFn: () => listFn({ data: { organizationId: orgId!, kind: "usor_vendor" } }),
  });
  const attestedAt = attestQ.data?.[0]?.attested_at ?? null;

  // Earliest SEI service_start_date org-wide — proxy for "SEI service-code
  // activation date" (no dedicated activation-date column exists).
  const seiStartQ = useQuery({
    enabled: !!orgId,
    queryKey: ["sei-earliest-start", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_billing_codes")
        .select("service_start_date")
        .eq("organization_id", orgId!)
        .eq("service_code", "SEI")
        .not("service_start_date", "is", null)
        .order("service_start_date", { ascending: true })
        .limit(1);
      if (error) throw error;
      return data?.[0]?.service_start_date as string | null ?? null;
    },
  });

  const deadline = useMemo(() => {
    const earliest = seiStartQ.data;
    if (earliest && earliest < SEI_CUTOVER) return new Date(USOR_FALLBACK_DEADLINE);
    if (earliest) {
      const d = new Date(`${earliest}T00:00:00`);
      d.setMonth(d.getMonth() + 6);
      return d;
    }
    return new Date(USOR_FALLBACK_DEADLINE);
  }, [seiStartQ.data]);

  const attest = useMutation({
    mutationFn: () => attestFn({ data: { organizationId: orgId!, clientId: null, kind: "usor_vendor", periodLabel: null } }),
    onSuccess: () => {
      toast.success("Attested.");
      qc.invalidateQueries({ queryKey: ["upi-attestations", orgId, "usor_vendor"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <OrgComplianceDocCard
      title="USOR Approved Vendor — Job Coaching"
      subtitle="Required for organizations providing SEI."
      documentType="usor_approved_vendor"
      attestation={{
        text: "I confirm this organization is an approved USOR vendor for job coaching services.",
        attestedAt,
        deadline,
        busy: attest.isPending,
        onAttest: () => attest.mutate(),
      }}
    />
  );
}
