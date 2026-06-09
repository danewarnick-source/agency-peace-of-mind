import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, CalendarDays, Sparkles, Home } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-org";
import { Button } from "@/components/ui/button";

type Zoom = "day" | "week" | "month";
type Health = "healthy" | "advisory" | "gap" | "na" | "none";

type Team = { id: string; team_name: string; setting: string | null };
type Client = { id: string; team_id: string | null; first_name: string; last_name: string };
type Ratio = { client_id: string; ratio_staff: number; ratio_clients: number; effective_start: string; effective_end: string | null };
type Shift = { staff_id: string; client_id: string; job_code: string | null; starts_at: string; ends_at: string; status: string };
type Code = { code: string; kind: string | null };

const DAY_PROGRAM_SETTINGS = new Set(["day_program", "day", "dsg"]);

const HEALTH_BG: Record<Health, string> = {
  healthy: "bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-200",
  advisory: "bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/40 dark:text-amber-200",
  gap: "bg-rose-100 text-rose-900 border-rose-300 dark:bg-rose-950/40 dark:text-rose-200",
  na: "bg-muted/40 text-muted-foreground border-border",
  none: "bg-slate-100 text-slate-600 border-slate-300 dark:bg-slate-900/40 dark:text-slate-300",
};
const HEALTH_LABEL: Record<Health, string> = {
  healthy: "In ratio", advisory: "Watch coverage", gap: "Gap", na: "N/A", none: "No ratio",
};

function startOfDay(d: Date) { const x = new Date(d); x.setHours(0,0,0,0); return x; }
function isoDay(d: Date) { return startOfDay(d).toISOString().slice(0,10); }
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate()+n); return x; }
function startOfWeek(d: Date) { const x = startOfDay(d); x.setDate(x.getDate() - x.getDay()); return x; }
function startOfMonth(d: Date) { return startOfDay(new Date(d.getFullYear(), d.getMonth(), 1)); }
function endOfMonth(d: Date) { const x = startOfDay(new Date(d.getFullYear(), d.getMonth()+1, 0)); x.setHours(23,59,59,999); return x; }

function ratiosOn(ratios: Ratio[], dayISO: string) {
  const m = new Map<string, Ratio>();
  for (const r of ratios) {
    if (r.effective_start > dayISO) continue;
    if (r.effective_end && r.effective_end < dayISO) continue;
    m.set(r.client_id, r);
  }
  return m;
}

function computeHomeRequired(clientsInHome: Client[], ratioByClient: Map<string, Ratio>) {
  const groups = new Map<string, { rs: number; rc: number; n: number }>();
  let configured = 0;
  for (const c of clientsInHome) {
    const r = ratioByClient.get(c.id);
    if (!r) continue;
    configured++;
    const key = r.ratio_clients === 1 ? `solo:${c.id}` : `${r.ratio_staff}:${r.ratio_clients}`;
    const g = groups.get(key);
    if (g) g.n++; else groups.set(key, { rs: r.ratio_staff, rc: r.ratio_clients, n: 1 });
  }
  let required = 0;
  for (const g of groups.values()) required += Math.ceil(g.n / g.rc) * g.rs;
  return { required, configured, totalClients: clientsInHome.length };
}

function cellHealth(p: { closed: boolean; required: number; configured: number; assigned: number }): Health {
  if (p.closed) return "na";
  if (p.configured === 0 || p.required === 0) return "none";
  if (p.assigned >= p.required) return "healthy";
  if (p.assigned === 0) return "gap";
  return "advisory";
}

function buildIndexes(data: { teams: Team[]; clients: Client[]; ratios: Ratio[]; shifts: Shift[]; codes: Code[] }) {
  const clientsByTeam = new Map<string, Client[]>();
  for (const c of data.clients) { if (!c.team_id) continue; const arr = clientsByTeam.get(c.team_id) ?? []; arr.push(c); clientsByTeam.set(c.team_id, arr); }
  const discreteCodes = new Set(data.codes.filter((c) => c.kind === "discrete").map((c) => c.code));
  return { clientsByTeam, discreteCodes };
}

function homeCellMetrics(home: Team, day: Date, data: { teams: Team[]; clients: Client[]; ratios: Ratio[]; shifts: Shift[]; codes: Code[] }, idx: ReturnType<typeof buildIndexes>) {
  const dow = day.getDay();
  const closed = !!(home.setting && DAY_PROGRAM_SETTINGS.has(home.setting) && (dow === 0 || dow === 6));
  const clientsInHome = idx.clientsByTeam.get(home.id) ?? [];
  const ratioMap = ratiosOn(data.ratios, isoDay(day));
  const { required, configured, totalClients } = computeHomeRequired(clientsInHome, ratioMap);
  const homeClientIds = new Set(clientsInHome.map((c) => c.id));
  const key = isoDay(day);
  const dayShifts = data.shifts.filter((s) => homeClientIds.has(s.client_id) && isoDay(new Date(s.starts_at)) === key);
  const assigned = new Set(dayShifts.map((s) => s.staff_id)).size;
  const hasDiscrete = dayShifts.some((s) => s.job_code && idx.discreteCodes.has(s.job_code));
  return { closed, required, configured, totalClients, assigned, hasDiscrete, health: cellHealth({ closed, required, configured, assigned }) };
}

export function CoverageViews() {
  const { data: org } = useCurrentOrg();
  const orgId = org?.organization_id ?? null;
  const [zoom, setZoom] = useState<Zoom>("week");
  const [anchor, setAnchor] = useState<Date>(() => startOfDay(new Date()));

  const range = useMemo(() => {
    if (zoom === "day") return { from: anchor, to: anchor };
    if (zoom === "week") { const s = startOfWeek(anchor); return { from: s, to: addDays(s, 6) }; }
    return { from: startOfMonth(anchor), to: endOfMonth(anchor) };
  }, [zoom, anchor]);

  const { data, isLoading } = useQuery({
    enabled: !!orgId,
    queryKey: ["coverage-views", orgId, range.from.toISOString(), range.to.toISOString()],
    queryFn: async () => {
      const fromISO = range.from.toISOString();
      const toISO = new Date(range.to.getTime() + 24*3600_000 - 1).toISOString();
      const [teamsRes, clientsRes, ratiosRes, shiftsRes, codesRes] = await Promise.all([
        (supabase as any).from("teams").select("id, team_name, setting").eq("organization_id", orgId).order("team_name"),
        (supabase as any).from("clients").select("id, team_id, first_name, last_name").eq("organization_id", orgId).eq("account_status", "active"),
        (supabase as any).from("client_ratios").select("client_id, ratio_staff, ratio_clients, effective_start, effective_end").eq("organization_id", orgId),
        (supabase as any).from("scheduled_shifts").select("staff_id, client_id, job_code, starts_at, ends_at, status").eq("organization_id", orgId).gte("starts_at", fromISO).lte("starts_at", toISO).neq("status", "declined"),
        (supabase as any).from("provider_authorized_codes").select("code, kind").eq("organization_id", orgId),
      ]);
      if (teamsRes.error) throw teamsRes.error;
      return {
        teams: (teamsRes.data ?? []) as Team[],
        clients: (clientsRes.data ?? []) as Client[],
        ratios: (ratiosRes.data ?? []) as Ratio[],
        shifts: (shiftsRes.data ?? []) as Shift[],
        codes: (codesRes.data ?? []) as Code[],
      };
    },
  });

  const navLabel = useMemo(() => {
    if (zoom === "day") return anchor.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric", year: "numeric" });
    if (zoom === "week") {
      const s = startOfWeek(anchor); const e = addDays(s, 6);
      return `${s.toLocaleDateString(undefined,{month:"short",day:"numeric"})} – ${e.toLocaleDateString(undefined,{month:"short",day:"numeric",year:"numeric"})}`;
    }
    return anchor.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  }, [zoom, anchor]);

  function nav(dir: -1 | 1) {
    setAnchor((a) => {
      if (zoom === "day") return addDays(a, dir);
      if (zoom === "week") return addDays(a, dir * 7);
      const n = new Date(a); n.setMonth(n.getMonth() + dir); return startOfDay(n);
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-base font-semibold">Coverage</h2>
          <span className="text-xs text-muted-foreground">advisory · reads ratios & shifts</span>
        </div>
        <div role="tablist" aria-label="Zoom level" className="inline-flex rounded-lg border border-border bg-muted/40 p-1">
          {(["day","week","month"] as Zoom[]).map((z) => (
            <button key={z} role="tab" aria-selected={zoom===z} onClick={() => setZoom(z)}
              className={`min-h-[36px] rounded-md px-3 text-sm font-semibold capitalize transition ${zoom===z ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >{z}</button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <Button variant="outline" size="icon" onClick={() => nav(-1)} aria-label="Previous"><ChevronLeft className="h-4 w-4" /></Button>
        <div className="flex flex-col items-center">
          <p className="text-sm font-semibold">{navLabel}</p>
          <button className="text-[11px] uppercase tracking-wide text-[#137182] hover:underline" onClick={() => setAnchor(startOfDay(new Date()))}>Today</button>
        </div>
        <Button variant="outline" size="icon" onClick={() => nav(1)} aria-label="Next"><ChevronRight className="h-4 w-4" /></Button>
      </div>

      {isLoading || !data ? (
        <p className="text-sm text-muted-foreground">Loading coverage…</p>
      ) : data.teams.length === 0 ? (
        <NoHomesEmpty />
      ) : null}
      {data && data.teams.length > 0 && (zoom === "week" ? (
        <WeekMatrix data={data} anchor={anchor} onDrill={(d) => { setAnchor(d); setZoom("day"); }} />
      ) : zoom === "month" ? (
        <MonthHeatmap data={data} anchor={anchor} onDrill={(d) => { setAnchor(d); setZoom("day"); }} />
      ) : (
        <DayBreakdown data={data} anchor={anchor} />
      ))}
      {/* placeholder removed by structural change */}
      {false && (
        <p className="text-sm text-muted-foreground">Loading coverage…</p>
      )}
      ) : zoom === "week" ? (
        <WeekMatrix data={data} anchor={anchor} onDrill={(d) => { setAnchor(d); setZoom("day"); }} />
      ) : zoom === "month" ? (
        <MonthHeatmap data={data} anchor={anchor} onDrill={(d) => { setAnchor(d); setZoom("day"); }} />
      ) : (
        <DayBreakdown data={data} anchor={anchor} />
      )}

      <Legend />
    </div>
  );
}

function WeekMatrix({ data, anchor, onDrill }: { data: any; anchor: Date; onDrill: (d: Date) => void }) {
  const idx = buildIndexes(data);
  const start = startOfWeek(anchor);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const today = isoDay(new Date());
  if (data.teams.length === 0) return <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">No homes yet.</p>;
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[720px] text-sm">
        <thead className="bg-muted/40">
          <tr>
            <th className="sticky left-0 z-10 bg-muted/40 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Home</th>
            {days.map((d) => {
              const isToday = isoDay(d) === today;
              return (
                <th key={d.toISOString()} className={`px-2 py-2 text-center text-xs font-semibold ${isToday ? "text-[#137182]" : "text-muted-foreground"}`}>
                  <div>{d.toLocaleDateString(undefined,{weekday:"short"})}</div>
                  <div className="tabular-nums">{d.getDate()}</div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {data.teams.map((home: Team) => (
            <tr key={home.id} className="border-t border-border">
              <td className="sticky left-0 z-10 bg-card px-3 py-2 align-top">
                <div className="font-medium">{home.team_name}</div>
                {home.setting && <div className="text-[11px] text-muted-foreground">{home.setting}</div>}
              </td>
              {days.map((d) => {
                const m = homeCellMetrics(home, d, data, idx);
                return (
                  <td key={d.toISOString()} className="p-1 align-top">
                    <button onClick={() => onDrill(d)}
                      className={`group w-full rounded-md border px-2 py-1.5 text-left transition hover:ring-2 hover:ring-[#137182]/40 ${HEALTH_BG[m.health]}`}
                      title={`${HEALTH_LABEL[m.health]} · ${m.assigned}/${m.required} staff`}>
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-[10px] font-bold uppercase tracking-wide">{HEALTH_LABEL[m.health]}</span>
                        {m.hasDiscrete && <Sparkles className="h-3 w-3" aria-label="1:1 service scheduled" />}
                      </div>
                      {!m.closed && <div className="mt-0.5 text-[11px] tabular-nums opacity-80">{m.assigned}/{m.required} staff</div>}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MonthHeatmap({ data, anchor, onDrill }: { data: any; anchor: Date; onDrill: (d: Date) => void }) {
  const idx = buildIndexes(data);
  const monthStart = startOfMonth(anchor);
  const gridStart = startOfWeek(monthStart);
  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const today = isoDay(new Date());
  function orgHealth(day: Date): Health {
    let worst: Health = "healthy"; let any = false;
    for (const t of data.teams as Team[]) {
      const m = homeCellMetrics(t, day, data, idx);
      if (m.health === "na" || m.health === "none") continue;
      any = true;
      if (m.health === "gap") return "gap";
      if (m.health === "advisory") worst = "advisory";
    }
    return any ? worst : "none";
  }
  return (
    <div className="rounded-lg border border-border">
      <div className="grid grid-cols-7 border-b border-border bg-muted/40 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((d) => <div key={d} className="py-2">{d}</div>)}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((d) => {
          const inMonth = d.getMonth() === monthStart.getMonth();
          const h = inMonth ? orgHealth(d) : "na";
          const isToday = isoDay(d) === today;
          return (
            <button key={d.toISOString()} onClick={() => onDrill(d)}
              className={`flex min-h-[68px] flex-col items-start gap-1 border-b border-r border-border p-1.5 text-left transition hover:ring-2 hover:ring-inset hover:ring-[#137182]/40 ${
                inMonth ? HEALTH_BG[h] : "bg-muted/20 text-muted-foreground/60"
              } ${isToday ? "outline outline-2 outline-[#137182]" : ""}`}>
              <span className="text-xs font-bold tabular-nums">{d.getDate()}</span>
              {inMonth && h !== "none" && <span className="text-[10px] uppercase tracking-wide opacity-80">{HEALTH_LABEL[h]}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function DayBreakdown({ data, anchor }: { data: any; anchor: Date }) {
  const idx = buildIndexes(data);
  if (data.teams.length === 0) return <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">No homes yet.</p>;
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {data.teams.map((home: Team) => {
        const m = homeCellMetrics(home, anchor, data, idx);
        return (
          <div key={home.id} className={`rounded-lg border p-3 ${HEALTH_BG[m.health]}`}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-semibold">{home.team_name}</div>
                {home.setting && <div className="text-[11px] opacity-80">{home.setting}</div>}
              </div>
              <span className="rounded-full bg-card/60 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">{HEALTH_LABEL[m.health]}</span>
            </div>
            {!m.closed && (
              <div className="mt-2 flex items-center justify-between text-xs">
                <span className="tabular-nums">{m.assigned} of {m.required} staff scheduled</span>
                {m.hasDiscrete && <span className="inline-flex items-center gap-1"><Sparkles className="h-3 w-3" /> 1:1 service</span>}
              </div>
            )}
            {m.configured === 0 && m.totalClients > 0 && <p className="mt-1 text-[11px] opacity-80">No ratios set for any resident.</p>}
          </div>
        );
      })}
    </div>
  );
}

function Legend() {
  const items: { h: Health; label: string }[] = [
    { h: "healthy", label: "In ratio" }, { h: "advisory", label: "Watch coverage" },
    { h: "gap", label: "Coverage gap" }, { h: "none", label: "No ratio set" }, { h: "na", label: "Closed / N/A" },
  ];
  return (
    <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
      {items.map((i) => (
        <span key={i.h} className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 ${HEALTH_BG[i.h]}`}>
          <span className="h-1.5 w-1.5 rounded-full bg-current opacity-60" />{i.label}
        </span>
      ))}
      <span className="inline-flex items-center gap-1"><Sparkles className="h-3 w-3" /> 1:1 service scheduled</span>
    </div>
  );
}
