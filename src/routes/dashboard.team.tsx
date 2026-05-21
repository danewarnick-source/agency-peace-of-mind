import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-org";

export const Route = createFileRoute("/dashboard/team")({ component: TeamPage });

function TeamPage() {
  const { data: org } = useCurrentOrg();

  const { data: rows } = useQuery({
    enabled: !!org,
    queryKey: ["team-progress", org?.organization_id],
    queryFn: async () => {
      const { data: members } = await supabase
        .from("organization_members")
        .select("user_id")
        .eq("organization_id", org!.organization_id)
        .eq("active", true);
      const userIds = (members ?? []).map((m) => m.user_id);
      const safeIds = userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"];
      const [{ data: profiles }, { data: assigns }] = await Promise.all([
        supabase.from("profiles").select("id, full_name, email").in("id", safeIds),
        supabase.from("course_assignments").select("user_id, status, progress, due_date").eq("organization_id", org!.organization_id),
      ]);
      return (profiles ?? []).map((p) => {
        const mine = (assigns ?? []).filter((a) => a.user_id === p.id);
        const completed = mine.filter((a) => a.status === "completed").length;
        const overdue = mine.filter((a) => a.due_date && new Date(a.due_date) < new Date() && a.status !== "completed").length;
        return { ...p, total: mine.length, completed, overdue, avg: mine.length ? Math.round(mine.reduce((s, a) => s + a.progress, 0) / mine.length) : 0 };
      });
    },
  });

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
        <h2 className="text-base font-semibold">Team progress</h2>
        <p className="text-sm text-muted-foreground">Track training completion and overdue assignments across your team.</p>
      </div>

      <div className="rounded-2xl border border-border bg-card shadow-[var(--shadow-card)]">
        <table className="w-full text-sm">
          <thead className="border-b border-border text-xs uppercase text-muted-foreground">
            <tr><th className="p-4 text-left">Employee</th><th className="p-4 text-left">Assigned</th><th className="p-4 text-left">Completed</th><th className="p-4 text-left">Overdue</th><th className="p-4 text-left">Avg progress</th></tr>
          </thead>
          <tbody>
            {!rows?.length && <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">No team members yet.</td></tr>}
            {rows?.map((r) => (
              <tr key={r.id} className="border-b border-border last:border-0">
                <td className="p-4"><div className="font-medium">{r.full_name ?? "—"}</div><div className="text-xs text-muted-foreground">{r.email}</div></td>
                <td className="p-4">{r.total}</td>
                <td className="p-4">{r.completed}</td>
                <td className="p-4">{r.overdue > 0 ? <span className="font-medium text-destructive">{r.overdue}</span> : "0"}</td>
                <td className="p-4">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-24 overflow-hidden rounded-full bg-secondary"><div className="h-full bg-[image:var(--gradient-brand)]" style={{ width: `${r.avg}%` }} /></div>
                    <span className="text-xs text-muted-foreground">{r.avg}%</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
