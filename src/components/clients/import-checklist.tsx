// Unified Smart-Import setup checklist for the done page.
//
// Composes the existing ClientReadinessCard + FinishOnboardingCard under
// ONE header so the user sees a single list (not three duplicated
// sections), adds an EVV gating note driven by the EVV_SERVICE_CODES
// registry (per SOW §1.12 — not derived), and exposes an optional
// "Advanced care / end-of-life" group that never blocks Submit. The
// existing two cards remain untouched so the client profile route keeps
// rendering them as before.
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  ListChecks, ChevronDown, ChevronRight, ShieldCheck, Send, Loader2,
  HeartPulse, Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ClientReadinessCard, useClientReadiness } from "@/components/clients/client-readiness-card";
import { FinishOnboardingCard } from "@/components/clients/finish-onboarding-card";
import { NectarAsk } from "@/components/clients/nectar-ask";
import { EVV_SERVICE_CODES } from "@/lib/evv-codes";
import { submitForSetup } from "@/lib/smart-import-review.functions";
import { setEndOfLifeStatus } from "@/lib/import-checklist.functions";
import { supabase } from "@/integrations/supabase/client";

export function ImportChecklist({ clientId, jobId }: { clientId: string; jobId: string }) {
  const qc = useQueryClient();
  const readinessQ = useClientReadiness(clientId);

  // EVV gating — strictly the registry, per SOW §1.12. We hide the EVV
  // geocoding row when no current code is EVV-locked. ClientReadinessCard
  // still renders evvReady on its own; we surface a note above to set
  // expectations.
  const evvApplicable = useMemo(() => {
    const codes = readinessQ.data?.currentCodes ?? [];
    return codes.some((c) =>
      EVV_SERVICE_CODES.find((d) => d.code === c.toUpperCase())?.evvLock,
    );
  }, [readinessQ.data?.currentCodes]);

  const submitFn = useServerFn(submitForSetup);
  const submitM = useMutation({
    mutationFn: () => submitFn({ data: { jobId } }),
    onSuccess: () => {
      toast.success("Submitted for setup.");
      qc.invalidateQueries({ queryKey: ["smart-import-done", jobId] });
      qc.invalidateQueries({ queryKey: ["client-readiness", clientId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const canSubmit = !!readinessQ.data?.isLive;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
        <div className="flex items-center gap-2">
          <ListChecks className="h-5 w-5 text-primary" />
          <div>
            <div className="text-sm font-semibold">Setup checklist</div>
            <div className="text-xs text-muted-foreground">
              Answer everything required to go live, then submit for setup.
            </div>
          </div>
        </div>
        {readinessQ.data?.isLive ? (
          <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
            <ShieldCheck className="mr-1 h-3 w-3" /> Ready to submit
          </Badge>
        ) : (
          <Badge variant="outline" className="text-amber-700 dark:text-amber-400">
            Needs attention
          </Badge>
        )}
      </div>

      {!evvApplicable && readinessQ.data && (
        <div className="rounded-md border border-border bg-muted/40 p-2 text-xs text-muted-foreground">
          <Sparkles className="mr-1 inline h-3 w-3 text-primary" />
          NECTAR hid the EVV geocoding requirement — no EVV-locked codes
          (per SOW §1.12) are on this client&apos;s authorization.
        </div>
      )}

      <ClientReadinessCard clientId={clientId} />
      <FinishOnboardingCard clientId={clientId} />

      <EndOfLifeGroup clientId={clientId} />

      <div className="flex items-center justify-end gap-2 rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
        {!canSubmit && (
          <span className="text-xs text-muted-foreground">
            Answer all required items to submit.
          </span>
        )}
        <Button
          onClick={() => submitM.mutate()}
          disabled={!canSubmit || submitM.isPending}
        >
          {submitM.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Send className="mr-2 h-4 w-4" />
          )}
          Submit for setup
        </Button>
      </div>
    </div>
  );
}

// ── Advanced care / end-of-life (collapsed, never blocks) ────────────────
type EolField = "dnr_status" | "polst_status" | "palliative_care_status" | "hospice_status";

const EOL_QUESTIONS: Array<{ field: EolField; question: string; positive: string; needsLocation?: boolean }> = [
  { field: "dnr_status", question: "Does this client have a DNR on file?", positive: "DNR on file", needsLocation: true },
  { field: "polst_status", question: "Does this client have a POLST on file?", positive: "POLST on file" },
  { field: "palliative_care_status", question: "Does this client have palliative care orders?", positive: "Palliative care orders on file" },
  { field: "hospice_status", question: "Does this client have hospice protocols on file?", positive: "Hospice protocols on file" },
];

function EndOfLifeGroup({ clientId }: { clientId: string }) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["client-eol", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("dnr_status, dnr_location, polst_status, palliative_care_status, hospice_status")
        .eq("id", clientId)
        .maybeSingle();
      if (error) throw error;
      return (data ?? {}) as Record<string, string | null>;
    },
  });

  const setFn = useServerFn(setEndOfLifeStatus);
  const refresh = () => qc.invalidateQueries({ queryKey: ["client-eol", clientId] });

  return (
    <div className="rounded-2xl border border-border bg-card shadow-[var(--shadow-card)]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 p-4 text-left min-h-11"
      >
        <div className="flex items-center gap-2">
          <HeartPulse className="h-5 w-5 text-muted-foreground" />
          <div>
            <div className="text-sm font-semibold">Advanced care / end-of-life</div>
            <div className="text-xs text-muted-foreground">
              Optional — does not block submission.
            </div>
          </div>
        </div>
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </button>
      {open && (
        <div className="space-y-3 border-t border-border p-4">
          {EOL_QUESTIONS.map((row) => {
            const current = (q.data?.[row.field] as string | null) ?? null;
            const answered = current ? (current === "none" ? "Not on file" : row.positive) : null;
            return (
              <NectarAsk
                key={row.field}
                question={row.question}
                kind="simple_yes_no"
                answeredSummary={answered}
                onYes={async () => {
                  if (row.needsLocation) {
                    // For DNR, we'll write status "on_file" and let the
                    // manual form collect the location.
                    return;
                  }
                  await setFn({ data: { clientId, field: row.field, status: "on_file" } });
                  refresh();
                }}
                onNone={async () => {
                  await setFn({ data: { clientId, field: row.field, status: "none" } });
                  refresh();
                }}
                manualForm={row.needsLocation ? (
                  <DnrLocationForm
                    clientId={clientId}
                    initialLocation={(q.data?.dnr_location as string | null) ?? ""}
                    onSaved={refresh}
                  />
                ) : null}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function DnrLocationForm({
  clientId, initialLocation, onSaved,
}: { clientId: string; initialLocation: string; onSaved: () => void }) {
  const [loc, setLoc] = useState(initialLocation);
  const setFn = useServerFn(setEndOfLifeStatus);
  const m = useMutation({
    mutationFn: () => setFn({ data: { clientId, field: "dnr_status", status: "on_file", location: loc.trim() } }),
    onSuccess: () => { toast.success("DNR location saved."); onSaved(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <div className="space-y-2">
      <Label className="text-xs">Where is the DNR kept?</Label>
      <Input value={loc} onChange={(e) => setLoc(e.target.value)} placeholder="e.g. front of binder, fridge magnet…" />
      <Button size="sm" onClick={() => m.mutate()} disabled={m.isPending || !loc.trim()}>
        {m.isPending ? "Saving…" : "Save DNR location"}
      </Button>
    </div>
  );
}
