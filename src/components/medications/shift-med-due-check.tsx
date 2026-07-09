import { useEffect } from "react";
import { Pill, CheckCircle2, ExternalLink, AlertTriangle } from "lucide-react";
import { useShiftMedDueStatus } from "@/hooks/use-shift-med-due-status";

/**
 * Pre-submit medication check for both the EVV clock-out and the HHS daily
 * note. Renders nothing when the client has no dose scheduled in the window.
 * When doses are due, lists them and links out to the real client MAR tab
 * where staff mark each dose Given / Refused / Missed — this component never
 * writes anywhere; the real `emar_logs` row is what resolves it.
 */
export function ShiftMedDueCheck({
  organizationId,
  clientId,
  clientName,
  windowStart,
  windowEnd,
  emarHref,
  onResolvedChange,
}: {
  organizationId: string | null | undefined;
  clientId: string | null | undefined;
  clientName: string;
  windowStart: string | null | undefined;
  windowEnd: string | null | undefined;
  /** Deep link to the client's real MAR tab (e.g. /dashboard/workspace/:id?tab=mar-emar). */
  emarHref: string;
  onResolvedChange: (resolved: boolean) => void;
}) {
  const status = useShiftMedDueStatus({
    organizationId,
    clientId,
    windowStart,
    windowEnd,
  });

  const resolved =
    !status.loading && (status.scheduledDoses.length === 0 || status.allDosesLogged);

  useEffect(() => {
    onResolvedChange(resolved);
  }, [resolved, onResolvedChange]);

  if (status.loading) {
    return (
      <div className="rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
        Checking scheduled medications…
      </div>
    );
  }

  // No dose scheduled in this window → hide entirely.
  if (status.scheduledDoses.length === 0) return null;

  if (status.allDosesLogged) {
    return (
      <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-900 dark:text-emerald-200">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>
            <span className="font-semibold">All scheduled doses logged</span> for {clientName}
            {" "}during this window ({status.scheduledDoses.length}).
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border-2 border-amber-500/50 bg-amber-500/5 p-3 sm:p-4 space-y-3">
      <div className="flex items-start gap-2">
        <Pill className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-snug">
            Medication doses due — {clientName}
          </p>
          <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
            {status.unloggedCount} scheduled dose{status.unloggedCount === 1 ? "" : "s"}{" "}
            {status.unloggedCount === 1 ? "hasn't" : "haven't"} been logged in eMAR yet.
            Log each one Given, Refused, or Missed before finishing.
          </p>
        </div>
      </div>

      <ul className="space-y-1.5">
        {status.scheduledDoses.map((d) => (
          <li
            key={`${d.medication_id}-${d.scheduled_for_iso}`}
            className={`flex flex-wrap items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-xs ${
              d.logged
                ? "border-emerald-500/40 bg-emerald-500/10"
                : "border-amber-500/50 bg-amber-500/10"
            }`}
          >
            <span className="min-w-0 flex-1">
              <span className="font-mono text-[11px]">{d.time_label}</span>{" "}
              <span className="font-medium">{d.medication_name}</span>
              {d.dosage ? <span className="text-muted-foreground"> · {d.dosage}</span> : null}
            </span>
            {d.logged ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="h-3 w-3" /> Logged
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-800 dark:text-amber-200">
                <AlertTriangle className="h-3 w-3" /> Not yet logged
              </span>
            )}
          </li>
        ))}
      </ul>

      <a
        href={emarHref}
        className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-md border border-input bg-primary px-3 text-sm font-semibold text-primary-foreground hover:opacity-90"
      >
        <ExternalLink className="h-4 w-4" /> Log doses in eMAR
      </a>
    </div>
  );
}
