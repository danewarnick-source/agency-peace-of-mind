import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ShieldAlert, Sparkles, Lock } from "lucide-react";
import {
  attestLoanFeature,
  disableLoanFeature,
  getLoanFeatureStatus,
  LOAN_ATTESTATION_TEXT,
} from "@/lib/client-loans.functions";

export function LoanFeatureGate({
  organizationId,
  children,
}: {
  organizationId: string;
  children: React.ReactNode;
}) {
  const fetchStatus = useServerFn(getLoanFeatureStatus);
  const doAttest = useServerFn(attestLoanFeature);
  const doDisable = useServerFn(disableLoanFeature);
  const qc = useQueryClient();
  const [accepted, setAccepted] = useState(false);

  const q = useQuery({
    queryKey: ["loan-feature-status", organizationId],
    queryFn: () => fetchStatus({ data: { organization_id: organizationId } }),
  });

  const attestMut = useMutation({
    mutationFn: () => doAttest({ data: { organization_id: organizationId, accepted: true } }),
    onSuccess: () => {
      toast.success("Client Loan feature enabled");
      qc.invalidateQueries({ queryKey: ["loan-feature-status", organizationId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not enable feature"),
  });

  const disableMut = useMutation({
    mutationFn: () => doDisable({ data: { organization_id: organizationId } }),
    onSuccess: () => {
      toast.success("Feature disabled");
      qc.invalidateQueries({ queryKey: ["loan-feature-status", organizationId] });
    },
  });

  if (q.isLoading) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  if (q.isError) return <div className="p-6 text-sm text-destructive">{(q.error as any)?.message ?? "Error"}</div>;

  const status = q.data!;
  if (status.enabled) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2 text-xs">
          <span className="text-muted-foreground">
            Client Loan feature is <span className="font-medium text-foreground">enabled</span> for this organization.
          </span>
          <Button variant="ghost" size="sm" onClick={() => disableMut.mutate()}>
            Disable feature
          </Button>
        </div>
        {children}
      </div>
    );
  }

  return (
    <Card className="border-amber-300/60 bg-amber-50/30 dark:bg-amber-950/10">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Lock className="h-5 w-5 text-amber-600" /> Restricted Feature — Client Loan Ledger
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-md border border-amber-300/60 bg-background/60 p-3 text-xs">
          <div className="mb-1 flex items-center gap-1 font-medium text-amber-700">
            <Sparkles className="h-3.5 w-3.5" /> NECTAR — informational only
          </div>
          <p className="text-muted-foreground">
            Provider-to-client lending is regulated differently by state and by Medicaid/DSPD program rules.
            Utah-specific and other state-specific considerations may apply (e.g. waiver conflict-of-interest, fiduciary,
            and consumer-protection rules). NECTAR can surface relevant rules for your review but does
            <span className="font-medium"> not </span>
            issue a legal verdict on whether this is permitted for your organization. Verify with your state and counsel.
          </p>
        </div>

        <div className="rounded-md border border-border bg-background/80 p-3">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <ShieldAlert className="h-4 w-4 text-amber-600" /> Recordkeeping attestation
          </div>
          <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded bg-muted/40 p-3 text-xs leading-relaxed">
{LOAN_ATTESTATION_TEXT}
          </pre>
        </div>

        <label className="flex items-start gap-2 text-sm">
          <Checkbox checked={accepted} onCheckedChange={(c) => setAccepted(!!c)} className="mt-0.5" />
          <span>
            I have read the attestation above, I have authority to make it on behalf of my organization, and
            I accept responsibility for use of this feature.
          </span>
        </label>

        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {status.attestations?.length
              ? `Previous attestations on file: ${status.attestations.length}`
              : "No prior attestations recorded."}
          </span>
          <Button
            disabled={!accepted || attestMut.isPending}
            onClick={() => attestMut.mutate()}
          >
            {attestMut.isPending ? "Recording…" : "Attest & enable feature"}
          </Button>
        </div>
        <p className="text-[10px] italic text-muted-foreground">
          Attestation text is DRAFT — pending legal review. Replace with finalized language before production use.
          The signer and timestamp are logged for audit.
        </p>
      </CardContent>
    </Card>
  );
}
