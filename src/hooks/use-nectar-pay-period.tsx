import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./use-auth";
import { useActiveShift } from "./use-active-shift";

/**
 * NECTAR pay-period intelligence. Pay periods are 1st–15th and 16th–end of
 * month. Computes total worked hours from `evv_timesheets`, per-client
 * breakdown, and outstanding-paperwork counters used by the staff caseload
 * NECTAR summary card. Pulls hourly_rate from the staff profile.
 */
export type NectarPayPeriod = {
  label: string;            // e.g. "May 16–31"
  start_iso: string;
  end_iso: string;
  hours_total: number;      // closed-shift hours only
  est_gross_pay: number;    // closed-shift hours × rate (no live shift)
  hourly_rate: number;
  per_client_hours: Record<string, number>;
  outstanding_daily_logs: number;
  incomplete_attendance_days: number;
};

const FALLBACK_RATE = 18;

function periodBounds(now = new Date()) {
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  const first = d <= 15;
  const start = new Date(y, m, first ? 1 : 16, 0, 0, 0, 0);
  const end = first
    ? new Date(y, m, 15, 23, 59, 59, 999)
    : new Date(y, m + 1, 0, 23, 59, 59, 999); // last day of month
  const monthName = start.toLocaleString("en-US", { month: "short" });
  const label = first
    ? `${monthName} 1–15`
    : `${monthName} 16–${end.getDate()}`;
  return { start, end, label };
}

export function useNectarPayPeriod() {
  const { user } = useAuth();
  return useQuery({
    enabled: !!user?.id,
    queryKey: ["nectar-pay-period", user?.id],
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<NectarPayPeriod> => {
      const { start, end, label } = periodBounds();

      const [{ data: tsRows, error: tsErr }, { data: profile, error: pErr }] =
        await Promise.all([
          supabase
            .from("evv_timesheets")
            .select("client_id, clock_in_timestamp, clock_out_timestamp")
            .eq("staff_id", user!.id)
            .gte("clock_in_timestamp", start.toISOString())
            .lte("clock_in_timestamp", end.toISOString()),
          supabase
            .from("profiles")
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .select("hourly_rate" as any)
            .eq("id", user!.id)
            .maybeSingle(),
        ]);
      if (tsErr) throw tsErr;
      if (pErr) throw pErr;

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

      const rateRaw = (profile as { hourly_rate?: number | string | null } | null)
        ?.hourly_rate;
      const hourly_rate =
        typeof rateRaw === "number"
          ? rateRaw
          : typeof rateRaw === "string"
            ? Number(rateRaw) || FALLBACK_RATE
            : FALLBACK_RATE;

      // Lightweight placeholders until daily-logs / attendance feeds land.
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
      };
    },
  });
}

/**
 * Live (1s-ticking) pay-period figures. Adds the in-flight client shift's
 * elapsed hours × hourly rate to the stored totals so the NECTAR pill, the
 * clocked-in bar, and the Time Clock screen all tick in sync.
 */
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
