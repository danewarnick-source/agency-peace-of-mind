import { createFileRoute, Link } from "@tanstack/react-router";
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
import { Users, Award, AlertTriangle, TrendingUp, UserPlus, Radio, Clock as ClockIcon } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { jobCodeLabel } from "@/lib/job-codes";
import { StaffClientGrid } from "@/components/staff-client-grid";
import { ComplianceMatrix } from "@/components/compliance-matrix";

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

  // Note: super_admins can freely visit /dashboard to see the caseload view.
  // The dedicated super-admin console is reachable from the sidebar.

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

      {showAdmin && <LiveMonitor shifts={(liveShifts ?? []) as unknown as LiveShift[]} />}

      {showAdmin ? (
        <ComplianceMatrix />

      ) : (
        <div className="space-y-6">
        <StaffClientGrid />
        <PayPeriodTracker />
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

type LiveShift = {
  id: string;
  clock_in_time: string | null;
  outside_geofence: boolean;
  profiles: { full_name: string | null; email: string | null } | null;
  clients: { first_name: string | null; last_name: string | null; job_code: string | null } | null;
};

function durationLabel(iso: string | null) {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return "0 mins";
  const mins = Math.floor(ms / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m} min${m === 1 ? "" : "s"}`;
  return `${h} hr${h === 1 ? "" : "s"} ${m} min${m === 1 ? "" : "s"}`;
}

function LiveMonitor({ shifts }: { shifts: LiveShift[] }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
      <div className="flex items-end justify-between">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
          </span>
          <div>
            <h3 className="flex items-center gap-2 text-base font-semibold">
              <Radio className="h-4 w-4 text-emerald-500" /> Active Field Monitoring
            </h3>
            <p className="text-xs text-muted-foreground">
              Staff currently clocked-in. Updates every 30 seconds.
            </p>
          </div>
        </div>
        <span className="text-xs text-muted-foreground">{shifts.length} on shift</span>
      </div>

      {!shifts.length ? (
        <p className="mt-6 rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No staff are currently clocked into a shift.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-border">
          {shifts.map((s) => {
            const name = s.profiles?.full_name || s.profiles?.email || "—";
            const client = s.clients ? `${s.clients.first_name ?? ""} ${s.clients.last_name ?? ""}`.trim() : "—";
            return (
              <li key={s.id} className="flex items-center justify-between gap-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{name}</p>
                  <p className="truncate text-xs text-muted-foreground">Serving {client || "—"}</p>
                </div>
                <div className="flex items-center gap-2">
                  {s.clients?.job_code && (
                    <Badge variant="outline" className="font-mono" title={jobCodeLabel(s.clients.job_code)}>
                      {s.clients.job_code}
                    </Badge>
                  )}
                  {s.outside_geofence && (
                    <Badge variant="outline" className="border-orange-400 text-orange-700 dark:text-orange-300">
                      <AlertTriangle className="mr-1 h-3 w-3" /> Off-site
                    </Badge>
                  )}
                </div>
                <div className="text-right">
                  <p className="font-mono text-sm tabular-nums">{durationLabel(s.clock_in_time)}</p>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">on clock</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/* ------------------------- Pay Period Hours Tracker ------------------------ */

type PayRange = "current" | "previous" | "week" | "custom";

function getBiweeklyPayPeriod(ref: Date, offsetPeriods = 0): { start: Date; end: Date } {
  // Anchor: a known Monday start for biweekly periods.
  const anchor = new Date(2024, 0, 1); // Mon Jan 1 2024
  const msPerPeriod = 14 * 24 * 3600 * 1000;
  const diff = ref.getTime() - anchor.getTime();
  const periodIndex = Math.floor(diff / msPerPeriod) + offsetPeriods;
  const start = new Date(anchor.getTime() + periodIndex * msPerPeriod);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start.getTime() + msPerPeriod - 1);
  return { start, end };
}

function startOfWeek(ref: Date): { start: Date; end: Date } {
  const d = new Date(ref);
  const day = d.getDay(); // 0 = Sun
  const diff = (day === 0 ? -6 : 1 - day);
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  const end = new Date(d.getTime() + 7 * 24 * 3600 * 1000 - 1);
  return { start: d, end };
}

function fmtShort(d: Date) {
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function PayPeriodTracker() {
  const { user } = useAuth();
  const [range, setRange] = useState<PayRange>("current");
  const [customStart, setCustomStart] = useState<string>("");
  const [customEnd, setCustomEnd] = useState<string>("");

  const { start, end } = (() => {
    const now = new Date();
    if (range === "current") return getBiweeklyPayPeriod(now, 0);
    if (range === "previous") return getBiweeklyPayPeriod(now, -1);
    if (range === "week") return startOfWeek(now);
    if (range === "custom" && customStart && customEnd) {
      const [sy, sm, sd] = customStart.split("-").map(Number);
      const [ey, em, ed] = customEnd.split("-").map(Number);
      return {
        start: new Date(sy, sm - 1, sd, 0, 0, 0, 0),
        end: new Date(ey, em - 1, ed, 23, 59, 59, 999),
      };
    }
    return getBiweeklyPayPeriod(now, 0);
  })();

  const { data: rows } = useQuery({
    enabled: !!user,
    queryKey: ["my-pay-period-shifts", user?.id, start.toISOString(), end.toISOString()],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shifts")
        .select("clock_in_time, clock_out_time")
        .eq("user_id", user!.id)
        .gte("clock_in_time", start.toISOString())
        .lte("clock_in_time", end.toISOString())
        .not("clock_out_time", "is", null);
      if (error) throw error;
      return data ?? [];
    },
  });

  const totalHours = (rows ?? []).reduce((sum, r) => {
    if (!r.clock_in_time || !r.clock_out_time) return sum;
    const ms = new Date(r.clock_out_time).getTime() - new Date(r.clock_in_time).getTime();
    return sum + (ms > 0 ? ms / 3_600_000 : 0);
  }, 0);

  const regular = Math.min(totalHours, 40);
  const overtime = Math.max(0, totalHours - 40);
  const regularPct = Math.min(100, (regular / 40) * 100);

  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-base font-semibold">
            <ClockIcon className="h-4 w-4 text-primary" /> My Hours This Pay Period
          </h3>
          <p className="text-xs text-muted-foreground">
            {fmtShort(start)} – {fmtShort(end)} · Calculated from quarter-hour rounded shifts
          </p>
        </div>
        <Select value={range} onValueChange={(v) => setRange(v as PayRange)}>
          <SelectTrigger className="h-8 w-[180px] text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="current">Current Pay Period</SelectItem>
            <SelectItem value="previous">Previous Pay Period</SelectItem>
            <SelectItem value="week">This Week</SelectItem>
            <SelectItem value="custom">Custom Range…</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {range === "custom" && (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <div className="grid gap-1">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">From</Label>
            <Input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="h-8 w-[160px] text-xs" />
          </div>
          <div className="grid gap-1">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">To</Label>
            <Input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="h-8 w-[160px] text-xs" />
          </div>
        </div>
      )}

      <div className="mt-6 flex items-baseline gap-3">
        <span className="text-5xl font-bold tabular-nums tracking-tight">{totalHours.toFixed(2)}</span>
        <span className="text-sm font-medium text-muted-foreground">Hours Worked</span>
      </div>

      <div className="mt-5 space-y-3">
        <div>
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium">Regular Hours</span>
            <span className="font-mono tabular-nums text-muted-foreground">
              {regular.toFixed(2)} / 40.00
            </span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-secondary">
            <div className="h-full bg-emerald-500 transition-all" style={{ width: `${regularPct}%` }} />
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium">Overtime Hours</span>
            <span className={`font-mono tabular-nums ${overtime > 0 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`}>
              {overtime.toFixed(2)}
            </span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full bg-amber-500 transition-all"
              style={{ width: `${Math.min(100, (overtime / 20) * 100)}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}


