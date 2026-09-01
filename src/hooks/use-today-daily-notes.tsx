import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "./use-org";
import { denverYmd } from "@/lib/denver-date";

/**
 * Client IDs that already have a daily note for America/Denver today.
 * Caseload hides the open-work daily-note CTA for these people.
 */
export function useTodayDailyNoteClients() {
  const { data: org } = useCurrentOrg();
  const today = denverYmd();

  return useQuery({
    enabled: !!org?.organization_id,
    queryKey: ["today-daily-notes", org?.organization_id, today],
    queryFn: async (): Promise<Set<string>> => {
      if (!org?.organization_id) return new Set();
      const { data, error } = await supabase
        .from("daily_logs")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .select("client_id" as any)
        .eq("organization_id", org.organization_id)
        .eq("log_date", today);
      if (error) throw error;
      const ids = new Set<string>();
      for (const r of (data ?? []) as Array<{ client_id: string | null }>) {
        if (r.client_id) ids.add(r.client_id);
      }
      return ids;
    },
  });
}
