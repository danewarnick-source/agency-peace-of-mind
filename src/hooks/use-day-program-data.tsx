import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "./use-org";

export type DPSession = {
  id: string;
  session_date: string;
  service_code: "DSG" | "DSP" | "DSI" | "SED";
  location_label: string | null;
  start_time: string;
  end_time: string;
};
export type DPSessionStaff = { id: string; session_id: string; staff_id: string };
export type DPAttendance = {
  id: string;
  session_id: string;
  client_id: string;
  attended: boolean;
};

export function useDayProgramData(weekStart: Date) {
  const { data: org } = useCurrentOrg();
  const orgId = org?.organization_id;
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);

  return useQuery({
    enabled: !!orgId,
    queryKey: ["day-program-data", orgId, weekStart.toISOString()],
    queryFn: async () => {
      const startDate = weekStart.toISOString().slice(0, 10);
      const endDate = weekEnd.toISOString().slice(0, 10);
      const { data: sessions, error } = await supabase
        .from("day_program_sessions")
        .select("id, session_date, service_code, location_label, start_time, end_time")
        .eq("organization_id", orgId!)
        .gte("session_date", startDate)
        .lt("session_date", endDate);
      if (error) throw error;
      const ids = (sessions ?? []).map((s) => s.id);
      const [staffRes, attRes] = await Promise.all([
        ids.length
          ? supabase
              .from("day_program_session_staff")
              .select("id, session_id, staff_id")
              .in("session_id", ids)
          : Promise.resolve({ data: [] as DPSessionStaff[], error: null }),
        ids.length
          ? supabase
              .from("day_program_attendance")
              .select("id, session_id, client_id, attended")
              .in("session_id", ids)
          : Promise.resolve({ data: [] as DPAttendance[], error: null }),
      ]);
      return {
        sessions: (sessions ?? []) as DPSession[],
        sessionStaff: (staffRes.data ?? []) as DPSessionStaff[],
        attendance: (attRes.data ?? []) as DPAttendance[],
      };
    },
  });
}
