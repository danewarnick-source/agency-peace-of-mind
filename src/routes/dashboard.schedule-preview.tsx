import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Lock } from "lucide-react";
import { CoverageBar24h } from "@/components/scheduling/coverage-bar-24h";
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

  const [settings, setSettings] = useSettings();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date()));
  const [siteId, setSiteId] = useState<string>("__all__");
  const [view, setView] = useState<ViewMode>(settings.defaultView);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorCtx, setEditorCtx] = useState<EditorContext | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const openEditor = (ctx: EditorContext) => { setEditorCtx(ctx); setEditorOpen(true); };

  useEffect(() => { setView(settings.defaultView); }, [settings.defaultView]);
  // Honor the "opens on" preference once, on first paint.
  const [landed, setLanded] = useState(false);
  useEffect(() => {
    if (!landed) { setSiteId(settings.startOnAllSites ? "__all__" : siteId); setLanded(true); }
  }, [landed, settings.startOnAllSites, siteId]);

  const { data, isLoading } = useSchedulePreview(weekStart);
  const { data: requests } = useOrgScheduleRequests();
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

  const isAll = siteId === "__all__";
  const currentSite = sites.find((s) => s.id === siteId);
  const weekEnd = days[6];
  const weekLabel = `${weekStart.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${weekEnd.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
  const orgName = org?.organization_name ?? "Your agency";

  return (
    <Shell>
      {/* ── Header ───────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 14, marginBottom: 14 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, letterSpacing: "-.02em", color: SCHED.ink }}>Scheduler</h1>
          <p style={{ margin: "4px 0 0", color: SCHED.muted, fontWeight: 500 }}>
            {orgName} · click any shift to edit, or a + on an open slot to add one
          </p>
        </div>
        <div style={{ display: "flex", gap: 9, alignItems: "center", flexWrap: "wrap" }}>
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
            <HomePill key={s.id} active={siteId === s.id} label={s.name} gap={!!siteHasGap.get(s.id)} onClick={() => setSiteId(s.id)} />
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
          />
        ) : currentSite ? (
          <SiteWeekGrid
            key={currentSite.id}
            siteId={currentSite.id} siteName={currentSite.name} days={days}
            clients={siteClients.get(currentSite.id) ?? []} shifts={siteShifts.get(currentSite.id) ?? []}
            staff={data?.staff ?? []} view={view} settings={settings} onOpenEditor={openEditor}
          />
        ) : (
          <div style={{ padding: 40, textAlign: "center", color: SCHED.muted, fontSize: 13 }}>No sites or 1-on-1 clients yet.</div>
        )}
      </div>

      {/* ── Week strip (requests) ─────────────────────────────────────── */}
      <RequestsPanel weekStart={weekStart} staff={data?.staff ?? []} />

      <p style={{ marginTop: 14, color: SCHED.muted, fontSize: 12.5, textAlign: "center" }}>
        Site type inferred from shift codes (HHS, RHS, DSG, RL6, RP3–5 = residential). Clients with no team are grouped as “1-on-1 Services”.
      </p>

      <SettingsDrawer open={settingsOpen} onOpenChange={setSettingsOpen} settings={settings} onChange={setSettings} />

      <ShiftEditorDialog
        open={editorOpen} onOpenChange={setEditorOpen} ctx={editorCtx}
        clients={data?.clients ?? []} staff={data?.staff ?? []} siteId={siteId}
        weekStartIso={weekStart.toISOString()} approvedTimeOff={approvedTimeOff}
      />

      {org?.organization_id && (
        <ShiftCreateDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          organizationId={org.organization_id}
          clients={(data?.clients ?? []).map((c) => ({ id: c.id, name: `${c.first_name} ${c.last_name}`.trim() }))}
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

function HomePill({ active, label, gap, onClick }: { active: boolean; label: string; gap?: boolean; onClick: () => void }) {
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

// ── All-homes status board ────────────────────────────────────────────
function AllHomesBoard({
  days, sites, siteClients, siteShifts, settings, onPickSite,
}: {
  days: Date[];
  sites: { id: string; name: string }[];
  siteClients: Map<string, ClientRow[]>;
  siteShifts: Map<string, ShiftRow[]>;
  settings: Settings;
  onPickSite: (id: string) => void;
}) {
  if (sites.length === 0) return <div style={{ padding: 40, textAlign: "center", color: SCHED.muted, fontSize: 13 }}>No sites yet.</div>;
  return (
    <>
      <table style={grid}>
        <thead>
          <tr>
            <th style={{ ...gTh, ...gThLeft, width: 150 }}>Home</th>
            {days.map((d, i) => <th key={i} style={gTh}>{DAY_LABELS[d.getDay()]} {d.getDate()}</th>)}
          </tr>
        </thead>
        <tbody>
          {sites.map((s) => {
            const clients = siteClients.get(s.id) ?? [];
            const shifts = siteShifts.get(s.id) ?? [];
            const type = inferSiteType(s.id, clients, shifts);
            return (
              <tr key={s.id} style={{ cursor: "pointer" }} onClick={() => onPickSite(s.id)} className="sched-drill">
                <td style={rowHead}>
                  {s.name}
                  {settings.showResidentCount && (
                    <small style={rowHeadSmall}>{type === "residential" ? "Residential" : "Day / 1:1"} · {clients.length} {clients.length === 1 ? "person" : "people"}</small>
                  )}
                </td>
                {days.map((d, i) => {
                  const de = shifts.filter((sh) => sameDay(new Date(sh.starts_at), d));
                  const open = de.filter((sh) => !sh.staff_id).length;
                  const setCnt = de.length - open;
                  let content: React.ReactNode;
                  if (de.length === 0) content = <div style={{ ...statusBase, color: "#c4c8d4" }}>—</div>;
                  else if (open > 0) content = <div style={{ ...statusBase, ...statusOpen }}><span style={dot} />{open} open</div>;
                  else if (type === "residential") content = <div style={{ ...statusBase, ...statusCov }}>✓ 24h</div>;
                  else content = <div style={{ ...statusBase, ...statusCov }}><span style={dot} />{setCnt} set</div>;
                  return <td key={i} style={gTd}>{content}</td>;
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
      <div style={hint}>Each cell shows coverage status. Click a home to open its full week.</div>
    </>
  );
}

// ── Single-home week grid ─────────────────────────────────────────────
function SiteWeekGrid({
  siteId, siteName, days, clients, shifts, staff, view, settings, onOpenEditor,
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
        }))}
      />
    </div>
  );
}

function ShiftChip({
  shift, view, settings, staffName, clientName, onClick,
}: {
  shift: ShiftRow;
  view: ViewMode;
  settings: Settings;
  staffName: string;
  clientName: string;
  onClick: () => void;
}) {
  const compact = settings.density === "compact";
  const isOpen = !shift.staff_id;
  const label = shiftTypeLabel(shift);

  if (isOpen) {
    return (
      <button className="sched-chip" onClick={onClick} style={{ ...chipBase, ...(compact ? chipCompact : null), background: SCHED.gapBg, borderColor: "#f3c9c6", color: SCHED.gap, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
        <span>{label} · open</span>
        <span style={{ background: SCHED.gap, color: "#fff", borderRadius: 6, fontSize: 9.5, padding: "2px 6px", fontWeight: 700 }}>Assign</span>
      </button>
    );
  }

  const hex = settings.colorBy === "staff" && shift.staff_id ? staffHex(shift.staff_id) : shiftAccentHex(shift);
  let top: string;
  let sub: string;
  if (view === "staff") { top = label; sub = settings.showTimes ? `${fmtTime(shift.starts_at)}–${fmtTime(shift.ends_at)}` : ""; }
  else if (view === "client") { top = staffName; sub = `${label}${settings.showTimes ? ` · ${fmtTime(shift.starts_at)}–${fmtTime(shift.ends_at)}` : ""}`; }
  else { top = label; sub = `${clientName}${settings.showTimes ? ` · ${fmtTime(shift.starts_at)}–${fmtTime(shift.ends_at)}` : ""}`; }

  return (
    <button
      className="sched-chip"
      onClick={onClick}
      title={`${label} · ${fmtTime(shift.starts_at)}–${fmtTime(shift.ends_at)} — click to edit`}
      style={{ ...chipBase, ...(compact ? chipCompact : null), background: hex + "1a", borderColor: hex + "55", color: hex, opacity: shift.published ? 1 : 0.8 }}
    >
      <span>{top}</span>
      {sub && <small style={{ display: "block", fontWeight: 500, opacity: 0.82, fontSize: compact ? 9.5 : 10 }}>{sub}</small>}
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
