import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Settings as SettingsIcon,
  Home,
  Users,
  AlertTriangle,
  CheckCircle2,
  Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetDescription,
} from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useCurrentOrg } from "@/hooks/use-org";
import {
  useSchedulePreview,
  startOfWeek,
  dayCoverageMinutes,
  inferSiteType,
  isDaily,
  UNASSIGNED_SITE_ID,
  type ShiftRow,
  type ClientRow,
  type StaffRow,
} from "@/hooks/use-schedule-preview";
import { ShiftEditorDialog, type EditorContext } from "@/components/schedule-preview/shift-editor";
import { Plus } from "lucide-react";

export const Route = createFileRoute("/dashboard/schedule-preview")({
  head: () => ({
    meta: [
      { title: "Schedule (new) — HIVE" },
      {
        name: "description",
        content: "Read-only schedule preview: site coverage, weekly grid by staff or client.",
      },
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

// HIVE palette (inline, page-scoped — no global token edits).
const NAVY = "#0B1126";
const GOLD = "#f5a623";
const TEAL = "#137182";
const INK = "#0d112b";

type ViewMode = "staff" | "client" | "both";
type Density = "comfortable" | "compact";
type ColorBy = "shift_type" | "staff";

type Settings = {
  defaultView: ViewMode;
  startOnAllSites: boolean;
  density: Density;
  colorBy: ColorBy;
  showTimes: boolean;
  showResidentCount: boolean;
};
const DEFAULT_SETTINGS: Settings = {
  defaultView: "staff",
  startOnAllSites: true,
  density: "comfortable",
  colorBy: "shift_type",
  showTimes: true,
  showResidentCount: true,
};
const SETTINGS_KEY = "hive.schedulePreview.settings";

function useSettings() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(raw) });
    } catch {/* ignore */}
  }, []);
  const update = (patch: Partial<Settings>) =>
    setSettings((s) => {
      const next = { ...s, ...patch };
      try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(next)); } catch {/* ignore */}
      return next;
    });
  return [settings, update] as const;
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const fmt = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`;
const fmtTime = (iso: string) => {
  const d = new Date(iso);
  let h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? "p" : "a";
  h = h % 12 || 12;
  return m ? `${h}:${String(m).padStart(2, "0")}${ampm}` : `${h}${ampm}`;
};

function shiftColor(s: ShiftRow, colorBy: ColorBy): string {
  if (colorBy === "staff") {
    const key = s.staff_id ?? "open";
    let h = 0;
    for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
    return `hsl(${h % 360} 55% 38%)`;
  }
  if (isDaily(s.job_code)) return TEAL;
  if (s.job_code === "DSI") return GOLD;
  return NAVY;
}

function SchedulePreviewPage() {
  const { data: org, isLoading: orgLoading } = useCurrentOrg();
  const role = org?.role;
  const isAdmin = role === "admin" || role === "manager" || role === "super_admin";

  const [settings, setSettings] = useSettings();
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date()));
  const [siteId, setSiteId] = useState<string>("__all__");
  const [view, setView] = useState<ViewMode>(settings.defaultView);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorCtx, setEditorCtx] = useState<EditorContext | null>(null);
  const openEditor = (ctx: EditorContext) => { setEditorCtx(ctx); setEditorOpen(true); };

  // Re-sync default view when settings change
  useEffect(() => { setView(settings.defaultView); }, [settings.defaultView]);
  useEffect(() => {
    if (!settings.startOnAllSites) {
      // keep current siteId (might be __all__ on first paint — user can pick)
    }
  }, [settings.startOnAllSites]);

  const { data, isLoading } = useSchedulePreview(weekStart);

  const days = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, [weekStart]);

  const sites = useMemo(() => {
    const teams = data?.teams ?? [];
    const clients = data?.clients ?? [];
    const list = teams.map((t) => ({ id: t.id, name: t.team_name }));
    const hasUnassigned = clients.some((c) => !c.team_id);
    if (hasUnassigned) list.push({ id: UNASSIGNED_SITE_ID, name: "1-on-1 Services" });
    return list;
  }, [data]);

  const siteClients = useMemo(() => {
    if (!data) return new Map<string, ClientRow[]>();
    const m = new Map<string, ClientRow[]>();
    for (const s of sites) m.set(s.id, []);
    for (const c of data.clients) {
      const key = c.team_id ?? UNASSIGNED_SITE_ID;
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(c);
    }
    return m;
  }, [data, sites]);

  const siteShifts = useMemo(() => {
    if (!data) return new Map<string, ShiftRow[]>();
    const clientToSite = new Map<string, string>();
    for (const c of data.clients) clientToSite.set(c.id, c.team_id ?? UNASSIGNED_SITE_ID);
    const m = new Map<string, ShiftRow[]>();
    for (const s of sites) m.set(s.id, []);
    for (const sh of data.shifts) {
      const key = sh.client_id ? clientToSite.get(sh.client_id) : null;
      if (!key) continue;
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(sh);
    }
    return m;
  }, [data, sites]);

  if (orgLoading) return <PageShell><div className="p-8 text-sm opacity-70">Loading…</div></PageShell>;
  if (!isAdmin) {
    return (
      <PageShell>
        <Card className="p-8 text-center max-w-md mx-auto mt-12">
          <Lock className="h-8 w-8 mx-auto mb-3 opacity-60" />
          <p className="font-semibold">Admin or manager access required</p>
          <p className="text-sm opacity-70 mt-1">Schedule (new) is currently admin-only during preview.</p>
          <Link to="/dashboard" className="inline-block mt-4 text-sm underline" style={{ color: TEAL }}>
            Back to dashboard
          </Link>
        </Card>
      </PageShell>
    );
  }

  const goPrev = () => { const d = new Date(weekStart); d.setDate(d.getDate() - 7); setWeekStart(d); };
  const goNext = () => { const d = new Date(weekStart); d.setDate(d.getDate() + 7); setWeekStart(d); };
  const goToday = () => setWeekStart(startOfWeek(new Date()));

  const isAll = siteId === "__all__";
  const currentSite = sites.find((s) => s.id === siteId);

  return (
    <PageShell>
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1
            className="text-2xl font-bold tracking-tight"
            style={{ color: INK, fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" }}
          >
            Schedule <span style={{ color: GOLD }}>· preview</span>
          </h1>
          <p className="text-sm opacity-70 mt-0.5">
            Read-only view of your existing schedule. Nothing here can edit shifts.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={goPrev} className="min-h-[44px]">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={goToday} className="min-h-[44px]">
            <CalendarDays className="h-4 w-4 mr-1" /> This week
          </Button>
          <Button variant="outline" size="sm" onClick={goNext} className="min-h-[44px]">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <SettingsDrawer settings={settings} onChange={setSettings} />
        </div>
      </div>

      {/* Week range */}
      <p className="text-xs uppercase tracking-wider opacity-60 mt-2">
        Week of {weekStart.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}
      </p>

      {/* Site picker */}
      <div className="mt-4 -mx-1 overflow-x-auto">
        <div className="flex gap-2 px-1 pb-2 min-w-fit">
          <SiteButton active={isAll} onClick={() => setSiteId("__all__")} label="All sites" icon={<Home className="h-3.5 w-3.5" />} />
          {sites.map((s) => (
            <SiteButton
              key={s.id}
              active={siteId === s.id}
              onClick={() => setSiteId(s.id)}
              label={s.name}
              icon={s.id === UNASSIGNED_SITE_ID ? <Users className="h-3.5 w-3.5" /> : <Home className="h-3.5 w-3.5" />}
            />
          ))}
        </div>
      </div>

      {isLoading ? (
        <Card className="p-8 mt-4 text-sm opacity-70 text-center">Loading schedule…</Card>
      ) : isAll ? (
        <AllSitesOverview
          days={days}
          sites={sites}
          siteClients={siteClients}
          siteShifts={siteShifts}
          settings={settings}
          onPickSite={setSiteId}
        />
      ) : currentSite ? (
        <SiteWeekGrid
          siteId={currentSite.id}
          siteName={currentSite.name}
          days={days}
          clients={siteClients.get(currentSite.id) ?? []}
          shifts={siteShifts.get(currentSite.id) ?? []}
          staff={data?.staff ?? []}
          view={view}
          setView={setView}
          settings={settings}
          onOpenEditor={openEditor}
        />
      ) : null}

      <p className="text-[11px] opacity-50 mt-6">
        Site type inferred from shift codes ({"{HHS, RHS, DSG, RL6, RP3, RP4, RP5}"} = residential). Clients with no
        team are grouped as “1-on-1 Services”.
      </p>

      <ShiftEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        ctx={editorCtx}
        clients={data?.clients ?? []}
        staff={data?.staff ?? []}
        siteId={siteId}
        weekStartIso={weekStart.toISOString()}
      />
    </PageShell>
  );
}

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="min-h-[60vh] p-4 md:p-6"
      style={{ fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" }}
    >
      {children}
    </div>
  );
}

function SiteButton({
  active, onClick, label, icon,
}: { active: boolean; onClick: () => void; label: string; icon: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-full px-3.5 min-h-[40px] text-sm font-medium transition relative"
      style={{
        background: active ? NAVY : "transparent",
        color: active ? "white" : INK,
        border: `1px solid ${active ? NAVY : "rgba(13,17,43,0.15)"}`,
      }}
    >
      {icon}
      <span className="whitespace-nowrap">{label}</span>
    </button>
  );
}

function AllSitesOverview({
  days, sites, siteClients, siteShifts, settings, onPickSite,
}: {
  days: Date[];
  sites: { id: string; name: string }[];
  siteClients: Map<string, ClientRow[]>;
  siteShifts: Map<string, ShiftRow[]>;
  settings: Settings;
  onPickSite: (id: string) => void;
}) {
  if (sites.length === 0) {
    return <Card className="p-8 mt-4 text-center text-sm opacity-70">No sites or 1-on-1 clients yet.</Card>;
  }
  return (
    <Card className="mt-4 overflow-x-auto">
      <table className="w-full text-sm border-separate border-spacing-0">
        <thead>
          <tr>
            <th className="text-left p-3 font-semibold sticky left-0 z-10 bg-white" style={{ color: INK }}>
              Site
            </th>
            {days.map((d, i) => (
              <th key={i} className="p-2 text-center font-semibold" style={{ color: INK }}>
                <div className="text-[11px] uppercase opacity-60">{DAY_LABELS[i]}</div>
                <div>{fmt(d)}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sites.map((s) => {
            const clients = siteClients.get(s.id) ?? [];
            const shifts = siteShifts.get(s.id) ?? [];
            const type = inferSiteType(s.id, clients, shifts);
            return (
              <tr
                key={s.id}
                className="cursor-pointer hover:bg-black/[0.02] border-t"
                style={{ borderColor: "rgba(13,17,43,0.06)" }}
                onClick={() => onPickSite(s.id)}
              >
                <td className="p-3 sticky left-0 bg-white">
                  <div className="font-semibold" style={{ color: INK }}>{s.name}</div>
                  <div className="text-[11px] opacity-60 mt-0.5 flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className="text-[10px] py-0 h-4"
                      style={{ borderColor: type === "residential" ? TEAL : GOLD, color: type === "residential" ? TEAL : GOLD }}
                    >
                      {type === "residential" ? "Residential" : "Day / 1:1"}
                    </Badge>
                    {settings.showResidentCount && <span>{clients.length} {clients.length === 1 ? "person" : "people"}</span>}
                  </div>
                </td>
                {days.map((d, i) => {
                  const dayShifts = shifts.filter((sh) => sameDay(new Date(sh.starts_at), d));
                  return (
                    <td key={i} className="p-2 text-center align-middle">
                      <CoverageCell type={type} day={d} shifts={dayShifts} />
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}

function CoverageCell({ type, day, shifts }: { type: "residential" | "day"; day: Date; shifts: ShiftRow[] }) {
  if (type === "residential") {
    const mins = dayCoverageMinutes(day, shifts);
    const ok = mins >= 24 * 60 - 1;
    if (ok) {
      return (
        <span
          className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold"
          style={{ background: "rgba(19,113,130,0.12)", color: TEAL }}
        >
          <CheckCircle2 className="h-3 w-3" /> 24h
        </span>
      );
    }
    const gap = 24 * 60 - mins;
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold"
        style={{ background: "rgba(245,166,35,0.15)", color: "#8a5a00" }}
      >
        <AlertTriangle className="h-3 w-3" />
        {gap >= 60 ? `${Math.round(gap / 60)}h gap` : `${gap}m gap`}
      </span>
    );
  }
  const open = shifts.filter((s) => !s.staff_id).length;
  return (
    <div className="text-[11px]">
      <div className="font-semibold" style={{ color: INK }}>{shifts.length} shifts</div>
      {open > 0 && <div className="opacity-70" style={{ color: GOLD }}>{open} open</div>}
    </div>
  );
}

function SiteWeekGrid({
  siteId, siteName, days, clients, shifts, staff, view, setView, settings, onOpenEditor,
}: {
  siteId: string;
  siteName: string;
  days: Date[];
  clients: ClientRow[];
  shifts: ShiftRow[];
  staff: StaffRow[];
  view: ViewMode;
  setView: (v: ViewMode) => void;
  settings: Settings;
  onOpenEditor: (ctx: EditorContext) => void;
}) {
  const type = inferSiteType(siteId, clients, shifts);
  const cellPad = settings.density === "compact" ? "p-1.5" : "p-2";
  const cardPad = settings.density === "compact" ? "px-2 py-1" : "px-2.5 py-1.5";

  // Build rows by view
  const staffById = new Map(staff.map((s) => [s.id, s]));
  const clientById = new Map(clients.map((c) => [c.id, c]));
  const clientName = (id: string | null) => {
    if (!id) return "—";
    const c = clientById.get(id);
    return c ? `${c.first_name} ${c.last_name}`.trim() : "Client";
  };

  type Row = { id: string; label: string; sublabel?: string };
  let rows: Row[] = [];
  if (view === "client") {
    if (type === "residential") {
      rows.push({ id: "__house__", label: "House coverage", sublabel: "All residents" });
    }
    rows = rows.concat(
      clients.map((c) => ({ id: c.id, label: `${c.first_name} ${c.last_name}`.trim() })),
    );
  } else {
    // staff or both
    const staffIds = new Set<string>();
    for (const s of shifts) if (s.staff_id) staffIds.add(s.staff_id);
    rows = Array.from(staffIds).map((id) => ({
      id,
      label: staffById.get(id)?.name ?? "Staff",
    }));
    rows.sort((a, b) => a.label.localeCompare(b.label));
    const openCount = shifts.filter((s) => !s.staff_id).length;
    if (openCount > 0) rows.unshift({ id: "__open__", label: "Open shifts" });
  }

  const cellsFor = (row: Row, day: Date) => {
    if (row.id === "__house__") {
      const dayShifts = shifts.filter((s) => sameDay(new Date(s.starts_at), day));
      return <CoverageCell type="residential" day={day} shifts={dayShifts} />;
    }
    const matches = shifts.filter((s) => {
      if (!sameDay(new Date(s.starts_at), day)) return false;
      if (view === "client") return s.client_id === row.id;
      if (row.id === "__open__") return !s.staff_id;
      return s.staff_id === row.id;
    });

    // Quick-add affordance for empty cells.
    const quickAdd = () => {
      const ctx: EditorContext = { day };
      if (view === "client") ctx.clientId = row.id;
      else ctx.staffId = row.id === "__open__" ? null : row.id;
      onOpenEditor(ctx);
    };

    if (matches.length === 0) {
      return (
        <button
          onClick={quickAdd}
          className="group w-full h-full min-h-[36px] flex items-center justify-center rounded-md opacity-0 hover:opacity-100 focus:opacity-100 transition"
          style={{ border: "1px dashed rgba(13,17,43,0.2)" }}
          aria-label="Add shift"
        >
          <Plus className="h-3.5 w-3.5" style={{ color: TEAL }} />
        </button>
      );
    }
    return (
      <div className="flex flex-col gap-1">
        {matches.map((s) => {
          const bg = shiftColor(s, settings.colorBy);
          const secondary =
            view === "both" || view === "staff"
              ? clientName(s.client_id)
              : (s.staff_id ? staffById.get(s.staff_id)?.name : "Open") ?? "Open";
          return (
            <button
              key={s.id}
              onClick={() => onOpenEditor({ shift: s })}
              className={`text-left rounded-md ${cardPad} text-[11px] text-white font-medium leading-tight hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-offset-1`}
              style={{ background: bg, opacity: s.published ? 1 : 0.75 }}
              title={`${s.job_code ?? ""} ${fmtTime(s.starts_at)}–${fmtTime(s.ends_at)} — click to edit`}
            >
              {settings.showTimes && (
                <div className="opacity-90">{fmtTime(s.starts_at)}–{fmtTime(s.ends_at)}</div>
              )}
              {view !== "client" && <div className="truncate">{secondary}</div>}
              {view === "client" && <div className="truncate opacity-90">{secondary}</div>}
              {s.job_code && <div className="opacity-80 text-[10px] uppercase tracking-wide">{s.job_code}</div>}
            </button>
          );
        })}
        <button
          onClick={quickAdd}
          className="text-[10px] py-0.5 rounded opacity-0 hover:opacity-100 focus:opacity-100 transition"
          style={{ color: TEAL }}
          aria-label="Add another shift"
        >
          + add
        </button>
      </div>
    );
  };

  return (
    <Card className="mt-4 overflow-hidden">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between p-3 border-b" style={{ borderColor: "rgba(13,17,43,0.08)" }}>
        <div>
          <div className="font-semibold" style={{ color: INK }}>{siteName}</div>
          <div className="text-[11px] opacity-60">
            {type === "residential" ? "Residential / group home" : "Day / 1-on-1"} · {clients.length} {clients.length === 1 ? "person" : "people"}
          </div>
        </div>
        <div className="inline-flex rounded-full p-0.5" style={{ background: "rgba(13,17,43,0.06)" }}>
          {(["staff", "client", "both"] as ViewMode[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className="px-3 min-h-[36px] text-xs font-semibold rounded-full transition"
              style={{
                background: view === v ? "white" : "transparent",
                color: view === v ? INK : "rgba(13,17,43,0.65)",
                boxShadow: view === v ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
              }}
            >
              {v === "staff" ? "Staff" : v === "client" ? "Client" : "Both"}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-separate border-spacing-0">
          <thead>
            <tr>
              <th className="text-left p-3 font-semibold sticky left-0 z-10 bg-white" style={{ color: INK, minWidth: 180 }}>
                {view === "client" ? "Person" : "Staff"}
              </th>
              {days.map((d, i) => (
                <th key={i} className="p-2 text-center font-semibold" style={{ color: INK, minWidth: 130 }}>
                  <div className="text-[11px] uppercase opacity-60">{DAY_LABELS[i]}</div>
                  <div>{fmt(d)}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={8} className="p-8 text-center text-sm opacity-60">No shifts this week.</td></tr>
            ) : rows.map((row) => (
              <tr key={row.id} className="border-t" style={{ borderColor: "rgba(13,17,43,0.06)" }}>
                <td className="p-3 sticky left-0 bg-white align-top">
                  <div className="font-medium" style={{ color: INK }}>{row.label}</div>
                  {row.sublabel && <div className="text-[11px] opacity-60">{row.sublabel}</div>}
                </td>
                {days.map((d, i) => (
                  <td key={i} className={`${cellPad} align-top`}>
                    {cellsFor(row, d)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function SettingsDrawer({ settings, onChange }: { settings: Settings; onChange: (p: Partial<Settings>) => void }) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="min-h-[44px]">
          <SettingsIcon className="h-4 w-4" />
        </Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Display settings</SheetTitle>
          <SheetDescription>Personal preferences for the Schedule (new) page. Saved on this device.</SheetDescription>
        </SheetHeader>
        <div className="space-y-5 mt-6">
          <div>
            <Label className="text-xs uppercase tracking-wider opacity-60">Default view</Label>
            <div className="inline-flex rounded-full p-0.5 mt-2" style={{ background: "rgba(13,17,43,0.06)" }}>
              {(["staff", "client", "both"] as ViewMode[]).map((v) => (
                <button
                  key={v}
                  onClick={() => onChange({ defaultView: v })}
                  className="px-3 min-h-[36px] text-xs font-semibold rounded-full"
                  style={{
                    background: settings.defaultView === v ? "white" : "transparent",
                    color: settings.defaultView === v ? INK : "rgba(13,17,43,0.65)",
                  }}
                >
                  {v[0].toUpperCase() + v.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label className="text-xs uppercase tracking-wider opacity-60">Density</Label>
            <div className="inline-flex rounded-full p-0.5 mt-2" style={{ background: "rgba(13,17,43,0.06)" }}>
              {(["comfortable", "compact"] as Density[]).map((v) => (
                <button
                  key={v}
                  onClick={() => onChange({ density: v })}
                  className="px-3 min-h-[36px] text-xs font-semibold rounded-full capitalize"
                  style={{
                    background: settings.density === v ? "white" : "transparent",
                    color: settings.density === v ? INK : "rgba(13,17,43,0.65)",
                  }}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label className="text-xs uppercase tracking-wider opacity-60">Color cards by</Label>
            <div className="inline-flex rounded-full p-0.5 mt-2" style={{ background: "rgba(13,17,43,0.06)" }}>
              {(["shift_type", "staff"] as ColorBy[]).map((v) => (
                <button
                  key={v}
                  onClick={() => onChange({ colorBy: v })}
                  className="px-3 min-h-[36px] text-xs font-semibold rounded-full"
                  style={{
                    background: settings.colorBy === v ? "white" : "transparent",
                    color: settings.colorBy === v ? INK : "rgba(13,17,43,0.65)",
                  }}
                >
                  {v === "shift_type" ? "Shift type" : "Staff"}
                </button>
              ))}
            </div>
          </div>
          <ToggleRow
            label="Start on All sites"
            checked={settings.startOnAllSites}
            onChange={(b) => onChange({ startOnAllSites: b })}
          />
          <ToggleRow
            label="Show shift times on cards"
            checked={settings.showTimes}
            onChange={(b) => onChange({ showTimes: b })}
          />
          <ToggleRow
            label="Show people count on site rows"
            checked={settings.showResidentCount}
            onChange={(b) => onChange({ showResidentCount: b })}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (b: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <Label className="text-sm">{label}</Label>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
