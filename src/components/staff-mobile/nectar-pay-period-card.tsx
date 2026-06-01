import { Link } from "@tanstack/react-router";
import { Sparkles, ChevronRight, FileText, CalendarX } from "lucide-react";
import { useNectarPayPeriod } from "@/hooks/use-nectar-pay-period";

const fmtHours = (n: number) => `${n.toFixed(1)} hrs`;
const fmtUSD = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });

/**
 * NECTAR pay-period summary card. Surfaced at the top of My Caseload as the
 * branded intelligence layer. Navy fill, amber NECTAR label, live indicator.
 */
export function NectarPayPeriodCard() {
  const { data, isLoading } = useNectarPayPeriod();

  const label = data?.label ?? "Current period";
  const hours = data?.hours_total ?? 0;
  const pay = data?.est_gross_pay ?? 0;
  const logs = data?.outstanding_daily_logs ?? 0;
  const days = data?.incomplete_attendance_days ?? 0;

  return (
    <section
      aria-label="NECTAR pay-period summary"
      className="overflow-hidden rounded-2xl border border-[#1f2752] bg-[#141a3d] text-white shadow-[0_10px_30px_-18px_rgba(13,17,43,0.6)]"
    >
      <header className="flex items-center justify-between gap-3 px-4 pt-4">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[image:var(--gradient-amber)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[color:var(--navy-900,#0d112b)]">
            <Sparkles className="h-3 w-3" /> NECTAR
          </span>
          <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/70">
            <span className="relative inline-flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#15a06a] opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[#15a06a]" />
            </span>
            Live
          </span>
        </div>
        <span className="text-[11px] font-medium text-white/70">{label}</span>
      </header>

      <div className="grid grid-cols-2 gap-2 px-4 pt-3">
        <div className="rounded-xl bg-white/[0.06] px-3 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-white/60">
            Hours this period
          </p>
          <p className="mt-1 font-mono text-2xl font-bold tabular-nums">
            {isLoading ? "—" : fmtHours(hours)}
          </p>
        </div>
        <div className="rounded-xl bg-white/[0.06] px-3 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-white/60">
            Est. gross pay
          </p>
          <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-[color:var(--amber-500,#f4a93a)]">
            {isLoading ? "—" : fmtUSD(pay)}
          </p>
          <p className="text-[10px] font-medium text-[color:var(--amber-500,#f4a93a)]/80">
            before taxes
          </p>
        </div>
      </div>

      <div className="mt-3 border-t border-white/10 px-4 py-3">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-white/60">
          Needs your attention
        </p>
        <ul className="mt-2 flex flex-col gap-1.5">
          <li>
            <Link
              to="/dashboard/daily-logs"
              className="flex min-h-[44px] items-center justify-between gap-3 rounded-lg bg-white/[0.04] px-3 py-2 text-sm font-medium text-white transition hover:bg-white/[0.09] active:scale-[0.99]"
            >
              <span className="inline-flex items-center gap-2">
                <FileText className="h-4 w-4 text-[color:var(--amber-500,#f4a93a)]" />
                Daily logs outstanding
              </span>
              <span className="inline-flex items-center gap-2">
                <span className="rounded-full bg-[color:var(--amber-500,#f4a93a)] px-2 py-0.5 font-mono text-xs font-bold tabular-nums text-[color:var(--navy-900,#0d112b)]">
                  {logs}
                </span>
                <ChevronRight className="h-4 w-4 text-white/60" />
              </span>
            </Link>
          </li>
          <li>
            <Link
              to="/dashboard/timeclock"
              className="flex min-h-[44px] items-center justify-between gap-3 rounded-lg bg-white/[0.04] px-3 py-2 text-sm font-medium text-white transition hover:bg-white/[0.09] active:scale-[0.99]"
            >
              <span className="inline-flex items-center gap-2">
                <CalendarX className="h-4 w-4 text-[color:var(--amber-500,#f4a93a)]" />
                Monthly attendance incomplete
              </span>
              <span className="inline-flex items-center gap-2">
                <span className="rounded-full bg-[color:var(--amber-500,#f4a93a)] px-2 py-0.5 font-mono text-xs font-bold tabular-nums text-[color:var(--navy-900,#0d112b)]">
                  {days}
                </span>
                <ChevronRight className="h-4 w-4 text-white/60" />
              </span>
            </Link>
          </li>
        </ul>
      </div>
    </section>
  );
}
