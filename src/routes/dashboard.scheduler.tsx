// New scheduler — code-section layout (SLH/COM/PAC/RP2/HHS/RHS/PM1/DSI),
// Day/Week/Month, RHS home toggle, Add-shift dialog gated on staff caseload
// (staff_assignments), shift detail panel, Publish button, Day Program
// attendance board (DSG/DSP), and admin-side Staff view preview.
//
// All data comes from real records: clients, client_billing_codes (for
// authorized codes + units), staff_assignments (caseload), teams (RHS
// homes), profiles (staff), scheduled_shifts, time_off_requests,
// day_program_sessions/_staff/_attendance. No sample/mock data.
import { useMemo, useState, useEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  CalendarDays, ChevronLeft, ChevronRight, Plus, Send, X, Edit2, Copy, Trash2,
  Users, User as UserIcon, Phone, AlertTriangle, ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useCurrentOrg } from "@/hooks/use-org";
import { usePermissions } from "@/hooks/use-permissions";
import {
  useSchedulerData, startOfWeek, startOfDay, startOfMonth,
  type SchedClient, type SchedStaff, type SchedShift,
} from "@/hooks/use-scheduler-data";
import { useDayProgramData } from "@/hooks/use-day-program-data";
import {
  saveShift, deleteShift, publishWeek, addToCaseload, setAdminTimeOff,
  saveDayProgramSession, markAttendance, addSessionStaff,
} from "@/lib/scheduler/scheduler.functions";
import { isClockableServiceCode } from "@/lib/service-billing";
import { evvServiceLabel } from "@/lib/evv-codes";
import { RequestsPanel } from "@/components/schedule-preview/requests-panel";
import { NectarBar } from "@/components/scheduler/nectar-bar";
import { NectarFocusBanner } from "@/components/nectar/nectar-focus-banner";
import { createRecurringShifts } from "@/lib/scheduler/repeat.functions";

export const Route = createFileRoute("/dashboard/scheduler")({
  head: () => ({
    meta: [
      { title: "Scheduler — HIVE" },
      { name: "description", content: "Schedule, Day Program, and Staff view" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap",
      },
    ],
  }),
  validateSearch: (s: Record<string, unknown>) => ({
    focus: typeof s.focus === "string" ? s.focus : undefined,
  }),
  component: SchedulerPage,
});

// Canonical ordering + friendly labels for the well-known sections.
// Codes NOT listed here are still rendered (in the same card format), in the
// order they appear after the canonical block, using evvServiceLabel for the
// description. Day-program-only codes (DSG/DSP) are excluded from this tab —
// they live on the Day Program tab.
const SECTION_OVERRIDES: Record<string, string> = {
  SLH: "Supported Living",
  COM: "Companion",
  PAC: "Personal Assistance",
  RP2: "Respite",
  RHS: "Residential Hab",
  PM1: "Med Monitoring",
  DSI: "Individual Day Support",
};
const SECTION_ORDER = ["SLH", "COM", "PAC", "RP2", "RHS", "PM1", "DSI"];
const DAY_PROGRAM_CODES = new Set(["DSG", "DSP"]);

function sectionLabelFor(code: string): string {
  if (SECTION_OVERRIDES[code]) return SECTION_OVERRIDES[code];
  // evvServiceLabel returns "CODE — Full Name"; strip the "CODE — " prefix.
  const full = evvServiceLabel(code);
  const parts = full.split(" — ");
  return parts.length > 1 ? parts.slice(1).join(" — ") : full;
}

const NAVY = "#0d112b";
const GOLD = "#f59324";
const TEAL = "#137182";
const LINE = "#e6e7ee";

type ViewMode = "day" | "week" | "month";
type Tab = "schedule" | "day-program" | "staff-view";

function fmtTime(d: Date) {
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}
function hourLabel(h: number) {
  const ampm = h >= 12 ? "p" : "a";
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr}${ampm}`;
}
function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function dayStr(d: Date) {
  return d.toISOString().slice(0, 10);
}

function SchedulerPage() {
  const { data: org } = useCurrentOrg();
  const orgId = org?.organization_id;
  const [tab, setTab] = useState<Tab>("schedule");
  const [view, setView] = useState<ViewMode>("day");
  const [anchor, setAnchor] = useState<Date>(() => {
    const d = new Date(); d.setHours(0, 0, 0, 0); return d;
  });

  // Always fetch from a week-aligned start so shifts in the same week are loaded.
  const weekStart = useMemo(() => startOfWeek(anchor), [anchor]);
  const { data, isLoading } = useSchedulerData(weekStart);

  const dateLabel = useMemo(() => {
    if (view === "day") return anchor.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
    if (view === "week") {
      const ws = startOfWeek(anchor);
      const we = new Date(ws); we.setDate(we.getDate() + 6);
      return `${ws.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${we.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
    }
    return anchor.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  }, [view, anchor]);

  function shift(dir: -1 | 1) {
    const next = new Date(anchor);
    if (view === "day") next.setDate(next.getDate() + dir);
    else if (view === "week") next.setDate(next.getDate() + dir * 7);
    else next.setMonth(next.getMonth() + dir);
    setAnchor(next);
  }

  const qc = useQueryClient();
  const publish = useServerFn(publishWeek);
  const publishMut = useMutation({
    mutationFn: () => publish({ data: { organization_id: orgId!, week_start_iso: startOfWeek(anchor).toISOString() } }),
    onSuccess: (r: { shifts: number; staff: number }) => {
      toast.success(`Published — ${r.shifts} shifts sent to ${r.staff} staff.`);
      qc.invalidateQueries({ queryKey: ["scheduler-data"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div
      className="min-h-screen"
      style={{ background: "#faf9f5", fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" }}
    >
      <div className="px-4 pt-4"><NectarFocusBanner /></div>
      {/* Brand bar with tabs */}
      <div style={{ background: NAVY, color: "#fff", padding: "10px 16px" }} className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span style={{ width: 28, height: 28, borderRadius: 6, background: GOLD, display: "inline-grid", placeItems: "center", color: NAVY, fontWeight: 800 }}>H</span>
          <div>
            <div style={{ fontWeight: 800, fontSize: 16, letterSpacing: 0.2 }}>HIVE</div>
            <div style={{ fontSize: 9, letterSpacing: 0.16, opacity: 0.8 }}>SCHEDULER</div>
          </div>
        </div>
        <div className="flex items-center gap-1 ml-2">
          <TabBtn label="Schedule" active={tab === "schedule"} onClick={() => setTab("schedule")} />
          <TabBtn label="Day Program" active={tab === "day-program"} onClick={() => setTab("day-program")} />
          <TabBtn label="Staff view" active={tab === "staff-view"} onClick={() => setTab("staff-view")} />
        </div>
        <div className="flex-1" />
        {tab === "schedule" && (
          <button
            onClick={() => publishMut.mutate()}
            disabled={publishMut.isPending || !orgId}
            style={{ background: GOLD, color: NAVY, border: "none", borderRadius: 8, padding: "8px 14px", fontWeight: 700, fontSize: 13, display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer" }}
          >
            <Send className="h-4 w-4" /> {publishMut.isPending ? "Publishing…" : "Publish"}
          </button>
        )}
      </div>

      {/* Sub-toolbar — date nav + view */}
      {tab !== "staff-view" && (
        <div className="px-4 py-3 flex items-center gap-2 flex-wrap" style={{ borderBottom: `1px solid ${LINE}`, background: "#fff" }}>
          <div className="flex items-center gap-1 border rounded-md" style={{ borderColor: LINE }}>
            <button onClick={() => shift(-1)} className="px-2 py-1 hover:bg-muted" aria-label="Previous"><ChevronLeft className="h-4 w-4" /></button>
            <button onClick={() => setAnchor(startOfDay(new Date()))} className="px-3 py-1 text-sm font-medium hover:bg-muted">Today</button>
            <span className="px-3 py-1 text-sm font-medium tabular-nums min-w-[180px] text-center">{dateLabel}</span>
            <button onClick={() => shift(1)} className="px-2 py-1 hover:bg-muted" aria-label="Next"><ChevronRight className="h-4 w-4" /></button>
          </div>
          <div className="flex-1" />
          <ViewBtn label="Day" icon={<CalendarDays className="h-4 w-4" />} active={view === "day"} onClick={() => setView("day")} />
          <ViewBtn label="Week" active={view === "week"} onClick={() => setView("week")} />
          <ViewBtn label="Month" active={view === "month"} onClick={() => setView("month")} />
        </div>
      )}

      <SchedulerBody
        tab={tab}
        view={view}
        anchor={anchor}
        setAnchor={setAnchor}
        setView={setView}
        data={data}
        isLoading={isLoading}
      />
    </div>
  );

  // Late state — declared after JSX so it's defined before use via hoisting? No — must declare above. Fix:
  // (Add-shift state is hoisted inside SchedulerPage via const below, but we need it before JSX. We use useState before return.)
}

function TabBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? GOLD : "transparent",
        color: active ? NAVY : "#fff",
        border: active ? "none" : "1px solid rgba(255,255,255,0.15)",
        borderRadius: 8, padding: "6px 12px", fontSize: 13, fontWeight: 700, cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}
function ViewBtn({ label, icon, active, onClick }: { label: string; icon?: React.ReactNode; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="text-sm font-medium inline-flex items-center gap-1 px-3 py-1.5 rounded-md"
      style={{
        background: active ? GOLD : "#fff",
        color: active ? NAVY : "#444",
        border: `1px solid ${active ? GOLD : LINE}`,
      }}
    >
      {icon}{label}
    </button>
  );
}

// We need the Add-shift dialog state and open-shift detail at top level,
// but rendered next to children. Use a wrapper to keep one source of truth.
function SchedulerBody({
  tab, view, anchor, setAnchor, setView, data, isLoading,
}: {
  tab: Tab;
  view: ViewMode;
  anchor: Date;
  setAnchor: (d: Date) => void;
  setView: (v: ViewMode) => void;
  data: ReturnType<typeof useSchedulerData>["data"];
  isLoading: boolean;
}) {
  const { data: org } = useCurrentOrg();
  const orgId = org?.organization_id;
  const { can } = usePermissions();
  const canManageSchedule = can("manage_schedule");
  const [addOpen, setAddOpen] = useState(false);
  const [addPrefill, setAddPrefill] = useState<{ clientId?: string; code?: string; day?: Date } | null>(null);
  const [detailShiftId, setDetailShiftId] = useState<string | null>(null);
  const [hhsClientForHours, setHhsClientForHours] = useState<SchedClient | null>(null);

  function openAdd(prefill?: { clientId?: string; code?: string; day?: Date }) {
    if (!canManageSchedule) {
      toast.error("You don't have permission to create or edit shifts.");
      return;
    }
    setAddPrefill(prefill ?? null);
    setAddOpen(true);
  }

  if (!data && isLoading) {
    return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;
  }
  if (!data) return <div className="p-8 text-sm text-muted-foreground">No data available.</div>;

  if (tab === "day-program") {
    return <DayProgramBoard weekStart={startOfWeek(anchor)} sched={data} />;
  }
  if (tab === "staff-view") {
    return <StaffViewPreview sched={data} anchor={anchor} />;
  }

  const detail = data.shifts.find((s) => s.id === detailShiftId) ?? null;

  return (
    <>
      <div className="px-3 sm:px-4 py-4 space-y-3 max-w-[1400px] mx-auto">
        {/* Ask Nectar — natural-language drafting + auto-fill + repeat shifts */}
        {orgId && (
          <NectarBar
            organizationId={orgId}
            weekStartIso={startOfWeek(anchor).toISOString()}
            anchor={anchor}
            clientNameById={new Map(data.clients.map((c) => [c.id, `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim()]))}
            staffNameById={new Map(data.staff.map((s) => [s.id, s.name]))}
          />
        )}
        {/* Requests panel: pending time-off + swaps, with shift-conflict warning */}
        <RequestsPanel
          weekStart={startOfWeek(anchor)}
          staff={data.staff.map((s) => ({ id: s.id, name: s.name }))}
        />

        {/* Legend */}
        <div className="flex items-center gap-3 text-xs text-muted-foreground px-1">
          <span className="inline-flex items-center gap-1.5"><span style={{ width: 14, height: 14, borderRadius: 4, background: GOLD }} /> Staff</span>
          <span className="inline-flex items-center gap-1.5"><span style={{ width: 14, height: 14, borderRadius: 999, background: TEAL }} /> Client</span>
          <span>· squares = staff, circles = clients</span>
        </div>

        {(() => {
          // Dynamic sections: only render codes that ≥ 1 current client is
          // authorized for. Exclude Day Program codes (DSG/DSP). Order known
          // codes by canonical order, then any remaining codes alphabetically.
          const authedCodes = new Set<string>();
          for (const a of data.auths) {
            const c = (a.service_code ?? "").toUpperCase();
            if (!c || DAY_PROGRAM_CODES.has(c)) continue;
            if (!isClockableServiceCode(c)) continue; // HHS/PPS/MTP are daily-rate non-clockable
            authedCodes.add(c);
          }
          const ordered = [
            ...SECTION_ORDER.filter((c) => authedCodes.has(c)),
            ...Array.from(authedCodes).filter((c) => !SECTION_ORDER.includes(c)).sort(),
          ];
          if (ordered.length === 0) {
            return (
              <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground text-center" style={{ borderColor: LINE }}>
                No clients are scheduled for clocked shifts yet. Clients with only daily-rate services (like Host Home) don't appear here — manage them through their profile, daily logs, eMAR, and billing. Add a clocked code (e.g. DSI, SEI) to a client to schedule shifts.
              </div>
            );
          }
          return ordered.map((code) => (
            <CodeSection
              key={code}
              code={code}
              label={sectionLabelFor(code)}
              view={view}
              anchor={anchor}
              data={data}
              onAdd={openAdd}
              onOpenShift={(id) => setDetailShiftId(id)}
              onSetAdminHours={(c) => setHhsClientForHours(c)}
              onDayJump={(d) => { setAnchor(d); setView("day"); }}
            />
          ));
        })()}
      </div>

      {/* Add shift dialog */}
      {addOpen && (
        <AddShiftDialog
          sched={data}
          prefill={addPrefill ?? undefined}
          defaultDate={anchor}
          onClose={() => setAddOpen(false)}
        />
      )}

      {/* Shift detail panel */}
      {detail && (
        <ShiftDetailPanel
          shift={detail}
          sched={data}
          onClose={() => setDetailShiftId(null)}
        />
      )}

      {/* HHS admin hours editor */}
      {hhsClientForHours && (
        <AdminHoursDialog client={hhsClientForHours} onClose={() => setHhsClientForHours(null)} />
      )}
    </>
  );
}

// ===================== Code section =====================

function CodeSection({
  code, label, view, anchor, data, onAdd, onOpenShift, onSetAdminHours, onDayJump,
}: {
  code: string;
  label: string;
  view: ViewMode;
  anchor: Date;
  data: NonNullable<ReturnType<typeof useSchedulerData>["data"]>;
  onAdd: (p?: { clientId?: string; code?: string; day?: Date }) => void;
  onOpenShift: (id: string) => void;
  onSetAdminHours: (c: SchedClient) => void;
  onDayJump: (d: Date) => void;
}) {
  const [open, setOpen] = useState(false);
  // Clients authorized for this code
  const authedClients = useMemo(() => {
    const ids = new Set(
      data.auths.filter((a) => a.service_code === code).map((a) => a.client_id),
    );
    return data.clients.filter((c) => ids.has(c.id));
  }, [data, code]);

  // RHS only: home toggle
  const [activeHome, setActiveHome] = useState<string | "__all__">("__all__");
  const homeIds = useMemo(() => {
    if (code !== "RHS") return [] as string[];
    return Array.from(
      new Set(authedClients.map((c) => c.team_id).filter((x): x is string => !!x)),
    );
  }, [code, authedClients]);
  const homes = useMemo(
    () => data.teams.filter((t) => homeIds.includes(t.id)),
    [data.teams, homeIds],
  );
  const visibleClients = useMemo(() => {
    if (code !== "RHS") return authedClients;
    if (activeHome === "__all__") return authedClients;
    return authedClients.filter((c) => c.team_id === activeHome);
  }, [authedClients, activeHome, code]);

  const count = authedClients.length;

  return (
    <div style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: 12 }}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-4 py-3 text-left"
      >
        <ChevronRight className="h-4 w-4 transition-transform" style={{ transform: open ? "rotate(90deg)" : "none" }} />
        <span style={{ background: codeColor(code), color: "#fff", padding: "2px 8px", borderRadius: 6, fontWeight: 800, fontSize: 11, letterSpacing: 0.5 }}>
          {code}
        </span>
        <span className="text-sm font-semibold text-foreground">· {label}</span>
        <div className="flex-1" />
        <Badge variant="outline" className="text-xs">{count} client{count === 1 ? "" : "s"}</Badge>
      </button>

      {open && (
        <div style={{ borderTop: `1px solid ${LINE}` }}>
          {code === "RHS" && homes.length > 0 && (
            <div className="px-4 py-2 flex items-center gap-1.5 flex-wrap" style={{ borderBottom: `1px solid ${LINE}`, background: "#fbfaf6" }}>
              <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground mr-1">
                Home:
              </span>
              <HomePill label={`All · ${authedClients.length}`} active={activeHome === "__all__"} onClick={() => setActiveHome("__all__")} />
              {homes.map((h) => {
                const c = authedClients.filter((x) => x.team_id === h.id).length;
                return (
                  <HomePill
                    key={h.id}
                    label={`${h.team_name} · ${c}`}
                    active={activeHome === h.id}
                    onClick={() => setActiveHome(h.id)}
                  />
                );
              })}
            </div>
          )}

          {visibleClients.length === 0 ? (
            <div className="px-4 py-6 text-sm text-muted-foreground text-center">
              No clients authorized for {code} yet.{" "}
              <Link to="/dashboard/hub/clients" className="underline">Open Clients</Link> to add the code.
            </div>
          ) : view === "day" ? (
            <DayView
              code={code}
              clients={visibleClients}
              data={data}
              anchor={anchor}
              onAdd={onAdd}
              onOpenShift={onOpenShift}
              onSetAdminHours={onSetAdminHours}
            />
          ) : view === "week" ? (
            <WeekView
              code={code}
              clients={visibleClients}
              data={data}
              anchor={anchor}
              onAdd={onAdd}
              onOpenShift={onOpenShift}
              onSetAdminHours={onSetAdminHours}
            />
          ) : (
            <MonthView
              code={code}
              clients={visibleClients}
              data={data}
              anchor={anchor}
              onOpenShift={onOpenShift}
              onDayJump={onDayJump}
            />
          )}
        </div>
      )}
    </div>
  );
}

function HomePill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? NAVY : "#fff",
        color: active ? "#fff" : "#333",
        border: `1px solid ${active ? NAVY : LINE}`,
        borderRadius: 999, padding: "5px 10px", fontSize: 12, fontWeight: 600,
      }}
    >
      {label}
    </button>
  );
}

const FALLBACK_PALETTE = ["#3b6aa8", "#7d4cdb", "#137182", "#d6438a", "#f59324", "#3a8acc", "#dc3a3a", "#7eb45b", "#4a5b8c", "#a36cd6", "#2e8b75", "#c0593f"];
function codeColor(code: string): string {
  switch (code) {
    case "SLH": return "#3b6aa8";
    case "COM": return "#7d4cdb";
    case "PAC": return "#137182";
    case "RP2": return "#d6438a";
    case "HHS": return "#f59324";
    case "RHS": return "#3a8acc";
    case "PM1": return "#dc3a3a";
    case "DSI": return "#7eb45b";
    default: {
      // Stable hash → palette so unknown codes get a consistent color.
      let h = 0;
      for (let i = 0; i < code.length; i++) h = (h * 31 + code.charCodeAt(i)) >>> 0;
      return FALLBACK_PALETTE[h % FALLBACK_PALETTE.length];
    }
  }
}

// ===================== Client column / unit chip =====================

function ClientCell({
  client, code, data, onSetAdminHours,
}: {
  client: SchedClient;
  code: string;
  data: NonNullable<ReturnType<typeof useSchedulerData>["data"]>;
  onSetAdminHours: (c: SchedClient) => void;
}) {
  const initials = `${client.first_name?.[0] ?? ""}${client.last_name?.[0] ?? ""}`.toUpperCase() || "—";
  const auth = data.auths.find((a) => a.client_id === client.id && a.service_code === code);
  const isHHS = code === "HHS";
  let metaLine: React.ReactNode = null;

  if (isHHS) {
    if (client.admin_hours_per_week == null) {
      metaLine = (
        <button
          onClick={() => onSetAdminHours(client)}
          className="text-[11px] underline text-[color:var(--amber-700,#d97a1c)]"
        >
          Set administrative hours
        </button>
      );
    } else {
      metaLine = <span className="text-[11px] text-muted-foreground">{Number(client.admin_hours_per_week)} hrs/wk admin</span>;
    }
  } else {
    const annual = auth?.annual_unit_authorization ?? 0;
    if (!annual) {
      metaLine = (
        <Link
          to="/dashboard/clients/$clientId"
          params={{ clientId: client.id }}
          search={{ tab: "codes" }}
          className="text-[11px] underline text-[color:var(--amber-700,#d97a1c)]"
        >
          Set units
        </Link>
      );
    } else {
      // Units left = annual - used. "Used" is shown as 0 here; full
      // utilization sums live elsewhere (billing). Showing annual as
      // "units left" until utilization is wired through this view.
      metaLine = <span className="text-[11px] text-muted-foreground">{annual} units left</span>;
    }
  }

  return (
    <div className="flex items-center gap-2 px-3 py-2" style={{ minWidth: 220 }}>
      <span
        style={{
          width: 30, height: 30, borderRadius: 999, background: TEAL, color: "#fff",
          display: "inline-grid", placeItems: "center", fontWeight: 700, fontSize: 11,
        }}
      >{initials}</span>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <Link
            to="/dashboard/clients/$clientId"
            params={{ clientId: client.id }}
            className="text-sm font-semibold text-foreground truncate hover:underline"
            style={{ maxWidth: 130 }}
          >
            {client.first_name} {client.last_name}
          </Link>
          <span style={{ background: "#e9f7f6", color: TEAL, fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 4, letterSpacing: 0.5 }}>
            CLIENT
          </span>
        </div>
        <div>{metaLine}</div>
      </div>
    </div>
  );
}

// ===================== Day view =====================

const DAY_HOURS = Array.from({ length: 15 }, (_, i) => i + 6); // 6a..8p

function DayView({
  code, clients, data, anchor, onAdd, onOpenShift, onSetAdminHours,
}: {
  code: string;
  clients: SchedClient[];
  data: NonNullable<ReturnType<typeof useSchedulerData>["data"]>;
  anchor: Date;
  onAdd: (p?: { clientId?: string; code?: string; day?: Date }) => void;
  onOpenShift: (id: string) => void;
  onSetAdminHours: (c: SchedClient) => void;
}) {
  const shiftsForDay = useMemo(() => {
    return data.shifts.filter((s) => {
      if ((s.service_code ?? s.job_code) !== code) return false;
      return sameDay(new Date(s.starts_at), anchor);
    });
  }, [data.shifts, code, anchor]);
  const staffById = useMemo(() => new Map(data.staff.map((s) => [s.id, s])), [data.staff]);

  return (
    <div className="overflow-x-auto">
      <div style={{ minWidth: 920 }}>
        {/* Header row */}
        <div className="flex items-center text-[10px] font-bold uppercase tracking-wider text-muted-foreground" style={{ borderBottom: `1px solid ${LINE}` }}>
          <div style={{ minWidth: 220, padding: "8px 12px" }}>Client</div>
          <div className="flex-1 grid" style={{ gridTemplateColumns: `repeat(${DAY_HOURS.length}, 1fr)` }}>
            {DAY_HOURS.map((h) => (
              <div key={h} className="px-1 py-2">{hourLabel(h)}</div>
            ))}
          </div>
        </div>
        {clients.map((c) => {
          const rowShifts = shiftsForDay.filter((s) => s.client_id === c.id);
          return (
            <div key={c.id} className="flex items-stretch" style={{ borderBottom: `1px solid ${LINE}` }}>
              <ClientCell client={c} code={code} data={data} onSetAdminHours={onSetAdminHours} />
              <div className="flex-1 relative" style={{ minHeight: 56 }}>
                {/* Hour gridlines */}
                <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${DAY_HOURS.length}, 1fr)` }}>
                  {DAY_HOURS.map((h) => (
                    <button
                      key={h}
                      onClick={(e) => {
                        if ((e.target as HTMLElement).dataset.block) return;
                        const d = new Date(anchor); d.setHours(h, 0, 0, 0);
                        onAdd({ clientId: c.id, code, day: d });
                      }}
                      className="border-l border-dashed text-[10px] text-muted-foreground/50 hover:bg-amber-50/40"
                      style={{ borderColor: "#eee" }}
                      title="Add shift"
                    />
                  ))}
                </div>
                {/* Shifts */}
                {rowShifts.map((s) => {
                  const start = new Date(s.starts_at);
                  const end = new Date(s.ends_at);
                  const startH = start.getHours() + start.getMinutes() / 60;
                  const endH = end.getHours() + end.getMinutes() / 60;
                  const min = 6, max = 21;
                  const leftPct = Math.max(0, (startH - min) / (max - min)) * 100;
                  const widthPct = Math.max(2, (Math.min(endH, max) - Math.max(startH, min)) / (max - min)) * 100;
                  const st = s.staff_id ? staffById.get(s.staff_id) : null;
                  const label = st?.first_name ?? "Open";
                  return (
                    <button
                      key={s.id}
                      data-block="1"
                      onClick={() => onOpenShift(s.id)}
                      style={{
                        position: "absolute",
                        top: 6, bottom: 6,
                        left: `${leftPct}%`, width: `${widthPct}%`,
                        background: s.staff_id ? "rgba(245,147,36,0.15)" : "rgba(180,180,180,0.15)",
                        border: `1px solid ${s.staff_id ? GOLD : "#bbb"}`,
                        borderRadius: 6, padding: "2px 6px",
                        fontSize: 11, fontWeight: 600,
                        color: NAVY, textAlign: "left", overflow: "hidden", whiteSpace: "nowrap",
                      }}
                    >
                      <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: 999, background: GOLD, marginRight: 4 }} />
                      <strong>{label}</strong> <span className="opacity-70">{fmtTime(start)}–{fmtTime(end)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ===================== Week view =====================

function WeekView({
  code, clients, data, anchor, onAdd, onOpenShift, onSetAdminHours,
}: {
  code: string;
  clients: SchedClient[];
  data: NonNullable<ReturnType<typeof useSchedulerData>["data"]>;
  anchor: Date;
  onAdd: (p?: { clientId?: string; code?: string; day?: Date }) => void;
  onOpenShift: (id: string) => void;
  onSetAdminHours: (c: SchedClient) => void;
}) {
  const ws = useMemo(() => startOfWeek(anchor), [anchor]);
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => { const d = new Date(ws); d.setDate(d.getDate() + i); return d; }),
    [ws],
  );
  const today = new Date(); today.setHours(0, 0, 0, 0);

  return (
    <div className="overflow-x-auto">
      <div style={{ minWidth: 920 }}>
        <div className="flex" style={{ borderBottom: `1px solid ${LINE}` }}>
          <div style={{ minWidth: 220, padding: "8px 12px" }} className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Client</div>
          <div className="flex-1 grid" style={{ gridTemplateColumns: "repeat(7, 1fr)" }}>
            {days.map((d) => (
              <div key={d.toISOString()} className="px-2 py-2 text-center" style={{ background: sameDay(d, today) ? "#fff7e6" : undefined }}>
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{d.toLocaleDateString(undefined, { weekday: "short" })}</div>
                <div className="text-sm font-semibold">{d.getDate()}</div>
              </div>
            ))}
          </div>
        </div>
        {clients.map((c) => (
          <div key={c.id} className="flex items-stretch" style={{ borderBottom: `1px solid ${LINE}` }}>
            <ClientCell client={c} code={code} data={data} onSetAdminHours={onSetAdminHours} />
            <div className="flex-1 grid" style={{ gridTemplateColumns: "repeat(7, 1fr)" }}>
              {days.map((d) => {
                const dayShifts = data.shifts.filter(
                  (s) => s.client_id === c.id && (s.service_code ?? s.job_code) === code && sameDay(new Date(s.starts_at), d),
                );
                return (
                  <button
                    key={d.toISOString()}
                    onClick={() => {
                      if (dayShifts[0]) onOpenShift(dayShifts[0].id);
                      else onAdd({ clientId: c.id, code, day: d });
                    }}
                    className="flex items-center justify-center hover:bg-amber-50/40"
                    style={{ minHeight: 50, background: sameDay(d, today) ? "#fff7e6" : undefined }}
                  >
                    {dayShifts.length === 0 ? (
                      <span className="text-xs text-muted-foreground/50">+</span>
                    ) : dayShifts.map((s) => (
                      <span
                        key={s.id}
                        title={s.staff_id ? "Assigned" : "Open"}
                        style={{
                          width: 14, height: 14, borderRadius: 999, margin: "0 2px",
                          background: s.staff_id ? "#2563d8" : "transparent",
                          border: s.staff_id ? "none" : `2px solid ${GOLD}`,
                        }}
                      />
                    ))}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ===================== Month view =====================

function MonthView({
  code, clients, data, anchor, onOpenShift, onDayJump,
}: {
  code: string;
  clients: SchedClient[];
  data: NonNullable<ReturnType<typeof useSchedulerData>["data"]>;
  anchor: Date;
  onOpenShift: (id: string) => void;
  onDayJump: (d: Date) => void;
}) {
  const monthStart = startOfMonth(anchor);
  const gridStart = new Date(monthStart); gridStart.setDate(gridStart.getDate() - gridStart.getDay());
  const cells = Array.from({ length: 42 }, (_, i) => { const d = new Date(gridStart); d.setDate(d.getDate() + i); return d; });
  const clientIds = new Set(clients.map((c) => c.id));
  const clientName = (id: string) => {
    const c = clients.find((x) => x.id === id);
    return c ? `${c.first_name?.[0] ?? ""}${c.last_name?.[0] ?? ""}` : "?";
  };

  return (
    <div className="p-3">
      <div className="grid grid-cols-7 text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => <div key={d} className="px-2 py-1 text-center">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-px" style={{ background: LINE }}>
        {cells.map((d) => {
          const isMonth = d.getMonth() === anchor.getMonth();
          const dayShifts = data.shifts.filter(
            (s) => clientIds.has(s.client_id) && (s.service_code ?? s.job_code) === code && sameDay(new Date(s.starts_at), d),
          );
          return (
            <div key={d.toISOString()} className="bg-white p-1 min-h-[78px]" style={{ opacity: isMonth ? 1 : 0.5 }}>
              <button onClick={() => onDayJump(d)} className="text-[11px] font-semibold hover:underline">{d.getDate()}</button>
              <div className="mt-1 space-y-1">
                {dayShifts.slice(0, 3).map((s) => (
                  <button
                    key={s.id}
                    onClick={() => onOpenShift(s.id)}
                    className="block w-full text-left text-[10px] px-1.5 py-0.5 rounded truncate"
                    style={{ background: "rgba(245,147,36,0.15)", color: NAVY }}
                  >
                    {clientName(s.client_id)} · {code}
                  </button>
                ))}
                {dayShifts.length > 3 && <div className="text-[10px] text-muted-foreground">+{dayShifts.length - 3} more</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ===================== Add shift dialog =====================

function AddShiftDialog({
  sched, prefill, defaultDate, onClose,
}: {
  sched: NonNullable<ReturnType<typeof useSchedulerData>["data"]>;
  prefill?: { clientId?: string; code?: string; day?: Date };
  defaultDate: Date;
  onClose: () => void;
}) {
  const { data: org } = useCurrentOrg();
  const qc = useQueryClient();
  const save = useServerFn(saveShift);
  const recur = useServerFn(createRecurringShifts);
  const [clientId, setClientId] = useState<string>(prefill?.clientId ?? "");
  const [code, setCode] = useState<string>(prefill?.code ?? "");
  const [staffId, setStaffId] = useState<string>("__open__");
  const dInit = prefill?.day ?? defaultDate;
  const [date, setDate] = useState<string>(dayStr(dInit));
  const [start, setStart] = useState<string>("09:00");
  const [end, setEnd] = useState<string>("13:00");

  // Recurrence (off by default)
  const [repeatOn, setRepeatOn] = useState(false);
  const [freq, setFreq] = useState<"daily" | "weekly" | "monthly">("weekly");
  const [weekdays, setWeekdays] = useState<number[]>([]); // 0=Sun..6=Sat
  const [dayOfMonth, setDayOfMonth] = useState<number>(new Date(dInit).getDate());
  const [endMode, setEndMode] = useState<"count" | "until">("count");
  const [count, setCount] = useState<number>(4);
  const [until, setUntil] = useState<string>("");

  // Codes available for selected client
  const clientCodes = useMemo(() => {
    if (!clientId) return [] as string[];
    return Array.from(new Set(sched.auths.filter((a) => a.client_id === clientId).map((a) => a.service_code)));
  }, [sched.auths, clientId]);

  // Staff assignable for selected client (caseload gate)
  const caseloadStaffIds = useMemo(() => {
    if (!clientId) return new Set<string>();
    return new Set(sched.assigns.filter((a) => a.client_id === clientId).map((a) => a.staff_id));
  }, [sched.assigns, clientId]);
  const caseloadStaff = useMemo(
    () => sched.staff.filter((s) => caseloadStaffIds.has(s.id)),
    [sched.staff, caseloadStaffIds],
  );

  const off = useMemo(() => {
    const set = new Set<string>();
    for (const t of sched.timeOff) {
      if (date >= t.start_date && date <= t.end_date) set.add(t.staff_id);
    }
    return set;
  }, [sched.timeOff, date]);

  const clientName = useMemo(() => {
    const c = sched.clients.find((x) => x.id === clientId);
    return c ? `${c.first_name} ${c.last_name}`.trim() : "this client";
  }, [sched.clients, clientId]);

  const toggleWeekday = (n: number) =>
    setWeekdays((prev) => prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n].sort());

  const saveMut = useMutation({
    mutationFn: async () => {
      const starts = new Date(`${date}T${start}:00`).toISOString();
      const ends = new Date(`${date}T${end}:00`).toISOString();
      const res = await save({
        data: {
          organization_id: org!.organization_id,
          client_id: clientId,
          job_code: code,
          staff_id: staffId === "__open__" ? null : staffId,
          starts_at: starts,
          ends_at: ends,
          shift_type: "hourly",
          status: "pending",
          published: false,
        },
      });
      if (repeatOn) {
        await recur({
          data: {
            organization_id: org!.organization_id,
            seed_shift_id: res.id,
            freq,
            weekdays: freq === "weekly" && weekdays.length > 0 ? weekdays : undefined,
            day_of_month: freq === "monthly" ? dayOfMonth : undefined,
            count: endMode === "count" ? count : undefined,
            until_date: endMode === "until" && until ? until : null,
          },
        });
      }
      return res;
    },
    onSuccess: () => {
      toast.success(repeatOn ? "Shift + recurring series saved." : "Shift saved.");
      qc.invalidateQueries({ queryKey: ["scheduler-data"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Plus className="h-4 w-4" /> Add shift</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Field label="CLIENT">
            <Select value={clientId} onValueChange={(v) => { setClientId(v); setCode(""); setStaffId("__open__"); }}>
              <SelectTrigger><SelectValue placeholder="Choose client" /></SelectTrigger>
              <SelectContent>
                {sched.clients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.first_name} {c.last_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="SERVICE CODE (AUTHORIZED ONLY)">
            <Select value={code} onValueChange={setCode} disabled={!clientId}>
              <SelectTrigger>
                <SelectValue placeholder={clientId ? "Choose code" : "Pick a client first"} />
              </SelectTrigger>
              <SelectContent>
                {clientCodes.length === 0 && (
                  <div className="p-2 text-xs text-muted-foreground">No authorized codes. Add one on the client profile.</div>
                )}
                {clientCodes.map((c) => (
                  <SelectItem key={c} value={c}>{c} · {evvServiceLabel(c)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="STAFF (CLIENT'S AUTHORIZED TEAM)">
            <Select value={staffId} onValueChange={setStaffId} disabled={!clientId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__open__">— Leave open —</SelectItem>
                {caseloadStaff.length === 0 && (
                  <div className="p-2 text-xs text-muted-foreground">No staff on {clientName}'s caseload yet.</div>
                )}
                {caseloadStaff.map((s) => {
                  const isOff = off.has(s.id);
                  const notActive = !s.is_active;
                  const reason = isOff ? "Off this day" : notActive ? "Onboarding incomplete" : null;
                  return (
                    <SelectItem key={s.id} value={s.id} disabled={!!reason}>
                      {s.name}{reason ? ` — ${reason}` : ""}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            {clientId && <p className="text-[11px] text-muted-foreground mt-1">Only staff on {clientName}'s team are listed.</p>}
          </Field>

          <div className="grid grid-cols-3 gap-2">
            <Field label="DATE"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
            <Field label="START"><Input type="time" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
            <Field label="END"><Input type="time" value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
          </div>

          {/* Recurrence */}
          <div className="rounded-md border p-3 space-y-2" style={{ borderColor: LINE, background: "#fbfaf6" }}>
            <label className="inline-flex items-center gap-2 text-sm font-semibold">
              <input type="checkbox" checked={repeatOn} onChange={(e) => setRepeatOn(e.target.checked)} className="h-4 w-4" />
              Repeat this shift
            </label>
            {repeatOn && (
              <div className="space-y-2 pt-1">
                <div className="grid grid-cols-2 gap-2">
                  <Field label="FREQUENCY">
                    <Select value={freq} onValueChange={(v) => setFreq(v as "daily" | "weekly" | "monthly")}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="daily">Daily</SelectItem>
                        <SelectItem value="weekly">Weekly</SelectItem>
                        <SelectItem value="monthly">Monthly</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  {freq === "monthly" && (
                    <Field label="DAY OF MONTH">
                      <Input
                        type="number" min={1} max={31}
                        value={dayOfMonth}
                        onChange={(e) => setDayOfMonth(Math.max(1, Math.min(31, Number(e.target.value) || 1)))}
                      />
                    </Field>
                  )}
                </div>

                {freq === "weekly" && (
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
                      DAYS OF WEEK
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((label, i) => {
                        const active = weekdays.includes(i);
                        return (
                          <button
                            key={i}
                            type="button"
                            onClick={() => toggleWeekday(i)}
                            className="text-xs font-semibold rounded-full px-3 py-1.5"
                            style={{
                              background: active ? NAVY : "#fff",
                              color: active ? "#fff" : "#444",
                              border: `1px solid ${active ? NAVY : LINE}`,
                              minHeight: 32, minWidth: 44,
                            }}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Leave blank to repeat on the same weekday as the seed date.
                    </p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <Field label="ENDS">
                    <Select value={endMode} onValueChange={(v) => setEndMode(v as "count" | "until")}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="count">After N occurrences</SelectItem>
                        <SelectItem value="until">On a date</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  {endMode === "count" ? (
                    <Field label="OCCURRENCES">
                      <Input
                        type="number" min={1} max={200}
                        value={count}
                        onChange={(e) => setCount(Math.max(1, Math.min(200, Number(e.target.value) || 1)))}
                      />
                    </Field>
                  ) : (
                    <Field label="UNTIL DATE">
                      <Input type="date" value={until} onChange={(e) => setUntil(e.target.value)} />
                    </Field>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => saveMut.mutate()}
            disabled={!clientId || !code || saveMut.isPending}
            style={{ background: GOLD, color: NAVY }}
          >
            {saveMut.isPending ? "Saving…" : "Add shift"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">{label}</div>
      {children}
    </div>
  );
}

// ===================== Shift detail panel =====================

function ShiftDetailPanel({
  shift, sched, onClose,
}: {
  shift: SchedShift;
  sched: NonNullable<ReturnType<typeof useSchedulerData>["data"]>;
  onClose: () => void;
}) {
  const { data: org } = useCurrentOrg();
  const qc = useQueryClient();
  const save = useServerFn(saveShift);
  const del = useServerFn(deleteShift);
  const add = useServerFn(addToCaseload);
  const client = sched.clients.find((c) => c.id === shift.client_id);
  const staffById = new Map(sched.staff.map((s) => [s.id, s]));
  const code = shift.service_code ?? shift.job_code ?? "";
  const start = new Date(shift.starts_at);
  const end = new Date(shift.ends_at);
  const [search, setSearch] = useState("");
  const [openOther, setOpenOther] = useState(false);

  const caseloadStaffIds = new Set(sched.assigns.filter((a) => a.client_id === shift.client_id).map((a) => a.staff_id));
  const caseloadStaff = sched.staff.filter((s) => caseloadStaffIds.has(s.id));

  const matchOthers = openOther
    ? sched.staff.filter((s) => s.name.toLowerCase().includes(search.toLowerCase())).slice(0, 8)
    : [];

  const assign = useMutation({
    mutationFn: (newStaffId: string | null) =>
      save({
        data: {
          id: shift.id,
          organization_id: org!.organization_id,
          client_id: shift.client_id,
          job_code: code,
          staff_id: newStaffId,
          starts_at: shift.starts_at,
          ends_at: shift.ends_at,
          shift_type: "hourly",
          status: shift.status,
          published: shift.published,
        },
      }),
    onSuccess: () => {
      toast.success("Updated.");
      qc.invalidateQueries({ queryKey: ["scheduler-data"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const dupMut = useMutation({
    mutationFn: () =>
      save({
        data: {
          organization_id: org!.organization_id,
          client_id: shift.client_id,
          job_code: code,
          staff_id: shift.staff_id,
          starts_at: shift.starts_at,
          ends_at: shift.ends_at,
          shift_type: "hourly",
          status: "pending",
          published: false,
        },
      }),
    onSuccess: () => {
      toast.success("Duplicated.");
      qc.invalidateQueries({ queryKey: ["scheduler-data"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delMut = useMutation({
    mutationFn: () => del({ data: { id: shift.id, organization_id: org!.organization_id } }),
    onSuccess: () => {
      toast.success("Deleted.");
      qc.invalidateQueries({ queryKey: ["scheduler-data"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addCl = useMutation({
    mutationFn: (staffId: string) =>
      add({
        data: {
          organization_id: org!.organization_id,
          client_id: shift.client_id,
          staff_id: staffId,
        },
      }),
    onSuccess: () => {
      toast.success("Added to caseload.");
      qc.invalidateQueries({ queryKey: ["scheduler-data"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="fixed inset-y-0 right-0 z-40 w-full sm:w-[420px] bg-white border-l shadow-xl flex flex-col" style={{ borderColor: LINE }}>
      <div className="flex items-center gap-2 p-3 border-b" style={{ borderColor: LINE, background: "#fbfaf6" }}>
        <span style={{ background: codeColor(code), color: "#fff", padding: "2px 8px", borderRadius: 6, fontWeight: 800, fontSize: 11 }}>{code}</span>
        <div className="flex-1 font-semibold text-sm">{client?.first_name} {client?.last_name}</div>
        <button onClick={onClose}><X className="h-4 w-4" /></button>
      </div>

      <div className="p-4 space-y-4 overflow-y-auto">
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled><Edit2 className="h-3.5 w-3.5 mr-1" /> Edit</Button>
          <Button size="sm" variant="outline" onClick={() => dupMut.mutate()} disabled={dupMut.isPending}><Copy className="h-3.5 w-3.5 mr-1" /> Duplicate</Button>
          <Button size="sm" variant="outline" onClick={() => { if (confirm("Delete this shift?")) delMut.mutate(); }} disabled={delMut.isPending}><Trash2 className="h-3.5 w-3.5 mr-1" /> Delete</Button>
        </div>

        <div className="text-sm">
          <div className="font-semibold">{start.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</div>
          <div className="text-muted-foreground">{fmtTime(start)} – {fmtTime(end)}</div>
        </div>

        <Field label="ASSIGNED STAFF">
          <Select
            value={shift.staff_id ?? "__open__"}
            onValueChange={(v) => assign.mutate(v === "__open__" ? null : v)}
          >
            <SelectTrigger>
              <SelectValue>
                {shift.staff_id ? staffById.get(shift.staff_id)?.name ?? "Staff" : "Open"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__open__">Open (no one assigned)</SelectItem>
              {caseloadStaff.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <div>
          <button className="text-xs underline text-muted-foreground" onClick={() => setOpenOther((v) => !v)}>
            {openOther ? "Hide" : "Assign someone not on the team"}
          </button>
          {openOther && (
            <div className="mt-2 space-y-2">
              <Input placeholder="Search staff…" value={search} onChange={(e) => setSearch(e.target.value)} />
              <div className="max-h-48 overflow-y-auto border rounded-md divide-y">
                {matchOthers.map((s) => {
                  const onCaseload = caseloadStaffIds.has(s.id);
                  return (
                    <div key={s.id} className="flex items-center gap-2 px-2 py-1.5 text-sm">
                      <div className="flex-1 truncate">{s.name}</div>
                      {onCaseload ? (
                        <Button size="sm" variant="outline" onClick={() => assign.mutate(s.id)}>Assign</Button>
                      ) : (
                        <>
                          <Button size="sm" variant="outline" onClick={async () => { await addCl.mutateAsync(s.id); assign.mutate(s.id); }}>
                            Add to caseload
                          </Button>
                          <Link to="/dashboard/employees/$staffId" params={{ staffId: s.id }} aria-label="Open profile">
                            <ArrowRight className="h-4 w-4" />
                          </Link>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="text-[11px] text-muted-foreground border-t pt-3" style={{ borderColor: LINE }}>
          Status: <strong>{shift.status}</strong> · Published: <strong>{shift.published ? "yes" : "no"}</strong>
        </div>
      </div>
    </div>
  );
}

// ===================== Admin hours dialog (HHS) =====================

function AdminHoursDialog({ client, onClose }: { client: SchedClient; onClose: () => void }) {
  const { data: org } = useCurrentOrg();
  const qc = useQueryClient();
  const { saveAdminHours } = require("@/lib/scheduler/scheduler.functions");
  const save = useServerFn(saveAdminHours as any);
  const [val, setVal] = useState<number>(client.admin_hours_per_week ?? 0);
  const saveMut = useMutation({
    mutationFn: () => (save as any)({ data: { organization_id: org!.organization_id, client_id: client.id, hours: val } }),
    onSuccess: () => {
      toast.success("Hours saved.");
      qc.invalidateQueries({ queryKey: ["scheduler-data"] });
      qc.invalidateQueries({ queryKey: ["client-profile"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-xs">
        <DialogHeader><DialogTitle>Administrative hours per week</DialogTitle></DialogHeader>
        <div className="flex items-center justify-center gap-2 py-3">
          <Button variant="outline" onClick={() => setVal((v) => Math.max(0, v - 1))}>−</Button>
          <Input
            type="number"
            value={val}
            min={0}
            max={168}
            onChange={(e) => setVal(Number(e.target.value) || 0)}
            className="w-24 text-center text-lg font-semibold"
          />
          <Button variant="outline" onClick={() => setVal((v) => Math.min(168, v + 1))}>+</Button>
        </div>
        <p className="text-[11px] text-muted-foreground text-center">{client.first_name} {client.last_name}</p>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending} style={{ background: GOLD, color: NAVY }}>
            {saveMut.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ===================== Day Program board =====================

function DayProgramBoard({
  weekStart, sched,
}: {
  weekStart: Date;
  sched: NonNullable<ReturnType<typeof useSchedulerData>["data"]>;
}) {
  const { data: org } = useCurrentOrg();
  const { data: dp, isLoading } = useDayProgramData(weekStart);
  const qc = useQueryClient();
  const create = useServerFn(saveDayProgramSession);
  const markFn = useServerFn(markAttendance);
  const addStaff = useServerFn(addSessionStaff);

  const [createOpen, setCreateOpen] = useState(false);

  if (isLoading || !dp) return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;

  const groups: Record<string, typeof dp.sessions> = { DSG: [], DSP: [], DSI: [], SED: [] };
  for (const s of dp.sessions) (groups[s.service_code] ??= []).push(s);

  // Clients authorized for each code
  const authByCode = (code: string) => new Set(sched.auths.filter((a) => a.service_code === code).map((a) => a.client_id));

  return (
    <div className="p-4 max-w-[1400px] mx-auto space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold">Day Program — week of {weekStart.toLocaleDateString(undefined, { month: "short", day: "numeric" })}</h2>
        <Button onClick={() => setCreateOpen(true)} style={{ background: GOLD, color: NAVY }}>
          <Plus className="h-4 w-4 mr-1" /> Add session
        </Button>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        {(["DSG", "DSP"] as const).map((code) => (
          <div key={code} style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: 12 }} className="p-3">
            <div className="flex items-center gap-2 mb-3">
              <span style={{ background: codeColor(code === "DSG" ? "SLH" : "RHS"), color: "#fff", padding: "2px 8px", borderRadius: 6, fontWeight: 800, fontSize: 11 }}>{code}</span>
              <span className="font-semibold">{code === "DSG" ? "Day Support — Group" : "Day Support — Partial"}</span>
            </div>
            {(groups[code] ?? []).length === 0 ? (
              <div className="text-sm text-muted-foreground py-4 text-center">No {code} sessions this week.</div>
            ) : (
              <div className="space-y-3">
                {(groups[code] ?? []).map((session) => (
                  <SessionCard
                    key={session.id}
                    session={session}
                    sched={sched}
                    dp={dp}
                    authedClients={Array.from(authByCode(code))}
                    onMark={(clientId, attended) => markFn({ data: { session_id: session.id, client_id: clientId, attended } }).then(() => qc.invalidateQueries({ queryKey: ["day-program-data"] }))}
                    onAddStaff={(staffId) => addStaff({ data: { session_id: session.id, staff_id: staffId } }).then(() => qc.invalidateQueries({ queryKey: ["day-program-data"] }))}
                  />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {createOpen && (
        <NewSessionDialog
          weekStart={weekStart}
          onClose={() => setCreateOpen(false)}
          onCreate={async (input) => {
            await create({ data: { organization_id: org!.organization_id, ...input } });
            await qc.invalidateQueries({ queryKey: ["day-program-data"] });
            setCreateOpen(false);
          }}
        />
      )}
    </div>
  );
}

function SessionCard({
  session, sched, dp, authedClients, onMark, onAddStaff,
}: {
  session: { id: string; session_date: string; service_code: string; location_label: string | null; start_time: string; end_time: string };
  sched: NonNullable<ReturnType<typeof useSchedulerData>["data"]>;
  dp: NonNullable<ReturnType<typeof useDayProgramData>["data"]>;
  authedClients: string[];
  onMark: (clientId: string, attended: boolean) => void;
  onAddStaff: (staffId: string) => void;
}) {
  const sessStaff = dp.sessionStaff.filter((s) => s.session_id === session.id);
  const attendance = dp.attendance.filter((a) => a.session_id === session.id);
  const presentCount = attendance.filter((a) => a.attended).length;
  const [showAddStaff, setShowAddStaff] = useState(false);

  return (
    <div className="border rounded-md p-3" style={{ borderColor: LINE }}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <div className="text-xs font-semibold text-muted-foreground">{new Date(session.session_date).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}</div>
          <div className="text-sm font-semibold">{session.location_label ?? "Room"}</div>
          <div className="text-[11px] text-muted-foreground">{fmtTime(new Date(session.start_time))}–{fmtTime(new Date(session.end_time))}</div>
        </div>
        <Badge variant="outline">{presentCount}/{authedClients.length} present</Badge>
      </div>

      <div className="mb-2">
        <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Staff ({sessStaff.length}) · one clock-in covers all clients</div>
        <div className="flex flex-wrap gap-1.5 items-center">
          {sessStaff.map((s) => {
            const st = sched.staff.find((x) => x.id === s.staff_id);
            return (
              <span key={s.id} className="text-[11px] font-semibold inline-flex items-center gap-1 px-2 py-1 rounded" style={{ background: "rgba(245,147,36,0.15)" }}>
                <span style={{ width: 6, height: 6, borderRadius: 2, background: GOLD }} />
                {st?.first_name ?? "Staff"}
              </span>
            );
          })}
          <button className="text-[11px] underline text-muted-foreground" onClick={() => setShowAddStaff((v) => !v)}>+ staff</button>
        </div>
        {showAddStaff && (
          <Select onValueChange={(v) => { onAddStaff(v); setShowAddStaff(false); }}>
            <SelectTrigger className="mt-1 h-8"><SelectValue placeholder="Pick staff to add" /></SelectTrigger>
            <SelectContent>
              {sched.staff.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>

      <div>
        <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Roster · attendance marked by staff</div>
        <div className="divide-y border rounded-md" style={{ borderColor: LINE }}>
          {authedClients.length === 0 && <div className="px-3 py-2 text-xs text-muted-foreground">No clients authorized for {session.service_code}.</div>}
          {authedClients.map((cid) => {
            const c = sched.clients.find((x) => x.id === cid);
            if (!c) return null;
            const a = attendance.find((x) => x.client_id === cid);
            const state = !a ? "unmarked" : a.attended ? "present" : "absent";
            return (
              <div key={cid} className="flex items-center gap-2 px-3 py-1.5">
                <span style={{ width: 22, height: 22, borderRadius: 999, background: TEAL, color: "#fff", display: "inline-grid", placeItems: "center", fontSize: 9, fontWeight: 700 }}>
                  {(c.first_name?.[0] ?? "") + (c.last_name?.[0] ?? "")}
                </span>
                <span className="text-sm flex-1 truncate">{c.first_name} {c.last_name}</span>
                <button onClick={() => onMark(cid, true)} className={`text-[11px] px-2 py-0.5 rounded ${state === "present" ? "bg-emerald-100 text-emerald-700 font-semibold" : "text-muted-foreground hover:bg-muted"}`}>Present</button>
                <button onClick={() => onMark(cid, false)} className={`text-[11px] px-2 py-0.5 rounded ${state === "absent" ? "bg-red-100 text-red-700 font-semibold" : "text-muted-foreground hover:bg-muted"}`}>Absent</button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function NewSessionDialog({
  weekStart, onClose, onCreate,
}: {
  weekStart: Date;
  onClose: () => void;
  onCreate: (input: { session_date: string; service_code: "DSG" | "DSP"; location_label: string | null; start_time: string; end_time: string }) => Promise<void>;
}) {
  const [date, setDate] = useState<string>(dayStr(weekStart));
  const [code, setCode] = useState<"DSG" | "DSP">("DSG");
  const [room, setRoom] = useState("");
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("15:00");
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>New day-program session</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Field label="DATE"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="CODE">
            <Select value={code} onValueChange={(v) => setCode(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="DSG">DSG · Day Support — Group</SelectItem>
                <SelectItem value="DSP">DSP · Day Support — Partial</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="ROOM / LOCATION"><Input value={room} onChange={(e) => setRoom(e.target.value)} placeholder="e.g. Sunflower Room" /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="START"><Input type="time" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
            <Field label="END"><Input type="time" value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onCreate({
                  session_date: date,
                  service_code: code,
                  location_label: room.trim() || null,
                  start_time: new Date(`${date}T${start}:00`).toISOString(),
                  end_time: new Date(`${date}T${end}:00`).toISOString(),
                });
              } finally {
                setBusy(false);
              }
            }}
            style={{ background: GOLD, color: NAVY }}
          >
            {busy ? "Saving…" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ===================== Staff view preview =====================

function StaffViewPreview({
  sched, anchor,
}: {
  sched: NonNullable<ReturnType<typeof useSchedulerData>["data"]>;
  anchor: Date;
}) {
  const { data: org } = useCurrentOrg();
  const qc = useQueryClient();
  const off = useServerFn(setAdminTimeOff);
  const [staffId, setStaffId] = useState<string>(sched.staff[0]?.id ?? "");
  const ws = useMemo(() => startOfWeek(anchor), [anchor]);
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(ws); d.setDate(d.getDate() + i); return d; });

  useEffect(() => {
    if (!staffId && sched.staff[0]) setStaffId(sched.staff[0].id);
  }, [sched.staff, staffId]);

  const offDates = useMemo(() => {
    const set = new Set<string>();
    for (const t of sched.timeOff) {
      if (t.staff_id !== staffId) continue;
      const start = new Date(t.start_date);
      const end = new Date(t.end_date);
      for (const d of days) {
        const ds = dayStr(d);
        if (ds >= t.start_date && ds <= t.end_date) set.add(ds);
        void start; void end;
      }
    }
    return set;
  }, [sched.timeOff, days, staffId]);

  const myShifts = sched.shifts.filter((s) => s.staff_id === staffId && s.published);

  const setOff = useMutation({
    mutationFn: (args: { date: string; on: boolean }) =>
      off({ data: { organization_id: org!.organization_id, staff_id: staffId, date: args.date, on: args.on } }),
    onSuccess: () => {
      toast.success("Updated.");
      qc.invalidateQueries({ queryKey: ["scheduler-data"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const staff = sched.staff.find((s) => s.id === staffId);

  return (
    <div className="p-4 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-4">
        <Phone className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Staff portal preview —</span>
        <Select value={staffId} onValueChange={setStaffId}>
          <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {sched.staff.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">this is what they do on their phone</span>
      </div>
      <div style={{ background: NAVY, color: "#fff", padding: "12px 14px", borderRadius: "12px 12px 0 0" }} className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span style={{ width: 36, height: 36, borderRadius: 999, background: GOLD, color: NAVY, display: "inline-grid", placeItems: "center", fontWeight: 800 }}>
            {staff?.first_name?.[0] ?? "S"}
          </span>
          <div>
            <div className="font-bold">{staff?.name ?? "Staff"}</div>
          </div>
        </div>
        <Badge style={{ background: GOLD, color: NAVY }}>{myShifts.length} shifts</Badge>
      </div>
      <div style={{ background: "#fff", border: `1px solid ${LINE}`, borderTop: "none", borderRadius: "0 0 12px 12px" }} className="divide-y">
        {days.map((d) => {
          const ds = dayStr(d);
          const isOff = offDates.has(ds);
          const dayShifts = myShifts.filter((s) => sameDay(new Date(s.starts_at), d));
          return (
            <div key={ds} className="flex items-center gap-3 px-4 py-3" style={{ background: sameDay(d, new Date()) ? "#fffaf0" : undefined }}>
              <div className="w-12 text-center">
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{d.toLocaleDateString(undefined, { weekday: "short" })}</div>
                <div className="text-base font-semibold">{d.getDate()}</div>
              </div>
              <div className="flex-1 text-sm">
                {isOff ? (
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-emerald-50 text-emerald-700 text-xs font-semibold">
                    ✈ Time off
                  </span>
                ) : dayShifts.length === 0 ? (
                  <span className="text-muted-foreground">No shifts</span>
                ) : (
                  <div className="space-y-1">
                    {dayShifts.map((s) => {
                      const c = sched.clients.find((x) => x.id === s.client_id);
                      return <div key={s.id}>{c?.first_name} {c?.last_name} · {s.service_code ?? s.job_code} · {fmtTime(new Date(s.starts_at))}–{fmtTime(new Date(s.ends_at))}</div>;
                    })}
                  </div>
                )}
              </div>
              <button
                onClick={() => setOff.mutate({ date: ds, on: !isOff })}
                className="text-xs px-2 py-1 rounded border"
                style={{ borderColor: LINE }}
                disabled={setOff.isPending}
              >
                {isOff ? "Undo" : "Off"}
              </button>
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground text-center">
        Only published shifts appear here. Marking off blocks scheduling that day everywhere.
      </p>
    </div>
  );
}
