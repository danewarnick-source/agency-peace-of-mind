import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Sparkles, Copy, Eraser, Send, AlertTriangle, Check, Loader2, ChevronLeft, ChevronRight, Home, Wand2 } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-org";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { parseCoverageSentence, type NectarCoverageResult, type NectarCoveragePlan } from "@/lib/nectar-schedule-parse.functions";

type Team = { id: string; team_name: string; setting: string | null };
type Client = { id: string; first_name: string; last_name: string; team_id: string | null };
type Ratio = { client_id: string; ratio_staff: number; ratio_clients: number; effective_start: string; effective_end: string | null };
type Template = { id: string; name: string; start_time: string; end_time: string; sort: number | null; team_id: string | null };
type Staff = { id: string; full_name: string | null; email: string | null };
type BillingCode = { client_id: string; service_code: string; annual_unit_authorization: number | null; weekly_cap_units: number | null };
type Code = { id: string; code: string; kind: string | null };
type Shift = { id: string; client_id: string; staff_id: string; starts_at: string; ends_at: string; status: string; published: boolean; code_id: string | null; job_code: string | null };

type Unit = {
  key: string;
  label: string;
  clientIds: string[];
  staffNeeded: number;
};

type Assignment = {
  unitKey: string;
  dayISO: string;
  bandId: string;
  slotIdx: number; // 0..staffNeeded-1
  staffId: string | null;
};

const DEFAULT_BANDS: Template[] = [
  { id: "default-day", name: "Day", start_time: "07:00:00", end_time: "15:00:00", sort: 1, team_id: null },
  { id: "default-eve", name: "Evening", start_time: "15:00:00", end_time: "23:00:00", sort: 2, team_id: null },
  { id: "default-noc", name: "Overnight", start_time: "23:00:00", end_time: "07:00:00", sort: 3, team_id: null },
];

function startOfDay(d: Date) { const x = new Date(d); x.setHours(0,0,0,0); return x; }
function startOfWeek(d: Date) { const x = startOfDay(d); x.setDate(x.getDate() - x.getDay()); return x; }
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate()+n); return x; }
function isoDay(d: Date) { return startOfDay(d).toISOString().slice(0,10); }

function combineDateTime(dayISO: string, hms: string, addOneDay = false): string {
  const [h, m, s] = hms.split(":").map(Number);
  const d = new Date(`${dayISO}T00:00:00`);
  if (addOneDay) d.setDate(d.getDate() + 1);
  d.setHours(h ?? 0, m ?? 0, s ?? 0, 0);
  return d.toISOString();
}

function bandTimes(dayISO: string, band: Template) {
  const startISO = combineDateTime(dayISO, band.start_time);
  const overnight = band.end_time <= band.start_time;
  const endISO = combineDateTime(dayISO, band.end_time, overnight);
  return { startISO, endISO, overnight };
}

function ratiosOn(ratios: Ratio[], dayISO: string) {
  // Advisory view: evaluate ratios as of max(day, today) so a ratio set today
  // applies to the current week even on days earlier in the week. Matches the
  // Homes & Teams card, which always reads "today".
  const todayISO = new Date().toISOString().slice(0, 10);
  const asOf = dayISO > todayISO ? dayISO : todayISO;
  const m = new Map<string, Ratio>();
  for (const r of ratios) {
    if (r.effective_start > asOf) continue;
    if (r.effective_end && r.effective_end < asOf) continue;
    m.set(r.client_id, r);
  }
  return m;
}

function buildUnits(home: Team, clients: Client[], ratioMap: Map<string, Ratio>): Unit[] {
  const homeClients = clients.filter((c) => c.team_id === home.id);
  const units: Unit[] = [];
  const grouped = new Map<string, { clients: Client[]; rs: number; rc: number }>();
  for (const c of homeClients) {
    const r = ratioMap.get(c.id);
    if (!r || r.ratio_clients === 1) {
      units.push({
        key: `solo:${c.id}`,
        label: `${c.first_name} ${c.last_name}`,
        clientIds: [c.id],
        staffNeeded: r?.ratio_staff ?? 1,
      });
      continue;
    }
    const k = `${r.ratio_staff}:${r.ratio_clients}`;
    const g = grouped.get(k);
    if (g) g.clients.push(c);
    else grouped.set(k, { clients: [c], rs: r.ratio_staff, rc: r.ratio_clients });
  }
  for (const [k, g] of grouped.entries()) {
    for (let i = 0; i < g.clients.length; i += g.rc) {
      const slice = g.clients.slice(i, i + g.rc);
      units.push({
        key: `grp:${k}:${i}`,
        label: slice.map((c) => `${c.first_name} ${c.last_name.charAt(0)}.`).join(" + "),
        clientIds: slice.map((c) => c.id),
        staffNeeded: g.rs,
      });
    }
  }
  return units;
}

function assignmentKey(unitKey: string, dayISO: string, bandId: string, slotIdx: number) {
  return `${unitKey}|${dayISO}|${bandId}|${slotIdx}`;
}

export function ScheduleBuilder() {
  const { data: org } = useCurrentOrg();
  const { user } = useAuth();
  const orgId = org?.organization_id ?? null;
  const qc = useQueryClient();
  const [homeId, setHomeId] = useState<string>("");
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date()));
  const [assignments, setAssignments] = useState<Map<string, string | null>>(new Map());
  const [statuses, setStatuses] = useState<Map<string, string>>(new Map());
  const [drafts, setDrafts] = useState<Set<string>>(new Set());
  const [publishing, setPublishing] = useState(false);
  const [askOpen, setAskOpen] = useState(false);

  const weekEnd = addDays(weekStart, 6);
  const weekDays = useMemo(() => Array.from({length:7}, (_,i) => addDays(weekStart, i)), [weekStart]);

  const { data: teams = [] } = useQuery({
    enabled: !!orgId,
    queryKey: ["builder-teams", orgId],
    queryFn: async (): Promise<Team[]> => {
      const { data, error } = await (supabase as any).from("teams")
        .select("id, team_name, setting").eq("organization_id", orgId).order("team_name");
      if (error) throw error;
      return data ?? [];
    },
  });

  // auto-select first home
  if (!homeId && teams.length) setTimeout(() => setHomeId(teams[0].id), 0);

  const dataQ = useQuery({
    enabled: !!orgId && !!homeId,
    queryKey: ["builder-data", orgId, homeId, weekStart.toISOString()],
    queryFn: async () => {
      const fromISO = weekStart.toISOString();
      const toISO = new Date(addDays(weekStart, 7).getTime() - 1).toISOString();
      const lastWeekFrom = addDays(weekStart, -7).toISOString();
      const lastWeekTo = new Date(weekStart.getTime() - 1).toISOString();
      const [clientsR, ratiosR, tmplOverride, tmplOrg, designR, shiftsR, lastWeekR, billingR, codesR, memsR] = await Promise.all([
        (supabase as any).from("clients").select("id, first_name, last_name, team_id").eq("organization_id", orgId).eq("account_status","active"),
        (supabase as any).from("client_ratios").select("client_id, ratio_staff, ratio_clients, effective_start, effective_end").eq("organization_id", orgId),
        (supabase as any).from("shift_templates").select("id, name, start_time, end_time, sort, team_id").eq("team_id", homeId).eq("active", true).order("sort"),
        (supabase as any).from("shift_templates").select("id, name, start_time, end_time, sort, team_id").eq("organization_id", orgId).is("team_id", null).eq("active", true).order("sort"),
        (supabase as any).from("home_staff_designations").select("staff_id").eq("organization_id", orgId).eq("team_id", homeId),
        (supabase as any).from("scheduled_shifts").select("id, client_id, staff_id, starts_at, ends_at, status, published, code_id, job_code").eq("organization_id", orgId).gte("starts_at", fromISO).lte("starts_at", toISO),
        (supabase as any).from("scheduled_shifts").select("client_id, staff_id, starts_at, ends_at, code_id, job_code").eq("organization_id", orgId).gte("starts_at", lastWeekFrom).lte("starts_at", lastWeekTo),
        (supabase as any).from("client_billing_codes").select("client_id, service_code, annual_unit_authorization, weekly_cap_units").eq("organization_id", orgId),
        (supabase as any).from("provider_authorized_codes").select("id, code, kind").eq("organization_id", orgId),
        (supabase as any).from("organization_members").select("user_id").eq("organization_id", orgId).eq("active", true),
      ]);
      const clients = (clientsR.data ?? []) as Client[];
      const ratios = (ratiosR.data ?? []) as Ratio[];
      let templates = (tmplOverride.data ?? []) as Template[];
      if (templates.length === 0) templates = (tmplOrg.data ?? []) as Template[];
      if (templates.length === 0) templates = DEFAULT_BANDS;
      const designated = new Set(((designR.data ?? []) as any[]).map((d) => d.staff_id));
      // Resolve staff pool from organization_members + profiles (same source
      // Homes & Teams uses), so the home's care team always appears here.
      const memberIds = ((memsR.data ?? []) as any[]).map((m) => m.user_id as string);
      let allStaff: Staff[] = [];
      if (memberIds.length) {
        const { data: profs } = await (supabase as any)
          .from("profiles").select("id, full_name, email").in("id", memberIds);
        allStaff = ((profs ?? []) as Staff[]).filter((s) => !!s.id);
      }
      const homeStaff = allStaff.filter((s) => designated.has(s.id));
      return {
        clients,
        ratios,
        templates,
        homeStaff,
        allStaff,
        shifts: (shiftsR.data ?? []) as Shift[],
        lastWeekShifts: (lastWeekR.data ?? []) as Shift[],
        billing: (billingR.data ?? []) as BillingCode[],
        codes: (codesR.data ?? []) as Code[],
      };
    },
  });

  const data = dataQ.data;
  const home = teams.find((t) => t.id === homeId) ?? null;

  // Load existing published shifts into assignments map on data change
  useMemo(() => {
    if (!data || !home) return;
    const ratioMap = ratiosOn(data.ratios, isoDay(weekDays[0]));
    const units = buildUnits(home, data.clients, ratioMap);
    const next = new Map<string, string | null>();
    const nextStatus = new Map<string, string>();
    for (const sh of data.shifts) {
      const day = isoDay(new Date(sh.starts_at));
      const start = new Date(sh.starts_at);
      const hhmm = `${String(start.getHours()).padStart(2,"0")}:${String(start.getMinutes()).padStart(2,"0")}:00`;
      const band = data.templates.find((b) => b.start_time === hhmm) ?? data.templates[0];
      if (!band) continue;
      const unit = units.find((u) => u.clientIds.includes(sh.client_id));
      if (!unit) continue;
      // find first empty slot
      for (let i = 0; i < unit.staffNeeded; i++) {
        const k = assignmentKey(unit.key, day, band.id, i);
        if (!next.has(k)) {
          next.set(k, sh.staff_id);
          if (sh.published) nextStatus.set(k, sh.status);
          break;
        }
      }
    }
    setAssignments(next);
    setStatuses(nextStatus);
    setDrafts(new Set());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, home?.id, weekStart.toISOString()]);

  if (!org) return <p className="text-sm text-muted-foreground">Loading…</p>;

  const units = data && home ? buildUnits(home, data.clients, ratiosOn(data.ratios, isoDay(weekStart))) : [];
  const bands = data?.templates ?? [];
  const homeStaff = data?.homeStaff ?? [];

  // staff already used in a given day+band+slot context (for "no overtime" advisory we use weekly total)
  const staffWeekHours = useMemo(() => {
    const counts = new Map<string, number>();
    if (!data) return counts;
    for (const [k, sid] of assignments.entries()) {
      if (!sid) continue;
      const [, , bandId] = k.split("|");
      const band = bands.find((b) => b.id === bandId);
      if (!band) continue;
      const [sh, sm] = band.start_time.split(":").map(Number);
      const [eh, em] = band.end_time.split(":").map(Number);
      let hrs = (eh*60+em) - (sh*60+sm);
      if (hrs <= 0) hrs += 24*60;
      counts.set(sid, (counts.get(sid) ?? 0) + hrs/60);
    }
    return counts;
  }, [assignments, bands, data]);

  // Continuity: for each client, last week's staff per band
  const continuity = useMemo(() => {
    const m = new Map<string, Set<string>>();
    if (!data) return m;
    for (const sh of data.lastWeekShifts) {
      const arr = m.get(sh.client_id) ?? new Set();
      arr.add(sh.staff_id); m.set(sh.client_id, arr);
    }
    return m;
  }, [data]);

  function setAssignment(key: string, staffId: string | null) {
    setAssignments((prev) => { const next = new Map(prev); if (staffId === null) next.delete(key); else next.set(key, staffId); return next; });
    // Manual edits promote a draft cell to a confirmed assignment (or clear it),
    // and clear any stale published status — it'll be re-set on next Publish.
    setDrafts((prev) => { if (!prev.has(key)) return prev; const next = new Set(prev); next.delete(key); return next; });
    setStatuses((prev) => { if (!prev.has(key)) return prev; const next = new Map(prev); next.delete(key); return next; });
  }

  function nectarDraft() {
    if (!data || !home) return;
    const pool = homeStaff.length ? homeStaff : data.allStaff;
    if (!pool.length) { toast.error("No staff to draft from. Add staff in Homes & Teams."); return; }
    const next = new Map(assignments);
    const newDrafts = new Set(drafts);
    let proposed = 0;
    let leftOpen = 0;
    for (const day of weekDays) {
      const dISO = isoDay(day);
      for (const band of bands) {
        // Track staff already booked in this day+band across any unit (existing + just-proposed)
        const usedThisBand = new Set<string>();
        for (const unit of units) {
          for (let i = 0; i < unit.staffNeeded; i++) {
            const k = assignmentKey(unit.key, dISO, band.id, i);
            const existing = next.get(k);
            if (existing) { usedThisBand.add(existing); }
          }
        }
        for (const unit of units) {
          // Prefer continuity for this unit's primary client (assigned here before)
          const cont = continuity.get(unit.clientIds[0]) ?? new Set<string>();
          const ranked = [...pool].sort((a, b) => {
            const ac = cont.has(a.id) ? -1 : 0;
            const bc = cont.has(b.id) ? -1 : 0;
            return ac - bc;
          });
          for (let i = 0; i < unit.staffNeeded; i++) {
            const k = assignmentKey(unit.key, dISO, band.id, i);
            if (next.get(k)) continue; // don't overwrite existing assignment
            // pick first ranked staffer not already booked in this band
            const pick = ranked.find((s) => !usedThisBand.has(s.id));
            if (!pick) { leftOpen++; continue; } // not enough staff — leave open as a coverage gap
            next.set(k, pick.id);
            newDrafts.add(k);
            usedThisBand.add(pick.id);
            proposed++;
          }
        }
      }
    }
    setAssignments(next);
    setDrafts(newDrafts);
    if (proposed === 0) {
      toast.message("Nothing to draft — all slots are already filled.");
    } else {
      toast.success(`NECTAR proposed ${proposed} slot${proposed===1?"":"s"}${leftOpen ? `; ${leftOpen} left open (not enough team).` : "."} Nothing is published — review and edit, then Publish.`);
    }
  }

  function copyLastWeek() {
    if (!data || !home) return;
    const next = new Map<string, string | null>();
    const ratioMap = ratiosOn(data.ratios, isoDay(weekDays[0]));
    const us = buildUnits(home, data.clients, ratioMap);
    for (const sh of data.lastWeekShifts) {
      const lastDate = new Date(sh.starts_at);
      const shifted = addDays(lastDate, 7);
      const dISO = isoDay(shifted);
      const hhmm = `${String(lastDate.getHours()).padStart(2,"0")}:${String(lastDate.getMinutes()).padStart(2,"0")}:00`;
      const band = bands.find((b) => b.start_time === hhmm) ?? bands[0];
      if (!band) continue;
      const unit = us.find((u) => u.clientIds.includes(sh.client_id));
      if (!unit) continue;
      for (let i = 0; i < unit.staffNeeded; i++) {
        const k = assignmentKey(unit.key, dISO, band.id, i);
        if (!next.has(k)) { next.set(k, sh.staff_id); break; }
      }
    }
    setAssignments(next);
    setDrafts(new Set());
    toast.success("Copied last week's pattern.");
  }

  function applyCoveragePicks(plan: NectarCoveragePlan): { applied: number; skipped: number } {
    let applied = 0;
    let skipped = 0;
    const next = new Map(assignments);
    const newDrafts = new Set(drafts);
    for (const p of plan.picks) {
      const unit = units.find((u) => u.key === p.unit_key);
      if (!unit) { skipped++; continue; }
      // Track who's already booked in this day+band across all units, to avoid
      // double-booking a staffer in the same band (same constraint nectarDraft uses).
      const usedThisBand = new Set<string>();
      for (const u of units) {
        for (let i = 0; i < u.staffNeeded; i++) {
          const k = assignmentKey(u.key, p.day_iso, p.band_id, i);
          const sid = next.get(k);
          if (sid) usedThisBand.add(sid);
        }
      }
      if (usedThisBand.has(p.staff_id)) { skipped++; continue; }
      // Find first empty slot for this unit/day/band.
      let placed = false;
      for (let i = 0; i < unit.staffNeeded; i++) {
        const k = assignmentKey(unit.key, p.day_iso, p.band_id, i);
        if (!next.get(k)) {
          next.set(k, p.staff_id);
          newDrafts.add(k);
          applied++;
          placed = true;
          break;
        }
      }
      if (!placed) skipped++;
    }
    setAssignments(next);
    setDrafts(newDrafts);
    return { applied, skipped };
  }


  function clearAll() {
    setAssignments(new Map());
    setStatuses(new Map());
    setDrafts(new Set());
    toast.message("Cleared. Nothing is published until you click Publish.");
  }

  // Plan-year discrete service pacing
  const discreteCodes = new Set(data?.codes.filter((c) => c.kind === "discrete").map((c) => c.code) ?? []);
  const homeClientIds = new Set(units.flatMap((u) => u.clientIds));
  const planYearPacing = useMemo(() => {
    if (!data) return [] as Array<{ client: string; code: string; weeklyTarget: number; delivered: number }>;
    const rows: Array<{ client: string; code: string; weeklyTarget: number; delivered: number }> = [];
    for (const b of data.billing) {
      if (!homeClientIds.has(b.client_id)) continue;
      if (!discreteCodes.has(b.service_code)) continue;
      const weekly = b.weekly_cap_units ?? (b.annual_unit_authorization ? Math.round(b.annual_unit_authorization / 52) : 0);
      const delivered = data.shifts.filter((s) => s.client_id === b.client_id && s.job_code === b.service_code).length;
      const client = data.clients.find((c) => c.id === b.client_id);
      rows.push({
        client: client ? `${client.first_name} ${client.last_name}` : "—",
        code: b.service_code,
        weeklyTarget: weekly,
        delivered,
      });
    }
    return rows;
  }, [data, units]);

  // Readiness
  const totalSlots = units.reduce((s, u) => s + u.staffNeeded, 0) * bands.length * 7;
  const filled = Array.from(assignments.values()).filter(Boolean).length;
  const holes = totalSlots - filled;
  const overtimeFlags = Array.from(staffWeekHours.entries()).filter(([, h]) => h > 40);
  const declinedCount = Array.from(statuses.values()).filter((s) => s === "declined").length;
  const acceptedCount = Array.from(statuses.values()).filter((s) => s === "accepted").length;
  const flagCount = (holes > 0 ? 1 : 0) + overtimeFlags.length + declinedCount + planYearPacing.filter((p) => p.weeklyTarget > 0 && p.delivered < p.weeklyTarget).length;

  const publishMut = useMutation({
    mutationFn: async () => {
      if (!orgId || !data || !home) throw new Error("Not ready");
      const rows: any[] = [];
      for (const [k, staffId] of assignments.entries()) {
        if (!staffId) continue;
        const [unitKey, dayISO, bandId] = k.split("|");
        const band = bands.find((b) => b.id === bandId); if (!band) continue;
        const unit = units.find((u) => u.key === unitKey); if (!unit) continue;
        const { startISO, endISO } = bandTimes(dayISO, band);
        for (const clientId of unit.clientIds) {
          const billing = data.billing.find((b) => b.client_id === clientId);
          const codeRow = billing ? data.codes.find((c) => c.code === billing.service_code) : null;
          rows.push({
            organization_id: orgId,
            staff_id: staffId,
            client_id: clientId,
            starts_at: startISO,
            ends_at: endISO,
            shift_type: "hourly",
            job_code: billing?.service_code ?? null,
            code_id: codeRow?.id ?? null,
            status: "pending",
            published: true,
            created_by: user?.id ?? null,
          });
        }
      }
      // wipe existing shifts in week for this home's clients (advisory replace)
      const homeClientArr = Array.from(homeClientIds);
      let priorShiftIds: string[] = [];
      if (homeClientArr.length) {
        const { data: prior } = await (supabase as any).from("scheduled_shifts")
          .select("id")
          .eq("organization_id", orgId)
          .in("client_id", homeClientArr)
          .gte("starts_at", weekStart.toISOString())
          .lte("starts_at", new Date(addDays(weekStart,7).getTime()-1).toISOString());
        priorShiftIds = ((prior ?? []) as Array<{ id: string }>).map((r) => r.id);
        await (supabase as any).from("scheduled_shifts")
          .delete()
          .eq("organization_id", orgId)
          .in("client_id", homeClientArr)
          .gte("starts_at", weekStart.toISOString())
          .lte("starts_at", new Date(addDays(weekStart,7).getTime()-1).toISOString());
      }
      if (rows.length) {
        const { error } = await (supabase as any).from("scheduled_shifts").insert(rows);
        if (error) throw error;
      }
      // Resolve any open "shift declined" admin notifications tied to the wiped shifts.
      if (priorShiftIds.length) {
        await (supabase as any).from("notifications")
          .update({ dismissed_at: new Date().toISOString() })
          .eq("organization_id", orgId)
          .eq("related_type", "shift_decline")
          .in("related_id", priorShiftIds)
          .is("dismissed_at", null);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["builder-data"] });
      qc.invalidateQueries({ queryKey: ["my-scheduled-shifts"] });
      qc.invalidateQueries({ queryKey: ["coverage-views"] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
      toast.success(holes > 0 ? `Published with ${holes} open slot${holes===1?"":"s"}. They'll ride along as reminders.` : "Published. Staff will see Pending shifts.");
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not publish."),
  });

  if (teams.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-surface-warm p-8 text-center">
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-lg bg-[#137182]/10 text-[#137182]">
          <Home className="h-5 w-5" />
        </span>
        <h3 className="mt-3 text-base font-semibold">No homes yet</h3>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          Add a home in{" "}
          <Link to="/dashboard/scheduling" search={{ tab: "homes" }} className="font-medium text-[#137182] hover:underline">
            Homes &amp; Teams
          </Link>
          , then tap any resident chip on the household card to set their staffing ratio. Come back here to draft a week.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Select value={homeId} onValueChange={setHomeId}>
            <SelectTrigger className="w-full sm:w-64"><SelectValue placeholder="Pick a home" /></SelectTrigger>
            <SelectContent>{teams.map((t) => <SelectItem key={t.id} value={t.id}>{t.team_name}</SelectItem>)}</SelectContent>
          </Select>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" onClick={() => setWeekStart(addDays(weekStart, -7))}><ChevronLeft className="h-4 w-4" /></Button>
            <span className="px-2 text-sm font-medium tabular-nums">
              {weekStart.toLocaleDateString(undefined,{month:"short",day:"numeric"})} – {weekEnd.toLocaleDateString(undefined,{month:"short",day:"numeric"})}
            </span>
            <Button variant="outline" size="icon" onClick={() => setWeekStart(addDays(weekStart, 7))}><ChevronRight className="h-4 w-4" /></Button>
            <Button variant="ghost" size="sm" onClick={() => setWeekStart(startOfWeek(new Date()))}>This week</Button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setAskOpen(true)} disabled={!data || !home}>
            <Wand2 className="mr-1 h-4 w-4" />Ask NECTAR to schedule
          </Button>
          <Button variant="outline" size="sm" onClick={nectarDraft} disabled={!data}><Sparkles className="mr-1 h-4 w-4" />NECTAR draft</Button>
          <Button variant="outline" size="sm" onClick={copyLastWeek} disabled={!data}><Copy className="mr-1 h-4 w-4" />Copy last week</Button>
          <Button variant="outline" size="sm" onClick={clearAll}><Eraser className="mr-1 h-4 w-4" />Clear</Button>
          <Button size="sm" onClick={() => { setPublishing(true); publishMut.mutate(undefined, { onSettled: () => setPublishing(false) }); }} disabled={publishing || publishMut.isPending || !data}>
            {publishing || publishMut.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Send className="mr-1 h-4 w-4" />}Publish week
          </Button>
        </div>
      </div>

      <ReadinessPanel holes={holes} overtimeFlags={overtimeFlags} pacing={planYearPacing} flagCount={flagCount} declinedCount={declinedCount} acceptedCount={acceptedCount} />

      {!data || !home ? (
        <p className="text-sm text-muted-foreground">{dataQ.isLoading ? "Loading…" : "Pick a home to begin."}</p>
      ) : units.length === 0 ? (
        <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">No residents in this home yet, or no ratios set.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[900px] text-xs">
            <thead className="bg-muted/40">
              <tr>
                <th className="sticky left-0 z-10 bg-muted/40 px-2 py-2 text-left">Unit</th>
                <th className="px-2 py-2 text-left">Band</th>
                {weekDays.map((d) => (
                  <th key={d.toISOString()} className="px-2 py-2 text-center font-semibold">
                    <div>{d.toLocaleDateString(undefined,{weekday:"short"})}</div>
                    <div className="tabular-nums text-[10px] text-muted-foreground">{d.getDate()}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {units.flatMap((u) => bands.map((band, bi) => (
                <tr key={`${u.key}-${band.id}`} className="border-t border-border">
                  {bi === 0 && (
                    <td rowSpan={bands.length} className="sticky left-0 z-10 border-r border-border bg-card px-2 py-2 align-top">
                      <div className="font-medium">{u.label}</div>
                      <div className="text-[10px] text-muted-foreground">needs {u.staffNeeded}</div>
                    </td>
                  )}
                  <td className="px-2 py-1 text-[11px] text-muted-foreground">
                    <div className="font-medium">{band.name}</div>
                    <div className="tabular-nums">{band.start_time.slice(0,5)}–{band.end_time.slice(0,5)}</div>
                  </td>
                  {weekDays.map((d) => {
                    const dISO = isoDay(d);
                    const slotKeys = Array.from({length:u.staffNeeded}, (_,i) => assignmentKey(u.key, dISO, band.id, i));
                    return (
                      <td key={dISO} className="p-1 align-top">
                        <div className="flex flex-col gap-1">
                          {slotKeys.map((k, i) => {
                            const sid = assignments.get(k) ?? null;
                            const staff = sid ? homeStaff.find((s) => s.id === sid) ?? data.allStaff.find((s) => s.id === sid) : null;
                            return (
                              <SlotCell
                                key={k}
                                slotKey={k}
                                staffName={staff?.full_name ?? staff?.email ?? null}
                                isDraft={drafts.has(k)}
                                status={statuses.get(k) ?? null}
                                unit={u}
                                day={dISO}
                                bandName={band.name}
                                pool={homeStaff.length ? homeStaff : data.allStaff}
                                continuityFor={continuity.get(u.clientIds[0]) ?? new Set()}
                                weekHours={staffWeekHours}
                                onPick={(staffId) => setAssignment(k, staffId)}
                                onClear={() => setAssignment(k, null)}
                              />
                            );
                          })}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              )))}
            </tbody>
          </table>
        </div>
      )}

      {data && home && (
        <AskNectarCoverageDialog
          open={askOpen}
          onClose={() => setAskOpen(false)}
          homeName={home.team_name}
          units={units}
          bands={bands}
          weekDays={weekDays}
          staff={homeStaff.length ? homeStaff : data.allStaff}
          onConfirm={(plan) => {
            const { applied, skipped } = applyCoveragePicks(plan);
            if (applied === 0) {
              toast.message(`Nothing to add — those slot${skipped === 1 ? " is" : "s are"} already filled.`);
            } else {
              toast.success(`NECTAR proposed ${applied} slot${applied === 1 ? "" : "s"}${skipped ? `; ${skipped} skipped (already filled or double-booked).` : "."} Review and Publish when ready.`);
            }
            setAskOpen(false);
          }}
        />
      )}
    </div>
  );
}

// ----------------- Ask NECTAR — residential coverage variant -----------------

function AskNectarCoverageDialog({
  open,
  onClose,
  homeName,
  units,
  bands,
  weekDays,
  staff,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  homeName: string;
  units: Unit[];
  bands: Template[];
  weekDays: Date[];
  staff: Staff[];
  onConfirm: (plan: NectarCoveragePlan) => void;
}) {
  const parseFn = useServerFn(parseCoverageSentence);
  const firstUnit = units[0]?.label?.split(" ")[0] ?? "the home";
  const firstStaff = staff[0]?.full_name?.split(" ")[0] ?? "a staffer";
  const [sentence, setSentence] = useState(
    `Cover ${firstUnit} overnight Mon–Fri with ${firstStaff}.`,
  );
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<NectarCoverageResult | null>(null);

  async function ask() {
    if (!sentence.trim()) return;
    setBusy(true);
    setResult(null);
    try {
      const res = await parseFn({
        data: {
          sentence: sentence.trim(),
          home_name: homeName,
          units: units.map((u) => ({ key: u.key, label: u.label, staff_needed: u.staffNeeded })),
          bands: bands.map((b) => ({ id: b.id, name: b.name, start_time: b.start_time, end_time: b.end_time })),
          days: weekDays.map((d) => {
            const x = new Date(d); x.setHours(0,0,0,0);
            return x.toISOString().slice(0,10);
          }),
          staff: staff.map((s) => ({ id: s.id, name: s.full_name ?? s.email ?? "—" })),
        },
      });
      setResult(res);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "NECTAR couldn't reach the gateway.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="h-4 w-4 text-[#137182]" /> Ask NECTAR to schedule
          </DialogTitle>
          <DialogDescription>
            Describe the coverage in plain English. NECTAR proposes draft cells — nothing
            publishes until you click Publish week.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Textarea
            value={sentence}
            onChange={(e) => setSentence(e.target.value)}
            rows={3}
            className="text-sm"
            placeholder="e.g. Cover the Maple house overnight Mon–Fri with Sarah."
          />
          <div className="flex justify-end">
            <Button size="sm" onClick={ask} disabled={busy || !sentence.trim()}>
              {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1 h-4 w-4" />}
              {busy ? "Thinking…" : "Parse with NECTAR"}
            </Button>
          </div>

          {result?.kind === "ask" && (
            <div className="rounded-lg border border-amber-300/60 bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
              <p className="font-semibold">NECTAR needs one detail:</p>
              <p className="mt-1">{result.question}</p>
              <p className="mt-2 text-[11px] opacity-80">Add the missing detail and parse again.</p>
            </div>
          )}

          {result?.kind === "ok" && (
            <div className="space-y-2 rounded-lg border border-[#137182]/40 bg-[#137182]/5 p-3 text-sm">
              <p className="font-semibold text-[#137182]">Preview — confirm to add as drafts:</p>
              <p className="font-mono text-xs">{result.summary}</p>
              <p className="text-[11px] text-muted-foreground">
                {result.picks.length} slot{result.picks.length === 1 ? "" : "s"} will be added as drafts.
                Nothing publishes automatically.
              </p>
              <div className="flex justify-end gap-2 pt-1">
                <Button size="sm" variant="outline" onClick={() => setResult(null)}>
                  Edit sentence
                </Button>
                <Button size="sm" onClick={() => onConfirm(result)}>
                  <Send className="mr-1 h-4 w-4" />
                  Confirm & save drafts
                </Button>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SlotCell({
  slotKey, staffName, isDraft, status, unit, day, bandName, pool, continuityFor, weekHours, onPick, onClear,
}: {
  slotKey: string;
  staffName: string | null;
  isDraft?: boolean;
  status?: string | null;
  unit: Unit; day: string; bandName: string;
  pool: Staff[]; continuityFor: Set<string>; weekHours: Map<string, number>;
  onPick: (id: string) => void; onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ranked = useMemo(() => {
    return [...pool].sort((a,b) => {
      const ac = continuityFor.has(a.id) ? -1 : 0;
      const bc = continuityFor.has(b.id) ? -1 : 0;
      if (ac !== bc) return ac - bc;
      return (weekHours.get(a.id) ?? 0) - (weekHours.get(b.id) ?? 0);
    });
  }, [pool, continuityFor, weekHours]);

  const filledStyle = isDraft
    ? "border-dashed border-violet-400 bg-violet-50 text-violet-900 hover:bg-violet-100 dark:bg-violet-950/30 dark:text-violet-200"
    : status === "declined"
      ? "border-rose-400 bg-rose-100 text-rose-900 hover:bg-rose-200 dark:bg-rose-950/40 dark:text-rose-200"
      : status === "accepted"
        ? "border-emerald-500 bg-emerald-100 text-emerald-900 hover:bg-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-100"
        : "border-emerald-300 bg-emerald-50 text-emerald-900 hover:bg-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-200";

  const statusBadge = isDraft && staffName
    ? { label: "draft", cls: "bg-violet-200 text-violet-800" }
    : status === "accepted"
      ? { label: "✓", cls: "bg-emerald-200 text-emerald-800" }
      : status === "declined"
        ? { label: "declined", cls: "bg-rose-200 text-rose-800" }
        : status === "pending"
          ? { label: "scheduled", cls: "bg-muted text-muted-foreground" }
          : null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={`w-full rounded border px-1.5 py-1 text-left text-[11px] transition ${
            staffName
              ? filledStyle
              : "border-dashed border-rose-300 bg-rose-50/50 text-rose-700 hover:bg-rose-100/50 dark:bg-rose-950/20 dark:text-rose-200"
          }`}
          aria-label={staffName ? `${isDraft ? "Proposed" : status ?? "Assigned"} ${staffName}` : `Needs staff for ${unit.label} ${bandName} ${day}`}
        >
          <div className="flex items-center justify-between gap-1">
            <span className="truncate font-medium">{staffName ?? `needs 1`}</span>
            {statusBadge && <span className={`shrink-0 rounded px-1 text-[9px] font-bold uppercase tracking-wide ${statusBadge.cls}`}>{statusBadge.label}</span>}
          </div>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-2" align="start">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          NECTAR picks for {unit.label}
        </div>
        <ul className="max-h-64 space-y-1 overflow-y-auto">
          {ranked.map((s) => {
            const cont = continuityFor.has(s.id);
            const hrs = weekHours.get(s.id) ?? 0;
            const overtime = hrs > 40;
            return (
              <li key={s.id}>
                <button
                  onClick={() => { onPick(s.id); setOpen(false); }}
                  className="flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-accent"
                >
                  <span className="truncate font-medium">{s.full_name ?? s.email ?? s.id.slice(0,6)}</span>
                  <span className="flex shrink-0 items-center gap-1">
                    {cont && <span className="rounded bg-emerald-100 px-1 text-[9px] font-bold text-emerald-700">continuity</span>}
                    {overtime && <span className="rounded bg-amber-100 px-1 text-[9px] font-bold text-amber-700">OT {hrs.toFixed(0)}h</span>}
                  </span>
                </button>
              </li>
            );
          })}
          {ranked.length === 0 && <li className="px-2 py-1 text-xs text-muted-foreground">No staff in pool.</li>}
        </ul>
        <div className="mt-2 flex justify-end border-t pt-2">
          <Button variant="ghost" size="sm" onClick={() => { onClear(); setOpen(false); }}>Clear</Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ReadinessPanel({ holes, overtimeFlags, pacing, flagCount, declinedCount, acceptedCount }: {
  holes: number; overtimeFlags: Array<[string, number]>; pacing: Array<{ client: string; code: string; weeklyTarget: number; delivered: number }>; flagCount: number; declinedCount: number; acceptedCount: number;
}) {
  const ready = flagCount === 0;
  return (
    <div className={`rounded-lg border p-3 ${ready ? "border-emerald-300 bg-emerald-50/70 dark:bg-emerald-950/20" : "border-amber-300 bg-amber-50/70 dark:bg-amber-950/20"}`}>
      <div className="flex items-center gap-2">
        {ready ? <Check className="h-4 w-4 text-emerald-700" /> : <AlertTriangle className="h-4 w-4 text-amber-700" />}
        <h3 className="text-sm font-semibold">{ready ? "Ready to publish" : `${flagCount} to resolve (advisory)`}</h3>
      </div>
      <ul className="mt-2 grid gap-1 text-xs text-muted-foreground sm:grid-cols-5">
        <li>Open slots: <strong className="text-foreground tabular-nums">{holes}</strong></li>
        <li>Accepted: <strong className="text-emerald-700 tabular-nums">{acceptedCount}</strong></li>
        <li className={declinedCount > 0 ? "" : ""}>
          Declined: <strong className={`tabular-nums ${declinedCount > 0 ? "text-rose-700" : "text-foreground"}`}>{declinedCount}</strong>
          {declinedCount > 0 && <span className="ml-1 text-[10px] font-semibold uppercase tracking-wide text-rose-700">re-cover</span>}
        </li>
        <li>Overtime watch: <strong className="text-foreground tabular-nums">{overtimeFlags.length}</strong></li>
        <li>Services off pace: <strong className="text-foreground tabular-nums">{pacing.filter((p) => p.weeklyTarget > 0 && p.delivered < p.weeklyTarget).length}</strong></li>
      </ul>
      {pacing.length > 0 && (
        <div className="mt-2 border-t pt-2">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Plan-year services this week</div>
          <ul className="mt-1 space-y-0.5 text-xs">
            {pacing.map((p, i) => (
              <li key={i} className="flex justify-between gap-2">
                <span className="truncate">{p.client} · <span className="font-mono">{p.code}</span></span>
                <span className={`tabular-nums ${p.weeklyTarget > 0 && p.delivered < p.weeklyTarget ? "text-amber-700" : "text-emerald-700"}`}>
                  {p.delivered}/{p.weeklyTarget || "—"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
