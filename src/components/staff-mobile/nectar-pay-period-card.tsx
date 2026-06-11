import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ChevronDown, ChevronRight, FileText, CalendarX, Clock, CalendarDays, Briefcase, ShieldAlert, BookOpen, CalendarX2,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  useNectarPayPeriod, useLivePayPeriod,
} from "@/hooks/use-nectar-pay-period";
import { useCountUp } from "@/hooks/use-count-up";
import { HexWatermark } from "@/components/brand/hex-watermark";
import { NectarBadge, NectarSurface } from "@/components/nectar/nectar-brand";
import { getMyOtherAssignmentsSummary } from "@/lib/other-assignments.functions";

const fmtHours = (n: number) => `${n.toFixed(1)} hrs`;
const fmtDays = (n: number) => `${n} ${n === 1 ? "day" : "days"}`;
const fmtUSD = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });

/**
 * Slim NECTAR pay-period pill — expands to show the hourly + daily pay
 * breakdown. Hourly earnings tick live during an active hourly shift;
 * daily earnings only update when a daily log is filed.
 */
export function NectarPayPeriodCard() {
  const { data } = useNectarPayPeriod();
  const live = useLivePayPeriod();
  const [open, setOpen] = useState(false);
  const fetchOther = useServerFn(getMyOtherAssignmentsSummary);
  const { data: otherSummary } = useQuery({
    queryKey: ["my-other-assignments-summary"],
    queryFn: () => fetchOther(),
  });
  const otherOpen = otherSummary?.open_count ?? 0;
  const otherSafety = otherSummary?.safety_critical_open_count ?? 0;


  const label = data?.label ?? "Current period";

  const baseHourlyHours = data?.hourly_hours ?? 0;
  const baseHourlyPay = data?.hourly_earnings ?? 0;
  const dailyDays = data?.daily_days ?? 0;
  const dailyPay = data?.daily_earnings ?? 0;
  const hourlyRate = data?.hourly_rate ?? 0;
  const dailyRate = data?.daily_rate ?? 0;

  // Count up the static totals on load; mirror live values second-by-second
  // once an hourly shift is running.
  const animatedHours = useCountUp(baseHourlyHours);
  const animatedPay = useCountUp((data?.est_gross_pay ?? 0));
  const hourlyHoursDisplay = live.isHourlyShift ? live.hoursTotal : animatedHours;
  const hourlyPayDisplay = live.isHourlyShift ? baseHourlyPay + live.liveEarnings : baseHourlyPay;
  const payTotal = live.isLive ? live.payTotal : animatedPay;

  // Non-client (General Time Clock) totals — Training/Admin/Travel/Meeting.
  const generalHoursDisplay = live.generalHoursTotal;
  const generalPayDisplay = live.generalEarningsTotal;
  const hasGeneral = generalHoursDisplay > 0 || live.isGeneralShift;

  const hasHourly = data?.has_hourly_assignment ?? true;
  const hasDaily = data?.has_daily_assignment ?? false;
  const blockedDays = data?.blocked_daily_days ?? [];
  const logs = hasDaily ? (data?.outstanding_daily_logs ?? 0) : 0;
  const attn = hasDaily ? (data?.incomplete_attendance_days ?? 0) : 0;
  const todo = logs + attn;

  return (
    <NectarSurface aria-label="NECTAR pay-period summary">
      <HexWatermark size={120} className="-right-6 -top-6" opacity={0.07} />

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="nectar-pay-period-details"
        className="relative flex w-full items-center gap-3 px-4 py-3 text-left transition active:bg-white/[0.04]"
      >
        <NectarBadge size="sm" live={live.isLive} />

        <span className="min-w-0 flex-1 truncate font-mono text-sm font-semibold tabular-nums text-white">
          {fmtHours(hourlyHoursDisplay)} · {fmtUSD(payTotal)}
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

          {/* Pay breakdown */}
          <div className="mt-3 overflow-hidden rounded-xl bg-white/[0.06]">
            {hasHourly && (
              <>
                <div className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <span className="inline-flex items-center gap-2 text-sm font-medium text-white">
                    <Clock className="h-4 w-4 text-[#f4a93a]" />
                    Direct Support
                  </span>
                  <span className="font-mono text-sm tabular-nums text-white/90">
                    {fmtHours(hourlyHoursDisplay)} × {fmtUSD(hourlyRate)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3 border-t border-white/10 px-3 py-2.5">
                  <span className="text-[11px] uppercase tracking-wider text-white/70">= subtotal</span>
                  <span className="font-mono text-sm font-semibold tabular-nums text-white">
                    {fmtUSD(hourlyPayDisplay)}
                  </span>
                </div>
              </>
            )}

            {hasDaily && (
              <>
                <div className="flex items-center justify-between gap-3 border-t border-white/10 px-3 py-2.5">
                  <span className="inline-flex items-center gap-2 text-sm font-medium text-white">
                    <CalendarDays className="h-4 w-4 text-[#f4a93a]" />
                    Host Home
                  </span>
                  <span className="font-mono text-sm tabular-nums text-white/90">
                    {fmtDays(dailyDays)} × {fmtUSD(dailyRate)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3 border-t border-white/10 px-3 py-2.5">
                  <span className="text-[11px] uppercase tracking-wider text-white/70">= subtotal</span>
                  <span className="font-mono text-sm font-semibold tabular-nums text-white">
                    {fmtUSD(dailyPay)}
                  </span>
                </div>
                {blockedDays.length > 0 && (
                  <div className="border-t border-white/10 px-3 py-2">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="inline-flex cursor-default items-center gap-1.5 text-[11px] text-white/60">
                            <CalendarX2 className="h-3.5 w-3.5" />
                            {blockedDays.length} blocked day{blockedDays.length === 1 ? "" : "s"} (not billable)
                          </span>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          <p className="mb-1 font-medium">Blocked days</p>
                          <ul className="max-h-40 space-y-0.5 overflow-y-auto text-xs">
                            {blockedDays.slice(0, 20).map((b, i) => (
                              <li key={i}>{b.record_date} — {b.blocked_reason}</li>
                            ))}
                            {blockedDays.length > 20 && <li>…and {blockedDays.length - 20} more</li>}
                          </ul>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                )}
              </>
            )}

            {hasGeneral && (
              <>
                <div className="flex items-center justify-between gap-3 border-t border-white/10 px-3 py-2.5">
                  <span className="inline-flex items-center gap-2 text-sm font-medium text-white">
                    <Briefcase className="h-4 w-4 text-[#f4a93a]" />
                    Non-client · General time clock
                    {live.isGeneralShift && (
                      <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-[#15a06a]/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[#9cf2c8]">
                        <span className="relative inline-flex h-1 w-1">
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#15a06a] opacity-75" />
                          <span className="relative inline-flex h-1 w-1 rounded-full bg-[#15a06a]" />
                        </span>
                        live
                      </span>
                    )}
                  </span>
                  <span className="font-mono text-sm tabular-nums text-white/90">
                    {fmtHours(generalHoursDisplay)} × {fmtUSD(hourlyRate)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3 border-t border-white/10 px-3 py-2.5">
                  <span className="text-[11px] uppercase tracking-wider text-white/70">= subtotal</span>
                  <span className="font-mono text-sm font-semibold tabular-nums text-white">
                    {fmtUSD(generalPayDisplay)}
                  </span>
                </div>
              </>
            )}


            <div className="flex items-center justify-between gap-3 border-t border-white/15 bg-white/[0.04] px-3 py-3">
              <div className="flex flex-col">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-white/80">
                  Est. gross pay
                </span>
                <span className="text-[10px] font-medium text-[#f4a93a]">
                  Estimate · before taxes
                </span>
              </div>
              <span className="font-mono text-xl font-bold tabular-nums text-[#f4a93a]">
                {fmtUSD(payTotal)}
              </span>
            </div>
          </div>

          <p className="mt-4 text-[11px] font-semibold uppercase tracking-wider text-white/80">
            Needs your attention
          </p>
          <ul className="mt-2 flex flex-col gap-1.5">
            {otherOpen > 0 && (
              <li>
                <Link
                  to="/dashboard/courses/other"
                  className={`flex min-h-[44px] items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm font-medium text-white transition active:scale-[0.99] ${
                    otherSafety > 0
                      ? "bg-red-500/25 hover:bg-red-500/35 ring-1 ring-red-400/60"
                      : "bg-white/[0.06] hover:bg-white/[0.12]"
                  }`}
                >
                  <span className="inline-flex items-center gap-2">
                    {otherSafety > 0 ? (
                      <ShieldAlert className="h-4 w-4 text-red-200" />
                    ) : (
                      <BookOpen className="h-4 w-4 text-[#f4a93a]" />
                    )}
                    {otherSafety > 0
                      ? "Safety-critical training due"
                      : "Assigned trainings outstanding"}
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 font-mono text-xs font-bold tabular-nums ${
                      otherSafety > 0
                        ? "bg-red-400 text-red-950"
                        : "bg-[image:var(--gradient-amber)] text-[#412402]"
                    }`}>
                      {otherSafety > 0 ? otherSafety : otherOpen}
                    </span>
                    <ChevronRight className="h-4 w-4 text-white/80" />
                  </span>
                </Link>
              </li>
            )}
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
                    {attn}
                  </span>
                  <ChevronRight className="h-4 w-4 text-white/80" />
                </span>
              </Link>
            </li>
          </ul>
        </div>
      )}
    </NectarSurface>
  );
}
