import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
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
import { Users, Award, AlertTriangle, TrendingUp, UserPlus, Radio } from "lucide-react";
import { toast } from "sonner";
import { EvvShiftControl } from "@/components/evv-shift-control";
import { Badge } from "@/components/ui/badge";
import { jobCodeLabel } from "@/lib/job-codes";

export const Route = createFileRoute("/dashboard/")({ component: Overview });

type Role = "admin" | "manager" | "employee";

function Overview() {
  const { user } = useAuth();
  const { data: org } = useCurrentOrg();
  const { view } = usePortalView();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const isManager = org?.role === "admin" || org?.role === "manager" || org?.role === "super_admin";
  const showAdmin = isManager && view === "admin";
  const [inviteOpen, setInviteOpen] = useState(false);

  useEffect(() => {
    if (org?.role === "super_admin") navigate({ to: "/dashboard/super-admin" });
  }, [org?.role, navigate]);

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

  // Compliance status per employee — track training_modules completed
  const { data: compliance } = useQuery({
    enabled: !!org && showAdmin,
    queryKey: ["compliance-status", org?.organization_id],
    queryFn: async () => {
      const [{ data: mems }, { count: totalModules }, { data: progress }] = await Promise.all([
        supabase.from("organization_members").select("user_id").eq("organization_id", org!.organization_id).eq("active", true),
        supabase.from("training_modules").select("*", { count: "exact", head: true }),
        supabase.from("user_training_progress").select("user_id, is_completed"),
      ]);
      const ids = (mems ?? []).map((m) => m.user_id);
      if (!ids.length) return { total: totalModules ?? 6, rows: [] as Array<{ id: string; name: string; pct: number }> };
      const { data: profs } = await supabase
        .from("profiles").select("id, full_name, email").in("id", ids);
      const completedBy = new Map<string, number>();
      (progress ?? []).forEach((p) => {
        if (p.is_completed) completedBy.set(p.user_id, (completedBy.get(p.user_id) ?? 0) + 1);
      });
      const tot = totalModules ?? 6;
      const rows = (profs ?? []).map((p) => {
        const done = completedBy.get(p.id) ?? 0;
        return { id: p.id, name: p.full_name || p.email || "—", pct: Math.min(100, Math.round((done / tot) * 100)) };
      }).sort((a, b) => a.name.localeCompare(b.name));
      return { total: tot, rows };
    },
  });

  // Live active-shift monitor (admin view)
  const { data: liveShifts } = useQuery({
    enabled: !!org && showAdmin,
    queryKey: ["live-shifts", org?.organization_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shifts")
        .select(`id, user_id, clock_in_time, outside_geofence,
          profiles:user_id(full_name, email),
          clients:client_id(first_name, last_name, job_code)`)
        .eq("organization_id", org!.organization_id)
        .eq("status", "active")
        .is("clock_out_time", null)
        .order("clock_in_time", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 30_000,
  });

  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!showAdmin) return;
    const id = window.setInterval(() => setTick((n) => n + 1), 60_000);
    return () => window.clearInterval(id);
  }, [showAdmin]);
  void tick;

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
      {/* Header with invite button */}
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

      {showAdmin && <LiveMonitor shifts={liveShifts ?? []} />}

      {showAdmin ? (
        <div className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
          <div className="flex items-end justify-between">
            <div>
              <h3 className="text-base font-semibold">Company Compliance Status</h3>
              <p className="text-xs text-muted-foreground">
                Onboarding progress across the {compliance?.total ?? 6}-module Utah DSPD compliance track.
              </p>
            </div>
            <span className="text-xs text-muted-foreground">{compliance?.rows.length ?? 0} employees</span>
          </div>
          <div className="mt-6 space-y-3">
            {!compliance?.rows.length ? (
              <p className="text-sm text-muted-foreground">No employees yet — invite your team to begin.</p>
            ) : (
              compliance.rows.map((r) => (
                <div key={r.id} className="grid grid-cols-[180px_1fr_48px] items-center gap-4">
                  <span className="truncate text-sm">{r.name}</span>
                  <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                    <div
                      className="h-full bg-[image:var(--gradient-brand)] transition-all"
                      style={{ width: `${r.pct}%` }}
                    />
                  </div>
                  <span className="text-right text-xs tabular-nums text-muted-foreground">{r.pct}%</span>
                </div>
              ))
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <EvvShiftControl />
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
