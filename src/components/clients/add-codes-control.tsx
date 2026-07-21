// Inline DSPD service-code adder. No navigation: pick codes the client
// doesn't already have, click Add → upserts client_billing_codes rows
// (rate 0, units 0 — filled in by the Rates step) and merges the codes
// into clients.authorized_dspd_codes + clients.job_code. Used by the
// readiness card and the onboarding wizard's billing step so the
// "schedulable" / "billable" checks can flip to ✓ in place.
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  CheckboxMultiSelect,
  type CheckboxMultiSelectOption,
} from "@/components/ui/checkbox-multi-select";
import { supabase } from "@/integrations/supabase/client";
import { EVV_SERVICE_CODES } from "@/lib/evv-codes";
import { addClientBillingCodes } from "@/lib/finish-onboarding.functions";
import { CodeAssignedStaff } from "@/components/clients/code-assigned-staff";
import { UserPlus } from "lucide-react";

// Full DSPD code catalog (EVV_SERVICE_CODES is the canonical registry —
// includes every real code, not just the ones with a feature-area mapping).
const ALL_CODE_DEFS = [...EVV_SERVICE_CODES].sort((a, b) => a.code.localeCompare(b.code));

export function AddCodesControl({
  clientId,
  onAdded,
  compact = false,
}: {
  clientId: string;
  onAdded?: () => void;
  compact?: boolean;
}) {
  const qc = useQueryClient();
  const [picked, setPicked] = useState<string[]>([]);
  const [justAdded, setJustAdded] = useState<string[]>([]);

  const existingQ = useQuery({
    queryKey: ["client-codes-summary", clientId],
    queryFn: async () => {
      const [{ data: client }, { data: rows }] = await Promise.all([
        supabase
          .from("clients")
          .select("authorized_dspd_codes")
          .eq("id", clientId)
          .maybeSingle(),
        supabase
          .from("client_billing_codes")
          .select("service_code")
          .eq("client_id", clientId),
      ]);
      const set = new Set<string>();
      for (const c of (client?.authorized_dspd_codes ?? []) as string[]) {
        if (c) set.add(c.toUpperCase());
      }
      for (const r of (rows ?? []) as Array<{ service_code: string | null }>) {
        if (r.service_code) set.add(r.service_code.toUpperCase());
      }
      return set;
    },
  });

  const options: CheckboxMultiSelectOption[] = useMemo(() => {
    const existing = existingQ.data ?? new Set<string>();
    return ALL_CODE_DEFS.filter((c) => !existing.has(c.code)).map((c) => ({
      value: c.code,
      label: c.code,
      sublabel: c.label.replace(`${c.code} — `, ""),
    }));
  }, [existingQ.data]);

  const addFn = useServerFn(addClientBillingCodes);
  const m = useMutation({
    mutationFn: () => addFn({ data: { clientId, codes: picked } }),
    onSuccess: (r) => {
      toast.success(`Added ${r.added} billing code${r.added === 1 ? "" : "s"}.`);
      setJustAdded(picked);
      setPicked([]);
      qc.invalidateQueries({ queryKey: ["client-codes-summary", clientId] });
      qc.invalidateQueries({ queryKey: ["client-billing-codes"] });
      qc.invalidateQueries({ queryKey: ["client-readiness", clientId] });
      qc.invalidateQueries({ queryKey: ["finish-onboarding", clientId] });
      qc.invalidateQueries({ queryKey: ["scheduler-data"] });
      qc.invalidateQueries({ queryKey: ["caseload"] });
      qc.invalidateQueries({ queryKey: ["clients"] });
      onAdded?.();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (existingQ.isLoading) {
    return <div className="text-xs text-muted-foreground">Loading codes…</div>;
  }

  return (
    <div className="space-y-3">
      <div className={compact ? "flex flex-col gap-2 sm:flex-row sm:items-start" : "space-y-2"}>
        <div className="min-w-0 flex-1">
          <CheckboxMultiSelect
            value={picked}
            onChange={setPicked}
            options={options}
            placeholder="Pick DSPD service codes…"
            searchPlaceholder="Filter codes…"
            emptyLabel={options.length === 0 ? "Client already has every known code." : "No matches"}
            chipMonospace
          />
        </div>
        <Button
          size="sm"
          onClick={() => m.mutate()}
          disabled={m.isPending || picked.length === 0}
        >
          {m.isPending ? "Adding…" : `Add${picked.length ? ` ${picked.length}` : ""}`}
        </Button>
      </div>
      {justAdded.length > 0 && (
        <div className="space-y-2 rounded-md border border-dashed border-border bg-muted/30 p-2.5">
          <div className="flex items-center gap-1.5 text-xs font-medium">
            <UserPlus className="h-3.5 w-3.5" /> Who should work these codes?
          </div>
          {justAdded.map((code) => (
            <div key={code} className="flex flex-wrap items-center gap-2">
              <code className="rounded bg-background px-1.5 py-0.5 font-mono text-[11px]">{code}</code>
              <CodeAssignedStaff clientId={clientId} code={code} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
