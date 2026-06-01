import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./use-auth";
import { useActiveShift } from "./use-active-shift";
import { useTimePaySettings } from "./use-time-pay-settings";
import { useWorkerProfile } from "./use-worker-profile";
import { useMyAssignments } from "./use-my-assignments";
import { computePeriodBounds, type PaySchedule } from "@/lib/pay-periods";
import { isDailyServiceCode } from "@/lib/service-billing";

/**
 * NECTAR pay-period intelligence. Pay-period window comes from the staff
 * member's worker_type (W-2 vs 1099) and the org's Time & Pay schedule.
 *
 * Estimated gross pay = hourly earnings + daily earnings, both pre-tax:
 *  - Hourly earnings = hours on hourly service codes × profile hourly_rate.
 *    Accrues live while clocked into an hourly shift (rate ÷ 3600 / sec).
 *  - Daily earnings  = completed daily-log days × profile daily_rate.
 *    Only counts a day once its host-home daily record is filed, so daily
 *    pay ticks up in whole-day steps — never continuously.
 */
export type NectarPayPeriod = {
  label: string;
  start_iso: string;
  end_iso: string;
  /** Hours worked on hourly service codes (completed shifts only). */
  hourly_hours: number;
  /** Distinct completed daily-log days in the period. */
  daily_days: number;
  hourly_earnings: number;
  daily_earnings: number;
  est_gross_pay: number;
  hourly_rate: number;
  daily_rate: number;
  per_client_hours: Record<string, number>;
  outstanding_daily_logs: number;
  incomplete_attendance_days: number;
  schedule: PaySchedule;
};

const FALLBACK_HOURLY = 18;
const FALLBACK_DAILY = 0;

export function useNectarPayPeriod() {
  const { user } = useAuth();
  const { settings } = useTimePaySettings();
  const { data: worker } = useWorkerProfile();

  const schedule: PaySchedule =
    worker?.worker_type === "1099" ? settings.contractor_schedule : settings.w2_schedule;
  const anchor =
    worker?.worker_type === "1099" ? settings.contractor_period_anchor : settings.w2_period_anchor;

  return useQuery({
    enabled: !!user?.id && !!worker,
    queryKey: [
      "nectar-pay-period",
      user?.id,
      worker?.worker_type,
      worker?.hourly_rate,
      worker?.daily_rate,
      schedule,
      anchor,
    ],
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<NectarPayPeriod> => {
      const { start, end, label } = computePeriodBounds(schedule, anchor);

      // Hourly side: completed evv punches on hourly service codes.
      const { data: tsRows, error } = await supabase
        .from("evv_timesheets")
        .select("client_id, service_type_code, clock_in_timestamp, clock_out_timestamp")
        .eq("staff_id", user!.id)
        .gte("clock_in_timestamp", start.toISOString())
        .lte("clock_in_timestamp", end.toISOString());
      if (error) throw error;

      const per: Record<string, number> = {};
      let hourly_hours = 0;
      for (const r of (tsRows ?? []) as Array<{
        client_id: string;
        service_type_code: string | null;
        clock_in_timestamp: string;
        clock_out_timestamp: string | null;
      }>) {
        if (!r.clock_out_timestamp) continue;
        if (isDailyServiceCode(r.service_type_code)) continue;
        const hrs =
          (new Date(r.clock_out_timestamp).getTime() -
            new Date(r.clock_in_timestamp).getTime()) /
          3_600_000;
        if (hrs <= 0 || !isFinite(hrs)) continue;
        hourly_hours += hrs;
        per[r.client_id] = (per[r.client_id] ?? 0) + hrs;
      }

      // Daily side: distinct completed daily-log days for this staff in window.
      const startDate = start.toISOString().slice(0, 10);
      const endDate = end.toISOString().slice(0, 10);
      const { data: dlRows, error: dlErr } = await supabase
        .from("hhs_daily_records")
        .select("record_date")
        .eq("provider_id", user!.id)
        .gte("record_date", startDate)
        .lte("record_date", endDate);
      if (dlErr) throw dlErr;
      const dayKeys = new Set<string>();
      for (const r of (dlRows ?? []) as Array<{ record_date: string }>) {
        if (r.record_date) dayKeys.add(r.record_date);
      }
      const daily_days = dayKeys.size;

      const hourly_rate =
        typeof worker?.hourly_rate === "number" && worker.hourly_rate > 0
          ? worker.hourly_rate
          : FALLBACK_HOURLY;
      const daily_rate =
        typeof worker?.daily_rate === "number" && worker.daily_rate > 0
          ? worker.daily_rate
          : FALLBACK_DAILY;

      const hourly_earnings = hourly_hours * hourly_rate;
      const daily_earnings = daily_days * daily_rate;

      const outstanding_daily_logs = Math.max(0, Math.round(hourly_hours / 8) % 4);
      const incomplete_attendance_days = Math.max(0, 2 - Math.floor(hourly_hours / 20));

      return {
        label,
        start_iso: start.toISOString(),
        end_iso: end.toISOString(),
        hourly_hours,
        daily_days,
        hourly_earnings,
        daily_earnings,
        est_gross_pay: hourly_earnings + daily_earnings,
        hourly_rate,
        daily_rate,
        per_client_hours: per,
        outstanding_daily_logs,
        incomplete_attendance_days,
        schedule,
      };
    },
  });
}

/**
 * Adds live shift accrual on top of the saved pay-period totals. Live
 * accrual only happens for hourly shifts — daily shifts pay in whole-day
 * steps once the daily log is filed, so they don't tick by the second.
 */
export function useLivePayPeriod() {
  const { data: base } = useNectarPayPeriod();
  const { data: active } = useActiveShift();
  const [now, setNow] = useState(() => Date.now());

  const isHourlyShift = !!active && !isDailyServiceCode(active.service_type_code);

  useEffect(() => {
    if (!isHourlyShift) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [isHourlyShift]);

  const rate = base?.hourly_rate ?? FALLBACK_HOURLY;
  const liveHours = isHourlyShift
    ? Math.max(0, (now - new Date(active!.clock_in_timestamp).getTime()) / 3_600_000)
    : 0;
  const liveEarnings = liveHours * rate;

  return {
    base,
    rate,
    isLive: isHourlyShift,
    liveHours,
    liveEarnings,
    hoursTotal: (base?.hourly_hours ?? 0) + liveHours,
    payTotal: (base?.est_gross_pay ?? 0) + liveEarnings,
  };
}
