import { useMemo, useState } from "react";
import { AlertTriangle, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useServerFn } from "@tanstack/react-start";
import { dismissUiPref } from "@/lib/ui-dismissals.functions";
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
 *  - each panel offers "Open the form" (caller wires the navigation) OR
 *    explicit dismissal with required reason
 *  - calls `onAllResolved(true|false)` whenever resolution state changes,
 *    so the parent submit handler can gate accordingly
 *
 * Recording: dismissals are persisted via the existing user_ui_dismissals
 * server fn with key `nectar_trigger:{type}:{client}:{date}`. The reason is
 * kept in component state (the dismissals table has no value column).
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
  const [resolved, setResolved] = useState<Record<TriggerKind, boolean>>({
    incident: false,
    appointment: false,
  });
  const [reasons, setReasons] = useState<Record<TriggerKind, string>>({
    incident: "",
    appointment: "",
  });
  const dismissFn = useServerFn(dismissUiPref);

  const unresolved = hits.filter((h) => !resolved[h.kind]);
  // Surface resolution status upward whenever it changes.
  const allResolved = unresolved.length === 0;
  // Defer the callback until after render via microtask to avoid setState-in-render.
  Promise.resolve().then(() => onAllResolved?.(allResolved));

  if (!hits.length) return null;

  return (
    <div className="space-y-3">
      {hits.map((hit) => {
        const isResolved = resolved[hit.kind];
        return (
          <div
            key={hit.kind}
            className={`rounded-lg border p-3 text-sm ${
              isResolved
                ? "border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30"
                : "border-amber-400 bg-amber-50 dark:bg-amber-950/30"
            }`}
          >
            <div className="flex items-start gap-2">
              <AlertTriangle
                className={`mt-0.5 h-4 w-4 shrink-0 ${
                  isResolved ? "text-emerald-600" : "text-amber-600"
                }`}
              />
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  Nectar noticed this note mentions <span className="font-mono">"{hit.term}"</span>.{" "}
                  {triggerLabel(hit.kind)} may be required.
                </p>
                {isResolved ? (
                  <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-300">
                    Resolved — you can submit this note.
                  </p>
                ) : (
                  <div className="mt-2 space-y-2">
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => {
                          onOpenForm(hit.kind);
                          setResolved((r) => ({ ...r, [hit.kind]: true }));
                        }}
                      >
                        <ExternalLink className="mr-1 h-3.5 w-3.5" />
                        Open {hit.kind === "incident" ? "Incident Report" : "Appointment Log"}
                      </Button>
                    </div>
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
                            setResolved((r) => ({ ...r, [hit.kind]: true }));
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
