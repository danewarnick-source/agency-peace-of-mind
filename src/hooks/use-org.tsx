import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./use-auth";
import type { Role } from "@/lib/rbac";

export type { Role };

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
      // Prefer highest-privilege active membership so super admins land on their console.
      const { data, error } = await supabase
        .from("organization_members")
        .select("id, role, job_title, organization_id, organizations(name)")
        .eq("user_id", user!.id)
        .eq("active", true);
      if (error || !data?.length) return null;
      const rank: Record<Role, number> = { super_admin: 0, admin: 1, manager: 2, employee: 3 };
      const sorted = [...data].sort((a, b) => rank[a.role as Role] - rank[b.role as Role]);
      const m = sorted[0];
      return {
        membership_id: m.id,
        organization_id: m.organization_id,
        organization_name: (m.organizations as { name: string } | null)?.name ?? "Workspace",
        role: m.role as Role,
        job_title: m.job_title,
      };
    },
  });
  return q;
}
