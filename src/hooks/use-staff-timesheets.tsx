import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./use-auth";
import { useNectarPayPeriod } from "./use-nectar-pay-period";
import { displayPersonName } from "@/lib/person-name";
import {
  staffDisplayHours,
  staffTimesheetStatus,
} from "@/lib/staff-display-hours";

export type StaffTimesheetRow = {
  id: string;
  date_label: string;
  sort_iso: string;
  person_label: string;
  hours: number;
  status: string;
  awaiting_approval: boolean;
};

function formatRowDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "—";
  return new Date(ms).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

/**
 * Read-only submitted timesheets for the current pay period.
 * Hours use the corrected duration. No edit / delete / re-open.
 */
export function useStaffTimesheets() {
  const { user } = useAuth();
  const { data: period } = useNectarPayPeriod();

  return useQuery({
    enabled: !!user?.id && !!period?.start_iso && !!period?.end_iso,
    queryKey: [
      "staff-my-timesheets",
      user?.id,
      period?.start_iso,
      period?.end_iso,
    ],
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<StaffTimesheetRow[]> => {
      const start = period!.start_iso;
      const end = period!.end_iso;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;
      const [{ data: evvRows, error: evvErr }, { data: genRows, error: genErr }] =
        await Promise.all([
          db
            .from("evv_timesheets")
            .select(
              "id, client_id, clock_in_timestamp, clock_out_timestamp, corrected_clock_in, corrected_clock_out, review_status, clients:client_id(first_name, last_name)",
            )
            .eq("staff_id", user!.id)
            .not("clock_out_timestamp", "is", null)
            .gte("clock_in_timestamp", start)
            .lte("clock_in_timestamp", end)
            .order("clock_in_timestamp", { ascending: false }),
          db
            .from("general_shifts")
            .select("id, clock_in_timestamp, clock_out_timestamp")
            .eq("user_id", user!.id)
            .not("clock_out_timestamp", "is", null)
            .gte("clock_out_timestamp", start)
            .lte("clock_out_timestamp", end)
            .order("clock_out_timestamp", { ascending: false }),
        ]);
      if (evvErr) throw evvErr;
      if (genErr) throw genErr;

      const rows: StaffTimesheetRow[] = [];

      for (const r of (evvRows ?? []) as Array<{
        id: string;
        clock_in_timestamp: string;
        clock_out_timestamp: string | null;
        corrected_clock_in: string | null;
        corrected_clock_out: string | null;
        review_status: string | null;
        clients: { first_name: string | null; last_name: string | null } | null;
      }>) {
        const hours = staffDisplayHours(r);
        if (hours <= 0) continue;
        const status = staffTimesheetStatus(r);
        const person = r.clients
          ? displayPersonName(r.clients.first_name, r.clients.last_name)
          : "Not with a client";
        rows.push({
          id: `evv-${r.id}`,
          date_label: formatRowDate(r.corrected_clock_in || r.clock_in_timestamp),
          sort_iso: r.clock_in_timestamp,
          person_label: person || "Not with a client",
          hours,
          status,
          awaiting_approval: status === "Awaiting supervisor approval",
        });
      }

      for (const r of (genRows ?? []) as Array<{
        id: string;
        clock_in_timestamp: string;
        clock_out_timestamp: string;
      }>) {
        const hours = staffDisplayHours({
          clock_in_timestamp: r.clock_in_timestamp,
          clock_out_timestamp: r.clock_out_timestamp,
        });
        if (hours <= 0) continue;
        rows.push({
          id: `gen-${r.id}`,
          date_label: formatRowDate(r.clock_in_timestamp),
          sort_iso: r.clock_in_timestamp,
          person_label: "Not with a client",
          hours,
          status: "Submitted",
          awaiting_approval: false,
        });
      }

      rows.sort((a, b) => b.sort_iso.localeCompare(a.sort_iso));
      return rows;
    },
  });
}
