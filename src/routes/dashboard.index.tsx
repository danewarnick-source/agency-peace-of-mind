import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
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

function ComplianceInbox() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const { data: rejectedLogs = [] } = useQuery({
    enabled: !!user?.id,
    queryKey: ["inbox-rejected-logs", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("daily_logs")
        .select("id, client_id, log_date, denial_reason, clients:client_id(first_name, last_name)")
        .eq("user_id", user!.id)
        .eq("status", "rejected")
        .order("log_date", { ascending: false })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .limit(10) as any;
      return (data ?? []) as Array<{
        id: string; client_id: string; log_date: string;
        denial_reason: string | null;
        clients: { first_name: string; last_name: string } | null;
      }>;
    },
  });

  const { data: openShifts = [] } = useQuery({
    enabled: !!user?.id,
    queryKey: ["inbox-open-shifts", user?.id],
    queryFn: async () => {
      const cutoff = new Date(Date.now() - 16 * 3_600_000).toISOString();
      const { data } = await supabase
        .from("evv_timesheets")
        .select("id, client_id, clock_in_timestamp, service_type_code, clients:client_id(first_name, last_name)")
        .eq("staff_id", user!.id)
        .eq("status", "Active")
        .is("clock_out_timestamp", null)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .lt("clock_in_timestamp", cutoff) as any;
      return (data ?? []) as Array<{
        id: string; client_id: string; clock_in_timestamp: string;
        service_type_code: string;
        clients: { first_name: string; last_name: string } | null;
      }>;
    },
  });

  const totalItems = rejectedLogs.length + openShifts.length;
  if (totalItems === 0) return null;

  return (
    <div className="rounded-2xl border-2 border-amber-500/40 bg-amber-50 p-5 dark:bg-amber-950/20">
      <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-amber-800 dark:text-amber-200">
        ⚠️ Needs Your Attention ({totalItems})
      </h2>
      <ul className="space-y-2">
        {openShifts.map((s) => (
          <li key={s.id}
            className="flex items-center justify-between gap-3 rounded-lg border border-amber-500/30 bg-white px-3 py-2.5 dark:bg-amber-950/30">
            <div className="min-w-0">
              <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
                🕐 Open shift — {s.clients ? `${s.clients.first_name} ${s.clients.last_name}` : "Unknown client"}
              </p>
              <p className="text-xs text-amber-700 dark:text-amber-300">
                Clocked in {new Date(s.clock_in_timestamp).toLocaleDateString()} — never clocked out
              </p>
            </div>
            <Button size="sm" variant="outline"
              className="shrink-0 border-amber-500/50 text-amber-800 hover:bg-amber-100 dark:text-amber-200"
              onClick={() => navigate({ to: "/dashboard/timeclock" })}>
              Fix Now →
            </Button>
          </li>
        ))}
        {rejectedLogs.map((l) => (
          <li key={l.id}
            className="flex items-center justify-between gap-3 rounded-lg border border-rose-500/30 bg-white px-3 py-2.5 dark:bg-rose-950/30">
            <div className="min-w-0">
              <p className="text-sm font-medium text-rose-900 dark:text-rose-100">
                📋 Daily log returned — {l.clients ? `${l.clients.first_name} ${l.clients.last_name}` : "Unknown"} ·{" "}
                {new Date(l.log_date + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" })}
              </p>
              {l.denial_reason && (
                <p className="text-xs text-rose-700 dark:text-rose-300">Admin note: {l.denial_reason}</p>
              )}
            </div>
            <Button size="sm" variant="outline"
              className="shrink-0 border-rose-500/50 text-rose-800 hover:bg-rose-100 dark:text-rose-200"
              onClick={() => navigate({ to: "/dashboard/daily-logs" })}>
              Fix Now →
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Overview() {
  const { user } = useAuth();
  const { data: org } = useCurrentOrg();
  const { view } = usePortalView();
  const qc = useQueryClient();

  const isManager = org?.role === "admin" || org?.role === "manager" || org?.role === "super_admin";
  const showAdmin = isManager && view === "admin";
  const [inviteOpen, setInviteOpen] = useState(false);


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

      {showAdmin && org && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-6 text-center space-y-2">
          <p className="text-base font-semibold">Admin tools have moved</p>
          <p className="text-sm text-muted-foreground">
            The Agency Command Center is your new daily triage desk — urgent items,
            pending reviews, approved records, and analytics all in one place.
          </p>
          <a
            href="/dashboard/command-center"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition mt-2"
          >
            🏢 Open Agency Command Center →
          </a>
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
