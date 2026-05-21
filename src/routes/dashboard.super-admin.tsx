import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { RequirePermission } from "@/components/rbac-guard";
import { Building2, Users, BookOpen, Award } from "lucide-react";

export const Route = createFileRoute("/dashboard/super-admin")({
  component: () => (
    <RequirePermission perm="view_platform_metrics">
      <SuperAdminConsole />
    </RequirePermission>
  ),
});

function SuperAdminConsole() {
  const { data } = useQuery({
    queryKey: ["super-admin-overview"],
    queryFn: async () => {
      const [orgs, members, assigns, certs] = await Promise.all([
        supabase.from("organizations").select("id, name, created_at").order("created_at", { ascending: false }),
        supabase.from("organization_members").select("organization_id, role", { count: "exact" }),
        supabase.from("course_assignments").select("status"),
        supabase.from("certifications").select("id", { count: "exact", head: true }),
      ]);
      return {
        orgs: orgs.data ?? [],
        memberCount: members.count ?? 0,
        assignmentTotal: assigns.data?.length ?? 0,
        completedTotal: (assigns.data ?? []).filter((a) => a.status === "completed").length,
        certCount: certs.count ?? 0,
      };
    },
  });

  const tiles = [
    { label: "Organizations", value: data?.orgs.length ?? "—", icon: Building2 },
    { label: "Total members", value: data?.memberCount ?? "—", icon: Users },
    { label: "Course assignments", value: data?.assignmentTotal ?? "—", icon: BookOpen },
    { label: "Certifications issued", value: data?.certCount ?? "—", icon: Award },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((t) => {
          const Icon = t.icon;
          return (
            <div key={t.label} className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-muted-foreground">{t.label}</p>
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-accent/15 text-accent"><Icon className="h-4 w-4" /></span>
              </div>
              <p className="mt-3 text-3xl font-semibold tracking-tight">{String(t.value)}</p>
            </div>
          );
        })}
      </div>

      <div className="rounded-2xl border border-border bg-card shadow-[var(--shadow-card)]">
        <div className="border-b border-border p-5">
          <h2 className="text-base font-semibold">All organizations</h2>
          <p className="text-sm text-muted-foreground">Every workspace on the platform.</p>
        </div>
        <table className="w-full text-sm">
          <thead className="text-xs uppercase text-muted-foreground">
            <tr><th className="p-4 text-left">Organization</th><th className="p-4 text-left">Created</th></tr>
          </thead>
          <tbody>
            {!data?.orgs.length && <tr><td colSpan={2} className="p-8 text-center text-muted-foreground">No organizations yet.</td></tr>}
            {data?.orgs.map((o) => (
              <tr key={o.id} className="border-t border-border">
                <td className="p-4 font-medium">{o.name}</td>
                <td className="p-4 text-muted-foreground">{new Date(o.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
