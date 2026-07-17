import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./use-auth";
import { useCurrentOrg } from "./use-org";

export type TodayShift = {
  id: string;
  client_id: string;
  client_name: string;
  job_code: string | null;
  starts_at: string;
  ends_at: string;
};

export type ActiveTimesheet = {
  id: string;
  client_id: string;
  service_type_code: string;
  clock_in_timestamp: string;
};

/**
 * Returns the current staff's next/active scheduled shift for today
 * (published OR accepted), plus any currently-open EVV timesheet.
 */
export function useTodayShift() {
  const { user } = useAuth();
  const { data: org } = useCurrentOrg();

  const shiftQuery = useQuery({
    enabled: !!user?.id && !!org?.organization_id,
    queryKey: ["today-shift", user?.id, org?.organization_id],
    queryFn: async (): Promise<TodayShift | null> => {
      const now = new Date();
      const start = new Date(now); start.setHours(0, 0, 0, 0);
      const end = new Date(now); end.setHours(23, 59, 59, 999);

      const { data, error } = await supabase
        .from("scheduled_shifts")
        .select("id, client_id, job_code, starts_at, ends_at, status, published, clients:client_id(first_name, last_name)")
        .eq("staff_id", user!.id)
        .eq("organization_id", org!.organization_id)
        .gte("starts_at", start.toISOString())
        .lte("starts_at", end.toISOString())
        .or("published.eq.true,status.eq.accepted")
        .order("starts_at", { ascending: true });
      if (error) throw error;

      const rows = (data ?? []) as Array<{
        id: string; client_id: string; job_code: string | null;
        starts_at: string; ends_at: string; status: string; published: boolean;
        clients: { first_name: string; last_name: string } | null;
      }>;
      // Prefer a shift currently in window; otherwise first upcoming today.
      const nowMs = now.getTime();
      const current = rows.find(
        (r) => new Date(r.starts_at).getTime() <= nowMs && new Date(r.ends_at).getTime() >= nowMs,
      );
      const pick = current ?? rows[0];
      if (!pick) return null;
      const c = pick.clients;
      return {
        id: pick.id,
        client_id: pick.client_id,
        client_name: c ? `${c.first_name} ${c.last_name}`.trim() : "Client",
        job_code: pick.job_code,
        starts_at: pick.starts_at,
        ends_at: pick.ends_at,
      };
    },
  });

  const activeQuery = useQuery({
    enabled: !!user?.id,
    queryKey: ["active-timesheet-overview", user?.id],
    queryFn: async (): Promise<ActiveTimesheet | null> => {
      const { data, error } = await supabase
        .from("evv_timesheets")
        .select("id, client_id, service_type_code, clock_in_timestamp")
        .eq("staff_id", user!.id)
        .is("clock_out_timestamp", null)
        .order("clock_in_timestamp", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data as ActiveTimesheet | null) ?? null;
    },
  });

  return {
    shift: shiftQuery.data ?? null,
    active: activeQuery.data ?? null,
    isLoading: shiftQuery.isLoading || activeQuery.isLoading,
  };
}
