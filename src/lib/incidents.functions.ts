/**
 * Server functions for the §1.27 Incident Report workflow.
 *
 * - createIncident: any active org member can file an IR for a client on
 *   their caseload (or for any client if they are admin/manager).
 * - listIncidents: org-scoped list with optional filters used by the admin
 *   queue and the incident log.
 * - markUpiInitiated / markGuardianNotified / markUpiCompleted: admin/manager
 *   actions that write the attestation columns. Completing all three closes
 *   the incident.
 *
 * UPI is the state portal. Hive NEVER submits — these functions only record
 * the provider's attestation that they performed the manual UPI step.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any;

async function getMembership(supabase: AnySupabase, userId: string) {
  const { data, error } = await supabase
    .from("organization_members")
    .select("organization_id, role, active")
    .eq("user_id", userId)
    .eq("active", true)
    .limit(1)
    .maybeSingle();
  if (error || !data) throw new Error("No active organization membership.");
  return data as { organization_id: string; role: string; active: boolean };
}

function isManager(role: string | undefined) {
  return !!role && ["admin", "manager", "super_admin"].includes(role);
}

const createInput = z.object({
  client_id: z.string().uuid(),
  occurred_at: z.string().datetime().nullable().optional(),
  discovered_at: z.string().datetime(),
  location: z.string().max(300).optional().nullable(),
  category: z.string().min(1).max(120),
  description: z.string().min(1).max(8000),
  people_involved: z.string().max(2000).optional().nullable(),
  witnesses: z.string().max(2000).optional().nullable(),
  injuries: z.string().max(2000).optional().nullable(),
  medical_attention: z.string().max(2000).optional().nullable(),
  immediate_actions: z.string().max(4000).optional().nullable(),
  is_abuse_neglect: z.boolean().default(false),
  prevention_strategies: z.string().max(4000).optional().nullable(),
  is_fatality: z.boolean().default(false),
  triggered_by_note_id: z.string().uuid().nullable().optional(),
  triggered_by_note_type: z.string().max(60).nullable().optional(),
  // §1.27 structured detail extensions
  details: z.record(z.string(), z.unknown()).default({}),
  witnessed_directly: z.boolean().nullable().optional(),
  reported_to_reporter_by: z.string().max(300).nullable().optional(),
  restraint_used: z.boolean().default(false),
  aps_notified_at: z.string().datetime().nullable().optional(),
  aps_notified_by: z.string().max(300).nullable().optional(),
  aps_reference: z.string().max(120).nullable().optional(),
});

export const createIncident = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => createInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: AnySupabase; userId: string };
    const m = await getMembership(supabase, userId);
    if (data.is_abuse_neglect && !(data.prevention_strategies?.trim())) {
      throw new Error("Prevention strategies are required for abuse/neglect/exploitation incidents.");
    }
    // Confirm caregiver may file for this client.
    if (!isManager(m.role)) {
      const { data: sa } = await supabase
        .from("staff_assignments")
        .select("client_id")
        .eq("organization_id", m.organization_id)
        .eq("staff_id", userId)
        .eq("client_id", data.client_id)
        .limit(1)
        .maybeSingle();
      if (!sa) throw new Error("You are not assigned to this individual.");
    }

    // Generate a short report number (org-local sequence by year + count).
    const year = new Date().getFullYear();
    const { count } = await supabase
      .from("incident_reports")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", m.organization_id)
      .gte("created_at", `${year}-01-01T00:00:00Z`);
    const seq = String((count ?? 0) + 1).padStart(4, "0");
    const report_number = `IR-${year}-${seq}`;

    const discovered = new Date(data.discovered_at);
    const occurred = data.occurred_at ? new Date(data.occurred_at) : discovered;

    const row = {
      organization_id: m.organization_id,
      client_id: data.client_id,
      reported_by: userId,
      report_number,
      // Legacy NOT-NULL columns (pre-existing schema): map to the new structured fields.
      incident_date: occurred.toISOString().slice(0, 10),
      incident_time: occurred.toISOString().slice(11, 19),
      narrative_before: "",
      narrative_during: data.description,
      narrative_after: "",
      immediate_actions: data.immediate_actions ?? "",
      incident_types: [data.category],
      // New §1.27 fields:
      occurred_at: data.occurred_at ?? discovered.toISOString(),
      discovered_at: discovered.toISOString(),
      location: data.location ?? null,
      category: data.category,
      description: data.description,
      people_involved: data.people_involved ?? null,
      witnesses: data.witnesses ?? null,
      injuries: data.injuries ?? null,
      medical_attention: data.medical_attention ?? null,
      is_abuse_neglect: !!data.is_abuse_neglect,
      prevention_strategies: data.prevention_strategies ?? null,
      is_fatality: !!data.is_fatality,
      status: "submitted",
      triggered_by_note_id: data.triggered_by_note_id ?? null,
      triggered_by_note_type: data.triggered_by_note_type ?? null,
      details: data.details ?? {},
      witnessed_directly: data.witnessed_directly ?? null,
      reported_to_reporter_by: data.reported_to_reporter_by ?? null,
      restraint_used: !!data.restraint_used,
      aps_notified_at: data.aps_notified_at ?? null,
      aps_notified_by: data.aps_notified_by ?? null,
      aps_reference: data.aps_reference ?? null,
    };

    const { data: ins, error } = await supabase
      .from("incident_reports")
      .insert(row)
      .select("id, report_number")
      .single();
    if (error) throw new Error(error.message);
    return ins as { id: string; report_number: string };
  });

const filtersInput = z.object({
  status: z.enum(["open", "closed", "all"]).default("open"),
  client_id: z.string().uuid().optional().nullable(),
  category: z.string().max(120).optional().nullable(),
  from: z.string().optional().nullable(),
  to: z.string().optional().nullable(),
  limit: z.number().int().positive().max(500).default(200),
});

export const listIncidents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => filtersInput.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: AnySupabase; userId: string };
    const m = await getMembership(supabase, userId);

    let q = supabase
      .from("incident_reports")
      .select(
        "id, report_number, client_id, reported_by, discovered_at, occurred_at, category, description, location, status, is_abuse_neglect, is_fatality, prevention_strategies, guardian_notified_at, guardian_notified_method, guardian_notified_by, upi_initiated_at, upi_initiated_by, upi_completed_at, upi_completed_by, followup_notes, created_at, details, witnessed_directly, reported_to_reporter_by, restraint_used, aps_notified_at, aps_notified_by, aps_reference, clients:client_id(first_name,last_name)",
      )
      .eq("organization_id", m.organization_id)
      .order("discovered_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(data.limit);
    // For the "open queue" view we widen the SQL to include closed incidents
    // too — the caller layers the "open SC request" re-surface rule client-side
    // so a closed incident with an outstanding SC request still appears.
    if (data.status === "closed") q = q.eq("status", "closed");
    if (data.client_id) q = q.eq("client_id", data.client_id);
    if (data.category) q = q.eq("category", data.category);
    if (data.from) q = q.gte("discovered_at", data.from);
    if (data.to) q = q.lte("discovered_at", data.to);

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    // Always include the SC requests for the returned incidents so the
    // queue can re-surface a closed incident with an outstanding request.
    const ids = (rows ?? []).map((r: { id: string }) => r.id);
    let scRows: Array<{
      id: string;
      incident_id: string;
      requested_at: string;
      request_summary: string;
      responded_at: string | null;
      response_summary: string | null;
      responded_by: string | null;
    }> = [];
    if (ids.length) {
      const { data: scs, error: scErr } = await supabase
        .from("incident_sc_requests")
        .select("id, incident_id, requested_at, request_summary, responded_at, response_summary, responded_by")
        .eq("organization_id", m.organization_id)
        .in("incident_id", ids)
        .order("requested_at", { ascending: false });
      if (scErr) throw new Error(scErr.message);
      scRows = (scs ?? []) as typeof scRows;
    }
    return { incidents: rows ?? [], sc_requests: scRows };
  });

const logScInput = z.object({
  incident_id: z.string().uuid(),
  request_summary: z.string().min(3).max(4000),
  requested_at: z.string().datetime().optional(),
});

export const logScRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => logScInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: AnySupabase; userId: string };
    const m = await requireManager(supabase, userId);
    // Confirm the incident belongs to this org.
    const { data: ir, error: irErr } = await supabase
      .from("incident_reports")
      .select("id, organization_id")
      .eq("id", data.incident_id)
      .maybeSingle();
    if (irErr) throw new Error(irErr.message);
    if (!ir || ir.organization_id !== m.organization_id) {
      throw new Error("Incident not found.");
    }
    const { data: ins, error } = await supabase
      .from("incident_sc_requests")
      .insert({
        organization_id: m.organization_id,
        incident_id: data.incident_id,
        requested_at: data.requested_at ?? new Date().toISOString(),
        request_summary: data.request_summary.trim(),
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return ins as { id: string };
  });

export const respondScRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid(),
      response_summary: z.string().min(3).max(4000),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: AnySupabase; userId: string };
    await requireManager(supabase, userId);
    const { error } = await supabase
      .from("incident_sc_requests")
      .update({
        responded_at: new Date().toISOString(),
        responded_by: userId,
        response_summary: data.response_summary.trim(),
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Trends feed: monthly counts, category breakdown, per-client counts.
 *  Reads incident_reports directly; no aggregate tables. */
export const incidentTrends = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      from: z.string().datetime().optional().nullable(),
      to: z.string().datetime().optional().nullable(),
    }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: AnySupabase; userId: string };
    const m = await requireManager(supabase, userId);

    // Trailing-6-month window for the bar chart (always); the caller-supplied
    // [from..to] only filters the per-client table.
    const now = new Date();
    const sixMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1));

    const { data: rows, error } = await supabase
      .from("incident_reports")
      .select("id, client_id, discovered_at, category, created_at, clients:client_id(first_name,last_name)")
      .eq("organization_id", m.organization_id)
      .gte("discovered_at", sixMonthStart.toISOString())
      .limit(5000);
    if (error) throw new Error(error.message);

    return { rows: rows ?? [] };
  });


async function requireManager(supabase: AnySupabase, userId: string) {
  const m = await getMembership(supabase, userId);
  if (!isManager(m.role)) throw new Error("Admin or manager access required.");
  return m;
}

async function maybeClose(supabase: AnySupabase, id: string) {
  const { data } = await supabase
    .from("incident_reports")
    .select("upi_initiated_at, upi_completed_at, guardian_notified_at, status")
    .eq("id", id)
    .maybeSingle();
  if (!data) return;
  if (data.status === "closed") return;
  if (data.upi_initiated_at && data.upi_completed_at && data.guardian_notified_at) {
    await supabase.from("incident_reports").update({ status: "closed" }).eq("id", id);
  }
}

export const markUpiInitiated = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: AnySupabase; userId: string };
    await requireManager(supabase, userId);
    const { error } = await supabase
      .from("incident_reports")
      .update({ upi_initiated_at: new Date().toISOString(), upi_initiated_by: userId })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await maybeClose(supabase, data.id);
    return { ok: true };
  });

export const markGuardianNotified = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid(),
      method: z.enum(["phone", "email", "face-to-face"]),
      notified_at: z.string().datetime().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: AnySupabase; userId: string };
    await requireManager(supabase, userId);
    const when = data.notified_at ?? new Date().toISOString();
    const { error } = await supabase
      .from("incident_reports")
      .update({
        guardian_notified_at: when,
        guardian_notified_method: data.method,
        guardian_notified_by: userId,
        // Legacy mirror — keep the older columns truthful so existing
        // family-notified surfaces (timesheet / audit packets) stay in sync.
        family_notified: true,
        family_notified_at: when,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await maybeClose(supabase, data.id);
    return { ok: true };
  });

export const markUpiCompleted = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid(),
      followup_notes: z.string().max(8000).optional().nullable(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: AnySupabase; userId: string };
    await requireManager(supabase, userId);
    const { error } = await supabase
      .from("incident_reports")
      .update({
        upi_completed_at: new Date().toISOString(),
        upi_completed_by: userId,
        followup_notes: data.followup_notes ?? null,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await maybeClose(supabase, data.id);
    return { ok: true };
  });

/** Resolve reporter / actor names for the attestation trail. */
export const getIncidentActors = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ user_ids: z.array(z.string().uuid()).max(200) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: AnySupabase; userId: string };
    await getMembership(supabase, userId);
    if (!data.user_ids.length) return { profiles: [] };
    const { data: rows } = await supabase
      .from("profiles")
      .select("id, first_name, last_name")
      .in("id", data.user_ids);
    return { profiles: rows ?? [] };
  });
