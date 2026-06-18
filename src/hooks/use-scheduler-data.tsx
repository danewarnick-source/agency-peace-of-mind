import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "./use-org";

export type SchedClient = {
  id: string;
  first_name: string;
  last_name: string;
  team_id: string | null;
  admin_hours_per_week: number | null;
};
export type SchedTeam = { id: string; team_name: string; setting: string | null };
export type SchedStaff = {
  id: string;
  name: string;
  first_name: string;
  is_active: boolean;
  start_date: string | null;
};
export type SchedShift = {
  id: string;
  staff_id: string | null;
  client_id: string;
  job_code: string | null;
  service_code: string | null;
  starts_at: string;
  ends_at: string;
  status: string;
  published: boolean;
};
export type SchedAuth = {
  client_id: string;
  service_code: string;
  annual_unit_authorization: number | null;
  weekly_cap_units: number | null;
};
export type SchedAssign = { staff_id: string; client_id: string };
export type SchedTimeOff = { staff_id: string; start_date: string; end_date: string };

export function useSchedulerData(weekStart: Date) {
  const { data: org } = useCurrentOrg();
  const orgId = org?.organization_id;
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 35); // fetch enough for month view

  return useQuery({
    enabled: !!orgId,
    queryKey: ["scheduler-data", orgId, weekStart.toISOString()],
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const [clientsRes, teamsRes, membersRes, shiftsRes, authRes, assignRes, toRes] =
        await Promise.all([
          supabase
            .from("clients")
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .select("id, first_name, last_name, team_id, admin_hours_per_week" as any)
            .eq("organization_id", orgId!),
          supabase
            .from("teams")
            .select("id, team_name, setting")
            .eq("organization_id", orgId!),
          supabase
            .from("organization_members")
            .select("user_id")
            .eq("organization_id", orgId!),
          supabase
            .from("scheduled_shifts")
            .select(
              "id, staff_id, client_id, job_code, service_code, starts_at, ends_at, status, published",
            )
            .eq("organization_id", orgId!)
            .gte("starts_at", weekStart.toISOString())
            .lt("starts_at", weekEnd.toISOString()),
          supabase
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .from("client_billing_codes" as any)
            .select(
              "client_id, service_code, annual_unit_authorization, weekly_cap_units, service_end_date",
            )
            .eq("organization_id", orgId!),
          supabase
            .from("staff_assignments")
            .select("staff_id, client_id")
            .eq("organization_id", orgId!),
          supabase
            .from("time_off_requests")
            .select("staff_id, start_date, end_date")
            .eq("organization_id", orgId!)
            .eq("status", "approved")
            .gte("end_date", weekStart.toISOString().slice(0, 10)),
        ]);
      if (shiftsRes.error) throw shiftsRes.error;
      const clients = (clientsRes.data ?? []) as unknown as SchedClient[];
      const teams = (teamsRes.data ?? []) as SchedTeam[];
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
            .select("id, first_name, last_name, full_name, is_active, start_date")
            .in("id", memberIds)
        : { data: [] as any[], error: null };
      const staff: SchedStaff[] = ((profilesRes.data ?? []) as any[]).map((p) => {
        const first = (p.first_name ?? "").toString().trim();
        const last = (p.last_name ?? "").toString().trim();
        const name =
          (p.full_name && String(p.full_name).trim()) ||
          [first, last].filter(Boolean).join(" ") ||
          "Staff";
        return {
          id: p.id,
          name,
          first_name: first || name.split(" ")[0] || "Staff",
          is_active: p.is_active !== false,
          start_date: p.start_date ?? null,
        };
      });
      const auths = ((authRes.data ?? []) as unknown as Array<SchedAuth & { service_end_date: string | null }>)
        .filter((r) => !r.service_end_date || r.service_end_date > today)
        .map((r) => ({
          client_id: r.client_id,
          service_code: r.service_code,
          annual_unit_authorization: r.annual_unit_authorization,
          weekly_cap_units: r.weekly_cap_units,
        }));
      return {
        clients,
        teams,
        staff,
        shifts: (shiftsRes.data ?? []) as SchedShift[],
        auths,
        assigns: (assignRes.data ?? []) as SchedAssign[],
        timeOff: (toRes.data ?? []) as SchedTimeOff[],
      };
    },
  });
}

export function startOfWeek(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); // Monday-aligned (Mon=0)
  return x;
}
export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
