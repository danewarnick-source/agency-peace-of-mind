import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./use-auth";

export type ActiveShift = {
  id: string;
  client_id: string;
  client_name: string;
  service_type_code: string;
  clock_in_timestamp: string;
  evv_live: boolean;
};

/**
 * Single global source for the staff member's currently-open EVV timesheet.
 * Drives the persistent clocked-in status bar, caseload "on the clock" badge,
 * and the Time Clock screen so they all share the same client/code/timer.
 */
export function useActiveShift() {
  const { user } = useAuth();

  return useQuery({
    enabled: !!user?.id,
    queryKey: ["active-shift", user?.id],
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<ActiveShift | null> => {
      const { data, error } = await supabase
        .from("evv_timesheets")
        .select(
          "id, client_id, service_type_code, clock_in_timestamp, gps_in_coordinates, clients:client_id(first_name, last_name)",
        )
        .eq("staff_id", user!.id)
        .is("clock_out_timestamp", null)
        .order("clock_in_timestamp", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const row = data as unknown as {
        id: string;
        client_id: string;
        service_type_code: string;
        clock_in_timestamp: string;
        gps_in_coordinates: { latitude?: number; longitude?: number } | null;
        clients: { first_name: string; last_name: string } | null;
      };
      return {
        id: row.id,
        client_id: row.client_id,
        service_type_code: row.service_type_code,
        clock_in_timestamp: row.clock_in_timestamp,
        evv_live: !!row.gps_in_coordinates?.latitude,
        client_name: row.clients
          ? `${row.clients.first_name} ${row.clients.last_name}`.trim()
          : "Client",
      };
    },
  });
}
