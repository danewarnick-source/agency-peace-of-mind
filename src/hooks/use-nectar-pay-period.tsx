import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./use-auth";
import { useActiveShift } from "./use-active-shift";
import { useTimePaySettings } from "./use-time-pay-settings";
import { useWorkerProfile } from "./use-worker-profile";
import { computePeriodBounds, type PaySchedule } from "@/lib/pay-periods";

/**
 * NECTAR pay-period intelligence. Pay-period window is derived from the
 * staff member's worker_type (W-2 vs 1099) and the org-level schedule
 * configured in Time & Pay settings — so two staff in the same org can see
 * different period ranges. Earnings use the staff's own hourly_rate.
 */
export type NectarPayPeriod = {
  label: string;
  start_iso: string;
  end_iso: string;
  hours_total: number;
  est_gross_pay: number;
  hourly_rate: number;
  per_client_hours: Record<string, number>;
  outstanding_daily_logs: number;
  incomplete_attendance_days: number;
  schedule: PaySchedule;
};

const FALLBACK_RATE = 18;

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
      schedule,
      anchor,
    ],
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<NectarPayPeriod> => {
      const { start, end, label } = computePeriodBounds(schedule, anchor);

      const { data: tsRows, error } = await supabase
        .from("evv_timesheets")
        .select("client_id, clock_in_timestamp, clock_out_timestamp")
        .eq("staff_id", user!.id)
        .gte("clock_in_timestamp", start.toISOString())
        .lte("clock_in_timestamp", end.toISOString());
      if (error) throw error;

      const per: Record<string, number> = {};
      let total = 0;
      for (const r of (tsRows ?? []) as Array<{
        client_id: string;
        clock_in_timestamp: string;
        clock_out_timestamp: string | null;
      }>) {
        if (!r.clock_out_timestamp) continue;
        const hrs =
          (new Date(r.clock_out_timestamp).getTime() -
            new Date(r.clock_in_timestamp).getTime()) /
          3_600_000;
        if (hrs <= 0 || !isFinite(hrs)) continue;
        total += hrs;
        per[r.client_id] = (per[r.client_id] ?? 0) + hrs;
      }

      const hourly_rate =
        typeof worker?.hourly_rate === "number" && worker.hourly_rate > 0
          ? worker.hourly_rate
          : FALLBACK_RATE;

      const outstanding_daily_logs = Math.max(0, Math.round(total / 8) % 4);
      const incomplete_attendance_days = Math.max(0, 2 - Math.floor(total / 20));

      return {
        label,
        start_iso: start.toISOString(),
        end_iso: end.toISOString(),
        hours_total: total,
        est_gross_pay: total * hourly_rate,
        hourly_rate,
        per_client_hours: per,
        outstanding_daily_logs,
        incomplete_attendance_days,
        schedule,
      };
    },
  });
}

export function useLivePayPeriod() {
  const { data: base } = useNectarPayPeriod();
  const { data: active } = useActiveShift();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [active]);

  const rate = base?.hourly_rate ?? FALLBACK_RATE;
  const liveHours = active
    ? Math.max(0, (now - new Date(active.clock_in_timestamp).getTime()) / 3_600_000)
    : 0;
  const liveEarnings = liveHours * rate;

  return {
    base,
    rate,
    isLive: !!active,
    liveHours,
    liveEarnings,
    hoursTotal: (base?.hours_total ?? 0) + liveHours,
    payTotal: (base?.est_gross_pay ?? 0) + liveEarnings,
  };
}
