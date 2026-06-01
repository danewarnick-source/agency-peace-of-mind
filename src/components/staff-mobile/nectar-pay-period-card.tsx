import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Sparkles, ChevronDown, ChevronRight, FileText, CalendarX,
} from "lucide-react";
import {
  useNectarPayPeriod, useLivePayPeriod,
} from "@/hooks/use-nectar-pay-period";
import { useCountUp } from "@/hooks/use-count-up";
import { HexWatermark } from "@/components/brand/hex-watermark";

const fmtHours = (n: number) => `${n.toFixed(1)} hrs`;
const fmtUSD = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });

/**
 * Slim NECTAR pay-period pill — expands on tap. Hours/pay count up on load
 * and tick live while a shift is active. Hex watermark reinforces brand.
 */
export function NectarPayPeriodCard() {
  const { data } = useNectarPayPeriod();
  const live = useLivePayPeriod();
  const [open, setOpen] = useState(false);

  const label = data?.label ?? "Current period";
  // Count up to the static base on load; once a shift is live, mirror the
  // live total directly so the second-by-second tick is smooth.
  const animatedHours = useCountUp(data?.hours_total ?? 0);
  const animatedPay = useCountUp(data?.est_gross_pay ?? 0);
  const hours = live.isLive ? live.hoursTotal : animatedHours;
  const pay = live.isLive ? live.payTotal : animatedPay;
  const logs = data?.outstanding_daily_logs ?? 0;
  const days = data?.incomplete_attendance_days ?? 0;
  const todo = logs + days;

  return (
    <section
      aria-label="NECTAR pay-period summary"
      className="relative overflow-hidden rounded-2xl border border-[#1f2752] bg-[#141a3d] text-white shadow-[0_12px_30px_-20px_rgba(13,17,43,0.6)]"
    >
      <HexWatermark size={120} className="-right-6 -top-6" opacity={0.07} />

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="nectar-pay-period-details"
        className="relative flex w-full items-center gap-3 px-4 py-3 text-left transition active:bg-white/[0.04]"
      >
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[image:var(--gradient-amber)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[#412402]">
          <Sparkles className="h-3 w-3" /> NECTAR
        </span>

        <span className="min-w-0 flex-1 truncate font-mono text-sm font-semibold tabular-nums text-white">
          {fmtHours(hours)} · {fmtUSD(pay)}
          {live.isLive && (
            <span className="ml-2 inline-flex items-center gap-1 align-middle text-[10px] font-semibold uppercase tracking-wider text-[#9cf2c8]">
              <span className="relative inline-flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#15a06a] opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#15a06a]" />
              </span>
              live
            </span>
          )}
        </span>

        {todo > 0 && (
          <span className="shrink-0 rounded-full bg-[image:var(--gradient-amber)] px-2 py-0.5 font-mono text-[11px] font-bold tabular-nums text-[#412402]">
            {todo} to do
          </span>
        )}

        <ChevronDown
          className={`h-4 w-4 shrink-0 text-white/80 transition-transform ${
            open ? "rotate-180" : ""
          }`}
          aria-hidden
        />
      </button>

      {open && (
        <div
          id="nectar-pay-period-details"
          className="relative border-t border-white/10 px-4 pb-4 pt-3"
        >
          <p className="text-[11px] font-semibold uppercase tracking-wider text-white/80">
            Pay period · {label}
          </p>

          <div className="mt-2 grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-white/[0.06] px-3 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-white/80">
                Hours this period
              </p>
              <p className="mt-1 font-mono text-2xl font-bold tabular-nums">
                {fmtHours(hours)}
              </p>
            </div>
            <div className="rounded-xl bg-white/[0.06] px-3 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-white/80">
                Est. gross pay
              </p>
              <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-[#f4a93a]">
                {fmtUSD(pay)}
              </p>
              <p className="text-[10px] font-semibold text-[#f4a93a]">
                before taxes
              </p>
            </div>
          </div>

          <p className="mt-4 text-[11px] font-semibold uppercase tracking-wider text-white/80">
            Needs your attention
          </p>
          <ul className="mt-2 flex flex-col gap-1.5">
            <li>
              <Link
                to="/dashboard/daily-logs"
                className="flex min-h-[44px] items-center justify-between gap-3 rounded-lg bg-white/[0.06] px-3 py-2 text-sm font-medium text-white transition hover:bg-white/[0.12] active:scale-[0.99]"
              >
                <span className="inline-flex items-center gap-2">
                  <FileText className="h-4 w-4 text-[#f4a93a]" />
                  Daily logs outstanding
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className="rounded-full bg-[image:var(--gradient-amber)] px-2 py-0.5 font-mono text-xs font-bold tabular-nums text-[#412402]">
                    {logs}
                  </span>
                  <ChevronRight className="h-4 w-4 text-white/80" />
                </span>
              </Link>
            </li>
            <li>
              <Link
                to="/dashboard/timeclock"
                className="flex min-h-[44px] items-center justify-between gap-3 rounded-lg bg-white/[0.06] px-3 py-2 text-sm font-medium text-white transition hover:bg-white/[0.12] active:scale-[0.99]"
              >
                <span className="inline-flex items-center gap-2">
                  <CalendarX className="h-4 w-4 text-[#f4a93a]" />
                  Monthly attendance incomplete
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className="rounded-full bg-[image:var(--gradient-amber)] px-2 py-0.5 font-mono text-xs font-bold tabular-nums text-[#412402]">
                    {days}
                  </span>
                  <ChevronRight className="h-4 w-4 text-white/80" />
                </span>
              </Link>
            </li>
          </ul>
        </div>
      )}
    </section>
  );
}
