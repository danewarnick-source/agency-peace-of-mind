import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useTodayShift } from "@/hooks/use-today-shift";
import { useCurrentOrg } from "@/hooks/use-org";
import { usePortalView } from "@/hooks/use-portal-view";
import { useDeadlines } from "@/hooks/use-deadlines";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Clock, FileText, ArrowRight, Users, CheckCircle2, ShieldAlert, FileSignature } from "lucide-react";
import { getHrComplianceMatrix } from "@/lib/hr-staff.functions";
import { listMyPendingPolicies } from "@/lib/policy-signatures.functions";

import { StaffClientGrid } from "@/components/staff-client-grid";
import { CompanyOverview } from "@/components/company-overview";
import { DeadlinesHomeCard } from "./dashboard.deadlines";
import { StaffPageHeader } from "@/components/staff-mobile/staff-page-header";
import { TodayHero } from "@/components/staff-mobile/today-hero";
import { AttentionStrip } from "@/components/staff-mobile/attention-strip";
import { NectarOnboardingPanel } from "@/components/onboarding/nectar-onboarding-panel";
import { StaffCompliancePanel } from "@/components/hr/staff-compliance-panel";
import { PersonAvatar } from "@/components/person/person-avatar";

export const Route = createFileRoute("/dashboard/")({
  component: Overview,
  validateSearch: (s: Record<string, unknown>): { welcome?: boolean } => {
    const on = s.welcome === "1" || s.welcome === 1 || s.welcome === true;
    return on ? { welcome: true } : {};
  },
});



function ComplianceInbox() {
  const { user } = useAuth();
  const { active } = useTodayShift();
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

  // Exclude the currently-active shift — TodayHero already surfaces it
  // (and promotes itself to a clock-out prompt past 12h).
  const orphanOpenShifts = openShifts.filter((s) => s.id !== active?.id);
  const totalItems = rejectedLogs.length + orphanOpenShifts.length;
  if (totalItems === 0) return null;

  return (
    <div className="rounded-2xl border border-amber-300/40 bg-amber-500/5 p-4 shadow-[var(--shadow-card)]">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
        <AlertTriangle className="h-4 w-4 text-amber-600" />
        Needs Your Attention ({totalItems})
      </h2>
      <ul className="space-y-2">
        {orphanOpenShifts.map((s) => (
          <li key={s.id}
            className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2.5">
            <div className="min-w-0 flex items-start gap-2">
              <Clock className="h-4 w-4 mt-0.5 shrink-0 text-warning-foreground" />
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  Open shift — {s.clients ? `${s.clients.first_name} ${s.clients.last_name}` : "Unknown client"}
                </p>
                <p className="text-xs text-muted-foreground">
                  Clocked in {new Date(s.clock_in_timestamp).toLocaleDateString()} — never clocked out
                </p>
              </div>
            </div>
            <Button size="sm" variant="outline"
              className="shrink-0"
              onClick={() => navigate({
                to: "/dashboard/workspace/$clientId",
                params: { clientId: s.client_id },
                search: { tab: "clock-in", code: s.service_type_code, verify: "1" },
              })}>
              Fix Now <ArrowRight />
            </Button>

          </li>
        ))}
        {rejectedLogs.map((l) => (
          <li key={l.id}
            className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2.5">
            <div className="min-w-0 flex items-start gap-2">
              <FileText className="h-4 w-4 mt-0.5 shrink-0 text-destructive" />
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  Daily log returned — {l.clients ? `${l.clients.first_name} ${l.clients.last_name}` : "Unknown"} ·{" "}
                  {new Date(l.log_date + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                </p>
                {l.denial_reason && (
                  <p className="text-xs text-muted-foreground">Admin note: {l.denial_reason}</p>
                )}
              </div>
            </div>
            <Button size="sm" variant="outline"
              className="shrink-0"
              onClick={() => navigate({ to: "/dashboard/daily-logs" })}>
              Fix Now <ArrowRight />
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Admin Compliance Status Section ─────────────────────────────────────────

type StaffAttentionRow = {
  staff_id: string;
  full_name: string;
  overdueCount: number;
  expiringCount: number;
  pendingCount: number;
};

function AdminComplianceStatus() {
  const { data: org } = useCurrentOrg();
  const [panelStaff, setPanelStaff] = useState<{ id: string; name: string } | null>(null);
  const fetchMatrix = useServerFn(getHrComplianceMatrix);

  const matrixQ = useQuery({
    enabled: !!org,
    queryKey: ["hr-matrix", org?.organization_id],
    queryFn: () => fetchMatrix({ data: { organization_id: org!.organization_id } }),
  });

  const clientsQ = useQuery({
    enabled: !!org,
    queryKey: ["clients-intake-status", org?.organization_id],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from("clients")
        .select("id, intake_status")
        .eq("organization_id", org!.organization_id)
        .neq("account_status", "archived");
      return (data ?? []) as Array<{ id: string; intake_status: string | null }>;
    },
  });

  const { overdue: overdueDeadlines, isLoading: deadlinesLoading } = useDeadlines();

  const staffMetrics = useMemo(() => {
    const matrix = matrixQ.data;
    if (!matrix) return null;
    const today = Date.now();
    const in60Ms = today + 60 * 86_400_000;

    let staffWithOverdue = 0;
    let staffWithPending = 0;
    const attentionRows: StaffAttentionRow[] = [];

    for (const staff of matrix.staff) {
      let overdueCount = 0;
      let expiringCount = 0;
      let pendingCount = 0;

      for (const req of matrix.requirements) {
        const cell = staff.cells[req.requirement_id];
        if (!cell || cell.applicable === false) continue;
        const status = cell.status as string;
        const expMs = cell.expires_at ? new Date(cell.expires_at as string).getTime() : null;
        const isExpired =
          status === "expired" || (expMs !== null && expMs < today);
        const isSoon =
          expMs !== null && expMs >= today && expMs <= in60Ms;

        if (isExpired) {
          overdueCount++;
        } else if (isSoon) {
          expiringCount++;
        } else if (status !== "complete" && status !== "waived") {
          pendingCount++;
        }
      }

      if (overdueCount > 0) staffWithOverdue++;
      if (overdueCount > 0 || expiringCount > 0 || pendingCount > 0) {
        staffWithPending++;
        attentionRows.push({
          staff_id: staff.staff_id,
          full_name: staff.full_name,
          overdueCount,
          expiringCount,
          pendingCount,
        });
      }
    }

    // Sort: most severe first
    attentionRows.sort((a, b) => (b.overdueCount - a.overdueCount) || (b.expiringCount - a.expiringCount));

    return {
      staffWithOverdue,
      staffWithPending,
      totalStaff: matrix.staff.length,
      attentionRows: attentionRows.slice(0, 5),
      allAttentionRows: attentionRows,
    };
  }, [matrixQ.data]);

  const incompleteClientCount = useMemo(() => {
    return (clientsQ.data ?? []).filter(
      (c) => c.intake_status !== "complete",
    ).length;
  }, [clientsQ.data]);

  // useDeadlines already includes source: "compliance_instance" rows (open UPI
  // submissions etc.) with status "overdue" in its `overdue` bucket — no filter
  // excludes them, so no extra wiring is needed here.
  const overdueDeadlineCount = overdueDeadlines.length;

  const isLoading = matrixQ.isLoading || clientsQ.isLoading || deadlinesLoading;

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
        <div className="text-sm text-muted-foreground">Loading compliance status…</div>
      </div>
    );
  }

  const allClear =
    (staffMetrics?.staffWithPending ?? 0) === 0 &&
    incompleteClientCount === 0 &&
    overdueDeadlineCount === 0;

  if (allClear) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-emerald-300/60 bg-emerald-50/60 px-5 py-4 shadow-[var(--shadow-card)] dark:border-emerald-800/60 dark:bg-emerald-950/20">
        <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
        <span className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
          All compliance items current — audit ready
        </span>
      </div>
    );
  }

  const staffOverdueCount = staffMetrics?.staffWithOverdue ?? 0;
  const staffPendingCount = staffMetrics?.staffWithPending ?? 0;

  return (
    <div className="space-y-4 rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <ShieldAlert className="h-4 w-4 text-[#137182]" />
        Compliance Status
      </h2>

      {/* Three tiles */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {/* Tile 1 — Staff */}
        <Link
          to="/dashboard/hub/employees"
          className={
            "group flex flex-col gap-1 rounded-xl border p-4 transition hover:shadow-sm " +
            (staffOverdueCount > 0
              ? "border-rose-300 bg-rose-50/60 dark:border-rose-800/60 dark:bg-rose-950/20"
              : staffPendingCount > 0
                ? "border-amber-300/70 bg-amber-50/40 dark:border-amber-800/60 dark:bg-amber-950/10"
                : "border-emerald-300/60 bg-emerald-50/40 dark:border-emerald-800/60 dark:bg-emerald-950/10")
          }
        >
          <div
            className={
              "text-2xl font-bold " +
              (staffOverdueCount > 0
                ? "text-rose-600"
                : staffPendingCount > 0
                  ? "text-amber-600"
                  : "text-emerald-600")
            }
          >
            {staffPendingCount}
          </div>
          <div className="text-xs font-medium leading-tight text-foreground">
            Staff with incomplete required records
          </div>
          {staffOverdueCount > 0 && (
            <div className="text-[11px] text-rose-600">{staffOverdueCount} overdue</div>
          )}
        </Link>

        {/* Tile 2 — Clients */}
        <Link
          to="/dashboard/hub/clients"
          className={
            "group flex flex-col gap-1 rounded-xl border p-4 transition hover:shadow-sm " +
            (incompleteClientCount > 0
              ? "border-amber-300/70 bg-amber-50/40 dark:border-amber-800/60 dark:bg-amber-950/10"
              : "border-emerald-300/60 bg-emerald-50/40 dark:border-emerald-800/60 dark:bg-emerald-950/10")
          }
        >
          <div
            className={
              "text-2xl font-bold " +
              (incompleteClientCount > 0 ? "text-amber-600" : "text-emerald-600")
            }
          >
            {incompleteClientCount}
          </div>
          <div className="text-xs font-medium leading-tight text-foreground">
            Clients with incomplete intake
          </div>
        </Link>

        {/* Tile 3 — Overdue deadlines */}
        <Link
          to="/dashboard/deadlines"
          title="Includes open UPI submissions, renewal deadlines, and other tracked obligations"
          className={
            "group flex flex-col gap-1 rounded-xl border p-4 transition hover:shadow-sm " +
            (overdueDeadlineCount > 0
              ? "border-rose-300 bg-rose-50/60 dark:border-rose-800/60 dark:bg-rose-950/20"
              : "border-emerald-300/60 bg-emerald-50/40 dark:border-emerald-800/60 dark:bg-emerald-950/10")
          }
        >
          <div
            className={
              "text-2xl font-bold " +
              (overdueDeadlineCount > 0 ? "text-rose-600" : "text-emerald-600")
            }
          >
            {overdueDeadlineCount}
          </div>
          <div className="text-xs font-medium leading-tight text-foreground">
            Overdue deadlines
          </div>
          <div className="text-[10px] leading-tight text-muted-foreground">
            Includes open UPI submissions, renewal deadlines, and other tracked obligations
          </div>
        </Link>
      </div>

      {/* Staff needing attention list */}
      {(staffMetrics?.attentionRows.length ?? 0) > 0 && (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Staff needing attention
            </div>
            {(staffMetrics?.allAttentionRows.length ?? 0) > 5 && (
              <Link
                to="/dashboard/hub/employees"
                className="text-xs text-[#137182] hover:underline"
              >
                View all →
              </Link>
            )}
          </div>
          <ul className="divide-y divide-border rounded-xl border border-border">
            {staffMetrics!.attentionRows.map((row) => (
              <li
                key={row.staff_id}
                className="flex items-center justify-between gap-3 px-3 py-2.5"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <PersonAvatar
                    bucket="staff-photos"
                    path={null}
                    name={row.full_name}
                    className="h-7 w-7 text-[10px]"
                  />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{row.full_name}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {row.overdueCount > 0 && (
                        <span className="text-rose-600">{row.overdueCount} overdue</span>
                      )}
                      {row.overdueCount > 0 && row.expiringCount > 0 && " · "}
                      {row.expiringCount > 0 && (
                        <span className="text-amber-600">{row.expiringCount} expiring</span>
                      )}
                      {(row.overdueCount > 0 || row.expiringCount > 0) && row.pendingCount > 0 && " · "}
                      {row.pendingCount > 0 && `${row.pendingCount} pending`}
                    </div>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 shrink-0 text-xs"
                  onClick={() =>
                    setPanelStaff({ id: row.staff_id, name: row.full_name })
                  }
                >
                  View checklist
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {org && panelStaff && (
        <StaffCompliancePanel
          open={!!panelStaff}
          onOpenChange={(v) => !v && setPanelStaff(null)}
          organizationId={org.organization_id}
          staffId={panelStaff.id}
          staffName={panelStaff.name}
        />
      )}
    </div>
  );
}

// ─── Staff: Policies to acknowledge ──────────────────────────────────────────

function PoliciesToAcknowledgeCard() {
  const { user } = useAuth();
  const { data: org } = useCurrentOrg();
  const fetchPendingPolicies = useServerFn(listMyPendingPolicies);

  const { data: pendingPolicies } = useQuery({
    enabled: !!user && !!org?.organization_id,
    queryKey: ["my-pending-policies", org?.organization_id, user?.id],
    queryFn: () => fetchPendingPolicies({ data: { organizationId: org!.organization_id } }),
  });
  const pending = pendingPolicies?.pending ?? [];

  if (pending.length === 0) return null;

  return (
    <div className="rounded-2xl border border-amber-400/50 bg-amber-500/5 p-4 shadow-[var(--shadow-card)]">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-amber-900 dark:text-amber-200">
        <FileSignature className="h-4 w-4" /> Policies to read &amp; acknowledge
      </h2>
      <ul className="space-y-2">
        {pending.map((p) => (
          <li
            key={p.id}
            className="flex items-center justify-between gap-3 rounded-lg border border-amber-300/60 bg-background/60 px-3 py-2.5"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{p.title}</p>
              <p className="text-xs text-muted-foreground">
                {p.cadence === "annual" ? "Annual acknowledgment" : "One-time"}
              </p>
            </div>
            <Link
              to="/dashboard/courses/policy/$documentId"
              params={{ documentId: p.id }}
              className="flex shrink-0 items-center gap-1 text-xs font-medium text-amber-700 hover:underline dark:text-amber-300"
            >
              Read and sign <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Overview() {
  const { data: org } = useCurrentOrg();
  const { view, subView, hasStoredView } = usePortalView();
  const { welcome } = Route.useSearch();

  const isManager = org?.role === "admin" || org?.role === "manager" || org?.role === "super_admin";
  const effectiveView = hasStoredView ? view : isManager ? "admin" : "staff";
  const isStatePreviewAdmin = effectiveView === "state_preview" && subView === "admin";
  const showAdmin = (isManager && effectiveView === "admin") || isStatePreviewAdmin;


  return (
    <div className="space-y-8">
      {showAdmin && (
        <>
          <NectarOnboardingPanel welcomeFlag={!!welcome} />
          <AdminComplianceStatus />
          <DeadlinesHomeCard />
          <CompanyOverview />
        </>
      )}


      {!showAdmin && (
        <div className="space-y-5">
          <StaffPageHeader
            eyebrow="My Day · Active Caseload"
            eyebrowIcon={Users}
            title="My Caseload"
            subtitle="Your assigned clients, today's shift, and anything that needs your attention."
          />
          <TodayHero />
          <AttentionStrip />
          <PoliciesToAcknowledgeCard />
          <ComplianceInbox />
          <StaffClientGrid />

        </div>
      )}
    </div>
  );
}
