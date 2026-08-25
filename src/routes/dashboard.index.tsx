import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useTodayShift } from "@/hooks/use-today-shift";
import { useCurrentOrg } from "@/hooks/use-org";
import { usePortalView } from "@/hooks/use-portal-view";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Clock, FileText, ArrowRight, Users, FileSignature } from "lucide-react";
import { listMyPendingPolicies } from "@/lib/policy-signatures.functions";
import { getAgencyHealthSnapshot, type HealthMetric } from "@/lib/agency-health.functions";

import { StaffClientGrid } from "@/components/staff-client-grid";
import { CompanyOverview } from "@/components/company-overview";
import { DeadlinesHomeCard } from "./dashboard.deadlines";
import { StaffPageHeader } from "@/components/staff-mobile/staff-page-header";
import { TodayHero } from "@/components/staff-mobile/today-hero";
import { AttentionStrip } from "@/components/staff-mobile/attention-strip";
import { NectarOnboardingPanel } from "@/components/onboarding/nectar-onboarding-panel";
import { MyObligationsWidget } from "@/components/company-obligations/my-obligations-widget";

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

function scoreTone(score: number) {
  if (score >= 90) return { text: "text-emerald-600", ring: "stroke-emerald-500", bg: "bg-emerald-50/60 dark:bg-emerald-950/20", border: "border-emerald-300/60 dark:border-emerald-800/60", dot: "bg-emerald-500" };
  if (score >= 75) return { text: "text-amber-600", ring: "stroke-amber-500", bg: "bg-amber-50/50 dark:bg-amber-950/20", border: "border-amber-300/70 dark:border-amber-800/60", dot: "bg-amber-500" };
  return { text: "text-rose-600", ring: "stroke-rose-500", bg: "bg-rose-50/60 dark:bg-rose-950/20", border: "border-rose-300 dark:border-rose-800/60", dot: "bg-rose-500" };
}

function parseMetricLink(link: string): { to: string; search?: Record<string, string> } {
  const [path, qs] = link.split("?");
  if (!qs) return { to: path };
  const search: Record<string, string> = {};
  for (const part of qs.split("&")) {
    const [k, v] = part.split("=");
    if (k) search[decodeURIComponent(k)] = decodeURIComponent(v ?? "");
  }
  return { to: path, search };
}

function AuditReadinessRing({ score }: { score: number }) {
  const t = scoreTone(score);
  const r = 54;
  const c = 2 * Math.PI * r;
  const offset = c - (Math.min(100, Math.max(0, score)) / 100) * c;
  return (
    <div className="relative grid h-36 w-36 place-items-center">
      <svg viewBox="0 0 140 140" className="h-36 w-36 -rotate-90" aria-hidden>
        <circle cx="70" cy="70" r={r} className="fill-none stroke-border" strokeWidth="8" />
        <circle
          cx="70"
          cy="70"
          r={r}
          className={`fill-none ${t.ring} transition-all duration-700`}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <div className="text-center">
          <div className={`text-3xl font-semibold tabular-nums ${t.text}`}>{score}%</div>
        </div>
      </div>
    </div>
  );
}

function MetricStatusDot({ score }: { score: number }) {
  const t = scoreTone(score);
  return <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${t.dot}`} aria-hidden />;
}

function AdminComplianceStatus() {
  const { data: org } = useCurrentOrg();
  const orgId = org?.organization_id;
  const fetchHealth = useServerFn(getAgencyHealthSnapshot);

  const { data, isLoading } = useQuery({
    enabled: !!orgId,
    queryKey: ["agency-health", orgId],
    queryFn: () => fetchHealth({ data: { organizationId: orgId! } }),
  });

  if (isLoading || !data) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
        <div className="text-sm text-muted-foreground">Loading audit readiness…</div>
      </div>
    );
  }

  const visible = data.metrics.filter((m: HealthMetric) => m.applicable);
  const tone = scoreTone(data.overall);
  const overdueStaff = data.staffWithOverdueObligations;

  return (
    <div className={`space-y-5 rounded-2xl border ${tone.border} ${tone.bg} p-5 md:p-6 shadow-[var(--shadow-card)]`}>
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:gap-6">
        <AuditReadinessRing score={data.overall} />
        <div className="min-w-0 text-center sm:text-left">
          <h2 className="text-lg font-semibold tracking-tight text-foreground">Audit Readiness Score</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Weighted across {visible.length} DSPD documentation area{visible.length === 1 ? "" : "s"} that apply to this organization.
          </p>
        </div>
      </div>

      <div className="max-h-[28rem] overflow-y-auto rounded-xl border border-border bg-card/80">
        <ul className="divide-y divide-border">
          {visible.map((m: HealthMetric) => {
            const { to, search } = parseMetricLink(m.link);
            return (
              <li key={m.key}>
                <Link
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  to={to as any}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  search={search as any}
                  className="flex items-start gap-3 px-3 py-3 transition hover:bg-muted/40 sm:items-center"
                >
                  <MetricStatusDot score={m.score} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                      <span className="text-sm font-medium text-foreground">{m.label}</span>
                      <span className={`text-sm font-semibold tabular-nums ${scoreTone(m.score).text}`}>
                        {m.score}%
                      </span>
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {m.total === 0 && m.score === 100
                        ? "No active items — compliant"
                        : `${m.passing} of ${m.total} passing`}
                    </div>
                  </div>
                  <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground sm:mt-0" />
                </Link>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="text-sm text-muted-foreground">
        {overdueStaff > 0 ? (
          <Link
            to="/dashboard/company-obligations"
            className="inline-flex items-center gap-1 font-medium text-rose-700 hover:underline dark:text-rose-300"
          >
            {overdueStaff} staff with overdue obligations
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        ) : (
          <span>No staff with overdue obligations</span>
        )}
      </div>
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
          <MyObligationsWidget />
          <AttentionStrip />
          <PoliciesToAcknowledgeCard />
          <ComplianceInbox />
          <StaffClientGrid />

        </div>
      )}
    </div>
  );
}
