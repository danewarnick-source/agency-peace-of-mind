import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useCurrentOrg } from "@/hooks/use-org";
import { usePortalView } from "@/hooks/use-portal-view";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserPlus } from "lucide-react";
import { toast } from "sonner";

import { StaffClientGrid } from "@/components/staff-client-grid";
import { AgencyHealthSnapshot } from "@/components/agency-health-snapshot";

export const Route = createFileRoute("/dashboard/")({ component: Overview });

type Role = "admin" | "manager" | "employee";

function Overview() {
  const { user } = useAuth();
  const { data: org } = useCurrentOrg();
  const { view } = usePortalView();
  const qc = useQueryClient();

  const isManager = org?.role === "admin" || org?.role === "manager" || org?.role === "super_admin";
  const showAdmin = isManager && view === "admin";
  const [inviteOpen, setInviteOpen] = useState(false);

  const { data: stats } = useQuery({
    enabled: !!org && showAdmin,
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
    enabled: !!user && !showAdmin,
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

  const inviteMutation = useMutation({
    mutationFn: async (input: { email: string; role: Role }) => {
      const { error } = await supabase.from("invitations").insert({
        organization_id: org!.organization_id, email: input.email, role: input.role, invited_by: user!.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Invitation created");
      qc.invalidateQueries({ queryKey: ["invites"] });
      setInviteOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">
            {showAdmin ? "Company Overview" : "Welcome back"}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {showAdmin
              ? "Real-time compliance status across your organization."
              : "Pick up where you left off with your assigned training."}
          </p>
        </div>
        {showAdmin && (
          <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" className="shrink-0">
                <UserPlus className="mr-2 h-4 w-4" /> Invite employee
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Invite an employee</DialogTitle></DialogHeader>
              <form onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                inviteMutation.mutate({ email: String(fd.get("email")), role: String(fd.get("role")) as Role });
              }} className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="email">Email address</Label>
                  <Input id="email" name="email" type="email" required />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="role">Role</Label>
                  <Select name="role" defaultValue="employee">
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="employee">Employee</SelectItem>
                      <SelectItem value="manager">Manager</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={inviteMutation.isPending}>Create invitation</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {showAdmin && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: "Active employees", value: String(stats?.employees ?? "—"), icon: Users },
            { label: "Completion rate", value: stats ? `${stats.completion}%` : "—", icon: TrendingUp },
            { label: "Overdue training", value: String(stats?.overdue ?? "—"), icon: AlertTriangle },
            { label: "Expiring in 30 days", value: String(stats?.expiringSoon ?? "—"), icon: Award },
          ].map((m) => {
            const Icon = m.icon;
            return (
              <div key={m.label} className="rounded-xl border border-border bg-card p-5">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{m.label}</p>
                  <Icon className="h-4 w-4 text-muted-foreground" />
                </div>
                <p className="mt-3 text-3xl font-semibold tracking-tight">{m.value}</p>
              </div>
            );
          })}
        </div>
      )}

      {!showAdmin && (
        <div className="space-y-6">
          <StaffClientGrid />
          <div className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
            <h2 className="text-base font-semibold">My active training</h2>
            {!myAssigns?.length ? (
              <div className="mt-6 rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                <p>You don't have any assigned training yet.</p>
                <p className="mt-1">Open <Link to="/dashboard/courses" className="font-medium text-accent hover:underline">My Trainings</Link> to start your compliance roadmap.</p>
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
        </div>
      )}
    </div>
  );
}
