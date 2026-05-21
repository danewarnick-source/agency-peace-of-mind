import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./use-auth";

export type Role = "admin" | "manager" | "employee";

export interface CurrentMembership {
  membership_id: string;
  organization_id: string;
  organization_name: string;
  role: Role;
  job_title: string | null;
}

export function useCurrentOrg() {
  const { user } = useAuth();
  const q = useQuery({
    enabled: !!user,
    queryKey: ["current-org", user?.id],
    queryFn: async (): Promise<CurrentMembership | null> => {
      const { data, error } = await supabase
        .from("organization_members")
        .select("id, role, job_title, organization_id, organizations(name)")
        .eq("user_id", user!.id)
        .eq("active", true)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (error || !data) return null;
      return {
        membership_id: data.id,
        organization_id: data.organization_id,
        organization_name: (data.organizations as { name: string } | null)?.name ?? "Workspace",
        role: data.role as Role,
        job_title: data.job_title,
      };
    },
  });
  return q;
}
