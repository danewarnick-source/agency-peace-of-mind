import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./use-auth";
import { useActiveShift } from "./use-active-shift";
import { useTimePaySettings } from "./use-time-pay-settings";
import { useWorkerProfile } from "./use-worker-profile";
import { useMyAssignments } from "./use-my-assignments";
import { useGeneralShift, useGeneralShiftLog } from "./use-general-shift";
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
  /** Completed non-client (General Time Clock) hours in the period. */
  general_hours: number;
  hourly_earnings: number;
  daily_earnings: number;
  general_earnings: number;
  est_gross_pay: number;
  hourly_rate: number;
  daily_rate: number;
  per_client_hours: Record<string, number>;
  outstanding_daily_logs: number;
  incomplete_attendance_days: number;
  schedule: PaySchedule;
  /** True if any client assignment includes an hourly code. */
  has_hourly_assignment: boolean;
  /** True if any client assignment includes a daily code. */
  has_daily_assignment: boolean;
};

const FALLBACK_HOURLY = 18;
const FALLBACK_DAILY = 0;

export function useNectarPayPeriod() {
  const { user } = useAuth();
  const { settings } = useTimePaySettings();
  const { data: worker } = useWorkerProfile();
  const { data: assignments } = useMyAssignments();

  const schedule: PaySchedule =
    worker?.worker_type === "1099" ? settings.contractor_schedule : settings.w2_schedule;
  const anchor =
    worker?.worker_type === "1099" ? settings.contractor_period_anchor : settings.w2_period_anchor;

  // Aggregate the staff member's assigned codes across all clients to
  // decide whether NECTAR should show the hourly line, the daily line, or
  // both. A staff with no daily assignment never sees daily totals/lines.
  let has_hourly_assignment = false;
  let has_daily_assignment = false;
  if (assignments) {
    for (const codes of assignments.values()) {
      if (codes === null) {
        has_hourly_assignment = true;
        has_daily_assignment = true;
        break;
      }
      for (const c of codes) {
        if (isDailyServiceCode(c)) has_daily_assignment = true;
        else has_hourly_assignment = true;
      }
    }
  }

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
      has_hourly_assignment,
      has_daily_assignment,
    ],
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<NectarPayPeriod> => {
      const { start, end, label } = computePeriodBounds(schedule, anchor);

      const per: Record<string, number> = {};
      let hourly_hours = 0;
      if (has_hourly_assignment) {
        const { data: tsRows, error } = await supabase
          .from("evv_timesheets")
          .select("client_id, service_type_code, clock_in_timestamp, clock_out_timestamp")
          .eq("staff_id", user!.id)
          .gte("clock_in_timestamp", start.toISOString())
          .lte("clock_in_timestamp", end.toISOString());
        if (error) throw error;
        for (const r of (tsRows ?? []) as Array<{
          client_id: string;
          service_type_code: string | null;
          clock_in_timestamp: string;
          clock_out_timestamp: string | null;
        }>) {
          if (!r.clock_out_timestamp) continue;
          if (isDailyServiceCode(r.service_type_code)) continue;
          // Honor per-client assignment scope: only count punches on codes
          // the staff is actually assigned for this client.
          if (assignments) {
            const allow = assignments.get(r.client_id);
            if (allow === undefined) continue;
            if (allow && r.service_type_code && !allow.has(r.service_type_code)) continue;
          }
          const hrs =
            (new Date(r.clock_out_timestamp).getTime() -
              new Date(r.clock_in_timestamp).getTime()) /
            3_600_000;
          if (hrs <= 0 || !isFinite(hrs)) continue;
          hourly_hours += hrs;
          per[r.client_id] = (per[r.client_id] ?? 0) + hrs;
        }
      }

      let daily_days = 0;
      if (has_daily_assignment) {
        const startDate = start.toISOString().slice(0, 10);
        const endDate = end.toISOString().slice(0, 10);
        const { data: dlRows, error: dlErr } = await supabase
          .from("hhs_daily_records")
          .select("record_date, client_id")
          .eq("provider_id", user!.id)
          .gte("record_date", startDate)
          .lte("record_date", endDate);
        if (dlErr) throw dlErr;
        const dayKeys = new Set<string>();
        for (const r of (dlRows ?? []) as Array<{ record_date: string; client_id: string }>) {
          if (!r.record_date) continue;
          if (assignments) {
            const allow = assignments.get(r.client_id);
            if (allow === undefined) continue;
            // Daily-billed clients: any daily code in allow-list is enough.
            if (allow) {
              let ok = false;
              for (const c of allow) {
                if (isDailyServiceCode(c)) { ok = true; break; }
              }
              if (!ok) continue;
            }
          }
          dayKeys.add(`${r.client_id}|${r.record_date}`);
        }
        daily_days = dayKeys.size;
      }

      const hourly_rate =
        typeof worker?.hourly_rate === "number" && worker.hourly_rate > 0
          ? worker.hourly_rate
          : FALLBACK_HOURLY;
      const daily_rate =
        typeof worker?.daily_rate === "number" && worker.daily_rate > 0
          ? worker.daily_rate
          : FALLBACK_DAILY;

      const hourly_earnings = has_hourly_assignment ? hourly_hours * hourly_rate : 0;
      const daily_earnings = has_daily_assignment ? daily_days * daily_rate : 0;

      const outstanding_daily_logs = has_daily_assignment
        ? Math.max(0, Math.round(hourly_hours / 8) % 4)
        : 0;
      const incomplete_attendance_days = has_daily_assignment
        ? Math.max(0, 2 - Math.floor(hourly_hours / 20))
        : 0;

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
        has_hourly_assignment,
        has_daily_assignment,
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
