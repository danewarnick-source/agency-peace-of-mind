/**
 * Schedule preview mutations.
 *
 * These mirror the EXACT insert/update/delete shape used inline by the
 * existing scheduler (src/routes/dashboard.scheduling.tsx around line 320,
 * and src/components/scheduling/individual-services-scheduler.tsx), so the
 * preview page writes rows that look identical to ones the legacy
 * scheduler produces. The legacy scheduler does not export a reusable
 * mutation helper — we centralize one here rather than duplicate the
 * same SQL/payload at every call site inside the preview page.
 *
 * Org scoping: every write is filtered by `organization_id` AND the row's
 * id; RLS on scheduled_shifts also enforces this server-side. We never
 * delete by id alone.
 *
 * Recurrence model: mirrors the IndividualServicesScheduler path —
 * materialize one scheduled_shifts row per weekday × week between the
 * start date and the end date, each tagged `is_recurring=true` and
 * `recurrence_rule="weekly"` (same literal string the legacy code uses;
 * NOT RRULE). Series detection at edit/delete time matches legacy:
 * organization_id + client_id + job_code + is_recurring=true + same
 * weekday + same start time-of-day + starts_at >= clicked occurrence.
 */
import { supabase } from "@/integrations/supabase/client";

export type ShiftDraft = {
  id?: string;
  organization_id: string;
  staff_id: string;
  client_id: string;
  job_code: string;
  shift_type: string;
  starts_at: string; // ISO
  ends_at: string;   // ISO
  notes: string | null;
  status: string;    // e.g. "pending"
  published: boolean;
  created_by: string;
  // Recurrence (optional — defaults match a one-off shift)
  is_recurring?: boolean;
  recurrence_rule?: string | null;       // "weekly" or null
  recurrence_end_date?: string | null;   // ISO or null
};

async function assertActiveBillingCodeClient(
  organizationId: string,
  clientId: string,
  serviceCode: string,
): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("client_billing_codes")
    .select("id, service_start_date, service_end_date")
    .eq("organization_id", organizationId)
    .eq("client_id", clientId)
    .eq("service_code", serviceCode.toUpperCase());
  if (error) throw error;
  const active = (
    (data as Array<{ service_start_date: string | null; service_end_date: string | null }>) ?? []
  ).find((r) => {
    if (r.service_start_date && r.service_start_date > today) return false;
    if (r.service_end_date && r.service_end_date <= today) return false;
    return true;
  });
  if (!active) {
    throw new Error(
      "No active billing code for this client and service. Add one in the client's billing profile before scheduling.",
    );
  }
}

export function validateShiftDraft(d: Partial<ShiftDraft>): string | null {
  if (!d.organization_id) return "Missing organization.";
  if (!d.staff_id) return "Select a staff member.";
  if (!d.client_id) return "Select a client.";
  if (!d.job_code) return "Select a billing code.";
  if (!d.starts_at || !d.ends_at) return "Set start and end times.";
  const a = new Date(d.starts_at).getTime();
  const b = new Date(d.ends_at).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return "Invalid date/time.";
  if (b <= a) return "End must be after start.";
  return null;
}

function buildPayload(draft: ShiftDraft): Record<string, unknown> {
  return {
    organization_id: draft.organization_id,
    staff_id: draft.staff_id,
    client_id: draft.client_id,
    job_code: draft.job_code,
    service_code: draft.job_code,
    shift_type: draft.shift_type,
    starts_at: draft.starts_at,
    ends_at: draft.ends_at,
    notes: draft.notes?.trim() || null,
    status: draft.status,
    published: draft.published,
    created_by: draft.created_by,
    is_recurring: !!draft.is_recurring,
    recurrence_rule: draft.recurrence_rule ?? null,
    recurrence_end_date: draft.recurrence_end_date ?? null,
  };
}

export async function saveShift(draft: ShiftDraft) {
  const err = validateShiftDraft(draft);
  if (err) throw new Error(err);

  // Billing-code authorization — enforced at write layer so Nectar proposals
  // and bulk recurrence writes cannot create unbillable shifts.
  await assertActiveBillingCodeClient(draft.organization_id, draft.client_id, draft.job_code);

  const payload = buildPayload(draft);
  if (draft.id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("scheduled_shifts")
      .update(payload)
      .eq("id", draft.id)
      .eq("organization_id", draft.organization_id); // org scope guard
    if (error) throw error;
    return draft.id;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("scheduled_shifts")
    .insert(payload)
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function deleteShift(id: string, organizationId: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("scheduled_shifts")
    .delete()
    .eq("id", id)
    .eq("organization_id", organizationId); // org scope guard — never delete cross-org
  if (error) throw error;
}

// =====================================================================
// Recurrence — weekly, materialized one row per occurrence.
// =====================================================================

/** "HH:MM" of a Date in local time. */
function toHHMM(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Add days to a Date and return a new Date (local). */
function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

/** Compose ISO from a local YYYY-MM-DD + HH:MM. */
function composeISO(year: number, month: number, day: number, hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(year, month, day, h, m, 0, 0).toISOString();
}

export type WeeklyRecurrence = {
  /** 0=Sun … 6=Sat. Must be non-empty and should include the seed's weekday. */
  daysOfWeek: number[];
  /** Inclusive end date as ISO (date-only suffices; we compare by calendar day). */
  endDateISO: string;
};

/**
 * Create a weekly-recurring series. Materializes one scheduled_shifts row
 * per selected weekday per week from the seed week through endDate inclusive.
 * Each row goes through the existing org-scoped insert (RLS enforced).
 *
 * Returns the number of rows successfully inserted. If any insert fails,
 * the function throws and stops — already-inserted rows are NOT rolled back
 * (matches legacy IndividualServices behavior, which uses a single
 * bulk-insert array; we go row-by-row through saveShift so each insert is
 * independently validated and org-stamped).
 */
export async function saveWeeklyRecurringShift(
  seed: ShiftDraft,
  rec: WeeklyRecurrence,
): Promise<number> {
  if (!rec.daysOfWeek.length) throw new Error("Pick at least one day of the week.");
  const seedStart = new Date(seed.starts_at);
  const seedEnd = new Date(seed.ends_at);
  if (seedEnd <= seedStart) throw new Error("End must be after start.");
  const startHHMM = toHHMM(seedStart);
  const endHHMM = toHHMM(seedEnd);
  const durationMs = seedEnd.getTime() - seedStart.getTime();
  const crossesMidnight = durationMs > 0 && (
    seedEnd.getDate() !== seedStart.getDate() ||
    seedEnd.getMonth() !== seedStart.getMonth() ||
    seedEnd.getFullYear() !== seedStart.getFullYear()
  );

  const endDate = new Date(rec.endDateISO);
  endDate.setHours(23, 59, 59, 999);
  if (endDate < seedStart) throw new Error("End date must be on or after the start.");

  // Walk the calendar from the seed's week-Sunday to endDate.
  const cursor = new Date(seedStart);
  cursor.setHours(0, 0, 0, 0);
  cursor.setDate(cursor.getDate() - cursor.getDay()); // Sunday of seed week

  const sortedDOW = [...new Set(rec.daysOfWeek)].sort();
  let inserted = 0;
  while (cursor <= endDate) {
    for (const dow of sortedDOW) {
      const occ = addDays(cursor, dow);
      // Skip occurrences strictly before the seed start (don't backfill the
      // pre-seed part of the seed's own week).
      if (occ < new Date(seedStart.getFullYear(), seedStart.getMonth(), seedStart.getDate())) continue;
      if (occ > endDate) continue;
      const occStartISO = composeISO(occ.getFullYear(), occ.getMonth(), occ.getDate(), startHHMM);
      const occEndBase = crossesMidnight
        ? new Date(new Date(occStartISO).getTime() + durationMs)
        : null;
      const occEndISO = occEndBase
        ? occEndBase.toISOString()
        : composeISO(occ.getFullYear(), occ.getMonth(), occ.getDate(), endHHMM);
      const draft: ShiftDraft = {
        ...seed,
        id: undefined, // always insert
        starts_at: occStartISO,
        ends_at: occEndISO,
        is_recurring: true,
        recurrence_rule: "weekly",
        recurrence_end_date: endDate.toISOString(),
      };
      await saveShift(draft);
      inserted += 1;
    }
    cursor.setDate(cursor.getDate() + 7);
  }
  return inserted;
}

/**
 * Find every row in the same recurring series as `shift`, from this
 * occurrence forward. Mirrors `IndividualServicesScheduler.fetchSeriesIds`.
 *
 * Series predicate:
 *   organization_id = orgId
 *   AND client_id   = shift.client_id
 *   AND job_code    = shift.job_code
 *   AND is_recurring= true
 *   AND starts_at  >= shift.starts_at
 *   AND (same calendar weekday)  AND (same HH:MM start time)
 *
 * Always includes the seed shift itself.
 */
export async function fetchSeriesIdsForward(
  shift: {
    id: string;
    organization_id?: string;
    client_id: string | null;
    job_code: string | null;
    starts_at: string;
  },
  orgId: string,
): Promise<string[]> {
  if (!shift.client_id || !shift.job_code) return [shift.id];
  const seed = new Date(shift.starts_at);
  const seedDOW = seed.getDay();
  const seedHHMM = toHHMM(seed);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("scheduled_shifts")
    .select("id, starts_at")
    .eq("organization_id", orgId)
    .eq("client_id", shift.client_id)
    .eq("job_code", shift.job_code)
    .eq("is_recurring", true)
    .gte("starts_at", shift.starts_at);
  if (error || !data) return [shift.id];
  return (data as Array<{ id: string; starts_at: string }>)
    .filter((r) => {
      const d = new Date(r.starts_at);
      return d.getDay() === seedDOW && toHHMM(d) === seedHHMM;
    })
    .map((r) => r.id);
}

/**
 * Bulk-update fields across a set of series row ids. Time-of-day changes
 * (start/end HH:MM) are applied per-row so each occurrence keeps its own
 * calendar date — matches legacy IndividualServices semantics.
 */
export async function updateSeries(
  ids: string[],
  orgId: string,
  patch: {
    staff_id?: string;
    job_code?: string;
    shift_type?: string;
    notes?: string | null;
    published?: boolean;
    status?: string;
    /** New start time of day "HH:MM" — applied per-row, date kept. */
    startHHMM?: string;
    /** New end time of day "HH:MM" — applied per-row, date kept. */
    endHHMM?: string;
  },
): Promise<void> {
  if (!ids.length) return;
  // Bulk simple-fields update (everything except per-row time-of-day).
  const flat: Record<string, unknown> = {};
  if (patch.staff_id) flat.staff_id = patch.staff_id;
  if (patch.job_code) { flat.job_code = patch.job_code; flat.service_code = patch.job_code; }
  if (patch.shift_type) flat.shift_type = patch.shift_type;
  if (patch.notes !== undefined) flat.notes = patch.notes?.toString().trim() || null;
  if (patch.published !== undefined) flat.published = patch.published;
  if (patch.status !== undefined) flat.status = patch.status;
  if (Object.keys(flat).length) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("scheduled_shifts")
      .update(flat)
      .in("id", ids)
      .eq("organization_id", orgId); // belt-and-suspenders org guard
    if (error) throw error;
  }
  // Per-row time-of-day rewrite, preserving each row's calendar date.
  if (patch.startHHMM || patch.endHHMM) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from("scheduled_shifts")
      .select("id, starts_at, ends_at")
      .in("id", ids)
      .eq("organization_id", orgId);
    if (error) throw error;
    for (const row of (data ?? []) as Array<{ id: string; starts_at: string; ends_at: string }>) {
      const sd = new Date(row.starts_at);
      const ed = new Date(row.ends_at);
      const next: Record<string, unknown> = {};
      if (patch.startHHMM) {
        const [h, m] = patch.startHHMM.split(":").map(Number);
        const x = new Date(sd); x.setHours(h, m, 0, 0);
        next.starts_at = x.toISOString();
      }
      if (patch.endHHMM) {
        const [h, m] = patch.endHHMM.split(":").map(Number);
        const x = new Date(ed); x.setHours(h, m, 0, 0);
        next.ends_at = x.toISOString();
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: uerr } = await (supabase as any)
        .from("scheduled_shifts")
        .update(next)
        .eq("id", row.id)
        .eq("organization_id", orgId);
      if (uerr) throw uerr;
    }
  }
}

/** Delete every row in `ids`, org-guarded. */
export async function deleteSeries(ids: string[], orgId: string): Promise<void> {
  if (!ids.length) return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("scheduled_shifts")
    .delete()
    .in("id", ids)
    .eq("organization_id", orgId);
  if (error) throw error;
}
