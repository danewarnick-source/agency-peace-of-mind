import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "./use-org";
import { useAllClientBillingCodes, type ClientBillingCode } from "./use-client-billing-codes";
import { hoursToUnits, unitsToHours } from "@/lib/billing-units";
import { isDailyServiceCode } from "@/lib/service-billing";

/**
 * Sensitivity controls how aggressively NECTAR flags over/under utilization.
 * - overWeeksAhead: flag "over" when projected exhaustion is this many weeks
 *   (or more) before renewal.
 * - underUnusedPct: flag "under" when projected unused units at renewal exceed
 *   this fraction of annual authorization.
 */
export interface NectarAlertSettings {
  overWeeksAhead: number;
  underUnusedPct: number;
}

export const DEFAULT_NECTAR_ALERT_SETTINGS: NectarAlertSettings = {
  overWeeksAhead: 2,
  underUnusedPct: 0.1,
};

export type NectarAlertKind = "over" | "under" | "exhausted" | "expired";

export interface NectarAlert {
  client_id: string;
  client_name: string;
  service_code: string;
  is_daily: boolean;
  kind: NectarAlertKind;
  used_units: number;
  annual_units: number;
  remaining_units: number;
  remaining_hours: number;
  weekly_pace_hours: number;
  hours_per_week_target: number;
  weeks_to_renewal: number;
  /** For over-utilization: weeks before renewal exhaustion would occur. */
  weeks_early?: number;
  /** For under-utilization: units projected to expire unused. */
  projected_unused_units?: number;
  renewal_date: string | null;
  message: string;
}

function weeksBetween(a: Date, b: Date): number {
  return Math.max(0, (b.getTime() - a.getTime()) / (7 * 86_400_000));
}

export function useNectarAlerts(settings: NectarAlertSettings = DEFAULT_NECTAR_ALERT_SETTINGS) {
  const { data: org } = useCurrentOrg();
  const { data: codes } = useAllClientBillingCodes();

  const clientsQ = useQuery({
    enabled: !!org?.organization_id,
    queryKey: ["nectar-alerts-clients", org?.organization_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, first_name, last_name")
        .eq("organization_id", org!.organization_id);
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; first_name: string; last_name: string }>;
    },
  });

  const usageQ = useQuery({
    enabled: !!org?.organization_id,
    queryKey: ["nectar-alerts-usage", org?.organization_id],
    refetchInterval: 120_000,
    queryFn: async () => {
      const yearStart = new Date(new Date().getFullYear() - 1, 0, 1).toISOString();
      const [tsRes, dlRes] = await Promise.all([
        supabase
          .from("evv_timesheets")
          .select("client_id, service_type_code, clock_in_timestamp, clock_out_timestamp")
          .eq("organization_id", org!.organization_id)
          .gte("clock_in_timestamp", yearStart),
        // Daily-rate days come from the hhs_daily_records_v view; only
        // billable rows (attendance Present + daily note) count toward budget pace.
        supabase
          .from("hhs_daily_records_v")
          .select("client_id, record_date, service_code, billable")
          .eq("organization_id", org!.organization_id)
          .eq("billable", true)
          .gte("record_date", yearStart.slice(0, 10)),
      ]);
      if (tsRes.error) throw tsRes.error;
      if (dlRes.error) throw dlRes.error;
      return { ts: tsRes.data ?? [], dl: dlRes.data ?? [] };
    },
  });

  const alerts = useMemo<NectarAlert[]>(() => {
    if (!codes || !clientsQ.data) return [];
    const now = new Date();
    const tsRows = (usageQ.data?.ts ?? []) as Array<{
      client_id: string;
      service_type_code: string | null;
      clock_in_timestamp: string;
      clock_out_timestamp: string | null;
    }>;
    const dlRows = (usageQ.data?.dl ?? []) as Array<{ client_id: string; record_date: string; service_code: string | null }>;
    const clientNameById = new Map(
      clientsQ.data.map((c) => [c.id, `${c.last_name}, ${c.first_name}`]),
    );

    const out: NectarAlert[] = [];

    for (const code of codes as ClientBillingCode[]) {
      const clientName = clientNameById.get(code.client_id);
      if (!clientName) continue;
      const periodStart = code.service_start_date ? new Date(code.service_start_date) : null;
      const periodEnd = code.service_end_date ? new Date(code.service_end_date) : null;
      if (!periodStart || !periodEnd) continue;

      const is_daily = isDailyServiceCode(code.service_code);
      const annual = code.annual_unit_authorization ?? 0;
      if (annual <= 0) continue;

      let used_units = 0;
      if (is_daily) {
        const set = new Set<string>();
        for (const r of dlRows) {
          if (r.client_id !== code.client_id || !r.record_date) continue;
          // View rows carry the service code — attribute days to the exact code.
          if (r.service_code && r.service_code !== code.service_code) continue;
          const d = new Date(r.record_date + "T00:00:00");
          if (d < periodStart || d > periodEnd) continue;
          set.add(r.record_date);
        }
        used_units = set.size;
      } else {
        let hrs = 0;
        for (const r of tsRows) {
          if (r.client_id !== code.client_id || !r.clock_out_timestamp) continue;
          if (r.service_type_code !== code.service_code) continue;
          const inT = new Date(r.clock_in_timestamp);
          if (inT < periodStart || inT > periodEnd) continue;
          const h = (new Date(r.clock_out_timestamp).getTime() - inT.getTime()) / 3_600_000;
          if (h > 0 && isFinite(h)) hrs += h;
        }
        used_units = hoursToUnits(hrs);
      }

      const remaining_units = Math.max(0, annual - used_units);
      const remaining_hours = is_daily ? remaining_units : unitsToHours(remaining_units);
      const weeksElapsed = Math.max(0.001, weeksBetween(periodStart, now));
      const weeks_to_renewal = weeksBetween(now, periodEnd);
      const days_to_renewal = Math.ceil((periodEnd.getTime() - now.getTime()) / 86_400_000);
      const weekly_pace_units = used_units / weeksElapsed;
      const weekly_pace_hours = is_daily ? weekly_pace_units : unitsToHours(weekly_pace_units);
      const hours_per_week_target = weeks_to_renewal > 0 ? remaining_hours / weeks_to_renewal : 0;

      const base = {
        client_id: code.client_id,
        client_name: clientName,
        service_code: code.service_code,
        is_daily,
        used_units,
        annual_units: annual,
        remaining_units,
        remaining_hours,
        weekly_pace_hours,
        hours_per_week_target,
        weeks_to_renewal,
        renewal_date: code.service_end_date ?? null,
      };

      if (days_to_renewal < 0) {
        out.push({
          ...base,
          kind: "expired",
          message: `Authorization for ${code.service_code} expired ${Math.abs(days_to_renewal)} days ago.`,
        });
        continue;
      }
      if (used_units >= annual) {
        out.push({
          ...base,
          kind: "exhausted",
          message: `${code.service_code} budget fully used — ${weeks_to_renewal.toFixed(1)} weeks remain until renewal.`,
        });
        continue;
      }

      // Over-utilization: projected weeks to exhaustion at current pace.
      if (weekly_pace_units > 0) {
        const weeksToExhaust = remaining_units / weekly_pace_units;
        const weeksEarly = weeks_to_renewal - weeksToExhaust;
        if (weeksEarly >= settings.overWeeksAhead) {
          out.push({
            ...base,
            kind: "over",
            weeks_early: weeksEarly,
            message: `On pace to exhaust ${code.service_code} ~${weeksEarly.toFixed(1)} weeks before renewal.`,
          });
          continue;
        }
      }

      // Under-utilization: projected unused units at renewal.
      const projectedUsedByRenewal = used_units + weekly_pace_units * weeks_to_renewal;
      const projectedUnused = Math.max(0, annual - projectedUsedByRenewal);
      if (projectedUnused / annual >= settings.underUnusedPct) {
        out.push({
          ...base,
          kind: "under",
          projected_unused_units: projectedUnused,
          message: `Projected ${Math.round(projectedUnused)} units unused at renewal — need ${hours_per_week_target.toFixed(1)} hr/wk to fully use.`,
        });
      }
    }

    // Sort: exhausted/expired first, then over, then under.
    const rank: Record<NectarAlertKind, number> = { exhausted: 0, expired: 1, over: 2, under: 3 };
    out.sort((a, b) => rank[a.kind] - rank[b.kind] || a.client_name.localeCompare(b.client_name));
    return out;
  }, [codes, clientsQ.data, usageQ.data, settings.overWeeksAhead, settings.underUnusedPct]);

  return {
    alerts,
    isLoading: !codes || clientsQ.isLoading || usageQ.isLoading,
  };
}
