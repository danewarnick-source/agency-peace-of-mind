import { useEffect, useMemo } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { useCaseload } from "@/hooks/use-caseload";
import { useMyAssignments, allowedCodesFor } from "@/hooks/use-my-assignments";
import { isClockableServiceCode } from "@/lib/service-billing";


import { Badge } from "@/components/ui/badge";
import { PunchPad } from "@/components/evv/punch-pad";
import { padMemberId } from "@/lib/evv-codes";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  ArrowLeft,
  Clock,
  FileText,
  Pill,
  User,
  AlertTriangle,
  Info,
  Brain,
  Utensils,
  Sparkles,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { StaffBehaviorDataTab } from "@/components/behavior-support/staff-data-tab";
import { ClientQuickInfoSheet } from "@/components/staff-mobile/client-quick-info-sheet";

import { toast } from "sonner";
import { AboutTab } from "@/components/workspace/about-tab";
import { MarEmarTab } from "@/components/workspace/mar-emar-tab";
import { FormsHubTab } from "@/components/workspace/forms-hub-tab";
import { IdlePinLock } from "@/components/workspace/idle-pin-lock";
import { ReimbursementShiftPanel } from "@/components/staff-mobile/reimbursement-shift-panel";
import { ClientSpendingShiftPanel } from "@/components/staff-mobile/client-spending-shift-panel";
import { useActiveShift } from "@/hooks/use-active-shift";
import { useTodayShifts } from "@/hooks/use-today-shifts";
import { ClientPhoto } from "@/components/client-photo";
import { FaceSheetButton } from "@/components/clients/face-sheet-button";
import { useClientFeature, clientFeatureVisible } from "@/lib/client-features";
import { ClientMealPlannerMount } from "@/components/clients/client-meal-planner-mount";
import { ChoreDailyChecklist } from "@/components/chores/chore-daily-checklist";
import { ChoreChartForClient } from "@/components/chores/chore-chart-mount";

function ActiveShiftReimbursementSlot({ clientId }: { clientId: string }) {
  const { data: active } = useActiveShift();
  if (!active || active.client_id !== clientId) return null;
  // EVV workspace only mounts on hourly assignments, so the shift is hourly here.
  return (
    <div className="space-y-3">
      <ReimbursementShiftPanel shiftId={active.id} clientId={clientId} />
      <ClientSpendingShiftPanel shiftId={active.id} clientId={clientId} />
    </div>
  );
}

const workspaceSearch = z.object({ tab: z.string().optional(), code: z.string().optional(), verify: z.string().optional() });
export const Route = createFileRoute("/dashboard/workspace/$clientId")({
  head: () => ({ meta: [{ title: "Client Workspace — HIVE" }] }),
  validateSearch: workspaceSearch,
  component: ClientWorkspace,
});

function ClientWorkspace() {
  const { clientId } = Route.useParams();
  const { data: caseload, isLoading } = useCaseload();
  const { data: assignments } = useMyAssignments();
  const navigate = useNavigate();
  const { tab: tabParam, code: presetCode } = Route.useSearch();

  const client = useMemo(() => {
    return (caseload ?? []).find((c) => c.id === clientId) ?? null;
  }, [caseload, clientId]);

  const clientCodes = useMemo(
    () => (client && Array.isArray(client.job_code) ? client.job_code : []),
    [client],
  );
  const allowedCodes = useMemo(
    () => (client ? allowedCodesFor(assignments, client.id, clientCodes) : []),
    [client, assignments, clientCodes],
  );
  // EVV workspace is the clock-in surface — needs at least one clockable
  // code (excludes only HHS host-home & PPS parent-paid codes; RHS and the
  // other daily-rate codes remain clock-inable for payroll capture).
  const allowedHourly = useMemo(
    () => allowedCodes.filter(isClockableServiceCode),
    [allowedCodes],
  );

  // Auto-prefill the clock-in service code from today's scheduled shift for
  // this client, even when the user didn't arrive via the Today hero deep link.
  const { data: todayShifts } = useTodayShifts();
  const scheduledCode = useMemo(() => {
    if (presetCode) return undefined; // URL wins
    const mine = (todayShifts ?? []).filter(
      (s) => s.client_id === clientId && !!s.job_code,
    );
    if (mine.length === 0) return undefined;
    const now = Date.now();
    const current = mine.find(
      (s) => new Date(s.starts_at).getTime() <= now && new Date(s.ends_at).getTime() >= now,
    );
    const upcoming = mine
      .filter((s) => new Date(s.starts_at).getTime() >= now)
      .sort((a, b) => +new Date(a.starts_at) - +new Date(b.starts_at))[0];
    return (current ?? upcoming ?? mine[0]).job_code ?? undefined;
  }, [todayShifts, clientId, presetCode]);
  const effectivePresetCode = presetCode ?? scheduledCode;

  useEffect(() => {
    if (!isLoading && caseload && !client) {
      toast.error("You are not assigned to this individual.");
      navigate({ to: "/dashboard" });
    }
  }, [isLoading, caseload, client, navigate]);

  useEffect(() => {
    if (!isLoading && client && assignments && !allowedHourly.length) {
      toast.error("You are not assigned to any hourly services for this individual.");
      navigate({ to: "/dashboard" });
    }
  }, [isLoading, client, assignments, allowedHourly.length, navigate]);

  const { enabled: emarFeatureEnabled } = useClientFeature(client ?? null, "emar");

  // Code-driven feature visibility (DSPD plan).
  const planFeatureClient = client
    ? {
        feature_config: client.feature_config ?? null,
        authorized_dspd_codes: client.authorized_dspd_codes ?? client.job_code ?? null,
      }
    : null;
  const hasMedMonitoringCode = clientFeatureVisible(planFeatureClient, "med_monitoring");
  const hasBehaviorCode = clientFeatureVisible(planFeatureClient, "behavior");

  // Does the client have any active medications? A client w/ meds still
  // needs MAR for self-admin support even without a nursing code.
  const { data: hasMedications } = useQuery({
    queryKey: ["workspace-has-meds", client?.id ?? null],
    enabled: !!client?.id,
    queryFn: async () => {
      const { count } = await supabase
        .from("client_medications")
        .select("id", { count: "exact", head: true })
        .eq("client_id", client!.id);
      return (count ?? 0) > 0;
    },
  });

  // MAR tab: tier+per-client toggle AND (nursing code OR client actually has meds).
  const emarEnabled = emarFeatureEnabled && (hasMedMonitoringCode || !!hasMedications);

  // Behavior Support visibility: bc_code set, features_enabled true, ≥1 published behavior,
  // AND the client's plan includes a Behavior Consultation code (or feature_config override).
  const { data: bsTab } = useQuery({
    queryKey: ["workspace-bs-tab", client?.id ?? null],
    enabled: !!client?.id,
    queryFn: async () => {
      const cid = client!.id;
      const { data: bsc } = await supabase
        .from("behavior_support_clients")
        .select("organization_id, bc_code, features_enabled")
        .eq("client_id", cid)
        .maybeSingle();
      if (!bsc?.features_enabled || !bsc?.bc_code) return { show: false as const };
      const { count } = await supabase
        .from("bc_behaviors")
        .select("id", { count: "exact", head: true })
        .eq("client_id", cid)
        .eq("status", "published");
      return {
        show: (count ?? 0) > 0,
        organizationId: bsc.organization_id,
      };
    },
  });
  const showBehaviorTab = hasBehaviorCode && !!bsTab?.show;

  // Chore-chart space IDs for this client: any chore_space linked directly
  // (chore_space_clients) plus any chart attached to the client's home team.
  const { data: choreSpaceIds } = useQuery({
    queryKey: ["workspace-chore-spaces", client?.id ?? null],
    enabled: !!client?.id,
    queryFn: async () => {
      const ids = new Set<string>();
      const { data: links } = await supabase
        .from("chore_space_clients")
        .select("space_id")
        .eq("client_id", client!.id);
      (links ?? []).forEach((l) => ids.add(l.space_id));
      const { data: c } = await supabase
        .from("clients")
        .select("team_id")
        .eq("id", client!.id)
        .maybeSingle();
      const teamId = (c as { team_id: string | null } | null)?.team_id ?? null;
      if (teamId) {
        const { data: teamSpaces } = await supabase
          .from("chore_spaces")
          .select("id")
          .eq("team_id", teamId);
        (teamSpaces ?? []).forEach((s) => ids.add(s.id));
      }
      return Array.from(ids);
    },
  });
  const hasChores = (choreSpaceIds?.length ?? 0) > 0;


  if (isLoading || !client) {
    return <p className="p-6 text-sm text-muted-foreground">Loading…</p>;
  }

  const codes = allowedHourly.length ? allowedHourly : clientCodes;

  return (
    <>
      <div className="mx-auto w-full max-w-4xl space-y-5 px-3 sm:px-0">
        <div>
          <Link
            to="/dashboard"
            className="inline-flex h-11 items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to my caseload
          </Link>
          <div className="mt-2 flex flex-col items-start gap-4 sm:flex-row">
            <ClientPhoto
              path={client.profile_photo_url}
              alt={`${client.first_name} ${client.last_name}`}
              className="h-10 w-10 rounded-full object-cover border-2 border-border"
              fallback={
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                  {client.first_name?.[0] ?? ""}{client.last_name?.[0] ?? ""}
                </span>
              }
            />

            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <h1 className="min-w-0 break-words text-2xl font-semibold tracking-tight">
                  {client.first_name} {client.last_name}
                </h1>
                <div className="flex shrink-0 items-center gap-2">
                  <FaceSheetButton clientId={client.id} />
                  <ClientQuickInfoSheet
                    client={client}
                    trigger={
                      <button
                        type="button"
                        aria-label="Open quick info"
                        className="inline-flex h-9 shrink-0 items-center gap-1 rounded-full border border-border bg-background px-3 text-xs font-semibold text-foreground transition hover:border-[color:var(--amber-600,#f59324)]/60 hover:text-[color:var(--amber-700,#d97a1c)] active:scale-[0.97]"
                      >
                        <Info className="h-3.5 w-3.5" /> Info
                      </button>
                    }
                  />
                </div>
              </div>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {codes.length ? (
                  codes.map((code) => (
                    <Badge
                      key={code}
                      variant="outline"
                      className="font-mono text-[10px]"
                    >
                      {code}
                    </Badge>
                  ))
                ) : (
                  <span className="text-xs text-muted-foreground">
                    No billing codes on file
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {client.special_directions && (
          <div className="flex items-start gap-3 rounded-xl border-2 border-amber-500 bg-amber-50 px-4 py-3 dark:bg-amber-950/20">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div>
              <p className="text-sm font-bold text-amber-800 dark:text-amber-200">
                Special Directions & Clinical Alerts
              </p>
              <p className="mt-0.5 text-sm text-amber-700 dark:text-amber-300 whitespace-pre-wrap">
                {client.special_directions}
              </p>
            </div>
          </div>
        )}

        <Tabs
          value={tabParam ?? "about"}
          onValueChange={(val) => navigate({ to: ".", search: { tab: val }, replace: true })}
          className="w-full"
        >
          {/* Touch-friendly tab bar — amber active w/ 2px underline, navy inactive (tappable, never dimmed) */}
          {(() => {
            const tabDefs = [
              { v: "about", label: "About", Icon: User, show: true },
              { v: "clock-in", label: "Clock In", Icon: Clock, show: true },
              { v: "emar", label: "MAR", Icon: Pill, show: emarEnabled },
              { v: "forms", label: "Forms", Icon: FileText, show: true },
              { v: "meals", label: "Meals", Icon: Utensils, show: true },
              { v: "chores", label: "Chores", Icon: Sparkles, show: hasChores },
              { v: "behavior-data", label: "Behavior Data", Icon: Brain, show: showBehaviorTab },
            ].filter((t) => t.show);
            const gridCls =
              tabDefs.length <= 4
                ? "grid-cols-4"
                : tabDefs.length === 5
                  ? "grid-cols-5"
                  : tabDefs.length === 6
                    ? "grid-cols-6"
                    : "grid-cols-7";
            return (
              <TabsList
                className={`grid h-auto w-full ${gridCls} gap-1 border-b border-border bg-transparent p-0 text-foreground`}
              >
                {tabDefs.map(({ v, label, Icon }) => (
                  <TabsTrigger
                    key={v}
                    value={v}
                    className="h-12 min-w-[44px] gap-1.5 rounded-none px-1 text-xs font-semibold text-[color:var(--navy-900,#0d112b)] hover:text-[color:var(--amber-700,#d97a1c)] data-[state=active]:text-[color:var(--amber-700,#d97a1c)] sm:text-sm"
                  >
                    <Icon className="h-4 w-4" />
                    <span>{label}</span>
                  </TabsTrigger>
                ))}
              </TabsList>
            );
          })()}

          <TabsContent value="about" className="mt-5">
            <AboutTab client={client} />
          </TabsContent>

          <TabsContent value="clock-in" className="mt-5 space-y-5">
            <PunchPad
              entryType="Client_Profile_Pass"
              lockedClient={{
                id: client.id,
                name: `${client.first_name} ${client.last_name}`.trim(),
                memberId: padMemberId(client.medicaid_id),
                facility: client.physical_address,
                authorizedCodes: allowedHourly.length ? allowedHourly : (client.job_code ?? undefined),
                homeLat: client.home_latitude,
                homeLng: client.home_longitude,
                geofenceRadiusFeet: client.geofence_radius_feet ?? 1000,
                pcspGoals: client.pcsp_goals ?? [],
              }}
              presetServiceCode={effectivePresetCode}
              lockServiceCode={!!effectivePresetCode}
            />
            <ActiveShiftReimbursementSlot clientId={client.id} />
          </TabsContent>

          {emarEnabled && (
            <TabsContent value="emar" className="mt-5">
              <MarEmarTab
                clientId={client.id}
                clientName={`${client.first_name} ${client.last_name}`}
              />
            </TabsContent>
          )}

          <TabsContent value="forms" className="mt-5">
            <FormsHubTab
              clientId={client.id}
              clientName={`${client.first_name} ${client.last_name}`}
            />
          </TabsContent>

          <TabsContent value="meals" className="mt-5">
            <ClientMealPlannerMount clientId={client.id} readOnly />
          </TabsContent>

          {hasChores && (
            <TabsContent value="chores" className="mt-5 space-y-5">
              <ChoreDailyChecklist spaceIds={choreSpaceIds ?? []} />
              <ChoreChartForClient clientId={client.id} readOnly />
            </TabsContent>
          )}

          {showBehaviorTab && bsTab?.organizationId && (
            <TabsContent value="behavior-data" className="mt-5">
              <StaffBehaviorDataTab
                clientId={client.id}
                organizationId={bsTab.organizationId}
              />
            </TabsContent>
          )}
        </Tabs>

      </div>

      {/* 3-minute shared-device idle lock — scoped to this route */}
      <IdlePinLock />
    </>
  );
}
