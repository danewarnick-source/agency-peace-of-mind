import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useTodayShift } from "@/hooks/use-today-shift";
import { useCurrentOrg } from "@/hooks/use-org";
import { usePortalView } from "@/hooks/use-portal-view";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Clock, FileText, ArrowRight, Users } from "lucide-react";

import { StaffClientGrid } from "@/components/staff-client-grid";
import { CompanyOverview } from "@/components/company-overview";
import { DeadlinesHomeCard } from "./dashboard.deadlines";
import { StaffPageHeader } from "@/components/staff-mobile/staff-page-header";
import { TodayHero } from "@/components/staff-mobile/today-hero";
import { AttentionStrip } from "@/components/staff-mobile/attention-strip";
import { NectarOnboardingPanel } from "@/components/onboarding/nectar-onboarding-panel";

export const Route = createFileRoute("/dashboard/")({
  component: Overview,
  validateSearch: (s: Record<string, unknown>) => ({
    welcome: s.welcome === "1" || s.welcome === 1 || s.welcome === true ? true : undefined,
  }),
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
        {openShifts.map((s) => (
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
          <ComplianceInbox />
          <StaffClientGrid />

        </div>
      )}
    </div>
  );
}
