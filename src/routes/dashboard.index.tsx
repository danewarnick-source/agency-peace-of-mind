import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useCurrentOrg } from "@/hooks/use-org";
import { Users, Award, AlertTriangle, TrendingUp } from "lucide-react";

export const Route = createFileRoute("/dashboard/")({ component: Overview });

function Overview() {
  const { user } = useAuth();
  const { data: org } = useCurrentOrg();
  const navigate = useNavigate();
  const isManager = org?.role === "admin" || org?.role === "manager" || org?.role === "super_admin";

  // Super admins live on the platform console.
  useEffect(() => {
    if (org?.role === "super_admin") navigate({ to: "/dashboard/super-admin" });
  }, [org?.role, navigate]);

  const { data: stats } = useQuery({
    enabled: !!org && isManager,
    queryKey: ["overview-stats", org?.organization_id],
    queryFn: async () => {
      const [{ count: empCount }, { data: assigns }, { data: certs }] = await Promise.all([
        supabase.from("organization_members").select("*", { count: "exact", head: true }).eq("organization_id", org!.organization_id).eq("active", true),
        supabase.from("course_assignments").select("status").eq("organization_id", org!.organization_id),
        supabase.from("certifications").select("expires_at").eq("organization_id", org!.organization_id),
      ]);
      const total = assigns?.length ?? 0;
      const completed = assigns?.filter((a) => a.status === "completed").length ?? 0;
      const overdue = assigns?.filter((a) => a.status === "overdue").length ?? 0;
      const now = new Date();
      const soon = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      const expiringSoon = (certs ?? []).filter((c) => c.expires_at && new Date(c.expires_at) > now && new Date(c.expires_at) < soon).length;
      return { employees: empCount ?? 0, completion: total ? Math.round((completed / total) * 100) : 0, expiringSoon, overdue };
    },
  });

  const { data: myAssigns } = useQuery({
    enabled: !!user,
    queryKey: ["my-assigns", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("course_assignments")
        .select("id, status, progress, due_date, courses(title, category)")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(5);
      return data ?? [];
    },
  });

  return (
    <div className="space-y-8">
      {isManager && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: "Active employees", value: String(stats?.employees ?? "—"), icon: Users, tone: "accent" as const },
            { label: "Completion rate", value: stats ? `${stats.completion}%` : "—", icon: TrendingUp, tone: "success" as const },
            { label: "Overdue training", value: String(stats?.overdue ?? "—"), icon: AlertTriangle, tone: "warning" as const },
            { label: "Expiring in 30 days", value: String(stats?.expiringSoon ?? "—"), icon: Award, tone: "accent" as const },
          ].map((m) => {
            const Icon = m.icon;
            return (
              <div key={m.label} className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-muted-foreground">{m.label}</p>
                  <span className={`inline-flex h-9 w-9 items-center justify-center rounded-lg ${
                    m.tone === "success" ? "bg-success/15 text-success" :
                    m.tone === "warning" ? "bg-warning/20 text-warning-foreground" : "bg-accent/15 text-accent"
                  }`}><Icon className="h-4 w-4" /></span>
                </div>
                <p className="mt-3 text-3xl font-semibold tracking-tight">{m.value}</p>
              </div>
            );
          })}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)] lg:col-span-2">
          <h2 className="text-base font-semibold">My active training</h2>
          {!myAssigns?.length ? (
            <div className="mt-6 rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              <p>You don't have any assigned training yet.</p>
              <p className="mt-1">Browse the <a href="/dashboard/courses" className="font-medium text-accent hover:underline">Course Library</a> to get started.</p>
            </div>
          ) : (
            <ul className="mt-4 divide-y divide-border">
              {myAssigns.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-4 py-3 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{(a.courses as { title: string } | null)?.title}</p>
                    <p className="text-xs text-muted-foreground">{(a.courses as { category: string } | null)?.category} · {a.status.replace("_", " ")}</p>
                  </div>
                  <div className="w-28 shrink-0">
                    <div className="h-2 overflow-hidden rounded-full bg-secondary"><div className="h-full bg-[image:var(--gradient-brand)]" style={{ width: `${a.progress}%` }} /></div>
                    <p className="mt-1 text-right text-[11px] text-muted-foreground">{a.progress}%</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="rounded-2xl border border-border bg-[image:var(--gradient-hero)] p-6 text-white shadow-[var(--shadow-elegant)]">
          <h3 className="text-base font-semibold">Welcome to Care Academy</h3>
          <p className="mt-2 text-sm text-white/80">
            {isManager
              ? "You're set up as an admin. Invite employees and assign their first course in under a minute."
              : "Browse the course library and complete your assigned training to earn certifications."}
          </p>
          <a href={isManager ? "/dashboard/employees" : "/dashboard/courses"} className="mt-4 inline-flex rounded-lg bg-white px-3 py-2 text-sm font-medium text-primary hover:bg-white/90">
            {isManager ? "Invite an employee" : "Browse courses"}
          </a>
        </div>
      </div>
    </div>
  );
}
