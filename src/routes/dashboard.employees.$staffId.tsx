import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, CalendarDays, Users as UsersIcon, ShieldAlert, FileText, Clock, AlertTriangle, ClipboardList } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-org";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RequirePermission } from "@/components/rbac-guard";
import { StaffHrChecklistCard } from "@/components/hr/staff-hr-checklist-card";
import { OtherAssignmentsAdminSection } from "@/components/training/other-assignments-section";
import { StaffTypeEditor } from "@/components/hr/staff-type-editor";
import { getStaffChecklist } from "@/lib/hr-staff.functions";

export const Route = createFileRoute("/dashboard/employees/$staffId")({
  component: () => (
    <RequirePermission perm="manage_users">
      <StaffProfilePage />
    </RequirePermission>
  ),
});

function StaffProfilePage() {
  const { staffId } = Route.useParams();
  const { data: org } = useCurrentOrg();

  const orgId = org?.organization_id;

  // Membership + basic non-PII profile. Org-scoped — RLS denies cross-org reads.
  const memberQ = useQuery({
    enabled: !!orgId,
    queryKey: ["staff-profile", orgId, staffId],
    queryFn: async () => {
      const { data: m, error: mErr } = await supabase
        .from("organization_members")
        .select("id, role, job_title, active, user_id, created_at")
        .eq("organization_id", orgId!)
        .eq("user_id", staffId)
        .maybeSingle();
      if (mErr) throw mErr;
      if (!m) return null;
      const { data: p } = await supabase
        .from("profiles")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .select("id, full_name, email, username, employee_id, position, department, hire_date, account_status, worker_type, team_id" as any)
        .eq("id", staffId)
        .maybeSingle();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return { member: m, profile: (p ?? null) as any };
    },
  });

  // Caseload — read-only links to client workspaces.
  const caseloadQ = useQuery({
    enabled: !!orgId,
    queryKey: ["staff-caseload", orgId, staffId],
    queryFn: async () => {
      const { data: rows } = await supabase
        .from("staff_assignments")
        .select("client_id, is_group_home_assignment, service_codes")
        .eq("organization_id", orgId!)
        .eq("staff_id", staffId);
      const ids = (rows ?? []).map((r) => r.client_id);
      if (ids.length === 0) return [] as Array<{ id: string; name: string; is_gh: boolean; codes: string[] }>;
      const { data: clients } = await supabase
        .from("clients")
        .select("id, first_name, last_name")
        .in("id", ids);
      const byId = new Map((clients ?? []).map((c) => [c.id, c]));
      return (rows ?? []).map((r) => {
        const c = byId.get(r.client_id);
        return {
          id: r.client_id,
          name: c ? `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || "—" : "—",
          is_gh: !!r.is_group_home_assignment,
          codes: (r.service_codes ?? []) as string[],
        };
      });
    },
  });

  // Team + manager
  const teamId = memberQ.data?.profile?.team_id ?? null;
  const teamQ = useQuery({
    enabled: !!teamId,
    queryKey: ["staff-team", teamId],
    queryFn: async () => {
      const { data: t } = await supabase
        .from("teams")
        .select("id, team_name, manager_id")
        .eq("id", teamId!)
        .maybeSingle();
      if (!t) return null;
      let managerName: string | null = null;
      if (t.manager_id) {
        const { data: mp } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", t.manager_id)
          .maybeSingle();
        managerName = mp?.full_name ?? null;
      }
      return { team_name: t.team_name as string, manager_name: managerName };
    },
  });

  if (!orgId || memberQ.isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading staff profile…</div>;
  }
  if (memberQ.data === null) {
    return (
      <Card className="border-rose-200 bg-rose-50/30">
        <CardContent className="p-6 text-sm text-rose-700">
          <ShieldAlert className="mr-2 inline h-4 w-4" />
          Staffer not found in your organization.
        </CardContent>
      </Card>
    );
  }

  const m = memberQ.data!.member;
  const p = memberQ.data!.profile;
  const name = p?.full_name ?? "—";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/dashboard/employees"><ArrowLeft className="mr-1 h-4 w-4" /> Employees</Link>
          </Button>
          <div>
            <h1 className="text-xl font-semibold">{name}</h1>
            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="secondary" className="uppercase">{m.role}</Badge>
              {p?.position && <Badge variant="outline">{p.position}</Badge>}
              <span>{m.active ? "Active" : "Deactivated"}</span>
              {p?.hire_date && <span>· Hired {p.hire_date}</span>}
            </div>
          </div>
        </div>
        <Button variant="outline" asChild>
          <Link to="/dashboard/employees">Back to list (quick edit)</Link>
        </Button>
      </div>

      <Tabs defaultValue="profile" className="w-full">
        <TabsList>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="requirements">Requirements</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        {/* ----- PROFILE ----- */}
        <TabsContent value="profile" className="mt-4 space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-base">Contact & position</CardTitle></CardHeader>
              <CardContent className="grid gap-2 text-sm">
                <Row label="Email" value={p?.email ?? "—"} />
                <Row label="Login" value={p?.username ?? p?.email ?? "—"} />
                <Row label="Employee ID" value={p?.employee_id ?? "—"} />
                <Row label="Position" value={p?.position ?? "—"} />
                <Row label="System role" value={m.role} />
                <Row label="Worker type" value={p?.worker_type === "1099" ? "1099 contractor" : "W-2 employee"} />
                <Row label="Status" value={m.active ? "Active" : "Deactivated"} />
                <Row label="Department" value={p?.department ?? "—"} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Team</CardTitle></CardHeader>
              <CardContent className="grid gap-2 text-sm">
                {teamId ? (
                  <>
                    <Row label="Team" value={teamQ.data?.team_name ?? "…"} />
                    <Row label="Reports to" value={teamQ.data?.manager_name ?? "—"} />
                    <div>
                      <Button variant="link" size="sm" className="px-0" asChild>
                        <Link to="/dashboard/teams">Manage team membership →</Link>
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className="text-muted-foreground">
                    Not assigned to a team.{" "}
                    <Link to="/dashboard/teams" className="underline">Manage teams</Link>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">Caseload</CardTitle>
                <Button variant="link" size="sm" asChild>
                  <Link to="/dashboard/employees"><UsersIcon className="mr-1 h-3.5 w-3.5" /> Manage caseload →</Link>
                </Button>
              </CardHeader>
              <CardContent>
                {caseloadQ.isLoading ? (
                  <div className="text-sm text-muted-foreground">Loading…</div>
                ) : (caseloadQ.data ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">No clients assigned.</p>
                ) : (
                  <ul className="divide-y">
                    {(caseloadQ.data ?? []).map((c) => (
                      <li key={c.id} className="flex items-center justify-between py-2 text-sm">
                        <Link
                          to="/dashboard/workspace/$clientId"
                          params={{ clientId: c.id }}
                          className="font-medium hover:underline"
                        >
                          {c.name}
                        </Link>
                        <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                          {c.is_gh && <Badge variant="outline">Group home</Badge>}
                          {c.codes.slice(0, 4).map((code) => (
                            <Badge key={code} variant="secondary" className="text-[10px]">{code}</Badge>
                          ))}
                          {c.codes.length > 4 && <span>+{c.codes.length - 4}</span>}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader><CardTitle className="text-base">Schedule</CardTitle></CardHeader>
              <CardContent className="text-sm">
                <p className="text-muted-foreground">
                  View shifts and scheduled time for this staffer in the schedule view.
                </p>
                <div className="mt-3 flex gap-2">
                  <Button variant="outline" size="sm" asChild>
                    <Link to="/dashboard/schedule"><CalendarDays className="mr-1 h-3.5 w-3.5" /> Open schedule →</Link>
                  </Button>
                  <Button variant="ghost" size="sm" asChild>
                    <Link to="/dashboard/scheduling">Scheduling tools →</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Staff type selector (UNION rule). Unchanged. */}
          <StaffTypeEditor organizationId={orgId} staffId={staffId} />

          {/* HR — Sensitive Information block. Permission gating intact;
              server fail-closes for non-admin/non-manager/non-self. */}
          <StaffHrChecklistCard organizationId={orgId} staffId={staffId} view="pii" />
        </TabsContent>

        {/* ----- REQUIREMENTS ----- */}
        <TabsContent value="requirements" className="mt-4 space-y-4">
          <RequirementsTab organizationId={orgId} staffId={staffId} />
        </TabsContent>

        {/* ----- ACTIVITY ----- */}
        <TabsContent value="activity" className="mt-4">
          <ActivityFeed organizationId={orgId} staffId={staffId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border/40 pb-1 last:border-0">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}

/* ======================================================================
 * Requirements tab — summary + filter chips above the existing checklist.
 * Reuses the SAME getStaffChecklist server fn and the SAME expiry logic
 * (60-day window, status === "complete" && !expired = current). Computes
 * counts only — does not write or mutate anything.
 * ====================================================================*/
function RequirementsTab({ organizationId, staffId }: { organizationId: string; staffId: string }) {
  const [filter, setFilter] = useState<"all" | "needs_action" | "current">("all");
  const fetchChecklist = useServerFn(getStaffChecklist);
  const checklistQ = useQuery({
    queryKey: ["staff-checklist", organizationId, staffId],
    queryFn: () => fetchChecklist({ data: { organization_id: organizationId, staff_id: staffId } }),
  });

  const counts = useMemo(() => {
    const todayMs = Date.now();
    const in60Ms = todayMs + 60 * 86400_000;
    const c = { current: 0, expiring: 0, overdue: 0, todo: 0 };
    for (const row of checklistQ.data ?? []) {
      if (row.applicable === false) continue;
      const status = row.completion.status;
      const expMs = row.completion.expires_at ? new Date(row.completion.expires_at).getTime() : null;
      const isExpired = status === "expired" || (expMs !== null && expMs < todayMs);
      const isSoon = expMs !== null && expMs >= todayMs && expMs <= in60Ms;
      if (status === "complete" && !isExpired) c.current++;
      else if (isExpired) c.overdue++;
      else if (isSoon) c.expiring++;
      else c.todo++;
    }
    return c;
  }, [checklistQ.data]);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="grid grid-cols-2 gap-3 p-4 md:grid-cols-4">
          <SummaryStat label="Current" value={counts.current} tone="emerald" />
          <SummaryStat label="Expiring" value={counts.expiring} tone="amber" />
          <SummaryStat label="Overdue" value={counts.overdue} tone="rose" />
          <SummaryStat label="To do" value={counts.todo} tone="muted" />
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>All</FilterChip>
        <FilterChip active={filter === "needs_action"} onClick={() => setFilter("needs_action")}>
          Needs action ({counts.overdue + counts.expiring + counts.todo})
        </FilterChip>
        <FilterChip active={filter === "current"} onClick={() => setFilter("current")}>
          Current ({counts.current})
        </FilterChip>
      </div>

      <StaffHrChecklistCard
        organizationId={organizationId}
        staffId={staffId}
        view="checklist"
        filter={filter}
      />

      <OtherAssignmentsAdminSection organizationId={organizationId} staffId={staffId} />
    </div>
  );
}

function SummaryStat({ label, value, tone }: { label: string; value: number; tone: "emerald" | "amber" | "rose" | "muted" }) {
  const cls =
    tone === "emerald"
      ? "text-emerald-700"
      : tone === "amber"
        ? "text-amber-700"
        : tone === "rose"
          ? "text-rose-700"
          : "text-muted-foreground";
  return (
    <div className="rounded-lg border border-border/60 bg-card p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${cls}`}>{value}</div>
    </div>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
        active
          ? "border-[#137182] bg-[#137182] text-white"
          : "border-border bg-card text-muted-foreground hover:border-[#137182]/40 hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

/* ======================================================================
 * Activity feed — read-only SELECTs of staff-linked records.
 * Pulls: evv_timesheets.staff_id, form_submissions.submitted_by,
 * incident_reports.reported_by. Newest first. No writes; respects RLS.
 * ====================================================================*/
type ActivityItem = {
  id: string;
  kind: "Shift" | "Timesheet" | "Form" | "Incident";
  title: string;
  status: string;
  date: string; // ISO
  href?: string;
};

function ActivityFeed({ organizationId, staffId }: { organizationId: string; staffId: string }) {
  const [filter, setFilter] = useState<"all" | "Shift" | "Timesheet" | "Form" | "Incident">("all");

  // EVV timesheets carry both Shift (scheduled) and Timesheet (post-clock) semantics
  // on a single row. We surface every row twice — once tagged Shift if it has a
  // clock-in, once tagged Timesheet if it has an approval/claim status — so the
  // filter chips work intuitively without a separate "shifts" table.
  const evvQ = useQuery({
    enabled: !!organizationId,
    queryKey: ["activity-evv", organizationId, staffId],
    queryFn: async () => {
      const { data } = await supabase
        .from("evv_timesheets")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .select("id, status, clock_in_timestamp, clock_out_timestamp" as any)
        .eq("organization_id", organizationId)
        .eq("staff_id", staffId)
        .order("clock_in_timestamp", { ascending: false })
        .limit(100);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []) as Array<any>;
    },
  });
  });

  const formsQ = useQuery({
    enabled: !!organizationId,
    queryKey: ["activity-forms", organizationId, staffId],
    queryFn: async () => {
      const { data } = await supabase
        .from("form_submissions")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .select("id, form_id, status, submitted_at, created_at, forms:form_id(name)" as any)
        .eq("organization_id", organizationId)
        .eq("submitted_by", staffId)
        .order("submitted_at", { ascending: false, nullsFirst: false })
        .limit(100);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []) as Array<any>;
    },
  });

  const incidentsQ = useQuery({
    enabled: !!organizationId,
    queryKey: ["activity-incidents", organizationId, staffId],
    queryFn: async () => {
      const { data } = await supabase
        .from("incident_reports")
        .select("id, report_number, status, incident_date, filed_at, client_id, incident_types")
        .eq("organization_id", organizationId)
        .eq("reported_by", staffId)
        .order("filed_at", { ascending: false, nullsFirst: false })
        .limit(100);
      return data ?? [];
    },
  });

  const items = useMemo<ActivityItem[]>(() => {
    const out: ActivityItem[] = [];
    for (const r of evvQ.data ?? []) {
      if (r.clock_in_timestamp) {
        out.push({
          id: `evv-shift-${r.id}`,
          kind: "Shift",
          title: `${r.service_code ?? "Shift"}${r.units != null ? ` · ${r.units} u` : ""}`,
          status: r.clock_out_timestamp ? "Clocked out" : "Clocked in",
          date: r.clock_in_timestamp as string,
        });
      }
      if (r.status) {
        out.push({
          id: `evv-ts-${r.id}`,
          kind: "Timesheet",
          title: `${r.service_code ?? "Timesheet"}${r.units != null ? ` · ${r.units} u` : ""}`,
          status: String(r.status),
          date: (r.clock_in_timestamp ?? new Date().toISOString()) as string,
        });
      }
    }
    for (const r of formsQ.data ?? []) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const formName = (r as any).forms?.name ?? "Form";
      out.push({
        id: `form-${r.id}`,
        kind: "Form",
        title: String(formName),
        status: String(r.status ?? "submitted"),
        date: String(r.submitted_at ?? r.created_at ?? new Date().toISOString()),
      });
    }
    for (const r of incidentsQ.data ?? []) {
      const types = Array.isArray(r.incident_types) ? r.incident_types.join(", ") : "";
      out.push({
        id: `inc-${r.id}`,
        kind: "Incident",
        title: `${r.report_number ?? "Incident"}${types ? ` · ${types}` : ""}`,
        status: String(r.status ?? "filed"),
        date: String(r.filed_at ?? r.incident_date ?? new Date().toISOString()),
      });
    }
    out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    return out;
  }, [evvQ.data, formsQ.data, incidentsQ.data]);

  const filtered = filter === "all" ? items : items.filter((i) => i.kind === filter);
  const isLoading = evvQ.isLoading || formsQ.isLoading || incidentsQ.isLoading;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-base">Activity</CardTitle>
        <span className="text-xs text-muted-foreground">Read-only · newest first</span>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>All</FilterChip>
          <FilterChip active={filter === "Shift"} onClick={() => setFilter("Shift")}>Shifts</FilterChip>
          <FilterChip active={filter === "Timesheet"} onClick={() => setFilter("Timesheet")}>Timesheets</FilterChip>
          <FilterChip active={filter === "Form"} onClick={() => setFilter("Form")}>Forms</FilterChip>
          <FilterChip active={filter === "Incident"} onClick={() => setFilter("Incident")}>Incidents</FilterChip>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading activity…</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground">No activity to show in this filter.</p>
        ) : (
          <ul className="divide-y">
            {filtered.map((it) => (
              <li key={it.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <div className="flex min-w-0 items-center gap-2">
                  <KindBadge kind={it.kind} />
                  <span className="truncate font-medium">{it.title}</span>
                </div>
                <div className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
                  <Badge variant="outline" className="text-[10px] capitalize">{it.status}</Badge>
                  <span>{new Date(it.date).toLocaleDateString()}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function KindBadge({ kind }: { kind: ActivityItem["kind"] }) {
  const map: Record<ActivityItem["kind"], { Icon: typeof FileText; cls: string }> = {
    Shift: { Icon: Clock, cls: "bg-[#137182]/10 text-[#137182]" },
    Timesheet: { Icon: ClipboardList, cls: "bg-[#0B1126]/10 text-[#0B1126]" },
    Form: { Icon: FileText, cls: "bg-muted text-foreground/80" },
    Incident: { Icon: AlertTriangle, cls: "bg-rose-100 text-rose-700" },
  };
  const { Icon, cls } = map[kind];
  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${cls}`}>
      <Icon className="h-3 w-3" /> {kind}
    </span>
  );
}
