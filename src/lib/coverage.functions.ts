import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Coverage requirement generator — READ-ONLY / DERIVED.
 *
 * Given a home (team) and a date, returns the coverage shape for that day:
 *  - the active shift bands for the home (per-home overrides shadow org defaults)
 *  - per band, the list of coverage units derived from clients in the home + their
 *    ratios for the chosen `setting`
 *  - per band, the required staff count = sum of staff side of each unit's ratio
 *
 * This function does NOT write to or modify shifts/assignments anywhere.
 */
export const generateCoverageRequirements = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { homeId: string; date: string; setting?: string }) => ({
    homeId: input.homeId,
    date: input.date,
    setting: input.setting ?? "residential",
  }))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { homeId, date, setting } = data;

    const { data: team, error: teamErr } = await supabase
      .from("teams")
      .select("id, organization_id, team_name")
      .eq("id", homeId)
      .maybeSingle();
    if (teamErr) throw teamErr;
    if (!team) throw new Error("Home not found or not accessible");

    const { data: clients, error: clientsErr } = await supabase
      .from("clients")
      .select("id, first_name, last_name, account_status")
      .eq("team_id", homeId)
      .eq("account_status", "active");
    if (clientsErr) throw clientsErr;

    const clientIds = (clients ?? []).map((c) => c.id);

    let ratios: Array<{
      client_id: string;
      setting: string;
      ratio_staff: number;
      ratio_clients: number;
      effective_start: string;
      effective_end: string | null;
    }> = [];
    if (clientIds.length > 0) {
      const { data: r, error: rErr } = await supabase
        .from("client_ratios")
        .select("client_id, setting, ratio_staff, ratio_clients, effective_start, effective_end")
        .in("client_id", clientIds)
        .eq("setting", setting)
        .lte("effective_start", date);
      if (rErr) throw rErr;
      ratios = (r ?? []).filter((x) => !x.effective_end || x.effective_end >= date);
    }
    const ratioByClient = new Map(ratios.map((x) => [x.client_id, x]));

    const { data: tmplOverride, error: tErr } = await supabase
      .from("shift_templates")
      .select("id, name, start_time, end_time, sort")
      .eq("team_id", homeId)
      .eq("active", true)
      .order("sort", { ascending: true });
    if (tErr) throw tErr;
    let templates = tmplOverride ?? [];
    if (templates.length === 0) {
      const { data: tmplOrg, error: tOrgErr } = await supabase
        .from("shift_templates")
        .select("id, name, start_time, end_time, sort")
        .eq("organization_id", team.organization_id!)
        .is("team_id", null)
        .eq("active", true)
        .order("sort", { ascending: true });
      if (tOrgErr) throw tOrgErr;
      templates = tmplOrg ?? [];
    }

    const ungrouped: typeof clients = [];
    const groups = new Map<string, { ratio_staff: number; ratio_clients: number; clients: typeof clients }>();
    for (const c of clients ?? []) {
      const r = ratioByClient.get(c.id);
      if (!r) { ungrouped.push(c); continue; }
      if (r.ratio_clients === 1) {
        groups.set(`solo:${c.id}`, { ratio_staff: r.ratio_staff, ratio_clients: 1, clients: [c] });
      } else {
        const key = `${r.ratio_staff}:${r.ratio_clients}`;
        const existing = groups.get(key);
        if (existing) existing.clients.push(c);
        else groups.set(key, { ratio_staff: r.ratio_staff, ratio_clients: r.ratio_clients, clients: [c] });
      }
    }

    type Unit = { ratio: string; staff: number; clients: Array<{ id: string; name: string }> };
    const units: Unit[] = [];
    for (const g of groups.values()) {
      const cap = g.ratio_clients;
      for (let i = 0; i < g.clients.length; i += cap) {
        const slice = g.clients.slice(i, i + cap);
        units.push({
          ratio: `${g.ratio_staff}:${g.ratio_clients}`,
          staff: g.ratio_staff,
          clients: slice.map((c) => ({ id: c.id, name: `${c.first_name} ${c.last_name}`.trim() })),
        });
      }
    }
    const requiredStaff = units.reduce((sum, u) => sum + u.staff, 0);

    const bands = templates.map((t) => ({
      template_id: t.id,
      name: t.name,
      start_time: t.start_time,
      end_time: t.end_time,
      units,
      required_staff: requiredStaff,
    }));

    return {
      home: { id: team.id, name: team.team_name, organization_id: team.organization_id },
      date,
      setting,
      bands,
      clients_without_ratio: ungrouped.map((c) => ({ id: c.id, name: `${c.first_name} ${c.last_name}`.trim() })),
      total_required_staff_per_band: requiredStaff,
    };
  });

// ─────────────────────────────────────────────────────────────────────────────
// Ratio-computed coverage (Utah DSPD SOW §1.33)
//
// Required staff at any moment in a residential home =
//   ceil( Σ over PRESENT residents of (ratio_staff / ratio_clients) )
//
// Default ratio for residents with no client_ratios row = 1:3.
// A resident is NOT present (contributes 0) during:
//   • their OWN scheduled_shifts row with service code DSI or SEI, or with
//     parent_shift_id set, within that window (a staff member has them 1:1);
//   • an active client_status_events absence row covering the window (e.g.
//     hospitalization). If the table is not provisioned, absences are
//     treated as empty (the helper never throws on a missing relation).
// ─────────────────────────────────────────────────────────────────────────────

export type ResidentInput = { id: string };
export type RatioInput = { client_id: string; ratio_staff: number; ratio_clients: number };
export type AwayWindowInput = { client_id: string; start_ms: number; end_ms: number };

const DEFAULT_RATIO_STAFF = 1;
const DEFAULT_RATIO_CLIENTS = 3;
export const AWAY_SERVICE_CODES = new Set(["DSI", "SEI"]);

/**
 * Per-minute required staff for ONE day at ONE residential home.
 * Returns a length-1440 array. Pure: callers inject the data.
 */
export function computeRequiredStaffMinutes(input: {
  residents: ReadonlyArray<ResidentInput>;
  ratios: ReadonlyArray<RatioInput>;
  away: ReadonlyArray<AwayWindowInput>;
  dayStartMs: number;
}): number[] {
  const { residents, ratios, away, dayStartMs } = input;
  const dayEndMs = dayStartMs + 24 * 3600 * 1000;
  const ratioByClient = new Map(ratios.map((r) => [r.client_id, r]));

  // Per-resident absence mask (length 1440).
  const absentByClient = new Map<string, Uint8Array>();
  for (const w of away) {
    const s0 = Math.max(w.start_ms, dayStartMs);
    const s1 = Math.min(w.end_ms, dayEndMs);
    if (s1 <= s0) continue;
    const m0 = Math.floor((s0 - dayStartMs) / 60000);
    const m1 = Math.ceil((s1 - dayStartMs) / 60000);
    let arr = absentByClient.get(w.client_id);
    if (!arr) { arr = new Uint8Array(1440); absentByClient.set(w.client_id, arr); }
    for (let i = m0; i < m1; i++) arr[i] = 1;
  }

  const totals = new Float64Array(1440);
  for (const r of residents) {
    const ratio = ratioByClient.get(r.id);
    const num = ratio?.ratio_staff ?? DEFAULT_RATIO_STAFF;
    const den = ratio?.ratio_clients ?? DEFAULT_RATIO_CLIENTS;
    const contribution = num / den;
    const absent = absentByClient.get(r.id);
    if (!absent) {
      for (let i = 0; i < 1440; i++) totals[i] += contribution;
    } else {
      for (let i = 0; i < 1440; i++) if (!absent[i]) totals[i] += contribution;
    }
  }

  const out = new Array<number>(1440);
  for (let i = 0; i < 1440; i++) out[i] = Math.ceil(totals[i] - 1e-9);
  return out;
}

/** True if any present resident in the home has a 2:1 ratio at any minute. */
export function hasTwoToOne(input: {
  residents: ReadonlyArray<ResidentInput>;
  ratios: ReadonlyArray<RatioInput>;
}): boolean {
  const ids = new Set(input.residents.map((r) => r.id));
  for (const r of input.ratios) {
    if (!ids.has(r.client_id)) continue;
    if (r.ratio_staff >= 2 && r.ratio_clients === 1) return true;
  }
  return false;
}

/**
 * Build away-windows from a shift list: residents with their own DSI/SEI
 * shift OR a shift with parent_shift_id set are pulled 1:1 by a staff
 * member and don't count toward home coverage during that window.
 */
export function awayWindowsFromShifts(shifts: ReadonlyArray<{
  client_id: string | null;
  service_code: string | null;
  job_code?: string | null;
  parent_shift_id: string | null;
  starts_at: string;
  ends_at: string;
}>): AwayWindowInput[] {
  const out: AwayWindowInput[] = [];
  for (const s of shifts) {
    if (!s.client_id) continue;
    const code = (s.service_code ?? s.job_code ?? "").toUpperCase();
    const isAway = !!s.parent_shift_id || AWAY_SERVICE_CODES.has(code);
    if (!isAway) continue;
    out.push({
      client_id: s.client_id,
      start_ms: new Date(s.starts_at).getTime(),
      end_ms: new Date(s.ends_at).getTime(),
    });
  }
  return out;
}

/** Element-wise max of two per-minute arrays. Manual overrides only RAISE the bar. */
export function maxRequiredMinutes(a: ReadonlyArray<number>, b: ReadonlyArray<number>): number[] {
  const n = Math.max(a.length, b.length);
  const out = new Array<number>(n);
  for (let i = 0; i < n; i++) out[i] = Math.max(a[i] ?? 0, b[i] ?? 0);
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Server fn: fetches residents/ratios/away-windows for a location+range and
// returns per-day computed required-staff minute arrays.
// ─────────────────────────────────────────────────────────────────────────────
export const computeRequiredStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { locationId: string; startDate: string; endDate?: string }) => ({
    locationId: input.locationId,
    startDate: input.startDate,
    endDate: input.endDate ?? input.startDate,
  }))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { locationId, startDate, endDate } = data;

    const { data: loc, error: locErr } = await supabase
      .from("locations")
      .select("id, organization_id, name, type")
      .eq("id", locationId)
      .maybeSingle();
    if (locErr) throw locErr;
    if (!loc) throw new Error("Location not found");

    // Locations mirror teams by (org, name). Resolve back to the team.
    const { data: team, error: tErr } = await supabase
      .from("teams")
      .select("id, organization_id, team_name, setting")
      .eq("organization_id", loc.organization_id!)
      .ilike("team_name", loc.name as string)
      .maybeSingle();
    if (tErr) throw tErr;

    const teamId = team?.id ?? null;

    const residents = teamId
      ? (await supabase
          .from("clients")
          .select("id, first_name, last_name")
          .eq("team_id", teamId)
          .eq("account_status", "active")).data ?? []
      : [];

    const clientIds = residents.map((c) => c.id);
    const ratios = clientIds.length
      ? ((await supabase
          .from("client_ratios")
          .select("client_id, ratio_staff, ratio_clients, effective_start, effective_end")
          .in("client_id", clientIds)
          .eq("setting", "residential")
          .lte("effective_start", endDate)).data ?? []).filter(
            (r) => !r.effective_end || r.effective_end >= startDate,
          )
      : [];

    const startMs = new Date(`${startDate}T00:00:00`).getTime();
    const endMs = new Date(`${endDate}T00:00:00`).getTime() + 24 * 3600 * 1000;

    const shifts = clientIds.length
      ? (await supabase
          .from("scheduled_shifts")
          .select("client_id, service_code, job_code, parent_shift_id, starts_at, ends_at")
          .in("client_id", clientIds)
          .gte("starts_at", new Date(startMs).toISOString())
          .lt("starts_at", new Date(endMs).toISOString())).data ?? []
      : [];

    // Absences are optional — table may not be provisioned on this tenant.
    let absences: Array<{ client_id: string; starts_at: string; ends_at: string | null }> = [];
    if (clientIds.length) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const res = await (supabase.from("client_status_events" as any)
          .select("client_id, starts_at, ends_at") as any)
          .in("client_id", clientIds);
        if (!res.error && Array.isArray(res.data)) absences = res.data;
      } catch { /* table not provisioned — treat as no absences */ }
    }

    const away = awayWindowsFromShifts(
      shifts as Array<{
        client_id: string | null;
        service_code: string | null;
        job_code: string | null;
        parent_shift_id: string | null;
        starts_at: string;
        ends_at: string;
      }>,
    );
    for (const a of absences) {
      if (!a.starts_at) continue;
      away.push({
        client_id: a.client_id,
        start_ms: new Date(a.starts_at).getTime(),
        end_ms: a.ends_at ? new Date(a.ends_at).getTime() : endMs,
      });
    }

    const days: Array<{ date: string; required: number[] }> = [];
    for (let t = startMs; t < endMs; t += 24 * 3600 * 1000) {
      const dt = new Date(t);
      const iso = dt.toISOString().slice(0, 10);
      days.push({
        date: iso,
        required: computeRequiredStaffMinutes({
          residents,
          ratios,
          away,
          dayStartMs: t,
        }),
      });
    }

    return {
      location: { id: loc.id, name: loc.name, type: loc.type },
      residents: residents.map((c) => ({ id: c.id, name: `${c.first_name} ${c.last_name}`.trim() })),
      ratios,
      twoToOne: hasTwoToOne({ residents, ratios }),
      days,
    };
  });
