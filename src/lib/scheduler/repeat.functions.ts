// Repeat-shifts server functions.
//   - previewRepeat: read shifts in a source window + project them onto target dates (no writes)
//   - applyRepeat: actually insert the projected shifts
//   - createRecurringShifts: expand a single (just-saved) shift into N occurrences
//
// All writes go through requireSupabaseAuth so RLS enforces tenant scope and
// per-row org scoping. Reuses the same insert path as scheduled_shifts so
// downstream invariants (status, created_by, service_code/job_code mirror)
// stay consistent with saveShift / applyDrafts. No schema changes.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type ShiftRow = {
  id: string;
  staff_id: string | null;
  client_id: string;
  service_code: string | null;
  job_code: string | null;
  starts_at: string;
  ends_at: string;
  shift_type: string | null;
  is_awake_overnight: boolean | null;
  notes: string | null;
};

function startOfDay(iso: string): Date {
  const d = new Date(iso);
  d.setHours(0, 0, 0, 0);
  return d;
}

function shiftDateOnly(src: Date, targetDay: Date): Date {
  // Keep src time-of-day, replace y/m/d with targetDay.
  const out = new Date(targetDay);
  out.setHours(src.getHours(), src.getMinutes(), src.getSeconds(), src.getMilliseconds());
  return out;
}

async function loadSourceShifts(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  orgId: string,
  sourceStartIso: string,
  sourceEndIso: string,
): Promise<ShiftRow[]> {
  const { data, error } = await supabase
    .from("scheduled_shifts")
    .select("id, staff_id, client_id, service_code, job_code, starts_at, ends_at, shift_type, is_awake_overnight, notes")
    .eq("organization_id", orgId)
    .gte("starts_at", sourceStartIso)
    .lt("starts_at", sourceEndIso)
    .order("starts_at");
  if (error) throw error;
  return (data ?? []) as ShiftRow[];
}

// Weekday-aligned mapping: each source shift lands on the matching weekday
// in the target week. Time-of-day, duration, staff, client, code preserved.
// `targetWeekStartIso` is the Sunday of the target week.
function projectShifts(
  shifts: ShiftRow[],
  targetWeekStartIso: string,
): Array<ShiftRow & { target_starts_at: string; target_ends_at: string; target_day: string }> {
  const out: Array<ShiftRow & { target_starts_at: string; target_ends_at: string; target_day: string }> = [];
  const targetWeekStart = startOfDay(targetWeekStartIso);
  // Track per-(client, weekday-hh:mm) so a source that has multiple Tuesdays
  // (i.e. month source) doesn't collapse onto a single target Tuesday slot.
  const usedKey = new Set<string>();
  // Sort sources by date so earliest occurrence wins the target slot.
  const ordered = [...shifts].sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  for (const s of ordered) {
    const srcStart = new Date(s.starts_at);
    const srcEnd = new Date(s.ends_at);
    const weekday = srcStart.getDay();
    const target = new Date(targetWeekStart);
    target.setDate(target.getDate() + weekday);
    target.setHours(srcStart.getHours(), srcStart.getMinutes(), srcStart.getSeconds(), 0);
    const durationMs = srcEnd.getTime() - srcStart.getTime();
    const targetEnd = new Date(target.getTime() + durationMs);
    const key = `${s.client_id}|${(s.service_code ?? s.job_code ?? "").toUpperCase()}|${weekday}|${srcStart.getHours()}:${srcStart.getMinutes()}|${s.staff_id ?? ""}`;
    if (usedKey.has(key)) continue;
    usedKey.add(key);
    out.push({
      ...s,
      target_starts_at: target.toISOString(),
      target_ends_at: targetEnd.toISOString(),
      target_day: target.toISOString().slice(0, 10),
    });
  }
  return out;
}

// ──────────────────────────────────────────────────────────────────────────────
// Preview
// ──────────────────────────────────────────────────────────────────────────────
export const previewRepeat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    organization_id: string;
    source_start_iso: string;
    source_end_iso: string;
    target_week_start_iso: string;
  }) =>
    z.object({
      organization_id: z.string().uuid(),
      source_start_iso: z.string().min(8),
      source_end_iso: z.string().min(8),
      target_week_start_iso: z.string().min(8),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { supabase } = context as any;
    const src = await loadSourceShifts(
      supabase, data.organization_id, data.source_start_iso, data.source_end_iso,
    );
    const projected = projectShifts(src, data.target_week_start_iso);
    return { source_count: src.length, projected };
  });

// ──────────────────────────────────────────────────────────────────────────────
// Apply
// ──────────────────────────────────────────────────────────────────────────────
export const applyRepeat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    organization_id: string;
    source_start_iso: string;
    source_end_iso: string;
    target_week_start_iso: string;
    keep_staff: boolean;
    skip_if_exists: boolean;
    publish_now?: boolean;
    include_source_ids?: string[];
  }) =>
    z.object({
      organization_id: z.string().uuid(),
      source_start_iso: z.string().min(8),
      source_end_iso: z.string().min(8),
      target_week_start_iso: z.string().min(8),
      keep_staff: z.boolean(),
      skip_if_exists: z.boolean(),
      publish_now: z.boolean().optional(),
      include_source_ids: z.array(z.string().uuid()).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { supabase, userId } = context as any;
    const src = await loadSourceShifts(
      supabase, data.organization_id, data.source_start_iso, data.source_end_iso,
    );
    const filtered = data.include_source_ids
      ? src.filter((s) => data.include_source_ids!.includes(s.id))
      : src;
    const projected = projectShifts(filtered, data.target_week_start_iso);

    // Optionally skip if the same client/code/start already exists on the target day.
    let existing: Array<{ client_id: string; service_code: string | null; job_code: string | null; starts_at: string }> = [];
    if (data.skip_if_exists && projected.length > 0) {
      const days = Array.from(new Set(projected.map((p) => p.target_day))).sort();
      const dayMin = days[0];
      const dayMax = new Date(days[days.length - 1]);
      dayMax.setDate(dayMax.getDate() + 1);
      const { data: ex, error } = await supabase
        .from("scheduled_shifts")
        .select("client_id, service_code, job_code, starts_at")
        .eq("organization_id", data.organization_id)
        .gte("starts_at", `${dayMin}T00:00:00.000Z`)
        .lt("starts_at", dayMax.toISOString());
      if (error) throw error;
      existing = (ex ?? []) as typeof existing;
    }
    const exKey = (clientId: string, code: string | null, startsAt: string) =>
      `${clientId}|${(code ?? "").toUpperCase()}|${startsAt}`;
    const existingKeys = new Set(
      existing.map((e) =>
        exKey(e.client_id, e.service_code ?? e.job_code, e.starts_at),
      ),
    );

    let inserted = 0;
    let skipped = 0;
    const rows: Record<string, unknown>[] = [];
    for (const p of projected) {
      const code = (p.service_code ?? p.job_code ?? "").toUpperCase();
      if (!code) { skipped++; continue; }
      if (data.skip_if_exists && existingKeys.has(exKey(p.client_id, code, p.target_starts_at))) {
        skipped++; continue;
      }
      rows.push({
        organization_id: data.organization_id,
        staff_id: data.keep_staff ? p.staff_id : null,
        client_id: p.client_id,
        service_code: code,
        job_code: code,
        shift_type: p.shift_type ?? "hourly",
        starts_at: p.target_starts_at,
        ends_at: p.target_ends_at,
        is_awake_overnight: p.is_awake_overnight,
        notes: p.notes,
        status: data.keep_staff && p.staff_id ? "pending" : "open",
        published: data.publish_now === true,
        created_by: userId,
        created_from: "copy",
      });
    }
    if (rows.length > 0) {
      const { gateScheduledShiftInsert } = await import("@/lib/scheduling/shift-commit");
      await gateScheduledShiftInsert(supabase, rows as never, { mode: "bulk_auto", userId });
      const { error } = await supabase.from("scheduled_shifts").insert(rows);
      if (error) throw error;
      inserted = rows.length;
    }
    return { inserted, skipped };
  });

// ──────────────────────────────────────────────────────────────────────────────
// Expand a seed shift into recurring occurrences.
// Frequencies:
//   - daily:   every day for `count` occurrences (after the seed)
//   - weekly:  on each `weekdays` (0=Sun..6=Sat) until `count` occurrences hit or `until_date`
//   - monthly: same day-of-month (or last day) until `count` / `until_date`
// Hard cap: 200 occurrences per call.
// ──────────────────────────────────────────────────────────────────────────────
export const createRecurringShifts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    organization_id: string;
    seed_shift_id: string;
    freq: "daily" | "weekly" | "monthly";
    weekdays?: number[];           // weekly only
    day_of_month?: number;         // monthly only (1..31; clamped to last day if short)
    count?: number;                // occurrences after the seed
    until_date?: string | null;    // ISO date
  }) =>
    z.object({
      organization_id: z.string().uuid(),
      seed_shift_id: z.string().uuid(),
      freq: z.enum(["daily", "weekly", "monthly"]),
      weekdays: z.array(z.number().min(0).max(6)).optional(),
      day_of_month: z.number().min(1).max(31).optional(),
      count: z.number().min(1).max(200).optional(),
      until_date: z.string().nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { supabase, userId } = context as any;

    const { data: seed, error: sErr } = await supabase
      .from("scheduled_shifts")
      .select("id, staff_id, client_id, service_code, job_code, starts_at, ends_at, shift_type, is_awake_overnight, notes")
      .eq("id", data.seed_shift_id)
      .eq("organization_id", data.organization_id)
      .maybeSingle();
    if (sErr) throw sErr;
    if (!seed) throw new Error("Seed shift not found.");

    const seedStart = new Date(seed.starts_at);
    const seedEnd = new Date(seed.ends_at);
    const durationMs = seedEnd.getTime() - seedStart.getTime();
    const cap = Math.min(data.count ?? 200, 200);
    const until = data.until_date ? startOfDay(data.until_date) : null;

    const dates: Date[] = [];
    if (data.freq === "daily") {
      const cur = new Date(seedStart);
      for (let i = 0; i < cap; i++) {
        cur.setDate(cur.getDate() + 1);
        if (until && startOfDay(cur.toISOString()) > until) break;
        dates.push(new Date(cur));
      }
    } else if (data.freq === "weekly") {
      const days = (data.weekdays && data.weekdays.length > 0)
        ? Array.from(new Set(data.weekdays)).sort()
        : [seedStart.getDay()];
      const cur = new Date(seedStart);
      let added = 0;
      // Walk forward day-by-day; safer than week-stepping when multi-day select.
      while (added < cap) {
        cur.setDate(cur.getDate() + 1);
        if (until && startOfDay(cur.toISOString()) > until) break;
        if (days.includes(cur.getDay())) {
          dates.push(new Date(cur));
          added++;
        }
        // Hard sanity break — at most 2 years scan
        if ((cur.getTime() - seedStart.getTime()) > 1000 * 60 * 60 * 24 * 730) break;
      }
    } else {
      // monthly
      const targetDom = data.day_of_month ?? seedStart.getDate();
      const cur = new Date(seedStart);
      for (let i = 0; i < cap; i++) {
        cur.setMonth(cur.getMonth() + 1);
        // clamp to last day of month
        const lastDom = new Date(cur.getFullYear(), cur.getMonth() + 1, 0).getDate();
        cur.setDate(Math.min(targetDom, lastDom));
        if (until && startOfDay(cur.toISOString()) > until) break;
        dates.push(new Date(cur));
      }
    }

    if (dates.length === 0) return { inserted: 0 };

    const code = (seed.service_code ?? seed.job_code ?? "").toUpperCase();
    const rows = dates.map((d) => {
      const starts = shiftDateOnly(seedStart, d);
      const ends = new Date(starts.getTime() + durationMs);
      return {
        organization_id: data.organization_id,
        staff_id: seed.staff_id,
        client_id: seed.client_id,
        service_code: code,
        job_code: code,
        shift_type: seed.shift_type ?? "hourly",
        starts_at: starts.toISOString(),
        ends_at: ends.toISOString(),
        is_awake_overnight: seed.is_awake_overnight,
        notes: seed.notes,
        status: seed.staff_id ? "pending" : "open",
        published: false,
        created_by: userId,
        created_from: "recurring",
      };
    });
    const { gateScheduledShiftInsert } = await import("@/lib/scheduling/shift-commit");
    await gateScheduledShiftInsert(supabase, rows as never, { mode: "bulk_auto", userId });
    const { error } = await supabase.from("scheduled_shifts").insert(rows);
    if (error) throw error;
    return { inserted: rows.length };
  });
