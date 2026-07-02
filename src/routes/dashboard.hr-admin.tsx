import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Sparkles,
  Users as UsersIcon,
} from "lucide-react";
import { useCurrentOrg } from "@/hooks/use-org";
import { getHrAdminRollup, type HrRollupRow } from "@/lib/hr-staff.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RequirePermission } from "@/components/rbac-guard";
import { HrComplianceMatrix } from "@/components/hr/hr-compliance-matrix";
import { OtherAssignmentsRollup } from "@/components/training/other-assignments-rollup";
import { Settings as SettingsIcon, Banknote } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmployeeLoansPanel } from "@/components/employee-loans/EmployeeLoansPanel";

export const Route = createFileRoute("/dashboard/hr-admin")({
  head: () => ({ meta: [{ title: "HR Admin — HIVE" }] }),
  component: () => (
    <RequirePermission perm="manage_users">
      <HrAdminPage />
    </RequirePermission>
  ),
});

type Filter = "all" | "open_gaps" | "renewals" | "onboarding";

export function HrAdminPage() {
  const { data: org } = useCurrentOrg();
  const orgId = org?.organization_id;
  const fetchRollup = useServerFn(getHrAdminRollup);
  const [filter, setFilter] = useState<Filter>("all");
  const [team, setTeam] = useState<string>("all");
  const [search, setSearch] = useState("");

  const q = useQuery({
    enabled: !!orgId,
    queryKey: ["hr-admin-rollup", orgId],
    queryFn: () => fetchRollup({ data: { organization_id: orgId! } }),
  });

  const teams = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of q.data?.rows ?? []) {
      if (r.team_id) map.set(r.team_id, r.team_name ?? "Team");
    }
    return Array.from(map.entries());
  }, [q.data]);

  const today = Date.now();
  const in30 = today + 30 * 86400_000;
  const filteredRows: HrRollupRow[] = useMemo(() => {
    const rows = q.data?.rows ?? [];
    return rows.filter((r) => {
      if (team !== "all" && r.team_id !== team) return false;
      if (search && !r.full_name.toLowerCase().includes(search.toLowerCase()))
        return false;
      if (filter === "open_gaps") return r.open_gaps > 0;
      if (filter === "onboarding") return r.is_new_hire;
      if (filter === "renewals") {
        if (!r.next_renewal) return false;
        const ts = new Date(r.next_renewal.due_date).getTime();
        return ts <= in30;
      }
      return true;
    });
  }, [q.data, filter, team, search, in30]);

  const summary = q.data?.summary;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">HR Admin</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Org-wide HR oversight. NECTAR surfaces what's missing or expiring across
            the staff you can see — completion still requires a one-click human
            confirm on each item.
          </p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link to="/dashboard/hr-admin/settings">
            <SettingsIcon className="mr-1 h-3.5 w-3.5" /> HR Settings →
          </Link>
        </Button>
      </div>

      <div className="space-y-6">


      {/* NECTAR gaps / renewals bar */}
      <Card className="border-amber-200/60 bg-amber-50/40 dark:bg-amber-900/10">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base">
            <Sparkles className="mr-2 inline h-4 w-4 text-amber-600" />
            NECTAR — Gaps & renewals
          </CardTitle>
          <span className="text-[11px] text-muted-foreground">
            Facts only · no advice
          </span>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <Stat
            icon={<UsersIcon className="h-4 w-4" />}
            label="Staff in scope"
            value={summary?.staff_count ?? "—"}
          />
          <Stat
            icon={<AlertTriangle className="h-4 w-4 text-rose-600" />}
            label="Open gaps"
            value={summary?.total_open_gaps ?? "—"}
            onClick={() => setFilter("open_gaps")}
          />
          <Stat
            icon={<CalendarClock className="h-4 w-4 text-amber-600" />}
            label="Renewals ≤30d"
            value={summary?.upcoming_renewals_30d ?? "—"}
            onClick={() => setFilter("renewals")}
          />
          <Stat
            icon={<CalendarClock className="h-4 w-4 text-rose-600" />}
            label="Overdue"
            value={summary?.overdue_renewals ?? "—"}
            onClick={() => setFilter("renewals")}
          />
          <Stat
            icon={<Sparkles className="h-4 w-4 text-emerald-600" />}
            label="Onboarding in progress"
            value={summary?.onboarding_in_progress ?? "—"}
            onClick={() => setFilter("onboarding")}
          />
        </CardContent>
      </Card>

      {/* Filters */}
      <Card>
        <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-1 flex-col gap-2 md:flex-row">
            <Input
              placeholder="Search staff…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="md:max-w-xs"
            />
            <Select value={team} onValueChange={setTeam}>
              <SelectTrigger className="w-full sm:w-auto md:w-[200px]">
                <SelectValue placeholder="Team" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All teams</SelectItem>
                {teams.map(([id, name]) => (
                  <SelectItem key={id} value={id}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filter} onValueChange={(v) => setFilter(v as Filter)}>
              <SelectTrigger className="w-full sm:w-auto md:w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All staff</SelectItem>
                <SelectItem value="open_gaps">With open gaps</SelectItem>
                <SelectItem value="renewals">Renewals ≤30d / overdue</SelectItem>
                <SelectItem value="onboarding">Onboarding in progress</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="text-xs text-muted-foreground">
            Showing {filteredRows.length} of {q.data?.rows.length ?? 0}
          </div>
        </CardContent>
      </Card>

      {/* Roll-up table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Staff roll-up</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          {q.isLoading ? (
            <div className="p-6 text-sm text-muted-foreground">Loading…</div>
          ) : filteredRows.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">
              {q.data?.rows.length === 0
                ? "No staff visible in your HR scope."
                : "No staff match the current filters."}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b border-border text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="p-3 text-left">Staff</th>
                  <th className="p-3 text-left">Team</th>
                  <th className="p-3 text-left">Completion</th>
                  <th className="p-3 text-left">Open gaps</th>
                  <th className="p-3 text-left">Next renewal</th>
                  <th className="p-3 text-left">Status</th>
                  <th className="p-3" />
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((r) => {
                  const renewalDays = r.next_renewal
                    ? Math.round(
                        (new Date(r.next_renewal.due_date).getTime() - today) /
                          86400_000,
                      )
                    : null;
                  return (
                    <tr
                      key={r.staff_id}
                      className="border-b border-border last:border-0"
                    >
                      <td className="p-3 font-medium">
                        <Link
                          to="/dashboard/employees/$staffId"
                          params={{ staffId: r.staff_id }}
                          className="hover:underline"
                        >
                          {r.full_name}
                        </Link>
                      </td>
                      <td className="p-3 text-muted-foreground">
                        {r.team_name ?? "—"}
                      </td>
                      <td className="p-3">
                        <CompletionBar
                          pct={r.completion_pct}
                          complete={r.complete_count}
                          total={r.total_required}
                        />
                      </td>
                      <td className="p-3">
                        {r.open_gaps === 0 ? (
                          <span className="inline-flex items-center gap-1 text-emerald-600">
                            <CheckCircle2 className="h-3.5 w-3.5" /> 0
                          </span>
                        ) : (
                          <Badge variant="destructive">{r.open_gaps}</Badge>
                        )}
                      </td>
                      <td className="p-3 text-xs">
                        {r.next_renewal ? (
                          <div>
                            <div className="truncate max-w-[200px]" title={r.next_renewal.title}>
                              {r.next_renewal.title}
                            </div>
                            <div
                              className={
                                renewalDays !== null && renewalDays < 0
                                  ? "text-rose-600"
                                  : renewalDays !== null && renewalDays <= 30
                                    ? "text-amber-600"
                                    : "text-muted-foreground"
                              }
                            >
                              {r.next_renewal.due_date}
                              {renewalDays !== null && (
                                <span className="ml-1">
                                  ({renewalDays < 0
                                    ? `${-renewalDays}d overdue`
                                    : `in ${renewalDays}d`})
                                </span>
                              )}
                            </div>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="p-3">
                        {r.is_new_hire ? (
                          <Badge variant="secondary">Onboarding</Badge>
                        ) : r.expired_count > 0 ? (
                          <Badge variant="destructive">
                            {r.expired_count} expired
                          </Badge>
                        ) : r.open_gaps === 0 ? (
                          <Badge className="bg-emerald-600 text-white">
                            Up to date
                          </Badge>
                        ) : (
                          <Badge variant="outline">In progress</Badge>
                        )}
                      </td>
                      <td className="p-3 text-right">
                        <Button variant="ghost" size="sm" asChild>
                          <Link
                            to="/dashboard/employees/$staffId"
                            params={{ staffId: r.staff_id }}
                          >
                            Open HR →
                          </Link>
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
      

      {orgId && <HrComplianceMatrix organizationId={orgId} />}

      {orgId && <OtherAssignmentsRollup organizationId={orgId} />}




      <p className="text-[11px] text-muted-foreground">
        Scope respects the HR PII gate at the aggregate level. Admins see every
        staffer in the org; team managers see only their team. Marking an item
        complete is always a one-click human attestation — NECTAR pre-fills but
        never auto-confirms.
      </p>
      </div>
    </div>
  );
}

export function EmployeeLoansPage() {
  const { data: org } = useCurrentOrg();
  const orgId = org?.organization_id;
  if (!orgId) return null;
  return <EmployeeLoansPanel organizationId={orgId} lenderName={org?.organization_name ?? "Employer"} />;
}


function Stat({
  icon,
  label,
  value,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  onClick?: () => void;
}) {
  const Inner = (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-background p-3">
      <div className="grid h-8 w-8 place-items-center rounded-lg bg-muted">
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
        <div className="text-lg font-semibold">{value}</div>
      </div>
    </div>
  );
  return onClick ? (
    <button type="button" onClick={onClick} className="text-left">
      {Inner}
    </button>
  ) : (
    Inner
  );
}

function CompletionBar({
  pct,
  complete,
  total,
}: {
  pct: number;
  complete: number;
  total: number;
}) {
  return (
    <div className="min-w-[140px]">
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={
            pct >= 90
              ? "h-full bg-emerald-500"
              : pct >= 60
                ? "h-full bg-amber-500"
                : "h-full bg-rose-500"
          }
          style={{ width: `${Math.max(2, pct)}%` }}
        />
      </div>
      <div className="mt-1 text-[11px] text-muted-foreground">
        {complete}/{total} · {pct}%
      </div>
    </div>
  );
}
