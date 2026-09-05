import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const ADMIN_HOME_WELCOME_KEY = "admin-home-welcome";

export function adminHomeWelcomeQueryKey(orgId: string | null) {
  return [ADMIN_HOME_WELCOME_KEY, orgId] as const;
}

export type AdminHomeWelcomeCounts = {
  orgCreatedAt: string;
  welcomeDismissedAt: string | null;
  memberCount: number;
  clientCount: number;
  documentedShiftCount: number;
};

/**
 * documentedShiftCount = attested EVV narratives + daily logs for the org.
 * Attested narrative = attested_accurate OR attested_at set.
 */
export async function fetchAdminHomeWelcomeCounts(orgId: string): Promise<AdminHomeWelcomeCounts> {
  const [orgRes, membersRes, clientsRes, timesheetsRes, logsRes] = await Promise.all([
    (supabase as any)
      .from("organizations")
      .select("created_at, welcome_dismissed_at")
      .eq("id", orgId)
      .maybeSingle(),
    (supabase as any)
      .from("organization_members")
      .select("user_id", { count: "exact", head: true })
      .eq("organization_id", orgId),
    (supabase as any)
      .from("clients")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId),
    (supabase as any)
      .from("evv_timesheets")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .or("attested_accurate.eq.true,attested_at.not.is.null"),
    (supabase as any)
      .from("daily_logs")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId),
  ]);

  if (orgRes.error) throw orgRes.error;
  if (membersRes.error) throw membersRes.error;
  if (clientsRes.error) throw clientsRes.error;
  if (timesheetsRes.error) throw timesheetsRes.error;
  if (logsRes.error) throw logsRes.error;

  const org = (orgRes.data ?? null) as {
    created_at?: string | null;
    welcome_dismissed_at?: string | null;
  } | null;

  return {
    orgCreatedAt: org?.created_at ?? "",
    welcomeDismissedAt: org?.welcome_dismissed_at ?? null,
    memberCount: membersRes.count ?? 0,
    clientCount: clientsRes.count ?? 0,
    documentedShiftCount: (timesheetsRes.count ?? 0) + (logsRes.count ?? 0),
  };
}

export function useAdminHomeWelcomeCounts(orgId: string | null) {
  return useQuery({
    enabled: !!orgId,
    queryKey: adminHomeWelcomeQueryKey(orgId),
    queryFn: () => fetchAdminHomeWelcomeCounts(orgId!),
    staleTime: 30_000,
  });
}
