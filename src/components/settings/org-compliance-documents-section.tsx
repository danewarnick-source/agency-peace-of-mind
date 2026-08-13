// Org-level compliance document cards, gated by which service codes the
// org actually runs (prompts 18/19/23, Provider Licensing Hub):
//   - OL Residential Support License / Certification — RHS orgs only.
//   - OL Day Treatment License / Day Support Certification — DSG/DSP/EPR orgs only.
//   - USOR Approved Vendor — Job Coaching — SEI orgs only.
//   - USOR Approved Vendor — Job Development — SJD orgs only.
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
const USOR_SEI_FALLBACK_DEADLINE = "2027-01-31T23:59:59";

export function OrgComplianceDocumentsSection() {
  const { codes, isLoading } = useOrgActiveServiceCodes();
  const hasRhs = codes.has("RHS");
  const hasDayCode = codes.has("DSG") || codes.has("DSP") || codes.has("EPR");
  const hasSei = codes.has("SEI");
  const hasSjd = codes.has("SJD");

  if (isLoading || (!hasRhs && !hasDayCode && !hasSei && !hasSjd)) return null;

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {hasRhs && (
        <>
          <OrgComplianceDocCard
            title="OL Residential Support License"
            subtitle="Required by the Office of Licensing for residential programs serving 4 or more Persons."
            documentType="ol_residential_license"
          />
          <OrgComplianceDocCard
            title="OL Residential Support Certification"
            subtitle="Required by the Office of Licensing for residential programs serving 3 or fewer Persons."
            documentType="ol_residential_certification"
          />
        </>
      )}
      {hasDayCode && (
        <>
          <OrgComplianceDocCard
            title="OL Day Treatment License"
            subtitle="Required by the Office of Licensing for day support or employment preparation programs serving 4 or more Persons."
            documentType="ol_day_treatment_license"
          />
          <OrgComplianceDocCard
            title="OL Day Support Certification"
            subtitle="Required by the Office of Licensing for day support or employment preparation programs serving 3 or fewer Persons."
            documentType="ol_day_support_certification"
          />
        </>
      )}
      {hasSei && (
        <UsorVendorCard
          title="USOR Approved Vendor — Job Coaching"
          subtitle="Required for organizations providing SEI."
          documentType="usor_approved_vendor"
          attestationText="I confirm this organization is an approved USOR vendor for job coaching services."
          attestKind="usor_vendor"
          serviceCode="SEI"
          cutover={{ date: SEI_CUTOVER, fallbackDeadline: USOR_SEI_FALLBACK_DEADLINE }}
        />
      )}
      {hasSjd && (
        <UsorVendorCard
          title="USOR Approved Vendor — Job Development"
          subtitle="Required for organizations providing SJD."
          documentType="usor_approved_vendor_job_development"
          attestationText="I confirm this organization is an approved USOR vendor for job development services."
          attestKind="usor_vendor_job_development"
          serviceCode="SJD"
        />
      )}
    </div>
  );
}

/**
 * USOR vendor attestation card. Deadline is 6 months from the org's
 * earliest active service_start_date for the given code — for SEI, orgs
 * that had the code before the DHHS91172 cutover instead get the fixed
 * 1/31/27 fallback deadline (`cutover`).
 */
function UsorVendorCard({
  title,
  subtitle,
  documentType,
  attestationText,
  attestKind,
  serviceCode,
  cutover,
}: {
  title: string;
  subtitle: string;
  documentType: "usor_approved_vendor" | "usor_approved_vendor_job_development";
  attestationText: string;
  attestKind: "usor_vendor" | "usor_vendor_job_development";
  serviceCode: string;
  cutover?: { date: string; fallbackDeadline: string };
}) {
  const { data: org } = useCurrentOrg();
  const orgId = org?.organization_id;
  const qc = useQueryClient();
  const listFn = useServerFn(listUpiAttestations);
  const attestFn = useServerFn(recordUpiAttestation);

  const attestQ = useQuery({
    enabled: !!orgId,
    queryKey: ["upi-attestations", orgId, attestKind],
    queryFn: () => listFn({ data: { organizationId: orgId!, kind: attestKind } }),
  });
  const attestedAt = attestQ.data?.[0]?.attested_at ?? null;

  // Earliest service_start_date org-wide for this code — proxy for
  // "service-code activation date" / "contract award date" (no dedicated
  // activation-date column exists).
  const startQ = useQuery({
    enabled: !!orgId,
    queryKey: ["usor-earliest-start", orgId, serviceCode],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_billing_codes")
        .select("service_start_date")
        .eq("organization_id", orgId!)
        .eq("service_code", serviceCode)
        .not("service_start_date", "is", null)
        .order("service_start_date", { ascending: true })
        .limit(1);
      if (error) throw error;
      return data?.[0]?.service_start_date as string | null ?? null;
    },
  });

  const deadline = useMemo(() => {
    const earliest = startQ.data;
    if (cutover) {
      if (earliest && earliest < cutover.date) return new Date(cutover.fallbackDeadline);
      if (earliest) {
        const d = new Date(`${earliest}T00:00:00`);
        d.setMonth(d.getMonth() + 6);
        return d;
      }
      return new Date(cutover.fallbackDeadline);
    }
    if (!earliest) return null;
    const d = new Date(`${earliest}T00:00:00`);
    d.setMonth(d.getMonth() + 6);
    return d;
  }, [startQ.data, cutover]);

  const attest = useMutation({
    mutationFn: () => attestFn({ data: { organizationId: orgId!, clientId: null, kind: attestKind, periodLabel: null } }),
    onSuccess: () => {
      toast.success("Attested.");
      qc.invalidateQueries({ queryKey: ["upi-attestations", orgId, attestKind] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <OrgComplianceDocCard
      title={title}
      subtitle={subtitle}
      documentType={documentType}
      attestation={{
        text: attestationText,
        attestedAt,
        deadline,
        busy: attest.isPending,
        onAttest: () => attest.mutate(),
      }}
    />
  );
}
