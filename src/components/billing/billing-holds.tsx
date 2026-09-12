/**
 * Admin surface for the three DSPD lanes + billing holds.
 * Reuses evaluateEntryReadiness — no second checklist.
 */
import { Link } from "@tanstack/react-router";
import { AlertTriangle, CheckCircle2, ChevronRight } from "lucide-react";
import type {
  BillingHold,
  BillingEligibilityStatus,
  EntryReadiness,
  NoteCompletenessStatus,
  StaffReadinessStatus,
} from "@/lib/dspd-entry-readiness";

const STAFF_LABEL: Record<StaffReadinessStatus, string> = {
  ready: "Staff ready",
  blocked: "Staff blocked",
};

const NOTE_LABEL: Record<NoteCompletenessStatus, string> = {
  complete: "Note complete",
  incomplete: "Note incomplete",
};

const BILLING_LABEL: Record<BillingEligibilityStatus, string> = {
  eligible: "Billing eligible",
  held: "Billing held",
};

function chipClass(ok: boolean): string {
  return ok
    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200"
    : "border-rose-400/50 bg-rose-500/10 text-rose-800 dark:text-rose-200";
}

export function EntryReadinessChips({ result }: { result: EntryReadiness }) {
  return (
    <div className="flex flex-wrap gap-1.5" data-testid="entry-readiness-chips">
      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${chipClass(result.staff.status === "ready")}`}>
        {STAFF_LABEL[result.staff.status]}
      </span>
      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${chipClass(result.note.status === "complete")}`}>
        {NOTE_LABEL[result.note.status]}
      </span>
      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${chipClass(result.billing.status === "eligible")}`}>
        {BILLING_LABEL[result.billing.status]}
      </span>
    </div>
  );
}

export function BillingHoldsList({
  holds,
  emptyLabel = "No billing holds on this entry.",
}: {
  holds: BillingHold[];
  emptyLabel?: string;
}) {
  if (holds.length === 0) {
    return (
      <p className="flex items-center gap-1.5 text-sm text-emerald-700 dark:text-emerald-300">
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
        {emptyLabel}
      </p>
    );
  }
  return (
    <ul className="space-y-2" data-testid="billing-holds-list">
      {holds.map((h, i) => (
        <li
          key={`${h.kind}-${h.gap}-${i}`}
          className="rounded-md border border-rose-300/40 bg-rose-500/[0.04] px-3 py-2"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="flex items-start gap-1.5 text-sm font-medium text-foreground">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-700" />
                {h.reason}
              </p>
              <p className="mt-0.5 pl-5 text-xs text-muted-foreground">
                {h.gap}
                {h.requirementId ? ` · requirement ${h.requirementId}` : ""}
              </p>
            </div>
            <Link
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              to={h.clear.to as any}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              params={h.clear.params as any}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              search={h.clear.search as any}
              className="inline-flex shrink-0 items-center text-xs font-semibold text-primary hover:underline"
            >
              {h.clear.label}
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function EntryReadinessPanel({
  result,
  title = "Billing eligibility",
}: {
  result: EntryReadiness;
  title?: string;
}) {
  return (
    <div className="space-y-2" data-testid="entry-readiness-panel">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </p>
        <EntryReadinessChips result={result} />
      </div>
      <p className="text-[11px] text-muted-foreground">
        Note completeness is not billing eligibility. Holds list the gap and the path to clear it.
      </p>
      <BillingHoldsList holds={result.billing.holds} />
    </div>
  );
}
