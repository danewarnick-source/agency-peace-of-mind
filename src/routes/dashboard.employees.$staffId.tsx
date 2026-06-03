import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, CalendarDays, Users as UsersIcon, ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-org";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RequirePermission } from "@/components/rbac-guard";
import { StaffHrChecklistCard } from "@/components/hr/staff-hr-checklist-card";

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
  const navigate = useNavigate();
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

      <Tabs defaultValue="overview" className="w-full">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="hr">HR</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4 grid gap-4 lg:grid-cols-2">
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
        </TabsContent>

        <TabsContent value="hr" className="mt-4">
          <StaffHrChecklistCard organizationId={orgId} staffId={staffId} />
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
