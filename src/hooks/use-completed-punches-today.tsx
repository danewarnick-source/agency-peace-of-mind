import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./use-auth";
import { denverWallToIso, denverYmd } from "@/lib/denver-date";
import type { CompletedPunch } from "@/lib/caseload-open-work";

/**
 * Clocked-out punches for this staff member from Denver yesterday
 * through tomorrow (overnight SLH). Caseload matches them to today's
 * scheduled windows — it does not hide tomorrow's shift.
 */
export function useCompletedPunchesToday() {
  const { user } = useAuth();
  const today = denverYmd();

  return useQuery({
    enabled: !!user?.id,
    queryKey: ["staff-completed-punches", user?.id, today],
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<CompletedPunch[]> => {
      const [y, m, d] = today.split("-").map(Number);
      const yesterday = new Date(Date.UTC(y, m - 1, d));
      yesterday.setUTCDate(yesterday.getUTCDate() - 1);
      const ymdYesterday = yesterday.toISOString().slice(0, 10);
      const startIso = denverWallToIso(ymdYesterday, 12, 0);
      const endIso = denverWallToIso(today, 23, 59);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("evv_timesheets")
        .select(
          "client_id, service_type_code, clock_in_timestamp, clock_out_timestamp, corrected_clock_in, corrected_clock_out, review_status",
        )
        .eq("staff_id", user!.id)
        .not("clock_out_timestamp", "is", null)
        .gte("clock_in_timestamp", startIso)
        .lte("clock_in_timestamp", endIso);
      if (error) throw error;
      return (data ?? []) as CompletedPunch[];
    },
  });
}
