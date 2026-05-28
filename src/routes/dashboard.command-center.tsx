import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useCurrentOrg } from "@/hooks/use-org";
import { RequirePermission } from "@/components/rbac-guard";
import { AgencyHealthSnapshot } from "@/components/agency-health-snapshot";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, CheckCircle2, Clock, ClipboardList, ShieldAlert, Search, BarChart3, Loader2, TimerReset, CalendarX } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/command-center")({
  head: () => ({ meta: [{ title: "Agency Command Center — Care Academy" }] }),
  component: CommandCenter,
});

type IncidentReport = {
  id: string; report_number: string; client_id: string; reported_by: string;
  incident_date: string; incident_time: string; incident_types: string[];
  narrative_before: string; narrative_during: string; narrative_after: string;
  immediate_actions: string; status: string; submitted_at: string;
  state_submission_deadline: string; state_submitted_at: string | null;
  state_confirmation_number: string | null; ai_trigger_reasons: string[];
  clients: { first_name: string; last_name: string; medicaid_id: string | null } | null;
  profiles: { full_name: string | null; email: string | null } | null;
};

type PendingTimesheet = {
  id: string; client_id: string; staff_id: string; service_type_code: string;
  clock_in_timestamp: string; clock_out_timestamp: string | null; status: string;
  ai_compliance_status: string | null; is_out_of_bounds: boolean | null;
  outside_geofence_reason: string | null; shift_note_text: string | null;
  clients: { first_name: string; last_name: string } | null;
  profiles: { full_name: string | null; email: string | null } | null;
};

type PendingDailyLog = {
  id: string; client_id: string; user_id: string; log_date: string;
  narrative: string; pcsp_goals_addressed: string[]; status: string;
  ai_compliance_status: string | null; submitted_at: string;
  submitted_late: boolean; backdated: boolean;
  clients: { first_name: string; last_name: string } | null;
  profiles: { full_name: string | null; email: string | null } | null;
};

type OpenShift = {
  id: string; client_id: string; staff_id: string;
  service_type_code: string; clock_in_timestamp: string;
  clients: { first_name: string; last_name: string } | null;
  profiles: { full_name: string | null; email: string | null } | null;
};

type Tab = "urgent" | "pending" | "approved" | "analytics";
type PendingFilter = "all" | "timesheets" | "daily_logs" | "incidents";

function hoursAgo(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / 3_600_000;
}
function hoursLeft(iso: string): number {
  return (new Date(iso).getTime() - Date.now()) / 3_600_000;
}
function fmtDeadline(iso: string): string {
  const h = hoursLeft(iso);
  if (h <= 0) return "⏰ OVERDUE";
  if (h < 1) return `${Math.floor(h * 60)}m remaining`;
  return `${Math.floor(h)}h ${Math.floor((h % 1) * 60)}m remaining`;
}
function deadlineColor(iso: string): string {
  const h = hoursLeft(iso);
  if (h <= 0) return "text-rose-600 font-bold";
  if (h <= 4) return "text-rose-500 font-semibold";
  if (h <= 8) return "text-amber-500 font-semibold";
  return "text-muted-foreground";
}
function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function clientName(r: { clients: { first_name: string; last_name: string } | null }): string {
  return r.clients ? `${r.clients.first_name} ${r.clients.last_name}`.trim() : "—";
}
function staffName(r: { profiles: { full_name: string | null; email: string | null } | null }): string {
  return r.profiles?.full_name ?? r.profiles?.email ?? "—";
}

function CommandCenter() {
  const { data: org } = useCurrentOrg();
  return (
    <RequirePermission perm="manage_users">

      {org && <CommandCenterInner orgId={org.organization_id} />}
    </RequirePermission>
  );
}

function CommandCenterInner({ orgId }: { orgId: string }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("urgent");
  const [pendingFilter, setPendingFilter] = useState<PendingFilter>("all");
  const [search, setSearch] = useState("");
  const [activeIncident, setActiveIncident] = useState<IncidentReport | null>(null);
  const [stateRefNum, setStateRefNum] = useState("");
  const [activeTimesheet, setActiveTimesheet] = useState<PendingTimesheet | null>(null);
  const [denialReason, setDenialReason] = useState("");
  const [activeDailyLog, setActiveDailyLog] = useState<PendingDailyLog | null>(null);
  const [dailyDenialReason, setDailyDenialReason] = useState("");

  const { data: incidents = [], isLoading: incLoading } = useQuery({
    enabled: !!orgId,
    queryKey: ["cmd-incidents", orgId],
    queryFn: async (): Promise<IncidentReport[]> => {
      const { data, error } = await supabase
        .from("incident_reports")
        .select(`id, report_number, client_id, reported_by, incident_date, incident_time,
          incident_types, narrative_before, narrative_during, narrative_after,
          immediate_actions, status, submitted_at, state_submission_deadline,
          state_submitted_at, state_confirmation_number, ai_trigger_reasons,
          clients:client_id (first_name, last_name, medicaid_id),
          profiles:reported_by (full_name, email)`)
        .eq("organization_id", orgId)
        .order("submitted_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as IncidentReport[];
    },
    refetchInterval: 60_000,
  });

  const { data: timesheets = [], isLoading: tsLoading } = useQuery({
    enabled: !!orgId,
    queryKey: ["cmd-timesheets", orgId],
    queryFn: async (): Promise<PendingTimesheet[]> => {
      const { data, error } = await supabase
        .from("evv_timesheets")
        .select(`id, client_id, staff_id, service_type_code, clock_in_timestamp,
          clock_out_timestamp, status, ai_compliance_status, is_out_of_bounds,
          outside_geofence_reason, shift_note_text,
          clients:client_id (first_name, last_name),
          profiles:staff_id (full_name, email)`)
        .eq("organization_id", orgId)
        .in("status", ["Pending", "Flagged"])
        .order("clock_in_timestamp", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as unknown as PendingTimesheet[];
    },
  });

  const { data: dailyLogs = [], isLoading: dlLoading } = useQuery({
    enabled: !!orgId,
    queryKey: ["cmd-daily-logs", orgId],
    queryFn: async (): Promise<PendingDailyLog[]> => {
      const { data, error } = await supabase
        .from("daily_logs")
        .select(`id, client_id, user_id, log_date, narrative, pcsp_goals_addressed,
          status, ai_compliance_status, submitted_at, submitted_late, backdated,
          clients:client_id (first_name, last_name),
          profiles:user_id (full_name, email)`)
        .eq("organization_id", orgId)
        .eq("status", "pending_approval")
        .order("log_date", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as unknown as PendingDailyLog[];
    },
  });

  const { data: openShifts = [] } = useQuery({
    enabled: !!orgId,
    queryKey: ["cmd-open-shifts", orgId],
    queryFn: async (): Promise<OpenShift[]> => {
      const cutoff = new Date(Date.now() - 16 * 3_600_000).toISOString();
      const { data, error } = await supabase
        .from("evv_timesheets")
        .select(`id, client_id, staff_id, service_type_code, clock_in_timestamp,
          clients:client_id (first_name, last_name),
          profiles:staff_id (full_name, email)`)
        .eq("organization_id", orgId)
        .eq("status", "Active")
        .is("clock_out_timestamp", null)
        .lt("clock_in_timestamp", cutoff)
        .order("clock_in_timestamp", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as OpenShift[];
    },
    refetchInterval: 300_000,
  });

  const { data: approvedTimesheets = [] } = useQuery({
    enabled: !!orgId && tab === "approved",
    queryKey: ["cmd-approved-ts", orgId],
    queryFn: async (): Promise<PendingTimesheet[]> => {
      const { data, error } = await supabase
        .from("evv_timesheets")
        .select(`id, client_id, staff_id, service_type_code, clock_in_timestamp,
          clock_out_timestamp, status, ai_compliance_status, is_out_of_bounds,
          outside_geofence_reason, shift_note_text,
          clients:client_id (first_name, last_name),
          profiles:staff_id (full_name, email)`)
        .eq("organization_id", orgId).eq("status", "Approved")
        .order("clock_in_timestamp", { ascending: false }).limit(100);
      if (error) throw error;
      return (data ?? []) as unknown as PendingTimesheet[];
    },
  });

  const { data: approvedLogs = [] } = useQuery({
    enabled: !!orgId && tab === "approved",
    queryKey: ["cmd-approved-logs", orgId],
    queryFn: async (): Promise<PendingDailyLog[]> => {
      const { data, error } = await supabase
        .from("daily_logs")
        .select(`id, client_id, user_id, log_date, narrative, pcsp_goals_addressed,
          status, ai_compliance_status, submitted_at, submitted_late, backdated,
          clients:client_id (first_name, last_name),
          profiles:user_id (full_name, email)`)
        .eq("organization_id", orgId).eq("status", "approved")
        .order("log_date", { ascending: false }).limit(100);
      if (error) throw error;
      return (data ?? []) as unknown as PendingDailyLog[];
    },
  });

  const submitToStateMut = useMutation({
    mutationFn: async ({ id, refNum }: { id: string; refNum: string }) => {
      const { error } = await supabase.from("incident_reports").update({
        status: "Submitted_To_State",
        state_submitted_at: new Date().toISOString(),
        state_submitted_by: user!.id,
        state_confirmation_number: refNum || null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("✅ Marked as submitted to state database.");
      qc.invalidateQueries({ queryKey: ["cmd-incidents", orgId] });
      setActiveIncident(null); setStateRefNum("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const approveTimesheetMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("evv_timesheets").update({
        status: "Approved", approved_at: new Date().toISOString(), approved_by: user!.id,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Timesheet approved.");
      qc.invalidateQueries({ queryKey: ["cmd-timesheets", orgId] });
      setActiveTimesheet(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const denyTimesheetMut = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await supabase.from("evv_timesheets").update({ status: "Rejected", denial_reason: reason } as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Timesheet returned to staff.");
      qc.invalidateQueries({ queryKey: ["cmd-timesheets", orgId] });
      setActiveTimesheet(null); setDenialReason("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const approveDailyLogMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("daily_logs").update({
        status: "approved", approved_at: new Date().toISOString(), approved_by: user!.id,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Daily log approved.");
      qc.invalidateQueries({ queryKey: ["cmd-daily-logs", orgId] });
      setActiveDailyLog(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const denyDailyLogMut = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const { error } = await supabase.from("daily_logs").update({
        status: "rejected", denial_reason: reason,
        denied_by: user!.id, denied_at: new Date().toISOString(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Daily log returned to caregiver.");
      qc.invalidateQueries({ queryKey: ["cmd-daily-logs", orgId] });
      setActiveDailyLog(null); setDailyDenialReason("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const urgentIncidents  = incidents.filter((i) => i.status === "Pending_Admin_Review");
  const urgentTimesheets = timesheets.filter((t) => t.ai_compliance_status === "Exception" || t.is_out_of_bounds);
  const urgentCount      = urgentIncidents.length + urgentTimesheets.length + openShifts.length;
  const pendingCount     = timesheets.length + dailyLogs.length + urgentIncidents.length;

  const q = search.toLowerCase();
  const filteredTimesheets = timesheets.filter((t) => !q || clientName(t).toLowerCase().includes(q) || staffName(t).toLowerCase().includes(q));
  const filteredLogs       = dailyLogs.filter((l) => !q || clientName(l).toLowerCase().includes(q) || staffName(l).toLowerCase().includes(q));
  const filteredIncidents  = urgentIncidents.filter((i) => !q || clientName(i).toLowerCase().includes(q) || staffName(i).toLowerCase().includes(q));

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "urgent",    label: "🚨 Urgent",          count: urgentCount  },
    { id: "pending",   label: "📋 Pending Review",   count: pendingCount },
    { id: "approved",  label: "✅ Approved Archive"                       },
    { id: "analytics", label: "📊 Analytics"                              },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">🏢 Agency Command Center</h1>
        <p className="mt-1 text-sm text-muted-foreground">Daily triage desk — everything that needs your attention, in priority order.</p>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-border pb-3">
        {tabs.map((t) => (
          <button key={t.id} type="button" onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition ${
              tab === t.id ? "bg-primary text-primary-foreground shadow-sm" : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}>
            {t.label}
            {t.count !== undefined && t.count > 0 && (
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                tab === t.id ? "bg-white/20 text-white" : t.id === "urgent" ? "bg-rose-500 text-white" : "bg-primary/15 text-primary"
              }`}>{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {tab === "urgent" && (
        <div className="space-y-6">
          {urgentCount === 0 && !incLoading && !tsLoading ? (
            <Card className="p-12 text-center">
              <CheckCircle2 className="mx-auto mb-3 h-12 w-12 text-emerald-500" />
              <p className="text-lg font-semibold text-emerald-700 dark:text-emerald-400">All Clear</p>
              <p className="mt-1 text-sm text-muted-foreground">No urgent items require your attention right now.</p>
            </Card>
          ) : (
            <>
              {urgentIncidents.length > 0 && (
                <section>
                  <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-rose-600">
                    <ShieldAlert className="h-4 w-4" /> Incident Reports — State Submission Required
                  </h2>
                  <div className="space-y-2">
                    {urgentIncidents.map((inc) => (
                      <Card key={inc.id} className="border-l-4 border-l-rose-500 p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold">{clientName(inc)}</p>
                            <p className="text-xs text-muted-foreground">
                              {inc.report_number} · Filed by {staffName(inc)} · {fmtDate(inc.submitted_at)} {fmtTime(inc.submitted_at)}
                            </p>
                            {inc.incident_types?.length > 0 && (
                              <div className="mt-1 flex flex-wrap gap-1">
                                {inc.incident_types.map((t) => <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>)}
                              </div>
                            )}
                          </div>
                          <div className="flex flex-col items-end gap-2">
                            <span className={`text-xs ${deadlineColor(inc.state_submission_deadline)}`}>
                              ⏱ {fmtDeadline(inc.state_submission_deadline)}
                            </span>
                            <Button size="sm" onClick={() => { setActiveIncident(inc); setStateRefNum(""); }}>
                              Review &amp; Submit to State
                            </Button>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                </section>
              )}

              {openShifts.length > 0 && (
                <section>
                  <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-amber-600">
                    <TimerReset className="h-4 w-4" /> Open Shifts — Staff Did Not Clock Out
                  </h2>
                  <div className="space-y-2">
                    {openShifts.map((s) => (
                      <Card key={s.id} className="border-l-4 border-l-amber-500 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="font-semibold">{staffName(s)}</p>
                            <p className="text-xs text-muted-foreground">
                              Serving {clientName(s)} · Clocked in {fmtDate(s.clock_in_timestamp)} at {fmtTime(s.clock_in_timestamp)}
                            </p>
                            <p className="mt-0.5 text-xs text-amber-600 font-medium">
                              {Math.floor(hoursAgo(s.clock_in_timestamp))}h open — no clock-out on record
                            </p>
                          </div>
                          <Link to="/dashboard/compliance-desk"
                            className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-500/20 dark:text-amber-300">
                            View in EVV Desk →
                          </Link>
                        </div>
                      </Card>
                    ))}
                  </div>
                </section>
              )}

              {urgentTimesheets.length > 0 && (
                <section>
                  <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-amber-600">
                    <AlertTriangle className="h-4 w-4" /> EVV Exceptions — Manual Review Required
                  </h2>
                  <div className="space-y-2">
                    {urgentTimesheets.map((t) => (
                      <Card key={t.id} className="border-l-4 border-l-amber-400 p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold">{staffName(t)} → {clientName(t)}</p>
                            <p className="text-xs text-muted-foreground">{t.service_type_code} · {fmtDate(t.clock_in_timestamp)}</p>
                            <div className="mt-1 flex gap-1.5">
                              {t.is_out_of_bounds && <Badge className="bg-rose-100 text-rose-800 text-[10px] dark:bg-rose-500/15 dark:text-rose-200">Out of Bounds</Badge>}
                              {t.ai_compliance_status === "Exception" && <Badge className="bg-amber-100 text-amber-800 text-[10px] dark:bg-amber-500/15 dark:text-amber-200">AI Exception</Badge>}
                            </div>
                          </div>
                          <Button size="sm" variant="outline" onClick={() => { setActiveTimesheet(t); setDenialReason(""); }}>Review</Button>
                        </div>
                      </Card>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      )}

      {tab === "pending" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-[200px] flex-1">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by client or staff name…" className="pl-8 h-9 text-sm" />
            </div>
            <div className="flex gap-1.5">
              {(["all","timesheets","daily_logs","incidents"] as PendingFilter[]).map((f) => (
                <button key={f} type="button" onClick={() => setPendingFilter(f)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                    pendingFilter === f ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}>
                  {f === "all" ? "All" : f === "timesheets" ? "Timesheets" : f === "daily_logs" ? "Daily Logs" : "Incidents"}
                </button>
              ))}
            </div>
          </div>

          {(pendingFilter === "all" || pendingFilter === "incidents") && filteredIncidents.length > 0 && (
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Incident Reports ({filteredIncidents.length})</h3>
              <Card className="overflow-hidden">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Report #</TableHead><TableHead>Client</TableHead>
                    <TableHead>Filed By</TableHead><TableHead>Date</TableHead>
                    <TableHead>State Deadline</TableHead><TableHead></TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {filteredIncidents.map((inc) => (
                      <TableRow key={inc.id} className="cursor-pointer" onClick={() => { setActiveIncident(inc); setStateRefNum(""); }}>
                        <TableCell className="font-mono text-xs">{inc.report_number}</TableCell>
                        <TableCell className="font-medium">{clientName(inc)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{staffName(inc)}</TableCell>
                        <TableCell className="text-sm">{fmtDate(inc.submitted_at)}</TableCell>
                        <TableCell className={`text-xs ${deadlineColor(inc.state_submission_deadline)}`}>{fmtDeadline(inc.state_submission_deadline)}</TableCell>
                        <TableCell><Badge className="bg-amber-100 text-amber-800 text-[10px] dark:bg-amber-500/15 dark:text-amber-200">Pending</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            </section>
          )}

          {(pendingFilter === "all" || pendingFilter === "timesheets") && filteredTimesheets.length > 0 && (
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">EVV Timesheets ({filteredTimesheets.length})</h3>
              <Card className="overflow-hidden">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Staff</TableHead><TableHead>Client</TableHead>
                    <TableHead>Service</TableHead><TableHead>Date</TableHead>
                    <TableHead>Flags</TableHead><TableHead></TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {filteredTimesheets.map((t) => (
                      <TableRow key={t.id} className="cursor-pointer" onClick={() => { setActiveTimesheet(t); setDenialReason(""); }}>
                        <TableCell className="font-medium">{staffName(t)}</TableCell>
                        <TableCell>{clientName(t)}</TableCell>
                        <TableCell className="font-mono text-xs">{t.service_type_code}</TableCell>
                        <TableCell className="text-sm">{fmtDate(t.clock_in_timestamp)}</TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {t.is_out_of_bounds && <Badge className="bg-rose-100 text-rose-800 text-[10px] dark:bg-rose-500/15 dark:text-rose-200">OOB</Badge>}
                            {t.ai_compliance_status === "Exception" && <Badge className="bg-amber-100 text-amber-800 text-[10px]">AI Exception</Badge>}
                            {t.ai_compliance_status === "Flagged" && <Badge className="bg-amber-100 text-amber-800 text-[10px]">Flagged</Badge>}
                          </div>
                        </TableCell>
                        <TableCell><Badge className="bg-amber-100 text-amber-800 text-[10px] dark:bg-amber-500/15 dark:text-amber-200">Pending</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            </section>
          )}

          {(pendingFilter === "all" || pendingFilter === "daily_logs") && filteredLogs.length > 0 && (
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">HHS Daily Logs ({filteredLogs.length})</h3>
              <Card className="overflow-hidden">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Caregiver</TableHead><TableHead>Client</TableHead>
                    <TableHead>Log Date</TableHead><TableHead>Flags</TableHead><TableHead></TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {filteredLogs.map((l) => (
                      <TableRow key={l.id} className="cursor-pointer" onClick={() => { setActiveDailyLog(l); setDailyDenialReason(""); }}>
                        <TableCell className="font-medium">{staffName(l)}</TableCell>
                        <TableCell>{clientName(l)}</TableCell>
                        <TableCell className="text-sm">{fmtDate(l.log_date)}</TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {l.submitted_late && <Badge className="bg-blue-100 text-blue-800 text-[10px] dark:bg-blue-500/15 dark:text-blue-200">Late</Badge>}
                            {l.backdated && <Badge className="bg-purple-100 text-purple-800 text-[10px] dark:bg-purple-500/15 dark:text-purple-200">Backdated</Badge>}
                            {l.ai_compliance_status === "Exception" && <Badge className="bg-amber-100 text-amber-800 text-[10px]">AI Exception</Badge>}
                          </div>
                        </TableCell>
                        <TableCell><Badge className="bg-amber-100 text-amber-800 text-[10px] dark:bg-amber-500/15 dark:text-amber-200">Pending</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            </section>
          )}

          {pendingCount === 0 && !tsLoading && !dlLoading && !incLoading && (
            <Card className="p-12 text-center">
              <CheckCircle2 className="mx-auto mb-3 h-12 w-12 text-emerald-500" />
              <p className="text-lg font-semibold">Nothing pending review</p>
              <p className="mt-1 text-sm text-muted-foreground">All submitted records have been reviewed.</p>
            </Card>
          )}
        </div>
      )}

      {tab === "approved" && (
        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search approved records…" className="pl-8 h-9 text-sm max-w-sm" />
          </div>

          {approvedTimesheets.length > 0 && (
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Approved Timesheets</h3>
              <Card className="overflow-hidden">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Staff</TableHead><TableHead>Client</TableHead>
                    <TableHead>Service</TableHead><TableHead>Date</TableHead><TableHead>EVV Status</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {approvedTimesheets
                      .filter((t) => !q || clientName(t).toLowerCase().includes(q) || staffName(t).toLowerCase().includes(q))
                      .map((t) => (
                        <TableRow key={t.id}>
                          <TableCell className="font-medium">{staffName(t)}</TableCell>
                          <TableCell>{clientName(t)}</TableCell>
                          <TableCell className="font-mono text-xs">{t.service_type_code}</TableCell>
                          <TableCell className="text-sm">{fmtDate(t.clock_in_timestamp)}</TableCell>
                          <TableCell>
                            {t.is_out_of_bounds
                              ? <Badge className="bg-amber-100 text-amber-800 text-[10px]">Variance on File</Badge>
                              : <Badge className="bg-emerald-100 text-emerald-800 text-[10px]">Clean</Badge>}
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </Card>
            </section>
          )}

          {approvedLogs.length > 0 && (
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Approved Daily Logs</h3>
              <Card className="overflow-hidden">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Caregiver</TableHead><TableHead>Client</TableHead>
                    <TableHead>Log Date</TableHead><TableHead>Notes</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {approvedLogs
                      .filter((l) => !q || clientName(l).toLowerCase().includes(q) || staffName(l).toLowerCase().includes(q))
                      .map((l) => (
                        <TableRow key={l.id}>
                          <TableCell className="font-medium">{staffName(l)}</TableCell>
                          <TableCell>{clientName(l)}</TableCell>
                          <TableCell className="text-sm">{fmtDate(l.log_date)}</TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              {l.submitted_late && <Badge className="bg-blue-100 text-blue-800 text-[10px]">Late</Badge>}
                              {l.backdated && <Badge className="bg-purple-100 text-purple-800 text-[10px]">Backdated</Badge>}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </Card>
            </section>
          )}

          {approvedTimesheets.length === 0 && approvedLogs.length === 0 && (
            <Card className="p-12 text-center">
              <CalendarX className="mx-auto mb-3 h-10 w-10 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">No approved records yet.</p>
            </Card>
          )}
        </div>
      )}

      {tab === "analytics" && <AgencyHealthSnapshot organizationId={orgId} />}

      {/* Incident report review dialog */}
      <Dialog open={!!activeIncident} onOpenChange={(o) => { if (!o) { setActiveIncident(null); setStateRefNum(""); } }}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-rose-500" />
              Incident Report — {activeIncident?.report_number}
            </DialogTitle>
            <DialogDescription>
              {activeIncident && `${clientName(activeIncident)} · Filed by ${staffName(activeIncident)} · ${fmtDate(activeIncident.submitted_at)}`}
            </DialogDescription>
          </DialogHeader>
          {activeIncident && (
            <div className="space-y-4">
              <div className={`rounded-lg border p-3 text-xs font-medium ${deadlineColor(activeIncident.state_submission_deadline)}`}>
                ⏱ State submission deadline: {fmtDeadline(activeIncident.state_submission_deadline)}
              </div>
              {activeIncident.incident_types?.length > 0 && (
                <div>
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Classification</p>
                  <div className="flex flex-wrap gap-1.5">
                    {activeIncident.incident_types.map((t) => <Badge key={t} variant="secondary">{t}</Badge>)}
                  </div>
                </div>
              )}
              {activeIncident.narrative_before && (
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Before Incident</p>
                  <p className="rounded-lg border bg-muted/30 p-3 text-sm whitespace-pre-wrap">{activeIncident.narrative_before}</p>
                </div>
              )}
              {activeIncident.narrative_during && (
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">During Incident</p>
                  <p className="rounded-lg border bg-muted/30 p-3 text-sm whitespace-pre-wrap">{activeIncident.narrative_during}</p>
                </div>
              )}
              {activeIncident.narrative_after && (
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">After / Resolution</p>
                  <p className="rounded-lg border bg-muted/30 p-3 text-sm whitespace-pre-wrap">{activeIncident.narrative_after}</p>
                </div>
              )}
              {activeIncident.immediate_actions && (
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Immediate Actions Taken</p>
                  <p className="rounded-lg border bg-muted/30 p-3 text-sm whitespace-pre-wrap">{activeIncident.immediate_actions}</p>
                </div>
              )}
              <div className="grid gap-2">
                <Label htmlFor="state-ref">State confirmation / reference number (optional)</Label>
                <Input id="state-ref" value={stateRefNum} onChange={(e) => setStateRefNum(e.target.value)}
                  placeholder="Enter state database reference number after submission" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setActiveIncident(null); setStateRefNum(""); }}>Close</Button>
            <Button onClick={() => submitToStateMut.mutate({ id: activeIncident!.id, refNum: stateRefNum })}
              disabled={submitToStateMut.isPending} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              {submitToStateMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              ✅ Mark Submitted to State Database
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Timesheet review dialog */}
      <Dialog open={!!activeTimesheet} onOpenChange={(o) => { if (!o) { setActiveTimesheet(null); setDenialReason(""); } }}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>EVV Timesheet Review</DialogTitle>
            <DialogDescription>
              {activeTimesheet && `${staffName(activeTimesheet)} → ${clientName(activeTimesheet)} · ${fmtDate(activeTimesheet.clock_in_timestamp)}`}
            </DialogDescription>
          </DialogHeader>
          {activeTimesheet && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg border bg-muted/30 p-3">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Service Code</p>
                  <p className="font-mono font-semibold">{activeTimesheet.service_type_code}</p>
                </div>
                <div className="rounded-lg border bg-muted/30 p-3">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">EVV Status</p>
                  <p className={activeTimesheet.is_out_of_bounds ? "text-rose-600 font-semibold" : "text-emerald-600 font-semibold"}>
                    {activeTimesheet.is_out_of_bounds ? "🔴 Out of Bounds" : "🟢 Clean"}
                  </p>
                </div>
              </div>
              {activeTimesheet.outside_geofence_reason && (
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Variance Justification</p>
                  <p className="rounded-lg border bg-amber-50 p-3 text-sm dark:bg-amber-950/30">{activeTimesheet.outside_geofence_reason}</p>
                </div>
              )}
              {activeTimesheet.shift_note_text && (
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Shift Note</p>
                  <p className="rounded-lg border bg-muted/30 p-3 text-sm whitespace-pre-wrap">{activeTimesheet.shift_note_text}</p>
                </div>
              )}
              <div className="grid gap-2">
                <Label htmlFor="ts-denial">Denial reason (required to deny)</Label>
                <Textarea id="ts-denial" rows={3} value={denialReason} onChange={(e) => setDenialReason(e.target.value)}
                  placeholder="Explain why this timesheet is being returned to staff…" />
              </div>
            </div>
          )}
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button onClick={() => approveTimesheetMut.mutate(activeTimesheet!.id)}
              disabled={approveTimesheetMut.isPending} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white">
              {approveTimesheetMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              ✅ Approve Timesheet
            </Button>
            <Button variant="outline"
              onClick={() => denyTimesheetMut.mutate({ id: activeTimesheet!.id, reason: denialReason })}
              disabled={denyTimesheetMut.isPending || denialReason.trim().length < 5}
              className="w-full border-rose-500/50 text-rose-700 hover:bg-rose-500/10 dark:text-rose-300">
              {denyTimesheetMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              🔴 Deny &amp; Return to Staff
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Daily log review dialog */}
      <Dialog open={!!activeDailyLog} onOpenChange={(o) => { if (!o) { setActiveDailyLog(null); setDailyDenialReason(""); } }}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>HHS Daily Log Review</DialogTitle>
            <DialogDescription>
              {activeDailyLog && `${staffName(activeDailyLog)} → ${clientName(activeDailyLog)} · ${fmtDate(activeDailyLog.log_date)}`}
            </DialogDescription>
          </DialogHeader>
          {activeDailyLog && (
            <div className="space-y-3">
              {(activeDailyLog.submitted_late || activeDailyLog.backdated) && (
                <div className="rounded-lg border border-blue-500/30 bg-blue-50 p-3 text-xs dark:bg-blue-950/30">
                  {activeDailyLog.backdated && <p>📅 <strong>Backdated entry</strong> — submitted after the service date.</p>}
                  {activeDailyLog.submitted_late && <p>🕐 <strong>Late submission</strong> — submitted after the due date.</p>}
                  <p className="mt-1 text-muted-foreground">Noted for admin awareness. Documentation is complete.</p>
                </div>
              )}
              {activeDailyLog.pcsp_goals_addressed?.length > 0 && (
                <div>
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">PCSP Goals Addressed</p>
                  <div className="flex flex-wrap gap-1.5">
                    {activeDailyLog.pcsp_goals_addressed.map((g) => <Badge key={g} variant="secondary" className="font-normal">{g}</Badge>)}
                  </div>
                </div>
              )}
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Narrative</p>
                <p className="rounded-lg border bg-muted/30 p-3 text-sm whitespace-pre-wrap">{activeDailyLog.narrative}</p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="dl-denial">Denial reason (required to deny)</Label>
                <Textarea id="dl-denial" rows={3} value={dailyDenialReason} onChange={(e) => setDailyDenialReason(e.target.value)}
                  placeholder="Explain why this daily log is being returned to the caregiver…" />
              </div>
            </div>
          )}
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button onClick={() => approveDailyLogMut.mutate(activeDailyLog!.id)}
              disabled={approveDailyLogMut.isPending} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white">
              {approveDailyLogMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              ✅ Approve Daily Log
            </Button>
            <Button variant="outline"
              onClick={() => denyDailyLogMut.mutate({ id: activeDailyLog!.id, reason: dailyDenialReason })}
              disabled={denyDailyLogMut.isPending || dailyDenialReason.trim().length < 5}
              className="w-full border-rose-500/50 text-rose-700 hover:bg-rose-500/10 dark:text-rose-300">
              {denyDailyLogMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              🔴 Deny &amp; Return to Caregiver
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
