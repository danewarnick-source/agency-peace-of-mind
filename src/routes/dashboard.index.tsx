import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useTodayShift } from "@/hooks/use-today-shift";
import { useCurrentOrg } from "@/hooks/use-org";
import { usePortalView } from "@/hooks/use-portal-view";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Clock, FileText, ArrowRight, Users, FileSignature } from "lucide-react";
import { listMyPendingPolicies } from "@/lib/policy-signatures.functions";
import { displayPersonName } from "@/lib/person-name";

import { StaffClientGrid } from "@/components/staff-client-grid";
import { StaffPageHeader } from "@/components/staff-mobile/staff-page-header";
import { TodayHero } from "@/components/staff-mobile/today-hero";
import { NectarPayPeriodCard } from "@/components/staff-mobile/nectar-pay-period-card";
import { AdminHomeDashboard } from "@/components/admin-home/admin-home-dashboard";
import { staffClockOutSearch } from "@/lib/staff-clock-out";
import { parseCheckoutReturnSearch } from "@/lib/billing-access";

export const Route = createFileRoute("/dashboard/")({
  component: Overview,
  validateSearch: (s: Record<string, unknown>): { welcome?: boolean; checkout?: string; session_id?: string } => {
    const on = s.welcome === "1" || s.welcome === 1 || s.welcome === true;
    return {
      ...(on ? { welcome: true } : {}),
      ...parseCheckoutReturnSearch(s),
    };
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
      const { data } = (await supabase
        .from("daily_logs")
        .select("id, client_id, log_date, denial_reason, clients:client_id(first_name, last_name)")
        .eq("user_id", user!.id)
        .eq("status", "rejected")
        .order("log_date", { ascending: false })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .limit(10)) as any;
      return (data ?? []) as Array<{
        id: string;
        client_id: string;
        log_date: string;
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
      const { data } = (await supabase
        .from("evv_timesheets")
        .select(
          "id, client_id, clock_in_timestamp, service_type_code, clients:client_id(first_name, last_name)",
        )
        .eq("staff_id", user!.id)
        .eq("status", "Active")
        .is("clock_out_timestamp", null)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .lt("clock_in_timestamp", cutoff)) as any;
      return (data ?? []) as Array<{
        id: string;
        client_id: string;
        clock_in_timestamp: string;
        service_type_code: string;
        clients: { first_name: string; last_name: string } | null;
      }>;
    },
  });

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
          <li
            key={s.id}
            className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2.5"
          >
            <div className="min-w-0 flex items-start gap-2">
              <Clock className="h-4 w-4 mt-0.5 shrink-0 text-warning-foreground" />
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  Open shift —{" "}
                  {s.clients
                    ? displayPersonName(s.clients.first_name, s.clients.last_name)
                    : "Unknown client"}
                </p>
                <p className="text-xs text-muted-foreground">
                  Clocked in {new Date(s.clock_in_timestamp).toLocaleDateString()} — never clocked
                  out
                </p>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="shrink-0"
              onClick={() =>
                navigate({
                  to: "/dashboard/workspace/$clientId",
                  params: { clientId: s.client_id },
                  search: staffClockOutSearch(s.service_type_code),
                })
              }
            >
              Fix Now <ArrowRight />
            </Button>
          </li>
        ))}
        {rejectedLogs.map((l) => (
          <li
            key={l.id}
            className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2.5"
          >
            <div className="min-w-0 flex items-start gap-2">
              <FileText className="h-4 w-4 mt-0.5 shrink-0 text-destructive" />
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  Daily log returned —{" "}
                  {l.clients
                    ? displayPersonName(l.clients.first_name, l.clients.last_name)
                    : "Unknown"}{" "}
                  ·{" "}
                  {new Date(l.log_date + "T00:00:00").toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  })}
                </p>
                {l.denial_reason && (
                  <p className="text-xs text-muted-foreground">Admin note: {l.denial_reason}</p>
                )}
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="shrink-0"
              onClick={() => navigate({ to: "/dashboard/daily-logs" })}
            >
              Fix Now <ArrowRight />
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

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

function StaffCaseloadHome() {
  const [nectarOpen, setNectarOpen] = useState(false);
  const headingRef = useRef<HTMLDivElement>(null);

  const onNectarOpenChange = (next: boolean) => {
    setNectarOpen(next);
    if (next) {
      headingRef.current?.scrollIntoView({ block: "start", behavior: "auto" });
    }
  };

  return (
    <div className="space-y-5">
      <div
        ref={headingRef}
        className={
          nectarOpen
            ? "max-md:sticky max-md:top-0 max-md:z-20 max-md:-mx-4 space-y-3 bg-[var(--hive-canvas)] max-md:px-4 max-md:pb-2 max-md:pt-1"
            : "space-y-3"
        }
      >
        <div className="max-md:hidden">
          <StaffPageHeader
            eyebrow="My Day · Active Caseload"
            eyebrowIcon={Users}
            title="My Caseload"
            subtitle="Your assigned clients, today's shift, and anything that needs your attention."
          />
        </div>
        {nectarOpen ? (
          <NectarPayPeriodCard open onOpenChange={onNectarOpenChange} />
        ) : null}
      </div>
      <TodayHero />
      {!nectarOpen ? (
        <NectarPayPeriodCard open={false} onOpenChange={onNectarOpenChange} />
      ) : null}
      <PoliciesToAcknowledgeCard />
      <ComplianceInbox />
      <StaffClientGrid />
    </div>
  );
}

function Overview() {
  const { data: org } = useCurrentOrg();
  const { view, subView, hasStoredView } = usePortalView();
  const isManager =
    org?.role === "admin" || org?.role === "program_manager" || org?.role === "manager";
  const defaultView = isManager ? "admin" : "staff";
  const effectiveView = hasStoredView ? view : defaultView;
  const isStatePreviewAdmin = effectiveView === "state_preview" && subView === "admin";
  const showAdmin =
    (isManager && (effectiveView === "admin" || effectiveView === "hive_exec")) ||
    isStatePreviewAdmin;

  return (
    <div className="space-y-8">
      {showAdmin && <AdminHomeDashboard />}

      {!showAdmin && <StaffCaseloadHome />}
    </div>
  );
}
