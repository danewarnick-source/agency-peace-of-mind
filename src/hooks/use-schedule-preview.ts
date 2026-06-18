import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "./use-org";
import { DAILY_SERVICE_CODES, isDailyServiceCode } from "@/lib/service-billing";

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
  is_recurring: boolean | null;
  recurrence_rule: string | null;
  recurrence_end_date: string | null;
  /** Set on 1:1 segments nested inside a base shift. */
  parent_shift_id: string | null;
  service_code: string | null;
  created_from: string | null;
};
export type ClientRow = { id: string; first_name: string; last_name: string; team_id: string | null; job_code: string[] };
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
      const [shiftsRes, clientsRes, teamsRes, membersRes] = await Promise.all([
        supabase
          .from("scheduled_shifts")
          .select("id, staff_id, client_id, job_code, shift_type, starts_at, ends_at, status, published, is_recurring, recurrence_rule, recurrence_end_date, parent_shift_id, service_code, created_from")
          .eq("organization_id", orgId!)
          .gte("starts_at", weekStart.toISOString())
          .lt("starts_at", weekEnd.toISOString()),
        supabase
          .from("clients")
          .select("id, first_name, last_name, team_id, job_code")
          .eq("organization_id", orgId!),
        supabase.from("teams").select("id, team_name").eq("organization_id", orgId!),
        // Org-to-user membership lives here (profiles.tenant_id is unused).
        supabase
          .from("organization_members")
          .select("user_id")
          .eq("organization_id", orgId!),
      ]);
      if (shiftsRes.error) throw shiftsRes.error;
      const shifts = (shiftsRes.data ?? []) as ShiftRow[];
      const clients = (clientsRes.data ?? []) as ClientRow[];
      const teams = (teamsRes.data ?? []) as TeamRow[];
      const memberIds = Array.from(
        new Set(
          ((membersRes.data ?? []) as Array<{ user_id: string | null }>)
            .map((m) => m.user_id)
            .filter((x): x is string => !!x),
        ),
      );
      const profilesRes = memberIds.length
        ? await supabase
            .from("profiles")
            .select("id, first_name, last_name, full_name")
            .in("id", memberIds)
        : { data: [] as Array<{ id: string; first_name: string | null; last_name: string | null; full_name: string | null }>, error: null };
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
      // Ensure every member is present even if they have no profile row yet.
      for (const id of memberIds) {
        if (!staffMap.has(id)) staffMap.set(id, { id, name: "Staff" });
      }
      // Safety net: any staff_id on an existing shift that's not in the member list.
      for (const s of shifts) {
        if (s.staff_id && !staffMap.has(s.staff_id))
          staffMap.set(s.staff_id, { id: s.staff_id, name: "Staff" });
      }
      return { shifts, clients, teams, staff: Array.from(staffMap.values()) };
    },
  });
}

// Daily-rate codes — re-exported from the single source of truth
// (src/lib/service-billing.ts) so the scheduler and pay router agree.
export const DAILY_CODES = DAILY_SERVICE_CODES;
export const isDaily = (code: string | null | undefined) => isDailyServiceCode(code);

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
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); // Monday-aligned (Mon=0)
  return x;
}
