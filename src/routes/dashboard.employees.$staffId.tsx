import { useMemo, useState } from "react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ShieldAlert,
  FileText,
  Clock,
  AlertTriangle,
  ClipboardList,
  Activity as ActivityIcon,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-org";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PersonAvatar } from "@/components/person/person-avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SectionPanel, SectionGroup } from "@/components/clients/section-panel";
import { RequirePermission } from "@/components/rbac-guard";
import { EmployeeFaceSheetButton } from "@/components/employees/employee-face-sheet-button";
import { StaffProfilePanel } from "@/components/employees/staff-profile-panel";
import { StaffObligationsFilesTab } from "@/components/employees/staff-obligations-files-tab";
import { ALL_PERMISSIONS, type Permission } from "@/lib/rbac";

const PROFILE_TABS = ["profile", "personnel", "activity"] as const;
type ProfileTab = (typeof PROFILE_TABS)[number];
type SearchTab = ProfileTab | "record" | "obligations" | "permissions";

function resolveTab(tab: SearchTab | undefined): ProfileTab {
  if (tab === "record" || tab === "obligations") return "personnel";
  if (tab === "permissions") return "profile";
  if (tab && (PROFILE_TABS as readonly string[]).includes(tab)) return tab;
  return "profile";
}

export const Route = createFileRoute("/dashboard/employees/$staffId")({
  validateSearch: (s: Record<string, unknown>): { tab?: SearchTab; override_perm?: Permission } => {
    const out: { tab?: SearchTab; override_perm?: Permission } = {};
    if (
      typeof s.tab === "string" &&
      (s.tab === "record" || s.tab === "obligations" || s.tab === "permissions" || (PROFILE_TABS as readonly string[]).includes(s.tab))
    ) {
      out.tab = s.tab as SearchTab;
    }
    if (typeof s.override_perm === "string" && (ALL_PERMISSIONS as readonly string[]).includes(s.override_perm)) {
      out.override_perm = s.override_perm as Permission;
    }
    return out;
  },
  component: () => (
    <RequirePermission perm="view_staff_records">
      <StaffProfilePage />
    </RequirePermission>
  ),
});

function StaffProfilePage() {
  const { staffId } = Route.useParams();
  const { tab, override_perm } = Route.useSearch();
  const { data: org } = useCurrentOrg();
  const router = useRouter();
  const qc = useQueryClient();
  const navigate = Route.useNavigate();
  const activeTab = resolveTab(tab);

  const orgId = org?.organization_id;

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
      const { data: p, error: pErr } = await supabase
        .from("profiles")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .select("id, full_name, first_name, last_name, email, username, hire_date, start_date, photo_path, photo_updated_at, phone, employee_id" as any)
        .eq("id", staffId)
        .maybeSingle();
      if (pErr) throw pErr;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return { member: m, profile: (p ?? null) as any };
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
  const name =
    (p?.full_name && String(p.full_name).trim()) ||
    (p?.username && String(p.username).trim()) ||
    (p?.email && String(p.email).trim()) ||
    "Name not set";

  const invalidateProfile = () => {
    qc.invalidateQueries({ queryKey: ["staff-profile", orgId, staffId] });
  };

  return (
    <div className="min-w-0 max-w-full space-y-6 overflow-x-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => window.history.length > 1 ? router.history.back() : router.navigate({ to: "/dashboard/hub/employees" })}>
            <ArrowLeft className="mr-1 h-4 w-4" /> Employees
          </Button>
          <PersonAvatar
            bucket="staff-photos"
            path={(p?.photo_path as string | null) ?? null}
            name={name}
            className="h-11 w-11"
          />
          <div>
            <h1 className="text-xl font-semibold leading-tight">{name}</h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
              <Badge
                variant="outline"
                className="border-primary/30 bg-primary/5 uppercase tracking-wide text-primary"
                title="Provider Interface role"
              >
                {m.role}
              </Badge>
              <Badge
                variant="outline"
                className={
                  m.active
                    ? "border-emerald-300 bg-emerald-50 uppercase tracking-wide text-emerald-700"
                    : "border-muted-foreground/30 bg-muted uppercase tracking-wide text-muted-foreground"
                }
                title="Account status"
              >
                {m.active ? "Active" : "Deactivated"}
              </Badge>
              <EmployeeFaceSheetButton staffId={staffId} organizationId={orgId} variant="pill" />
              {(p?.hire_date || p?.start_date) && (
                <span className="text-muted-foreground">· Hired {p?.hire_date ?? p?.start_date}</span>
              )}
            </div>
          </div>
        </div>
        <Button variant="outline" onClick={() => window.history.length > 1 ? router.history.back() : router.navigate({ to: "/dashboard/hub/employees" })}>
          Back to list
        </Button>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(v) =>
          navigate({ search: (prev) => ({ ...prev, tab: v === "profile" ? undefined : (v as ProfileTab) }) })
        }
        className="w-full"
      >
        <TabsList className="flex h-auto w-full min-w-0 max-w-full flex-wrap justify-start overflow-x-auto">
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="personnel">Personnel file</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="mt-4 space-y-6">
          <StaffProfilePanel
            orgId={orgId}
            staffId={staffId}
            profile={p}
            member={m}
            name={name}
            highlightPermission={override_perm}
            onSaved={invalidateProfile}
          />
        </TabsContent>

        <TabsContent value="personnel" className="mt-4 space-y-6">
          <StaffObligationsFilesTab
            organizationId={orgId}
            staffId={staffId}
            staffName={name}
          />
        </TabsContent>

        <TabsContent value="activity" className="mt-4 space-y-6">
          <SectionGroup label="Activity" hint="Recent actions">
            <SectionPanel icon={ActivityIcon} accent="sky">
              <ActivityFeed organizationId={orgId} staffId={staffId} />
            </SectionPanel>
          </SectionGroup>
        </TabsContent>

      </Tabs>
    </div>
  );
}

type ActivityItem = {
  id: string;
  kind: "Shift" | "Timesheet" | "Form" | "Incident";
  title: string;
  status: string;
  date: string;
  clientId?: string | null;
  clientName?: string | null;
  serviceCode?: string | null;
  units?: number | null;
};

function ActivityFeed({ organizationId, staffId }: { organizationId: string; staffId: string }) {
  const [filter, setFilter] = useState<"all" | "Shift" | "Timesheet" | "Form" | "Incident">("all");

  const evvQ = useQuery({
    enabled: !!organizationId,
    queryKey: ["activity-evv", organizationId, staffId],
    queryFn: async () => {
      const { data } = await supabase
        .from("evv_timesheets")
        .select("id, client_id, service_type_code, status, clock_in_timestamp, clock_out_timestamp, billed_units")
        .eq("organization_id", organizationId)
        .eq("staff_id", staffId)
        .order("clock_in_timestamp", { ascending: false })
        .limit(200);
      const rows = data ?? [];
      const ids = Array.from(new Set(rows.map((r) => r.client_id).filter(Boolean))) as string[];
      const nameById = new Map<string, string>();
      if (ids.length) {
        const { data: cs } = await supabase
          .from("clients")
          .select("id, first_name, last_name")
          .in("id", ids);
        for (const c of cs ?? []) {
          nameById.set(c.id, `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || "—");
        }
      }
      return rows.map((r) => ({ ...r, client_name: r.client_id ? nameById.get(r.client_id) ?? "—" : null }));
    },
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
      const code = r.service_type_code ?? null;
      const units = r.billed_units ?? null;
      const titleSuffix = `${code ?? "Shift"}${units != null ? ` · ${units} u` : ""}`;
      if (r.clock_in_timestamp) {
        out.push({
          id: `evv-shift-${r.id}`,
          kind: "Shift",
          title: titleSuffix,
          status: r.status ? String(r.status) : (r.clock_out_timestamp ? "Clocked out" : "Clocked in"),
          date: r.clock_in_timestamp as string,
          clientId: r.client_id ?? null,
          clientName: r.client_name ?? null,
          serviceCode: code,
          units,
        });
      }
      if (r.status) {
        out.push({
          id: `evv-ts-${r.id}`,
          kind: "Timesheet",
          title: `${code ?? "Timesheet"}${units != null ? ` · ${units} u` : ""}`,
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
        ) : filter === "Shift" ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Date</th>
                  <th className="px-3 py-2 text-left">Client</th>
                  <th className="px-3 py-2 text-left">Code</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-right">Units</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((it) => (
                  <tr key={it.id} className="border-t">
                    <td className="px-3 py-2 whitespace-nowrap">
                      {it.date ? new Date(it.date).toLocaleString() : "—"}
                    </td>
                    <td className="px-3 py-2">
                      {it.clientId ? (
                        <Link
                          to="/dashboard/clients/$clientId"
                          params={{ clientId: it.clientId }}
                          className="hover:underline"
                        >
                          {it.clientName ?? "—"}
                        </Link>
                      ) : "—"}
                    </td>
                    <td className="px-3 py-2"><code className="font-mono text-xs">{it.serviceCode ?? "—"}</code></td>
                    <td className="px-3 py-2"><Badge variant="outline" className="capitalize">{it.status}</Badge></td>
                    <td className="px-3 py-2 text-right">{it.units ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
        active
          ? "border-[var(--hive-ink)] bg-[var(--hive-ink)] text-white"
          : "border-border bg-card text-muted-foreground hover:border-[var(--hive-ink)]/40 hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function KindBadge({ kind }: { kind: ActivityItem["kind"] }) {
  const map: Record<ActivityItem["kind"], { Icon: typeof FileText; cls: string }> = {
    Shift: { Icon: Clock, cls: "bg-[var(--hive-ink)]/10 text-[var(--hive-ink)]" },
    Timesheet: { Icon: ClipboardList, cls: "bg-[var(--hive-text)]/10 text-[var(--hive-text)]" },
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
