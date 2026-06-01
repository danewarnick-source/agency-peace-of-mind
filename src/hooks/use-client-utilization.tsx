import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./use-auth";
import { useCurrentOrg } from "./use-org";
import { isDailyServiceCode } from "@/lib/service-billing";

export type ClientCodeUsage = {
  client_id: string;
  service_code: string;
  /** Hours worked this billing-period window across ALL staff (hourly codes). */
  all_staff_hours: number;
  /** Hours worked by the current staff member only. */
  my_hours: number;
  /** Distinct days completed this month across ALL staff (daily codes). */
  all_staff_days: number;
  my_days: number;
};

function weekBounds(now = new Date()): { start: Date; end: Date } {
  // Sunday-anchored week (matches the staff app's display convention).
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  const dow = d.getDay();
  const start = new Date(d);
  start.setDate(d.getDate() - dow);
  const end = new Date(start);
  end.setDate(start.getDate() + 7);
  end.setMilliseconds(-1);
  return { start, end };
}

function monthBounds(now = new Date()): { start: Date; end: Date } {
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  return { start, end };
}

/**
 * Per-client × per-code utilization across the whole org. Hourly hours are
 * scoped to the current week; daily days are scoped to the current month —
 * those windows match the caps stored on `client_billing_codes`.
 */
export function useClientUtilization() {
  const { user } = useAuth();
  const { data: org } = useCurrentOrg();

  return useQuery({
    enabled: !!org?.organization_id && !!user?.id,
    queryKey: ["client-utilization", org?.organization_id, user?.id],
    refetchInterval: 60_000,
    queryFn: async (): Promise<Map<string, ClientCodeUsage>> => {
      const week = weekBounds();
      const month = monthBounds();

      const map = new Map<string, ClientCodeUsage>();
      const key = (cid: string, code: string) => `${cid}|${code}`;
      const touch = (cid: string, code: string): ClientCodeUsage => {
        const k = key(cid, code);
        let row = map.get(k);
        if (!row) {
          row = {
            client_id: cid,
            service_code: code,
            all_staff_hours: 0,
            my_hours: 0,
            all_staff_days: 0,
            my_days: 0,
          };
          map.set(k, row);
        }
        return row;
      };

      // Hourly hours this week — all staff in org
      const { data: tsRows, error: tsErr } = await supabase
        .from("evv_timesheets")
        .select("client_id, service_type_code, staff_id, clock_in_timestamp, clock_out_timestamp")
        .eq("organization_id", org!.organization_id)
        .gte("clock_in_timestamp", week.start.toISOString())
        .lte("clock_in_timestamp", week.end.toISOString());
      if (tsErr) throw tsErr;
      for (const r of (tsRows ?? []) as Array<{
        client_id: string;
        service_type_code: string | null;
        staff_id: string | null;
        clock_in_timestamp: string;
        clock_out_timestamp: string | null;
      }>) {
        if (!r.clock_out_timestamp || !r.service_type_code) continue;
        if (isDailyServiceCode(r.service_type_code)) continue;
        const hrs =
          (new Date(r.clock_out_timestamp).getTime() -
            new Date(r.clock_in_timestamp).getTime()) /
          3_600_000;
        if (!isFinite(hrs) || hrs <= 0) continue;
        const row = touch(r.client_id, r.service_type_code);
        row.all_staff_hours += hrs;
        if (r.staff_id === user!.id) row.my_hours += hrs;
      }

      // Daily-billed completed days this month — all staff in org
      const { data: dlRows, error: dlErr } = await supabase
        .from("hhs_daily_records")
        // service_code may not exist on hhs_daily_records; we attribute days
        // to whatever daily code(s) the client has authorized at render time.
        .select("client_id, provider_id, record_date")
        .eq("organization_id", org!.organization_id)
        .gte("record_date", month.start.toISOString().slice(0, 10))
        .lte("record_date", month.end.toISOString().slice(0, 10));
      if (dlErr) throw dlErr;
      // Aggregate distinct dates per client; we tag them under a synthetic
      // "*DAILY*" bucket and the caller maps that onto each daily code.
      const allDays = new Map<string, Set<string>>();
      const myDays = new Map<string, Set<string>>();
      for (const r of (dlRows ?? []) as Array<{
        client_id: string;
        provider_id: string | null;
        record_date: string;
      }>) {
        if (!r.record_date) continue;
        if (!allDays.has(r.client_id)) allDays.set(r.client_id, new Set());
        allDays.get(r.client_id)!.add(r.record_date);
        if (r.provider_id === user!.id) {
          if (!myDays.has(r.client_id)) myDays.set(r.client_id, new Set());
          myDays.get(r.client_id)!.add(r.record_date);
        }
      }
      for (const [cid, dates] of allDays) {
        const row = touch(cid, "*DAILY*");
        row.all_staff_days = dates.size;
        row.my_days = myDays.get(cid)?.size ?? 0;
      }

      return map;
    },
  });
}

export function getUsage(
  map: Map<string, ClientCodeUsage> | undefined,
  clientId: string,
  code: string,
): ClientCodeUsage | null {
  if (!map) return null;
  if (isDailyServiceCode(code)) {
    const row = map.get(`${clientId}|*DAILY*`);
    if (!row) return null;
    return { ...row, service_code: code };
  }
  return map.get(`${clientId}|${code}`) ?? null;
}
