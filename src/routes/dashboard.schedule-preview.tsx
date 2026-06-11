import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Lock } from "lucide-react";
import { CoverageBar24h } from "@/components/scheduling/coverage-bar-24h";
import { publishShiftsWithNotify } from "@/lib/scheduling/workflow.functions";
import { listLocations, listCoverageRequirements } from "@/lib/scheduling/locations.functions";
import { listClientWeeklyTargets } from "@/lib/scheduling/targets.functions";
import { evaluateRange } from "@/lib/scheduling/conflicts.functions";
import { supabase } from "@/integrations/supabase/client";
import { Sparkles, CheckCircle2, XCircle, AlertTriangle, CalendarCheck2, Settings as SettingsIcon, Info } from "lucide-react";
import { classesForCode, familyForCode } from "@/lib/scheduling/code-colors";
import { hhsVisitLabel, hostHomeRowLabel, HHS_VISIT_TOOLTIP } from "@/lib/scheduling/hhs-visit";
import { HhsInfoTooltip } from "@/components/scheduling/hhs-info-tooltip";
import { HhsExplainerBanner } from "@/components/scheduling/hhs-explainer-banner";
import { ConflictsPanel } from "@/components/scheduling/conflicts-panel";
import { ActionNeededCard } from "@/components/scheduling/action-needed-card";
import { OpenShiftsPanel } from "@/components/scheduling/open-shifts-panel";
import { CopyWeekMenu } from "@/components/scheduling/copy-week-menu";
import { RecurringPatternsDialog } from "@/components/scheduling/recurring-patterns-dialog";
import { AutoAssignDrawer } from "@/components/scheduling/auto-assign-drawer";
import { WeeklyTargetMeter } from "@/components/scheduling/weekly-target-meter";
import { useCurrentOrg } from "@/hooks/use-org";
import {
  useSchedulePreview,
  startOfWeek,
  // dayCoverageMinutes removed — superseded by CoverageBar24h
  inferSiteType,
  UNASSIGNED_SITE_ID,
  type ShiftRow,
  type ClientRow,
  type StaffRow,
} from "@/hooks/use-schedule-preview";
import { ShiftEditorDialog, type EditorContext } from "@/components/schedule-preview/shift-editor";
import { RequestsPanel } from "@/components/schedule-preview/requests-panel";
import { NectarCommandBar } from "@/components/schedule-preview/nectar-command-bar";
import { useOrgScheduleRequests, buildApprovedTimeOffIndex } from "@/lib/schedule-requests";
import { SettingsDrawer } from "@/components/schedule-preview/settings-drawer";
import { ShiftCreateDialog } from "@/components/scheduling/shift-create-dialog";
import { DayTimelineDrawer } from "@/components/scheduling/day-timeline-drawer";
import { WeeklyTargetsDialog } from "@/components/scheduling/weekly-targets-dialog";
import { CoverageRequirementsDialog } from "@/components/scheduling/coverage-requirements-dialog";
import { LocationsDialog } from "@/components/scheduling/locations-dialog";
import {
  SCHED, font, type Settings, useSettings, type ViewMode,
  shiftAccentHex, shiftTypeLabel, fmtTime, DAY_LABELS,
} from "@/components/schedule-preview/sched-ui";

export const Route = createFileRoute("/dashboard/schedule-preview")({
  head: () => ({
    meta: [
      { title: "Scheduler — HIVE" },
      { name: "description", content: "Weekly schedule — site coverage, staff/client grid." },
    ],
    links: [
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap",
      },
    ],
  }),
  component: SchedulePreviewPage,
});

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function SchedulePreviewPage() {
  const { data: org, isLoading: orgLoading } = useCurrentOrg();
  const role = org?.role;
  const isAdmin = role === "admin" || role === "manager" || role === "super_admin";
  const queryClient = useQueryClient();


  const [settings, setSettings] = useSettings();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date()));
  const [siteId, setSiteId] = useState<string>("__all__");
  const [view, setView] = useState<ViewMode>(settings.defaultView);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorCtx, setEditorCtx] = useState<EditorContext | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createInitialDay, setCreateInitialDay] = useState<Date | null>(null);
  const [targetsOpen, setTargetsOpen] = useState(false);
  const [coverageOpen, setCoverageOpen] = useState(false);
  const [locationsOpen, setLocationsOpen] = useState(false);
  const [recurringOpen, setRecurringOpen] = useState(false);
  const [autoAssignOpen, setAutoAssignOpen] = useState(false);
  const [timelineCtx, setTimelineCtx] = useState<{ siteId: string; siteName: string; day: Date } | null>(null);
  // Mobile Day view (below md): selected day drives which week is fetched.
  const [mobileDay, setMobileDay] = useState<Date>(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; });
  const openEditor = (ctx: EditorContext) => { setEditorCtx(ctx); setEditorOpen(true); };

  useEffect(() => { setView(settings.defaultView); }, [settings.defaultView]);
  // Honor the "opens on" preference once, on first paint.
  const [landed, setLanded] = useState(false);
  useEffect(() => {
    if (!landed) { setSiteId(settings.startOnAllSites ? "__all__" : siteId); setLanded(true); }
  }, [landed, settings.startOnAllSites, siteId]);

  const { data, isLoading } = useSchedulePreview(weekStart);
  const { data: requests } = useOrgScheduleRequests();
  const listLocCall = useServerFn(listLocations);
  const evalRangeCall = useServerFn(evaluateRange);
  const locationsQ = useQuery({
    enabled: !!org?.organization_id,
    queryKey: ["locations", org?.organization_id],
    queryFn: () => listLocCall({ data: { organizationId: org!.organization_id } }),
  });
  // host-home names (lowercased) — used to give the All-Homes board a
  // distinct row variant and to tag the home pills.
  const hostHomeNames = useMemo(() => {
    const set = new Set<string>();
    for (const l of locationsQ.data ?? []) {
      if (l.type === "host_home" && l.active !== false) set.add(String(l.name ?? "").toLowerCase());
    }
    return set;
  }, [locationsQ.data]);

  // Coverage requirements for every location, keyed by lower-cased location
  // name (locations mirror teams by name) — drives the residential micro bars.
  const listReqsCall = useServerFn(listCoverageRequirements);
  const reqsAllQ = useQuery({
    enabled: !!org?.organization_id,
    queryKey: ["coverage-reqs-all", org?.organization_id],
    queryFn: () => listReqsCall({ data: { organizationId: org!.organization_id } }),
  });
  const reqsBySiteName = useMemo(() => {
    const nameById = new Map<string, string>();
    for (const l of locationsQ.data ?? []) nameById.set(l.id, String(l.name ?? "").toLowerCase());
    const m = new Map<string, Array<{ day_of_week: number | null; start_time: string; end_time: string; required_staff_count: number }>>();
    for (const r of reqsAllQ.data ?? []) {
      const key = nameById.get(r.location_id);
      if (!key) continue;
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push({
        day_of_week: r.day_of_week ?? null,
        start_time: r.start_time,
        end_time: r.end_time,
        required_staff_count: r.required_staff_count,
      });
    }
    return m;
  }, [reqsAllQ.data, locationsQ.data]);

  // Weekly hour targets per (client, code) — drives the 1:1 and host-home meters.
  const listTargetsCall = useServerFn(listClientWeeklyTargets);
  const targetsQ = useQuery({
    enabled: !!org?.organization_id,
    queryKey: ["client-weekly-targets", org?.organization_id],
    queryFn: () => listTargetsCall({ data: { organizationId: org!.organization_id } }),
  });
  const targetsByClient = useMemo(() => {
    const m = new Map<string, Array<{ service_code: string; target_hours_per_week: number }>>();
    for (const t of targetsQ.data ?? []) {
      if (!m.has(t.client_id)) m.set(t.client_id, []);
      m.get(t.client_id)!.push({
        service_code: String(t.service_code ?? "").toUpperCase(),
        target_hours_per_week: Number(t.target_hours_per_week ?? 0),
      });
    }
    return m;
  }, [targetsQ.data]);

  // Host-home day signals for the visible week: which (client, date) pairs
  // have a daily note and a confirmed overnight (attendance Present).
  const weekStartDate = weekStart.toISOString().slice(0, 10);
  const weekEndDate = useMemo(() => {
    const d = new Date(weekStart); d.setDate(d.getDate() + 7);
    return d.toISOString().slice(0, 10);
  }, [weekStart]);
  const hostSignalsQ = useQuery({
    enabled: !!org?.organization_id,
    queryKey: ["host-day-signals", org?.organization_id, weekStartDate],
    queryFn: async () => {
      const [notes, attendance] = await Promise.all([
        supabase
          .from("daily_logs")
          .select("client_id, log_date")
          .eq("organization_id", org!.organization_id)
          .gte("log_date", weekStartDate)
          .lt("log_date", weekEndDate),
        supabase
          .from("hhs_monthly_attendance")
          .select("client_id, record_date, presence_status")
          .eq("organization_id", org!.organization_id)
          .gte("record_date", weekStartDate)
          .lt("record_date", weekEndDate),
      ]);
      const noteDays = new Set<string>();
      for (const r of notes.data ?? []) {
        if (r.client_id && r.log_date) noteDays.add(`${r.client_id}|${r.log_date}`);
      }
      const overnightDays = new Set<string>();
      for (const r of attendance.data ?? []) {
        if (r.client_id && r.record_date && String(r.presence_status).toLowerCase() === "present") {
          overnightDays.add(`${r.client_id}|${r.record_date}`);
        }
      }
      return { noteDays, overnightDays };
    },
  });

  // Phase 2: evaluate conflicts across the visible week. The result powers
  // the toolbar Conflicts panel + per-shift badges. Re-runs whenever the
  // week shifts or shifts data invalidates.
  const conflictsQ = useQuery({
    enabled: !!org?.organization_id,
    queryKey: ["sched-conflicts", org?.organization_id, weekStart.toISOString(), data?.shifts?.length],
    queryFn: () => {
      const end = new Date(weekStart); end.setDate(end.getDate() + 7);
      return evalRangeCall({
        data: {
          organizationId: org!.organization_id,
          startIso: weekStart.toISOString(),
          endIso: end.toISOString(),
        },
      });
    },
  });
  const conflicts = conflictsQ.data ?? [];
  // Shift ids with a hard/blocking conflict — drives the red border on cards.
  const conflictShiftIds = useMemo(() => {
    const s = new Set<string>();
    for (const c of conflicts) {
      if (c.severity === "hard" || c.severity === "policy_block") s.add(c.shiftId);
    }
    return s;
  }, [conflicts]);
  const shiftLabelById = useMemo(() => {
    const m = new Map<string, string>();
    const cMap = new Map((data?.clients ?? []).map((c) => [c.id, `${c.first_name} ${c.last_name}`.trim()]));
    const sMap = new Map((data?.staff ?? []).map((p) => [p.id, p.name ?? "Staff"]));
    for (const sh of data?.shifts ?? []) {
      const d = new Date(sh.starts_at);
      const day = d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
      const t = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
      const who = sh.staff_id ? sMap.get(sh.staff_id) ?? "Staff" : "Open";
      const cli = sh.client_id ? cMap.get(sh.client_id) ?? "" : "";
      m.set(sh.id, `${day} ${t} · ${who}${cli ? " · " + cli : ""}`);
    }
    return m;
  }, [data]);
  const approvedTimeOff = useMemo(
    () => buildApprovedTimeOffIndex(requests?.timeOff ?? []),
    [requests?.timeOff],
  );

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => { const d = new Date(weekStart); d.setDate(d.getDate() + i); return d; }),
    [weekStart],
  );

  const sites = useMemo(() => {
    const teams = data?.teams ?? [];
    const clients = data?.clients ?? [];
    const list = teams.map((t) => ({ id: t.id, name: t.team_name }));
    if (clients.some((c) => !c.team_id)) list.push({ id: UNASSIGNED_SITE_ID, name: "1-on-1 Services" });
    return list;
  }, [data]);

  const siteClients = useMemo(() => {
    const m = new Map<string, ClientRow[]>();
    if (!data) return m;
    for (const s of sites) m.set(s.id, []);
    for (const c of data.clients) {
      const key = c.team_id ?? UNASSIGNED_SITE_ID;
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(c);
    }
    return m;
  }, [data, sites]);

  const siteShifts = useMemo(() => {
    const m = new Map<string, ShiftRow[]>();
    if (!data) return m;
    const clientToSite = new Map<string, string>();
    for (const c of data.clients) clientToSite.set(c.id, c.team_id ?? UNASSIGNED_SITE_ID);
    for (const s of sites) m.set(s.id, []);
    for (const sh of data.shifts) {
      const key = sh.client_id ? clientToSite.get(sh.client_id) : null;
      if (!key) continue;
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(sh);
    }
    return m;
  }, [data, sites]);

  // A site has an open slot ("gap") if any of its shifts is unassigned.
  const siteHasGap = useMemo(() => {
    const m = new Map<string, boolean>();
    for (const s of sites) m.set(s.id, (siteShifts.get(s.id) ?? []).some((sh) => !sh.staff_id));
    return m;
  }, [sites, siteShifts]);

  if (orgLoading) return <Shell><div style={{ padding: 24, color: SCHED.muted, fontSize: 13 }}>Loading…</div></Shell>;
  if (!isAdmin) {
    return (
      <Shell>
        <div style={card({ padding: 32, textAlign: "center", maxWidth: 420, margin: "48px auto" })}>
          <Lock className="h-8 w-8" style={{ margin: "0 auto 12px", opacity: 0.6 }} />
          <p style={{ fontWeight: 700 }}>Admin or manager access required</p>
          <p style={{ fontSize: 13, color: SCHED.muted, marginTop: 4 }}>Schedule is admin-only.</p>
          <Link to="/dashboard" style={{ display: "inline-block", marginTop: 16, fontSize: 13, color: SCHED.teal, textDecoration: "underline" }}>
            Back to dashboard
          </Link>
        </div>
      </Shell>
    );
  }

  const goPrev = () => { const d = new Date(weekStart); d.setDate(d.getDate() - 7); setWeekStart(d); };
  const goNext = () => { const d = new Date(weekStart); d.setDate(d.getDate() + 7); setWeekStart(d); };
  const goToday = () => setWeekStart(startOfWeek(new Date()));

  // Selecting a day on the mobile strip also moves the fetched week so the
  // existing week-scoped queries cover it (no data-layer changes).
  const selectMobileDay = (d: Date) => {
    const day = new Date(d); day.setHours(0, 0, 0, 0);
    setMobileDay(day);
    const ws = startOfWeek(day);
    if (ws.getTime() !== weekStart.getTime()) setWeekStart(ws);
  };

  const isAll = siteId === "__all__";
  const currentSite = sites.find((s) => s.id === siteId);
  const weekEnd = days[6];
  const weekLabel = `${weekStart.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${weekEnd.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
  const orgName = org?.organization_name ?? "Your agency";

  // A host home is one client living with a host family — label it by the
  // client ("Jane D. — Host Home (HHS)"), not the bare location name.
  const isHostSite = (s: { id: string; name: string }) => hostHomeNames.has(s.name.toLowerCase());
  const hasHostHomes = sites.some(isHostSite);
  const siteDisplayLabel = (s: { id: string; name: string }) => {
    if (!isHostSite(s)) return s.name;
    const c = (siteClients.get(s.id) ?? [])[0];
    return c ? hostHomeRowLabel(c.first_name, c.last_name) : hostHomeRowLabel(null, null);
  };

  return (
    <Shell>
      {/* ── Mobile Day view (below md only) ───────────────────────────── */}
      <div className="md:hidden">
        {hasHostHomes && <HhsExplainerBanner className="mb-3" />}
        <MobileDayBoard
          day={mobileDay}
          onSelectDay={selectMobileDay}
          sites={sites}
          siteId={siteId}
          onPickSite={setSiteId}
          siteClients={siteClients}
          siteShifts={siteShifts}
          allShifts={data?.shifts ?? []}
          staff={data?.staff ?? []}
          clients={data?.clients ?? []}
          isLoading={isLoading}
          conflictShiftIds={conflictShiftIds}
          hostHomeNames={hostHomeNames}
          reqsBySiteName={reqsBySiteName}
          noteDays={hostSignalsQ.data?.noteDays}
          overnightDays={hostSignalsQ.data?.overnightDays}
          weekStart={weekStart}
          weekEndIso={new Date(weekEnd.getTime() + 24 * 3600 * 1000).toISOString()}
          organizationId={org?.organization_id}
          onOpenEditor={openEditor}
          onOpenTimeline={(sid, sname) => setTimelineCtx({ siteId: sid, siteName: sname, day: mobileDay })}
          onOpenSettings={() => setSettingsOpen(true)}
        />
        {/* Floating create button — launches the existing client→code→time→staff flow. */}
        <button
          type="button"
          aria-label="New shift"
          onClick={() => { setCreateInitialDay(mobileDay); setCreateOpen(true); }}
          className="fixed bottom-5 right-5 z-40 grid h-14 w-14 place-items-center rounded-full text-2xl font-bold text-white shadow-lg active:scale-95"
          style={{ background: SCHED.navy }}
        >
          +
        </button>
      </div>

      {/* ── Desktop board (md+) — unchanged ───────────────────────────── */}
      <div className="hidden md:block">
      {/* ── Header ───────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 14, marginBottom: 14 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, letterSpacing: "-.02em", color: SCHED.ink }}>Scheduler</h1>
          <p style={{ margin: "4px 0 0", color: SCHED.muted, fontWeight: 500 }}>
            {orgName} · click any shift to edit, or a + on an open slot to add one
          </p>
        </div>
        <div style={{ display: "flex", gap: 9, alignItems: "center", flexWrap: "wrap" }}>
          <ConflictsPanel
            conflicts={conflicts}
            shiftLabel={(id) => shiftLabelById.get(id) ?? id.slice(0, 8)}
            onJumpToShift={(id) => {
              const shift = (data?.shifts ?? []).find((s) => s.id === id);
              if (shift) openEditor({ shift });
            }}
          />
          <PublishDraftsButton
            shifts={data?.shifts ?? []}
            weekStart={weekStart}
            conflictsCount={conflicts.filter(c => c.severity === "hard" || c.severity === "policy_block").length}
            onPublished={() => queryClient.invalidateQueries({ queryKey: ["schedule-preview"] })}
          />
          <button style={btn()} onClick={() => setTargetsOpen(true)}>Weekly targets</button>
          <button style={btn()} onClick={() => setLocationsOpen(true)}>Locations</button>
          <button style={btn()} onClick={() => setCoverageOpen(true)}>Coverage rules</button>
          {org?.organization_id && (
            <CopyWeekMenu
              organizationId={org.organization_id}
              weekStart={weekStart}
              onApplied={() => queryClient.invalidateQueries({ queryKey: ["schedule-preview"] })}
            />
          )}
          {org?.organization_id && isAdmin && (
            <>
              <button style={btn()} onClick={() => setRecurringOpen(true)}>Recurring patterns</button>
              <button style={btn()} onClick={() => setAutoAssignOpen(true)}>Auto-assign</button>
            </>
          )}
          <button style={{ ...btn(), background: SCHED.navy, color: "#fff", borderColor: SCHED.navy }} onClick={() => setCreateOpen(true)}>+ New shift</button>
          <Link to="/dashboard/homes" style={btn()}>Homes &amp; Teams</Link>
          <button style={btn()} onClick={() => setSettingsOpen(true)}><span style={{ fontSize: 15 }}>⚙</span> Settings</button>
        </div>
      </div>

      {/* ── NECTAR command bar (logic reused; styled to match) ────────── */}
      <NectarCommandBar
        weekStart={weekStart}
        clients={data?.clients ?? []}
        staff={data?.staff ?? []}
        teams={data?.teams ?? []}
        shifts={data?.shifts ?? []}
      />

      {hasHostHomes && <HhsExplainerBanner className="mb-3" />}

      {/* ── Controls bar (rounded top, attached to board) ─────────────── */}
      <div style={controlsBar}>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <button style={arrowBtn} onClick={goPrev} aria-label="Previous week">‹</button>
          <b style={{ fontSize: 14, whiteSpace: "nowrap" }}>{weekLabel}</b>
          <button style={arrowBtn} onClick={goNext} aria-label="Next week">›</button>
          <button style={{ ...arrowBtn, width: "auto", padding: "0 10px", fontSize: 12.5, fontWeight: 600 }} onClick={goToday}>Today</button>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <HomePill active={isAll} label="All homes" onClick={() => setSiteId("__all__")} />
          {sites.map((s) => (
            <HomePill
              key={s.id}
              active={siteId === s.id}
              label={siteDisplayLabel(s)}
              gap={!!siteHasGap.get(s.id)}
              host={false}
              onClick={() => setSiteId(s.id)}
            />
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <ViewSeg value={view} onChange={setView} disabled={isAll} />
      </div>

      {/* ── Board ─────────────────────────────────────────────────────── */}
      <div style={board}>
        {isLoading ? (
          <div style={{ padding: 40, textAlign: "center", color: SCHED.muted, fontSize: 13 }}>Loading schedule…</div>
        ) : isAll ? (
          <AllHomesBoard
            days={days} sites={sites} siteClients={siteClients} siteShifts={siteShifts}
            settings={settings} onPickSite={setSiteId}
            hostHomeNames={hostHomeNames}
            reqsBySiteName={reqsBySiteName}
            targetsByClient={targetsByClient}
            noteDays={hostSignalsQ.data?.noteDays}
            overnightDays={hostSignalsQ.data?.overnightDays}
            onOpenDay={(sid, sname, d) => setTimelineCtx({ siteId: sid, siteName: sname, day: d })}
          />
        ) : currentSite ? (
          <SiteWeekGrid
            key={currentSite.id}
            siteId={currentSite.id} siteName={currentSite.name} days={days}
            clients={siteClients.get(currentSite.id) ?? []} shifts={siteShifts.get(currentSite.id) ?? []}
            staff={data?.staff ?? []} view={view} settings={settings} onOpenEditor={openEditor}
            conflictShiftIds={conflictShiftIds}
            isHostHome={hostHomeNames.has(currentSite.name.toLowerCase())}
          />
        ) : (
          <div style={{ padding: 40, textAlign: "center", color: SCHED.muted, fontSize: 13 }}>No sites or 1-on-1 clients yet.</div>
        )}
      </div>

      {/* ── Week strip (requests) ─────────────────────────────────────── */}
      <RequestsPanel weekStart={weekStart} staff={data?.staff ?? []} />

      {org?.organization_id && (
        <OpenShiftsPanel
          organizationId={org.organization_id}
          startIso={weekStart.toISOString()}
          endIso={new Date(weekEnd.getTime() + 24 * 3600 * 1000).toISOString()}
          mode="admin"
          clientNames={new Map((data?.clients ?? []).map((c) => [c.id, `${c.first_name} ${c.last_name}`.trim()]))}
          onJumpToShift={(id) => {
            const shift = (data?.shifts ?? []).find((s) => s.id === id);
            if (shift) openEditor({ shift });
          }}
        />
      )}

      {org?.organization_id && (
        <ActionNeededCard
          organizationId={org.organization_id}
          weekStart={weekStart}
          staffNames={new Map((data?.staff ?? []).map((p) => [p.id, p.name ?? "Staff"]))}
          clientNames={new Map((data?.clients ?? []).map((c) => [c.id, `${c.first_name} ${c.last_name}`.trim()]))}
          onJumpToShift={(id) => {
            const shift = (data?.shifts ?? []).find((s) => s.id === id);
            if (shift) openEditor({ shift });
          }}
        />
      )}

      <p style={{ marginTop: 14, color: SCHED.muted, fontSize: 12.5, textAlign: "center" }}>
        Site type inferred from shift codes (HHS, RHS, DSG, RL6, RP3–5 = residential). Clients with no team are grouped as “1-on-1 Services”.
      </p>
      </div>{/* end desktop-only block */}

      <SettingsDrawer open={settingsOpen} onOpenChange={setSettingsOpen} settings={settings} onChange={setSettings} organizationId={org?.organization_id} />

      <ShiftEditorDialog
        open={editorOpen} onOpenChange={setEditorOpen} ctx={editorCtx}
        clients={data?.clients ?? []} staff={data?.staff ?? []} siteId={siteId}
        weekStartIso={weekStart.toISOString()} approvedTimeOff={approvedTimeOff}
      />

      {org?.organization_id && (
        <ShiftCreateDialog
          open={createOpen}
          onOpenChange={(v) => { setCreateOpen(v); if (!v) setCreateInitialDay(null); }}
          organizationId={org.organization_id}
          clients={(data?.clients ?? []).map((c) => ({ id: c.id, name: `${c.first_name} ${c.last_name}`.trim() }))}
          initialDay={createInitialDay}
          onCreated={() => queryClient.invalidateQueries({ queryKey: ["schedule-preview"] })}
        />
      )}

      {org?.organization_id && (
        <DayTimelineDrawer
          open={!!timelineCtx}
          onOpenChange={(v) => { if (!v) setTimelineCtx(null); }}
          organizationId={org.organization_id}
          day={timelineCtx?.day ?? null}
          locationName={timelineCtx?.siteName}
          onCreateClick={(d) => { setTimelineCtx(null); setCreateInitialDay(d); setCreateOpen(true); }}
          onShiftClick={(id) => {
            const shift = (data?.shifts ?? []).find((s) => s.id === id);
            if (shift) { setTimelineCtx(null); openEditor({ shift }); }
          }}
        />
      )}

      {org?.organization_id && (
        <WeeklyTargetsDialog
          open={targetsOpen}
          onOpenChange={setTargetsOpen}
          organizationId={org.organization_id}
          clients={(data?.clients ?? []).map((c) => ({ id: c.id, name: `${c.first_name} ${c.last_name}`.trim() }))}
        />
      )}

      {org?.organization_id && (
        <CoverageRequirementsDialog
          open={coverageOpen}
          onOpenChange={setCoverageOpen}
          organizationId={org.organization_id}
        />
      )}

      {org?.organization_id && (
        <LocationsDialog
          open={locationsOpen}
          onOpenChange={setLocationsOpen}
          organizationId={org.organization_id}
        />
      )}

      {org?.organization_id && (
        <RecurringPatternsDialog
          open={recurringOpen}
          onOpenChange={setRecurringOpen}
          organizationId={org.organization_id}
          weekStart={weekStart}
          clients={(data?.clients ?? []).map((c: ClientRow) => ({ id: c.id, name: `${c.first_name} ${c.last_name}`.trim() }))}
          staff={(data?.staff ?? []).map((s: StaffRow) => ({ id: s.id, name: s.name }))}
          onChanged={() => queryClient.invalidateQueries({ queryKey: ["schedule-preview"] })}
        />
      )}

      {org?.organization_id && (
        <AutoAssignDrawer
          open={autoAssignOpen}
          onOpenChange={setAutoAssignOpen}
          organizationId={org.organization_id}
          weekStart={weekStart}
          onApplied={() => queryClient.invalidateQueries({ queryKey: ["schedule-preview"] })}
        />
      )}
    </Shell>
  );
}

// ── Shell + small chrome helpers ──────────────────────────────────────
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ ...font, background: SCHED.paper, color: SCHED.ink, padding: 22, minHeight: "60vh" }}>
      {/* :hover affordances the inline styles can't express (quick-add reveal, drill, chip) */}
      <style>{`
        .sched-cell .sched-add{border-color:transparent;color:#c4c8d4}
        .sched-cell:hover .sched-add{border-color:#dde0ea;color:${SCHED.muted}}
        .sched-add:hover{border-color:${SCHED.teal}!important;color:${SCHED.teal}!important}
        .sched-drill:hover td:first-child{color:${SCHED.teal}}
        .sched-chip:hover{filter:brightness(.97);box-shadow:0 0 0 2px rgba(19,113,130,.15)}
      `}</style>
      {children}
    </div>
  );
}
function card(extra: React.CSSProperties): React.CSSProperties {
  return { background: SCHED.card, border: `1px solid ${SCHED.line}`, borderRadius: 14, boxShadow: SCHED.shadow, ...extra };
}
function btn(): React.CSSProperties {
  return {
    border: `1px solid ${SCHED.line}`, background: "#fff", color: SCHED.ink, padding: "9px 14px",
    borderRadius: 10, fontWeight: 600, fontSize: 13, display: "inline-flex", alignItems: "center",
    gap: 7, textDecoration: "none", cursor: "pointer",
  };
}
const controlsBar: React.CSSProperties = {
  background: SCHED.card, border: `1px solid ${SCHED.line}`, borderRadius: "14px 14px 0 0",
  borderBottom: "none", padding: "11px 14px", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap",
};
const board: React.CSSProperties = {
  background: SCHED.card, border: `1px solid ${SCHED.line}`, borderRadius: "0 0 16px 16px",
  boxShadow: SCHED.shadow, overflow: "hidden",
};
const arrowBtn: React.CSSProperties = {
  border: `1px solid ${SCHED.line}`, background: "#fff", width: 28, height: 28, borderRadius: 8, fontSize: 14, cursor: "pointer", color: SCHED.ink,
};

function HomePill({ active, label, gap, host, onClick }: { active: boolean; label: string; gap?: boolean; host?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        border: `1px solid ${active ? SCHED.navy : SCHED.line}`, background: active ? SCHED.navy : "#fff",
        color: active ? "#fff" : SCHED.ink, borderRadius: 9, padding: "7px 12px", fontWeight: 600,
        fontSize: 12.5, display: "flex", alignItems: "center", gap: 7, cursor: "pointer", whiteSpace: "nowrap",
      }}
    >
      {label}
      {host && (
        <span style={{
          fontSize: 9, fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase",
          padding: "2px 5px", borderRadius: 4,
          background: active ? "rgba(255,255,255,.18)" : "#eef2ff", color: active ? "#fff" : "#4f46e5",
        }}>HOST</span>
      )}
      {gap && <span style={{ width: 7, height: 7, borderRadius: "50%", background: SCHED.gap }} />}
    </button>
  );
}

function ViewSeg({ value, onChange, disabled }: { value: ViewMode; onChange: (v: ViewMode) => void; disabled?: boolean }) {
  const items: ViewMode[] = ["staff", "client", "both"];
  return (
    <div style={{ display: "flex", border: `1px solid ${SCHED.line}`, borderRadius: 9, overflow: "hidden", opacity: disabled ? 0.4 : 1, pointerEvents: disabled ? "none" : "auto" }}>
      {items.map((v) => {
        const on = value === v;
        return (
          <button
            key={v}
            onClick={() => onChange(v)}
            style={{ border: "none", background: on ? SCHED.tealBg : "#fff", padding: "7px 13px", fontWeight: 700, fontSize: 12.5, color: on ? "#0c5562" : SCHED.muted, cursor: "pointer" }}
          >
            {v === "staff" ? "Staff" : v === "client" ? "Client" : "Both"}
          </button>
        );
      })}
    </div>
  );
}

// ── Mobile Day view (below md) ────────────────────────────────────────
// Replaces the desktop week grid on phones: a swipeable date strip,
// location chips, the day's shifts as stacked cards, pinned approvals /
// open shifts, and a compact coverage strip. Presentation only — it reads
// the exact same week-scoped data as the desktop board.
function MobileDayBoard({
  day, onSelectDay, sites, siteId, onPickSite, siteShifts, siteClients, allShifts, staff, clients,
  isLoading, conflictShiftIds, hostHomeNames, reqsBySiteName, noteDays, overnightDays,
  weekStart, weekEndIso, organizationId, onOpenEditor, onOpenTimeline, onOpenSettings,
}: {
  day: Date;
  onSelectDay: (d: Date) => void;
  sites: { id: string; name: string }[];
  siteId: string;
  onPickSite: (id: string) => void;
  siteShifts: Map<string, ShiftRow[]>;
  siteClients: Map<string, ClientRow[]>;
  allShifts: ShiftRow[];
  staff: StaffRow[];
  clients: ClientRow[];
  isLoading: boolean;
  conflictShiftIds: Set<string>;
  hostHomeNames: Set<string>;
  reqsBySiteName: Map<string, ReqRow[]>;
  noteDays?: Set<string>;
  overnightDays?: Set<string>;
  weekStart: Date;
  weekEndIso: string;
  organizationId?: string;
  onOpenEditor: (ctx: EditorContext) => void;
  onOpenTimeline: (siteId: string, siteName: string) => void;
  onOpenSettings: () => void;
}) {
  const staffNameById = useMemo(() => new Map(staff.map((s) => [s.id, s.name ?? "Staff"])), [staff]);
  const clientNameById = useMemo(
    () => new Map(clients.map((c) => [c.id, `${c.first_name} ${c.last_name}`.trim()])),
    [clients],
  );

  // 14-day strip: 3 days back through 10 ahead, today highlighted.
  const strip = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return Array.from({ length: 14 }, (_, i) => {
      const d = new Date(today); d.setDate(d.getDate() - 3 + i); return d;
    });
  }, []);
  const todayMs = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); }, []);

  const isAll = siteId === "__all__";
  const dayShifts = useMemo(() => {
    const pool = isAll ? allShifts : (siteShifts.get(siteId) ?? []);
    return pool
      .filter((s) => sameDay(new Date(s.starts_at), day))
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  }, [isAll, allShifts, siteShifts, siteId, day]);

  // Clients who live in a host home → their visit cards get HHS labels even
  // in the All view where a card has no site context.
  const hostClientIds = useMemo(() => {
    const set = new Set<string>();
    for (const s of sites) {
      if (!hostHomeNames.has(s.name.toLowerCase())) continue;
      for (const c of siteClients.get(s.id) ?? []) set.add(c.id);
    }
    return set;
  }, [sites, siteClients, hostHomeNames]);
  const hostLabel = (s: { id: string; name: string }) => {
    const c = (siteClients.get(s.id) ?? [])[0];
    return c ? hostHomeRowLabel(c.first_name, c.last_name) : hostHomeRowLabel(null, null);
  };

  // Coverage strip: real homes only (1-on-1 pseudo-site excluded), honoring
  // the active location chip.
  const coverageSites = sites.filter((s) => s.id !== UNASSIGNED_SITE_ID && (isAll || s.id === siteId));
  const dk = (() => { const x = new Date(day); x.setHours(12); return x.toISOString().slice(0, 10); })();

  return (
    <div className="space-y-3 pb-24">
      {/* Compact header */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight" style={{ color: SCHED.ink }}>Scheduler</h1>
          <p className="text-xs font-medium" style={{ color: SCHED.muted }}>
            {day.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onSelectDay(new Date())}
            className="min-h-11 rounded-lg border bg-white px-3 text-xs font-semibold"
            style={{ borderColor: SCHED.line, color: SCHED.ink }}
          >
            Today
          </button>
          <button
            type="button"
            aria-label="Scheduler settings"
            onClick={onOpenSettings}
            className="grid h-11 w-11 place-items-center rounded-lg border bg-white"
            style={{ borderColor: SCHED.line, color: SCHED.ink }}
          >
            <SettingsIcon className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Date strip — horizontally scrollable, tap to select */}
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" style={{ scrollbarWidth: "none" }}>
        {strip.map((d) => {
          const selected = sameDay(d, day);
          const isToday = d.getTime() === todayMs;
          return (
            <button
              key={d.toISOString()}
              type="button"
              onClick={() => onSelectDay(d)}
              className="flex min-h-14 min-w-12 shrink-0 flex-col items-center justify-center rounded-xl border px-1"
              style={{
                background: selected ? SCHED.navy : "#fff",
                borderColor: selected ? SCHED.navy : SCHED.line,
                color: selected ? "#fff" : SCHED.ink,
              }}
            >
              <span className="text-[10px] font-bold uppercase tracking-wide opacity-75">
                {DAY_LABELS[d.getDay()]}
              </span>
              <span className="text-base font-extrabold tabular-nums leading-tight">{d.getDate()}</span>
              <span
                className="mt-0.5 h-1 w-1 rounded-full"
                style={{ background: isToday ? "#f59324" : "transparent" }}
              />
            </button>
          );
        })}
      </div>

      {/* Location chips */}
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" style={{ scrollbarWidth: "none" }}>
        <button
          type="button"
          onClick={() => onPickSite("__all__")}
          className="min-h-11 shrink-0 rounded-full border px-3.5 text-xs font-semibold"
          style={{
            background: isAll ? SCHED.navy : "#fff",
            borderColor: isAll ? SCHED.navy : SCHED.line,
            color: isAll ? "#fff" : SCHED.ink,
          }}
        >
          All
        </button>
        {sites.map((s) => {
          const on = siteId === s.id;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onPickSite(s.id)}
              className="min-h-11 shrink-0 rounded-full border px-3.5 text-xs font-semibold"
              style={{
                background: on ? SCHED.navy : "#fff",
                borderColor: on ? SCHED.navy : SCHED.line,
                color: on ? "#fff" : SCHED.ink,
              }}
            >
              {s.id === UNASSIGNED_SITE_ID
                ? "1-on-1"
                : hostHomeNames.has(s.name.toLowerCase())
                  ? hostLabel(s)
                  : s.name}
            </button>
          );
        })}
      </div>

      {/* Pinned: needs-approval + open shifts (one-tap actions live inside) */}
      <div className="[&_button]:min-h-11">
        <RequestsPanel weekStart={weekStart} staff={staff} />
        {organizationId && (
          <OpenShiftsPanel
            organizationId={organizationId}
            startIso={weekStart.toISOString()}
            endIso={weekEndIso}
            mode="admin"
            clientNames={clientNameById}
            onJumpToShift={(id) => {
              const shift = allShifts.find((s) => s.id === id);
              if (shift) onOpenEditor({ shift });
            }}
          />
        )}
      </div>

      {/* Coverage strip for the selected day */}
      {coverageSites.length > 0 && (
        <div className="rounded-xl border bg-white p-3" style={{ borderColor: SCHED.line }}>
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wide" style={{ color: SCHED.muted }}>
            Coverage · {day.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
          </p>
          <div className="space-y-2.5">
            {coverageSites.map((s) => {
              const isHost = hostHomeNames.has(s.name.toLowerCase());
              const shifts = (siteShifts.get(s.id) ?? []).filter((sh) => sameDay(new Date(sh.starts_at), day));
              const homeClients = siteClients.get(s.id) ?? [];
              if (isHost) {
                const state = (check: (cid: string) => boolean): "done" | "partial" | "none" => {
                  if (homeClients.length === 0) return "none";
                  const n = homeClients.filter((c) => check(c.id)).length;
                  return n === homeClients.length ? "done" : n > 0 ? "partial" : "none";
                };
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => onOpenTimeline(s.id, s.name)}
                    className="flex min-h-11 w-full items-center justify-between gap-2 text-left"
                  >
                    <span className="truncate text-xs font-semibold" style={{ color: SCHED.ink }}>
                      {hostLabel(s)}
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      <HostDot state={state((cid) => !!noteDays?.has(`${cid}|${dk}`))} label="Daily note" />
                      <HostDot state={state((cid) => !!overnightDays?.has(`${cid}|${dk}`))} label="Overnight confirmed" />
                      <HostDot state={shifts.length > 0 ? "done" : "none"} label="Agency visit scheduled" />
                    </span>
                  </button>
                );
              }
              const dayReqs = (reqsBySiteName.get(s.name.toLowerCase()) ?? []).filter(
                (r) => r.day_of_week === null || r.day_of_week === day.getDay(),
              );
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => onOpenTimeline(s.id, s.name)}
                  className="block min-h-11 w-full text-left"
                >
                  <span className="mb-1 block truncate text-xs font-semibold" style={{ color: SCHED.ink }}>{s.name}</span>
                  <CoverageBar24h
                    micro
                    day={day}
                    shifts={shifts.map((sh) => ({
                      id: sh.id, starts_at: sh.starts_at, ends_at: sh.ends_at,
                      staff_id: sh.staff_id, service_code: sh.service_code,
                      job_code: sh.job_code, parent_shift_id: sh.parent_shift_id,
                    }))}
                    requirements={dayReqs}
                  />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* The day's shifts as stacked cards */}
      <div className="space-y-2">
        <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: SCHED.muted }}>
          {dayShifts.length === 0 ? "No shifts" : `${dayShifts.length} shift${dayShifts.length === 1 ? "" : "s"}`} this day
        </p>
        {isLoading ? (
          <div className="rounded-xl border bg-white p-6 text-center text-sm" style={{ borderColor: SCHED.line, color: SCHED.muted }}>
            Loading schedule…
          </div>
        ) : dayShifts.length === 0 ? (
          <div className="rounded-xl border border-dashed bg-white p-6 text-center text-sm" style={{ borderColor: SCHED.line, color: SCHED.muted }}>
            Nothing scheduled — tap + to add a shift.
          </div>
        ) : (
          dayShifts.map((s) => (
            <MobileShiftCard
              key={s.id}
              shift={s}
              staffName={staffNameById.get(s.staff_id ?? "") ?? "Open"}
              clientName={clientNameById.get(s.client_id ?? "") ?? ""}
              hasConflict={conflictShiftIds.has(s.id)}
              isHostHome={!!s.client_id && hostClientIds.has(s.client_id)}
              onClick={() => onOpenEditor({ shift: s })}
            />
          ))
        )}
      </div>
    </div>
  );
}

function MobileShiftCard({
  shift, staffName, clientName, hasConflict, onClick, isHostHome,
}: {
  shift: ShiftRow;
  staffName: string;
  clientName: string;
  hasConflict: boolean;
  onClick: () => void;
  isHostHome?: boolean;
}) {
  const code = (shift.service_code ?? shift.job_code ?? "").toUpperCase();
  const visitLabel = hhsVisitLabel(code, isHostHome);
  const hex = FAMILY_HEX[familyForCode(code)] ?? "#64748b";
  const isOpen = !shift.staff_id;
  const status = isOpen
    ? "open"
    : shift.status === "accepted" ? "accepted"
    : shift.status === "declined" ? "declined"
    : shift.status === "draft" || !shift.published ? "draft"
    : "published";
  const isSegment = !!shift.parent_shift_id;
  const fromNectar = (shift.created_from ?? "").toLowerCase().startsWith("nectar");
  const timeStr = `${fmtTime(shift.starts_at)}–${fmtTime(shift.ends_at)}`;

  const statusBits: Record<string, { icon: React.ReactNode; label: string; cls: string }> = {
    open:      { icon: <AlertTriangle className="h-3.5 w-3.5" />, label: "Open",      cls: "bg-red-50 text-red-700" },
    draft:     { icon: <CalendarCheck2 className="h-3.5 w-3.5 opacity-50" />, label: "Draft", cls: "bg-slate-100 text-slate-600" },
    published: { icon: <CalendarCheck2 className="h-3.5 w-3.5" />, label: "Published", cls: "bg-sky-50 text-sky-700" },
    accepted:  { icon: <CheckCircle2 className="h-3.5 w-3.5" />,  label: "Accepted",  cls: "bg-emerald-50 text-emerald-700" },
    declined:  { icon: <XCircle className="h-3.5 w-3.5" />,       label: "Declined",  cls: "bg-red-50 text-red-700" },
  };
  const bit = statusBits[status];

  return (
    <button
      type="button"
      onClick={onClick}
      title={visitLabel ? HHS_VISIT_TOOLTIP : undefined}
      className="block w-full rounded-xl border bg-white p-3 text-left shadow-sm active:scale-[0.99]"
      style={{
        borderColor: hasConflict ? "#dc2626" : SCHED.line,
        borderWidth: hasConflict ? 2 : 1,
        borderStyle: status === "draft" && !hasConflict ? "dashed" : "solid",
        minHeight: 64,
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2">
          <span
            className="shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-extrabold tracking-wide text-white"
            style={{ background: hex }}
          >
            {code || "—"}{isSegment ? " · 1:1" : ""}
          </span>
          <span className="truncate text-sm font-semibold" style={{ color: SCHED.ink }}>
            {visitLabel ?? (isOpen ? "Open shift" : firstName(staffName))}
            {visitLabel
              ? (!isOpen && <span className="font-normal" style={{ color: SCHED.muted }}> · {firstName(staffName)}</span>)
              : (clientName && <span className="font-normal" style={{ color: SCHED.muted }}> → {firstName(clientName)}</span>)}
          </span>
          {visitLabel && <Info className="h-3.5 w-3.5 shrink-0" style={{ color: SCHED.muted }} aria-label="HHS visit info" />}
          {fromNectar && <Sparkles className="h-3.5 w-3.5 shrink-0" style={{ color: "#d97a1c" }} />}
        </span>
        <span className={cn2("flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold", bit.cls)}>
          {bit.icon}{bit.label}
        </span>
      </div>
      <div className="mt-1.5 flex items-center gap-2 text-xs tabular-nums" style={{ color: SCHED.muted }}>
        {timeStr}
        <span className="rounded px-1.5 py-0.5 text-[10px] font-bold" style={{ background: hex + "1a", color: hex }}>
          {durationLabel(shift.starts_at, shift.ends_at)}
        </span>
        {hasConflict && (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-600">
            <AlertTriangle className="h-3 w-3" /> conflict
          </span>
        )}
      </div>
    </button>
  );
}

// Tiny class joiner for the mobile card (avoids importing cn into this
// inline-styled page for one use).
function cn2(...parts: Array<string | false | undefined>) {
  return parts.filter(Boolean).join(" ");
}

// ── All-homes status board ────────────────────────────────────────────
type ReqRow = { day_of_week: number | null; start_time: string; end_time: string; required_staff_count: number };

/** Tri-state status dot for the host-home day cells. */
function HostDot({ state, label }: { state: "done" | "partial" | "none"; label: string }) {
  const bg = state === "done" ? "#15a06a" : state === "partial" ? "#f59324" : "#d7dbe6";
  return <span title={`${label}: ${state === "done" ? "done" : state === "partial" ? "partial" : "not yet"}`} style={{ ...dot, background: bg }} />;
}

function AllHomesBoard({
  days, sites, siteClients, siteShifts, settings, onPickSite, onOpenDay, hostHomeNames,
  reqsBySiteName, targetsByClient, noteDays, overnightDays,
}: {
  days: Date[];
  sites: { id: string; name: string }[];
  siteClients: Map<string, ClientRow[]>;
  siteShifts: Map<string, ShiftRow[]>;
  settings: Settings;
  onPickSite: (id: string) => void;
  onOpenDay?: (siteId: string, siteName: string, day: Date) => void;
  hostHomeNames?: Set<string>;
  reqsBySiteName?: Map<string, ReqRow[]>;
  targetsByClient?: Map<string, Array<{ service_code: string; target_hours_per_week: number }>>;
  noteDays?: Set<string>;
  overnightDays?: Set<string>;
}) {
  if (sites.length === 0) return <div style={{ padding: 40, textAlign: "center", color: SCHED.muted, fontSize: 13 }}>No sites yet.</div>;

  const isoDay = (d: Date) => {
    const x = new Date(d); x.setHours(12); // noon avoids TZ edge on toISOString
    return x.toISOString().slice(0, 10);
  };
  // Scheduled hours per (client, code) this week — feeds the weekly meters.
  const scheduledByClientCode = new Map<string, number>();
  for (const shifts of siteShifts.values()) {
    for (const sh of shifts) {
      const code = (sh.service_code ?? sh.job_code ?? "").toUpperCase();
      if (!sh.client_id || !code) continue;
      const hrs = Math.max(0, (new Date(sh.ends_at).getTime() - new Date(sh.starts_at).getTime()) / 3600000);
      const k = `${sh.client_id}|${code}`;
      scheduledByClientCode.set(k, (scheduledByClientCode.get(k) ?? 0) + hrs);
    }
  }

  return (
    <>
      <table style={grid}>
        <thead>
          <tr>
            <th style={{ ...gTh, ...gThLeft, width: 170 }}>Home</th>
            {days.map((d, i) => <th key={i} style={gTh}>{DAY_LABELS[d.getDay()]} {d.getDate()}</th>)}
          </tr>
        </thead>
        <tbody>
          {sites.map((s) => {
            const clients = siteClients.get(s.id) ?? [];
            const shifts = siteShifts.get(s.id) ?? [];
            const type = inferSiteType(s.id, clients, shifts);
            const isHost = !!hostHomeNames?.has(s.name.toLowerCase());
            const isOneOnOne = s.id === UNASSIGNED_SITE_ID;
            const siteReqs = reqsBySiteName?.get(s.name.toLowerCase()) ?? [];

            // Weekly Direct-Support meter for host homes: agency visits
            // (DSI/SEI/DSG/DSP/EPR) scheduled vs the clients' weekly targets.
            const DS_CODES = ["DSI", "SEI", "DSG", "DSP", "EPR"];
            const dsHours = shifts.reduce((acc, sh) => {
              const code = (sh.service_code ?? sh.job_code ?? "").toUpperCase();
              if (!DS_CODES.includes(code)) return acc;
              return acc + Math.max(0, (new Date(sh.ends_at).getTime() - new Date(sh.starts_at).getTime()) / 3600000);
            }, 0);
            const dsTarget = clients.reduce((acc, c) => {
              for (const t of targetsByClient?.get(c.id) ?? []) {
                if (DS_CODES.includes(t.service_code)) acc += t.target_hours_per_week;
              }
              return acc;
            }, 0);

            // 1:1 rows: weekly target meters per client+code (top few).
            const oneOnOneMeters: Array<{ key: string; code: string; scheduled: number; target: number; name: string }> = [];
            if (isOneOnOne) {
              for (const c of clients) {
                for (const t of targetsByClient?.get(c.id) ?? []) {
                  oneOnOneMeters.push({
                    key: `${c.id}|${t.service_code}`,
                    code: t.service_code,
                    scheduled: scheduledByClientCode.get(`${c.id}|${t.service_code}`) ?? 0,
                    target: t.target_hours_per_week,
                    name: c.first_name,
                  });
                }
              }
            }

            return (
              <tr key={s.id} style={{ cursor: "pointer" }} onClick={() => onPickSite(s.id)} className="sched-drill">
                <td style={rowHead}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {isHost
                      ? hostHomeRowLabel(clients[0]?.first_name, clients[0]?.last_name)
                      : s.name}
                  </div>
                  {settings.showResidentCount && (
                    <small style={rowHeadSmall}>
                      {isHost ? "Host home" : type === "residential" ? "Residential" : "Day / 1:1"} · {clients.length} {clients.length === 1 ? "person" : "people"}
                    </small>
                  )}
                  {isHost && dsTarget > 0 && (
                    <div style={{ marginTop: 6, maxWidth: 140 }}>
                      <WeeklyTargetMeter
                        serviceCode="DS"
                        scheduledHours={dsHours}
                        targetHours={dsTarget}
                        compact
                      />
                    </div>
                  )}
                  {isOneOnOne && oneOnOneMeters.slice(0, 4).map((m) => (
                    <div key={m.key} style={{ marginTop: 6, maxWidth: 140 }}>
                      <div style={{ fontSize: 10, fontWeight: 600, color: SCHED.muted, marginBottom: 1 }}>{m.name}</div>
                      <WeeklyTargetMeter serviceCode={m.code} scheduledHours={m.scheduled} targetHours={m.target} compact />
                    </div>
                  ))}
                  {isOneOnOne && oneOnOneMeters.length > 4 && (
                    <small style={rowHeadSmall}>+{oneOnOneMeters.length - 4} more targets</small>
                  )}
                </td>
                {days.map((d, i) => {
                  const de = shifts.filter((sh) => sameDay(new Date(sh.starts_at), d));
                  const open = de.filter((sh) => !sh.staff_id).length;
                  const setCnt = de.length - open;
                  let content: React.ReactNode;
                  if (isHost) {
                    // Three status dots: daily note done / overnight confirmed /
                    // agency visit scheduled. Host homes NEVER show a red gap —
                    // hosts don't clock; their artifacts are notes + attendance.
                    const dk = isoDay(d);
                    const states = (check: (cid: string) => boolean): "done" | "partial" | "none" => {
                      if (clients.length === 0) return "none";
                      const n = clients.filter((c) => check(c.id)).length;
                      return n === clients.length ? "done" : n > 0 ? "partial" : "none";
                    };
                    const noteState = states((cid) => !!noteDays?.has(`${cid}|${dk}`));
                    const overnightState = states((cid) => !!overnightDays?.has(`${cid}|${dk}`));
                    const visitState: "done" | "none" = de.length > 0 ? "done" : "none";
                    content = (
                      <div style={{ ...statusBase, gap: 4, justifyContent: "center" }}>
                        <HostDot state={noteState} label="Daily note" />
                        <HostDot state={overnightState} label="Overnight confirmed" />
                        <HostDot state={visitState} label="Agency visit scheduled" />
                      </div>
                    );
                  } else if (type === "residential") {
                    // 24h micro coverage bar: covered intervals colored by code
                    // family, gaps vs the location's requirements red-striped,
                    // over-coverage green-striped.
                    const dayReqs = siteReqs.filter(
                      (r) => r.day_of_week === null || r.day_of_week === d.getDay(),
                    );
                    content = (
                      <div style={{ padding: "4px 2px" }}>
                        <CoverageBar24h
                          micro
                          day={d}
                          shifts={de.map((sh) => ({
                            id: sh.id,
                            starts_at: sh.starts_at,
                            ends_at: sh.ends_at,
                            staff_id: sh.staff_id,
                            service_code: sh.service_code,
                            job_code: sh.job_code,
                            parent_shift_id: sh.parent_shift_id,
                          }))}
                          requirements={dayReqs}
                        />
                      </div>
                    );
                  } else if (de.length === 0) content = <div style={{ ...statusBase, color: "#c4c8d4" }}>—</div>;
                  else if (open > 0) content = <div style={{ ...statusBase, ...statusOpen }}><span style={dot} />{open} open</div>;
                  else content = <div style={{ ...statusBase, ...statusCov }}><span style={dot} />{setCnt} set</div>;
                  return (
                    <td
                      key={i}
                      style={{ ...gTd, cursor: "pointer" }}
                      onClick={(e) => { e.stopPropagation(); onOpenDay?.(s.id, s.name, d); }}
                      title="Open day timeline"
                    >
                      {content}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
      <div style={hint}>
        Residential rows show a 24h coverage bar per day (red stripes = below requirement, green stripes = above). Host homes show daily-note / overnight / agency-visit dots and a weekly DS-hours meter — never a red gap. Click a day cell for the timeline; click a home name for its full week.
      </div>
    </>
  );
}

// ── Single-home week grid ─────────────────────────────────────────────
function SiteWeekGrid({
  siteId, siteName, days, clients, shifts, staff, view, settings, onOpenEditor, conflictShiftIds, isHostHome,
}: {
  siteId: string;
  siteName: string;
  days: Date[];
  clients: ClientRow[];
  shifts: ShiftRow[];
  staff: StaffRow[];
  view: ViewMode;
  settings: Settings;
  onOpenEditor: (ctx: EditorContext) => void;
  conflictShiftIds?: Set<string>;
  isHostHome?: boolean;
}) {
  const type = inferSiteType(siteId, clients, shifts);
  const staffById = new Map(staff.map((s) => [s.id, s]));
  const clientById = new Map(clients.map((c) => [c.id, c]));
  const clientName = (id: string | null) => (id ? (clientById.get(id) ? `${clientById.get(id)!.first_name} ${clientById.get(id)!.last_name}`.trim() : "Client") : "House");
  const staffName = (id: string | null) => (id ? (staffById.get(id)?.name ?? "Staff") : "Open");

  type Row = { id: string; label: string; sublabel?: string; house?: boolean };
  let rows: Row[] = [];
  if (view === "client") {
    if (type === "residential") rows.push({ id: "__house__", label: "House coverage", sublabel: "All residents", house: true });
    rows = rows.concat(clients.map((c) => ({ id: c.id, label: `${c.first_name} ${c.last_name}`.trim() })));
  } else {
    const staffIds = new Set<string>();
    for (const s of shifts) if (s.staff_id) staffIds.add(s.staff_id);
    rows = Array.from(staffIds).map((id) => ({ id, label: staffById.get(id)?.name ?? "Staff" }));
    rows.sort((a, b) => a.label.localeCompare(b.label));
    if (shifts.some((s) => !s.staff_id)) rows.push({ id: "__open__", label: "Open / unassigned" });
  }

  const matchRow = (row: Row, s: ShiftRow) => {
    if (view === "client") return s.client_id === row.id;
    if (row.id === "__open__") return !s.staff_id;
    return s.staff_id === row.id;
  };

  const quickAdd = (row: Row, day: Date) => {
    const ctx: EditorContext = { day };
    if (view === "client") ctx.clientId = row.id === "__house__" ? undefined : row.id;
    else ctx.staffId = row.id === "__open__" ? null : row.id;
    onOpenEditor(ctx);
  };

  const compact = settings.density === "compact";

  return (
    <>
      <table style={{ ...grid, ...(compact ? gridCompact : null) }}>
        <thead>
          <tr>
            <th style={{ ...gTh, ...gThLeft }}>{view === "client" ? "Client" : "Staff"}</th>
            {days.map((d, i) => <th key={i} style={gTh}>{DAY_LABELS[d.getDay()]} {d.getDate()}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={8} style={{ padding: 40, textAlign: "center", color: SCHED.muted, fontSize: 13 }}>No shifts this week.</td></tr>
          ) : rows.map((row) => (
            <tr key={row.id}>
              <td style={rowHead}>
                {row.label}
                {row.sublabel && settings.showResidentCount && <small style={rowHeadSmall}>{row.sublabel}</small>}
              </td>
              {days.map((d, i) => {
                const cellShifts = shifts.filter((s) => sameDay(new Date(s.starts_at), d) && matchRow(row, s));
                return (
                  <td key={i} style={{ ...gTd, ...(compact ? gTdCompact : null) }} className="sched-cell">
                    {row.house && type === "residential" && <CoverageBadge day={d} shifts={shifts.filter((s) => sameDay(new Date(s.starts_at), d))} />}
                    {cellShifts.map((s) => (
                      <ShiftChip
                        key={s.id} shift={s} view={view} settings={settings}
                        staffName={staffName(s.staff_id)} clientName={clientName(s.client_id)}
                        hasConflict={conflictShiftIds?.has(s.id)}
                        isHostHome={isHostHome}
                        onClick={() => onOpenEditor({ shift: s })}
                      />
                    ))}
                    <button style={addCell} className="sched-add" title="Add a shift" onClick={() => quickAdd(row, d)}>+</button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div style={hint}>
        {siteName} · {view === "staff" ? "who works when" : view === "client" ? "who covers each person" : "staff paired with the client they support"}. Click a shift to edit; hover a cell for the + to add.
      </div>
    </>
  );
}

function CoverageBadge({ day, shifts }: { day: Date; shifts: ShiftRow[] }) {
  // Use the new 24h coverage bar visualization (Phase 1 DSPD overhaul).
  return (
    <div style={{ marginBottom: 6 }}>
      <CoverageBar24h
        day={day}
        shifts={shifts.map((s) => ({
          id: s.id,
          starts_at: s.starts_at,
          ends_at: s.ends_at,
          staff_id: s.staff_id,
          job_code: s.job_code,
          parent_shift_id: s.parent_shift_id,
        }))}
      />
    </div>
  );
}

// Service-code family → accent hex for the inline-styled board.
// (Residential teal · Supported Living blue · Day Supports green ·
//  Employment purple · Respite pink — mirrors code-colors.ts.)
const FAMILY_HEX: Record<ReturnType<typeof familyForCode>, string> = {
  residential: "#0d9488",
  supported_living: "#0284c7",
  day_supports: "#16a34a",
  employment: "#7c3aed",
  respite: "#db2777",
  other: "#64748b",
};

function firstName(full: string): string {
  return (full ?? "").trim().split(/\s+/)[0] || full;
}

function durationLabel(startsAt: string, endsAt: string): string {
  const h = Math.max(0, (new Date(endsAt).getTime() - new Date(startsAt).getTime()) / 3600000);
  return Number.isInteger(h) ? `${h}h` : `${h.toFixed(1)}h`;
}

function ShiftChip({
  shift, view, settings, staffName, clientName, onClick, hasConflict, isHostHome,
}: {
  shift: ShiftRow;
  view: ViewMode;
  settings: Settings;
  staffName: string;
  clientName: string;
  onClick: () => void;
  hasConflict?: boolean;
  isHostHome?: boolean;
}) {
  const compact = settings.density === "compact";
  const isOpen = !shift.staff_id;
  const code = (shift.service_code ?? shift.job_code ?? "").toUpperCase();
  // Host-home visits get a purpose-based label, never bare "HHS".
  const visitLabel = hhsVisitLabel(code, isHostHome);
  const label = visitLabel ?? shiftTypeLabel(shift);
  const isSegment = !!shift.parent_shift_id;
  const isDraft = shift.status === "draft" || (!shift.published && shift.status !== "published");
  const fromNectar = (shift.created_from ?? "").toLowerCase().startsWith("nectar");
  const timeStr = `${fmtTime(shift.starts_at)}–${fmtTime(shift.ends_at)}`;
  const dur = durationLabel(shift.starts_at, shift.ends_at);

  if (isOpen) {
    return (
      <button className="sched-chip" onClick={onClick} style={{ ...chipBase, ...(compact ? chipCompact : null), background: SCHED.gapBg, borderColor: "#f3c9c6", color: SCHED.gap, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, ...(hasConflict ? { border: "2px solid #dc2626" } : null) }}>
        <span>{code || label} · open</span>
        <span style={{ background: SCHED.gap, color: "#fff", borderRadius: 6, fontSize: 9.5, padding: "2px 6px", fontWeight: 700 }}>Assign</span>
      </button>
    );
  }

  const hex = settings.colorBy === "staff" && shift.staff_id
    ? staffHex(shift.staff_id)
    : (FAMILY_HEX[familyForCode(code)] ?? shiftAccentHex(shift));

  // Who-line: staff first name, plus the client's first name on 1:1 work
  // (anything that isn't whole-house coverage). In client view the row IS the
  // client, so the staff name carries the cell.
  const showClient = clientName && clientName !== "House" && view !== "client";
  const who = visitLabel
    ? `${visitLabel}${showClient ? ` · ${firstName(clientName)}` : ""}`
    : view === "client"
      ? firstName(staffName)
      : showClient
        ? `${firstName(staffName)} → ${firstName(clientName)}`
        : firstName(staffName);

  const border = hasConflict
    ? "2px solid #dc2626"
    : isDraft
      ? `1.5px dashed ${hex}88`
      : `1px solid ${hex}55`;

  return (
    <button
      className="sched-chip"
      onClick={onClick}
      title={visitLabel
        ? `${label} · ${timeStr} (${dur}) — ${HHS_VISIT_TOOLTIP}`
        : `${label} · ${timeStr} (${dur})${isDraft ? " · draft" : ""}${hasConflict ? " · has conflict" : ""}${fromNectar ? " · NECTAR-suggested" : ""} — click to edit`}
      style={{
        ...chipBase, ...(compact ? chipCompact : null),
        background: hex + "14", color: hex, border,
        opacity: isDraft ? 0.85 : 1,
      }}
    >
      <span style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 0 }}>
        <span style={{
          background: hex, color: "#fff", borderRadius: 5, fontSize: compact ? 8.5 : 9,
          fontWeight: 800, letterSpacing: ".03em", padding: "1.5px 5px", flexShrink: 0,
        }}>
          {code || "—"}{isSegment ? " · 1:1" : ""}
        </span>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{who}</span>
        {visitLabel && <Info aria-label="HHS visit info" style={{ width: 11, height: 11, flexShrink: 0, opacity: 0.7 }} />}
        {fromNectar && <Sparkles aria-label="NECTAR-suggested" style={{ width: 11, height: 11, flexShrink: 0, color: "#d97a1c" }} />}
      </span>
      {settings.showTimes && (
        <small style={{ display: "flex", alignItems: "center", gap: 4, fontWeight: 500, opacity: 0.85, fontSize: compact ? 9.5 : 10 }}>
          {timeStr}
          <span style={{ background: hex + "22", borderRadius: 4, padding: "0.5px 4px", fontWeight: 700 }}>{dur}</span>
        </small>
      )}
    </button>
  );
}

// Deterministic per-staff hue (used when "Color by → Staff member").
function staffHex(staffId: string): string {
  let h = 0;
  for (let i = 0; i < staffId.length; i++) h = (h * 31 + staffId.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  return hslToHex(hue, 55, 45);
}
function hslToHex(h: number, s: number, l: number): string {
  s /= 100; l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const c = l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return Math.round(255 * c).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

// ── table styles ──────────────────────────────────────────────────────
const grid: React.CSSProperties = { width: "100%", borderCollapse: "collapse", tableLayout: "fixed" };
const gridCompact: React.CSSProperties = {};
const gTh: React.CSSProperties = {
  background: "#fbfbfe", fontSize: 11, textTransform: "uppercase", letterSpacing: ".05em", color: SCHED.muted,
  fontWeight: 700, padding: "9px 8px", textAlign: "center", borderBottom: `1px solid ${SCHED.line}`, borderRight: `1px solid ${SCHED.line}`,
};
const gThLeft: React.CSSProperties = { textAlign: "left", width: 150 };
const gTd: React.CSSProperties = { padding: 6, height: 66, verticalAlign: "top", borderBottom: `1px solid ${SCHED.line}`, borderRight: `1px solid ${SCHED.line}` };
const gTdCompact: React.CSSProperties = { height: 44, padding: 4 };
const rowHead: React.CSSProperties = { width: 150, padding: "10px 12px", fontWeight: 700, fontSize: 13, background: "#fbfbfe", verticalAlign: "top", borderBottom: `1px solid ${SCHED.line}`, borderRight: `1px solid ${SCHED.line}` };
const rowHeadSmall: React.CSSProperties = { display: "block", color: SCHED.muted, fontWeight: 500, fontSize: 11, marginTop: 1 };
const chipBase: React.CSSProperties = { display: "block", width: "100%", textAlign: "left", borderRadius: 8, padding: "5px 8px", marginBottom: 4, fontSize: 11.5, fontWeight: 600, border: "1px solid transparent", cursor: "pointer" };
const chipCompact: React.CSSProperties = { padding: "3px 7px", fontSize: 11, marginBottom: 3 };
const addCell: React.CSSProperties = { display: "block", width: "100%", textAlign: "center", border: "1px dashed transparent", background: "transparent", color: "#c4c8d4", borderRadius: 7, padding: 2, fontSize: 15, fontWeight: 700, lineHeight: 1.1, marginTop: 1, cursor: "pointer" };
const statusBase: React.CSSProperties = { display: "flex", alignItems: "center", justifyContent: "center", height: "100%", fontWeight: 700, fontSize: 12, borderRadius: 8, gap: 6 };
const statusCov: React.CSSProperties = { background: SCHED.okBg, color: "#0e6a45" };
const statusOpen: React.CSSProperties = { background: SCHED.gapBg, color: SCHED.gap };
const dot: React.CSSProperties = { width: 7, height: 7, borderRadius: "50%", background: "currentColor" };
const hint: React.CSSProperties = { color: SCHED.muted, fontSize: 12, padding: "10px 14px", borderTop: `1px solid ${SCHED.line}`, background: "#fbfbfe" };

function PublishDraftsButton({
  shifts, weekStart, onPublished, conflictsCount,
}: {
  shifts: ShiftRow[];
  weekStart: Date;
  onPublished?: () => void;
  conflictsCount?: number;
}) {
  const publish = useServerFn(publishShiftsWithNotify);
  const [busy, setBusy] = useState(false);
  const weekEnd = useMemo(() => { const d = new Date(weekStart); d.setDate(d.getDate() + 7); return d; }, [weekStart]);
  const draftRows = useMemo(() => shifts.filter((s) => {
    if (s.published) return false;
    const t = new Date(s.starts_at).getTime();
    return t >= weekStart.getTime() && t < weekEnd.getTime();
  }), [shifts, weekStart, weekEnd]);
  const draftIds = useMemo(() => draftRows.map((s) => s.id), [draftRows]);
  const staffCount = useMemo(() => new Set(draftRows.map((s) => s.staff_id).filter(Boolean)).size, [draftRows]);

  const count = draftIds.length;
  const disabled = busy || count === 0;
  const handleClick = async () => {
    if (count === 0) return;
    const conflictLine = conflictsCount ? `\n\n⚠ ${conflictsCount} conflict${conflictsCount === 1 ? "" : "s"} remain in this week.` : "";
    const proceed = window.confirm(
      `Publish ${count} shift${count === 1 ? "" : "s"} across ${staffCount} staff?${conflictLine}\n\nEach staff member will be notified to accept or decline.`,
    );
    if (!proceed) return;
    setBusy(true);
    try {
      const res = await publish({ data: { ids: draftIds } });
      toast.success(`Published ${count} shift${count === 1 ? "" : "s"} · notified ${res.notified} staff`);
      onPublished?.();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Publish failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      style={{
        border: `1px solid ${SCHED.line}`,
        background: count > 0 ? "#fef3c7" : "#fff",
        color: count > 0 ? "#92400e" : SCHED.muted,
        padding: "9px 14px",
        borderRadius: 10,
        fontWeight: 600,
        fontSize: 13,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.6 : 1,
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
      }}
      onClick={handleClick}
      disabled={disabled}
      title={count === 0 ? "No draft shifts to publish" : `Publish ${count} draft shift${count === 1 ? "" : "s"} for this week`}
    >
      {busy ? "Publishing…" : count > 0 ? `Publish ${count} draft${count === 1 ? "" : "s"}` : "All published"}
    </button>
  );
}
