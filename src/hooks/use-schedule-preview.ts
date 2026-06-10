import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "./use-org";

export type ShiftRow = {
  id: string;
  staff_id: string | null;
  client_id: string | null;
  job_code: string | null;
  shift_type: string | null;
  starts_at: string;
  ends_at: string;
  status: string | null;
  published: boolean | null;
};
export type ClientRow = { id: string; first_name: string; last_name: string; team_id: string | null };
export type TeamRow = { id: string; team_name: string };
export type StaffRow = { id: string; name: string };

export const UNASSIGNED_SITE_ID = "__unassigned__";

export function useSchedulePreview(weekStart: Date) {
  const { data: org } = useCurrentOrg();
  const orgId = org?.organization_id;
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);

  return useQuery({
    enabled: !!orgId,
    queryKey: ["schedule-preview", orgId, weekStart.toISOString()],
    queryFn: async () => {
      const [shiftsRes, clientsRes, teamsRes, profilesRes] = await Promise.all([
        supabase
          .from("scheduled_shifts")
          .select("id, staff_id, client_id, job_code, shift_type, starts_at, ends_at, status, published")
          .eq("organization_id", orgId!)
          .gte("starts_at", weekStart.toISOString())
          .lt("starts_at", weekEnd.toISOString()),
        supabase
          .from("clients")
          .select("id, first_name, last_name, team_id")
          .eq("organization_id", orgId!),
        supabase.from("teams").select("id, team_name").eq("organization_id", orgId!),
        supabase
          .from("profiles")
          .select("id, first_name, last_name, full_name")
          .eq("tenant_id", orgId!),
      ]);
      if (shiftsRes.error) throw shiftsRes.error;
      const shifts = (shiftsRes.data ?? []) as ShiftRow[];
      const clients = (clientsRes.data ?? []) as ClientRow[];
      const teams = (teamsRes.data ?? []) as TeamRow[];
      const staffMap = new Map<string, StaffRow>();
      for (const p of (profilesRes.data ?? []) as Array<{
        id: string; first_name: string | null; last_name: string | null; full_name: string | null;
      }>) {
        const name =
          (p.full_name && p.full_name.trim()) ||
          [p.first_name, p.last_name].filter(Boolean).join(" ").trim() ||
          "Staff";
        staffMap.set(p.id, { id: p.id, name });
      }
      // Make sure every staff_id on a shift has a row, even if not in profiles fetch
      for (const s of shifts) {
        if (s.staff_id && !staffMap.has(s.staff_id))
          staffMap.set(s.staff_id, { id: s.staff_id, name: "Staff" });
      }
      return { shifts, clients, teams, staff: Array.from(staffMap.values()) };
    },
  });
}

// Same residential/daily codes used by the existing scheduler and pay router.
export const DAILY_CODES = new Set(["HHS", "RHS", "DSG", "RL6", "RP3", "RP4", "RP5"]);
export const isDaily = (code: string | null | undefined) => !!code && DAILY_CODES.has(code);

export type SiteType = "residential" | "day";

export function inferSiteType(
  teamId: string,
  clients: ClientRow[],
  shifts: ShiftRow[],
): SiteType {
  if (teamId === UNASSIGNED_SITE_ID) return "day";
  const clientIds = new Set(clients.filter((c) => c.team_id === teamId).map((c) => c.id));
  for (const s of shifts) {
    if (s.client_id && clientIds.has(s.client_id) && isDaily(s.job_code)) return "residential";
  }
  return "day";
}

// Coverage helpers — work in minutes from the start of `day`.
function clampToDay(day: Date, startISO: string, endISO: string): [number, number] | null {
  const dayStart = day.getTime();
  const dayEnd = dayStart + 24 * 60 * 60 * 1000;
  const a = new Date(startISO).getTime();
  const b = new Date(endISO).getTime();
  const lo = Math.max(a, dayStart);
  const hi = Math.min(b, dayEnd);
  if (hi <= lo) return null;
  return [(lo - dayStart) / 60000, (hi - dayStart) / 60000];
}

export function dayCoverageMinutes(day: Date, shifts: ShiftRow[]): number {
  const intervals: Array<[number, number]> = [];
  for (const s of shifts) {
    const v = clampToDay(day, s.starts_at, s.ends_at);
    if (v) intervals.push(v);
  }
  intervals.sort((a, b) => a[0] - b[0]);
  let total = 0;
  let curStart = -1;
  let curEnd = -1;
  for (const [a, b] of intervals) {
    if (a > curEnd) {
      total += Math.max(0, curEnd - curStart);
      curStart = a;
      curEnd = b;
    } else {
      curEnd = Math.max(curEnd, b);
    }
  }
  total += Math.max(0, curEnd - curStart);
  return total;
}

export function startOfWeek(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - x.getDay()); // Sunday
  return x;
}
