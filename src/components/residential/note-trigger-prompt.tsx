import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ExternalLink, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { dismissUiPref } from "@/lib/ui-dismissals.functions";
import { hasSubmittedIncidentForClientDate } from "@/lib/incidents.functions";
import { useCurrentOrg } from "@/hooks/use-org";

import {
  scanNoteForTriggers,
  triggerLabel,
  triggerDismissPrompt,
  triggerDismissalKey,
  type NoteTriggerHit,
  type TriggerKind,
} from "@/lib/nectar-triggers";

/**
 * Reusable Nectar trigger block. Pure UI:
 *  - scans `text` on every render
 *  - shows one panel per fired-and-unresolved trigger
 *  - for INCIDENT triggers, "Open the form" no longer self-resolves; the
 *    panel polls hasSubmittedIncidentForClientDate and only flips green
 *    once an actual IR for THIS client+date has been submitted (or the
 *    user records an explicit "No reportable incident occurred" dismissal
 *    with a required reason)
 *  - APPOINTMENT triggers still resolve on open OR dismissal
 *  - calls `onAllResolved(true|false)` whenever resolution state changes,
 *    so the parent submit handler can gate accordingly
 *
 * The incident gate replaces the previous loophole where merely opening the
 * dialog cleared the gate. No third path.
 */
export function NoteTriggerPrompt({
  text,
  clientId,
  date,
  onOpenForm,
  onAllResolved,
}: {
  text: string;
  clientId: string;
  date: string;
  onOpenForm: (kind: TriggerKind) => void;
  onAllResolved?: (resolved: boolean) => void;
}) {
  const hits = useMemo<NoteTriggerHit[]>(() => scanNoteForTriggers(text), [text]);
  const incidentHit = hits.some((h) => h.kind === "incident");

  // Per-kind explicit dismissal state. Appointment also tracks "opened".
  const [appointmentOpened, setAppointmentOpened] = useState(false);
  const [dismissed, setDismissed] = useState<Record<TriggerKind, boolean>>({
    incident: false,
    appointment: false,
  });
  const [reasons, setReasons] = useState<Record<TriggerKind, string>>({
    incident: "",
    appointment: "",
  });
  const dismissFn = useServerFn(dismissUiPref);
  const hasFn = useServerFn(hasSubmittedIncidentForClientDate);
  const { data: org } = useCurrentOrg();
  const activeOrgId = org?.organization_id ?? null;
  const qc = useQueryClient();

  // Reset opened/dismissed when the (client, date) target changes.
  useEffect(() => {
    setAppointmentOpened(false);
    setDismissed({ incident: false, appointment: false });
    setReasons({ incident: "", appointment: "" });
  }, [clientId, date]);

  // Poll: did the user actually submit an IR for this client+date? Only
  // poll while there's an unresolved incident hit, so we don't burn calls.
  const submittedQ = useQuery({
    enabled: incidentHit && !!clientId && !!date && !dismissed.incident && !!activeOrgId,
    queryKey: ["incident-submitted-for", activeOrgId, clientId, date],
    queryFn: () => hasFn({ data: { organization_id: activeOrgId!, client_id: clientId, date } }),
    refetchInterval: 5_000,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  const submittedIr = submittedQ.data?.incident ?? null;

  const isResolved = (kind: TriggerKind): boolean => {
    if (kind === "incident") return !!submittedIr || dismissed.incident;
    return appointmentOpened || dismissed.appointment;
  };
  const unresolved = hits.filter((h) => !isResolved(h.kind));
  const allResolved = unresolved.length === 0;
  // Defer the callback until after render via microtask to avoid setState-in-render.
  Promise.resolve().then(() => onAllResolved?.(allResolved));

  if (!hits.length) return null;

  return (
    <div className="space-y-3">
      {hits.map((hit) => {
        const resolved = isResolved(hit.kind);
        return (
          <div
            key={hit.kind}
            className={`rounded-lg border p-3 text-sm ${
              resolved
                ? "border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30"
                : "border-amber-400 bg-amber-50 dark:bg-amber-950/30"
            }`}
          >
            <div className="flex items-start gap-2">
              {resolved ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              ) : (
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              )}
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  Nectar noticed this note mentions <span className="font-mono">"{hit.term}"</span>.{" "}
                  {triggerLabel(hit.kind)} may be required.
                </p>
                {resolved ? (
                  hit.kind === "incident" && submittedIr ? (
                    <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-300">
                      Resolved — incident report <span className="font-mono">{submittedIr.report_number}</span> submitted for this individual today.
                    </p>
                  ) : (
                    <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-300">
                      Resolved — you can submit this note.
                    </p>
                  )
                ) : (
                  <div className="mt-2 space-y-2">
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => {
                          onOpenForm(hit.kind);
                          if (hit.kind === "appointment") {
                            setAppointmentOpened(true);
                          } else {
                            // Incident: do NOT mark resolved. Force a poll.
                            qc.invalidateQueries({
                              queryKey: ["incident-submitted-for", clientId, date],
                            });
                          }
                        }}
                      >
                        <ExternalLink className="mr-1 h-3.5 w-3.5" />
                        Open {hit.kind === "incident" ? "Incident Report" : "Appointment Log"}
                      </Button>
                      {hit.kind === "incident" && submittedQ.isFetching && (
                        <span className="self-center text-[10px] text-muted-foreground">
                          Checking for a submitted report…
                        </span>
                      )}
                    </div>
                    {hit.kind === "incident" && (
                      <p className="text-[11px] text-amber-800 dark:text-amber-200">
                        Opening the form is not enough — this note can't be submitted
                        until an Incident Report for this individual is <strong>submitted</strong>,
                        or you explicitly record below that no reportable incident occurred.
                      </p>
                    )}
                    <details className="text-xs">
                      <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                        {triggerDismissPrompt(hit.kind)}
                      </summary>
                      <div className="mt-2 space-y-2">
                        <Textarea
                          rows={2}
                          placeholder="Required: short reason this trigger does not apply."
                          value={reasons[hit.kind]}
                          onChange={(e) =>
                            setReasons((r) => ({ ...r, [hit.kind]: e.target.value }))
                          }
                        />
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={reasons[hit.kind].trim().length < 3}
                          onClick={async () => {
                            const key = triggerDismissalKey(hit.kind, clientId, date);
                            try {
                              await dismissFn({ data: { prefKey: key } });
                            } catch {
                              /* graceful: persist failure is non-blocking */
                            }
                            setDismissed((r) => ({ ...r, [hit.kind]: true }));
                          }}
                        >
                          Dismiss with this reason
                        </Button>
                      </div>
                    </details>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
