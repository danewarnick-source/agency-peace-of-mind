import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./use-auth";
import { useCurrentOrg } from "./use-org";

export type TodayShiftRow = {
  id: string;
  client_id: string;
  client_name: string;
  job_code: string | null;
  starts_at: string;
  ends_at: string;
};

/**
 * Returns ALL of the current staff's scheduled shifts for today
 * (published OR accepted), sorted by start time.
 */
export function useTodayShifts() {
  const { user } = useAuth();
  const { data: org } = useCurrentOrg();

  return useQuery({
    enabled: !!user?.id && !!org?.organization_id,
    queryKey: ["today-shifts-all", user?.id, org?.organization_id],
    queryFn: async (): Promise<TodayShiftRow[]> => {
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
        starts_at: string; ends_at: string;
        clients: { first_name: string; last_name: string } | null;
      }>;
      return rows.map((r) => ({
        id: r.id,
        client_id: r.client_id,
        client_name: r.clients
          ? `${r.clients.first_name} ${r.clients.last_name}`.trim()
          : "Client",
        job_code: r.job_code,
        starts_at: r.starts_at,
        ends_at: r.ends_at,
      }));
    },
  });
}
