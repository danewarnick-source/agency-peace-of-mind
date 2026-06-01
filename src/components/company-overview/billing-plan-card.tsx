import { Link } from "@tanstack/react-router";
import { CreditCard, ArrowRight } from "lucide-react";

export function BillingPlanCard({
  seatsUsed,
  seatsPurchased,
  nextInvoiceAt,
}: {
  seatsUsed: number;
  seatsPurchased: number | null;
  nextInvoiceAt: string | null;
}) {
  const hasPlan = seatsPurchased != null;
  const utilization = hasPlan && seatsPurchased! > 0 ? Math.round((seatsUsed / seatsPurchased!) * 100) : null;

  return (
    <section className="rounded-2xl border border-[#f4a93a]/40 bg-gradient-to-br from-[#fff8ec] to-[#fef0d6] p-5 shadow-card">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[#0d112b] text-[#f4a93a]">
            <CreditCard className="h-4 w-4" />
          </span>
          <h2 className="font-display text-base font-semibold tracking-tight text-[#0d112b]">Plan & billing</h2>
        </div>
        <span className="rounded-full border border-[#0d112b]/15 bg-white/70 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#0d112b]">
          Company Executive
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-white bg-white/70 p-3">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Seats used</p>
          <p className="mt-1 font-display text-2xl font-bold tabular-nums text-[#0d112b]">
            {seatsUsed}{hasPlan ? ` / ${seatsPurchased}` : ""}
          </p>
          {utilization != null && (
            <p className="mt-0.5 text-xs text-muted-foreground">{utilization}% utilized</p>
          )}
        </div>
        <div className="rounded-xl border border-white bg-white/70 p-3">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Next invoice</p>
          <p className="mt-1 font-display text-2xl font-bold tabular-nums text-[#0d112b]">
            {nextInvoiceAt
              ? new Date(nextInvoiceAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })
              : "—"}
          </p>
          <Link to="/dashboard/billing/subscription" className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-[#7a4a0a] hover:underline">
            Manage plan <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </div>
    </section>
  );
}
