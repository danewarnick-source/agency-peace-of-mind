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
        "id, report_number, client_id, reported_by, discovered_at, occurred_at, category, description, location, status, is_abuse_neglect, is_fatality, prevention_strategies, guardian_notified_at, guardian_notified_method, guardian_notified_by, upi_initiated_at, upi_initiated_by, upi_completed_at, upi_completed_by, followup_notes, created_at, clients:client_id(first_name,last_name)",
      )
      .eq("organization_id", m.organization_id)
      .order("discovered_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.status === "open") q = q.neq("status", "closed");
    if (data.status === "closed") q = q.eq("status", "closed");
    if (data.client_id) q = q.eq("client_id", data.client_id);
    if (data.category) q = q.eq("category", data.category);
    if (data.from) q = q.gte("discovered_at", data.from);
    if (data.to) q = q.lte("discovered_at", data.to);

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { incidents: rows ?? [] };
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
