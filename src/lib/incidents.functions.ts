/**
 * Server functions for the §1.27 Incident Report workflow.
 *
 * - createIncident: any active org member can file an IR for a client on
 *   their caseload (or for any client if they are admin/manager).
 * - listIncidents: org-scoped list with optional filters used by the admin
 *   queue and the incident log.
 * - submitToUpi: the single admin/manager attestation that closes the
 *   incident — UPI entry (initiation + detailed report) and the guardian
 *   notification duty, signed once.
 *
 * UPI is the state portal. Hive NEVER submits — these functions only record
 * the provider's attestation that they performed the manual UPI step. UPI
 * itself notifies the Support Coordinator, so Hive has no separate SC-update
 * duty to track.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { createIncidentInstances, resolveComplianceRequirement } from "@/lib/compliance-resolution";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any;

async function getMembership(
  supabase: AnySupabase,
  userId: string,
  organizationId: string,
) {
  const { data, error } = await supabase
    .from("organization_members")
    .select("organization_id, role, active")
    .eq("user_id", userId)
    .eq("organization_id", organizationId)
    .eq("active", true)
    .limit(1)
    .maybeSingle();
  if (error || !data) throw new Error("Not an active member of this organization.");
  return data as { organization_id: string; role: string; active: boolean };
}


function isManager(role: string | undefined) {
  return !!role && ["admin", "manager", "super_admin"].includes(role);
}

const createInput = z.object({
  organization_id: z.string().uuid(),
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
  // Nectar AI pre-submit review
  ai_review_status: z.enum(["passed", "answered", "skipped", "disabled"]).nullable().optional(),
  ai_review_issues: z.array(z.object({
    field: z.string().nullable().optional(),
    severity: z.enum(["must_fix", "should_add"]),
    question: z.string(),
    answer: z.string().nullable().optional(),
    not_applicable_reason: z.string().nullable().optional(),
  })).nullable().optional(),
});

export const createIncident = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => createInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: AnySupabase; userId: string };
    if (!supabase || !userId) return { id: null, report_number: null };
    const m = await getMembership(supabase, userId, data.organization_id);

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
      status: "Pending_Admin_Review",
      triggered_by_note_id: data.triggered_by_note_id ?? null,
      triggered_by_note_type: data.triggered_by_note_type ?? null,
      details: data.details ?? {},
      witnessed_directly: data.witnessed_directly ?? null,
      reported_to_reporter_by: data.reported_to_reporter_by ?? null,
      restraint_used: !!data.restraint_used,
      aps_notified_at: data.aps_notified_at ?? null,
      aps_notified_by: data.aps_notified_by ?? null,
      aps_reference: data.aps_reference ?? null,
      ai_review_status: data.ai_review_status ?? null,
      ai_review_issues: data.ai_review_issues ?? null,
      ai_review_at: data.ai_review_status ? new Date().toISOString() : null,
    };

    const { data: ins, error } = await supabase
      .from("incident_reports")
      .insert(row)
      .select("id, report_number")
      .single();
    if (error) throw new Error(error.message);

    const incidentCreatedAt = discovered;
    await createIncidentInstances(supabase, m.organization_id, ins.id, incidentCreatedAt);
    await resolveComplianceRequirement(
      supabase, m.organization_id, "incidents", ins.id, "incident", incidentCreatedAt,
    );

    return ins as { id: string; report_number: string };
  });

const filtersInput = z.object({
  organization_id: z.string().uuid(),
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
    if (!supabase || !userId) return { incidents: [] };
    const m = await getMembership(supabase, userId, data.organization_id);


    let q = supabase
      .from("incident_reports")
      .select(
        "id, report_number, client_id, reported_by, discovered_at, category, status, is_abuse_neglect, is_fatality, guardian_notified_at, upi_submitted_at, followup_notes, clients:client_id(first_name,last_name)",
      )
      .eq("organization_id", m.organization_id)
      .order("discovered_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.status === "closed") q = q.eq("status", "State_Confirmed");
    if (data.status === "open") q = q.or("status.neq.State_Confirmed,status.is.null");
    if (data.client_id) q = q.eq("client_id", data.client_id);
    if (data.category) q = q.eq("category", data.category);
    if (data.from) q = q.gte("discovered_at", data.from);
    if (data.to) q = q.lte("discovered_at", data.to);

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const incidents = (rows ?? []) as Array<{ reported_by: string | null }>;

    // Resolve reporter display names in the SAME round trip. Previously the
    // client fired a dependent follow-up request once the list landed, which
    // serialized a third hop onto every open of the Incidents tab.
    // NOTE: two queries joined in JS — never PostgREST-embed
    // organization_members/profiles (no FK; both key off auth.users.id).
    const actorIds = Array.from(
      new Set(incidents.map((r) => r.reported_by).filter(Boolean) as string[]),
    );
    let actors: Array<{ id: string; first_name: string | null; last_name: string | null }> = [];
    if (actorIds.length) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, first_name, last_name")
        .in("id", actorIds);
      actors = (profiles ?? []) as typeof actors;
    }
    return { incidents: rows ?? [], actors };
  });


/** Heavy fields deferred out of listIncidents — loaded once, on expand. */
const detailInput = z.object({
  organization_id: z.string().uuid(),
  id: z.string().uuid(),
});

export const getIncidentDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => detailInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: AnySupabase; userId: string };
    if (!supabase || !userId) return { incident: null };
    const m = await getMembership(supabase, userId, data.organization_id);

    const { data: row, error } = await supabase
      .from("incident_reports")
      .select(
        "id, occurred_at, location, description, prevention_strategies, guardian_notified_method, guardian_notified_by, guardian_notified_details, upi_submitted_by, upi_submitted_attestation_text, upi_submitted_signed_name, upi_submitted_signed_title, created_at, details, witnessed_directly, reported_to_reporter_by, restraint_used, aps_notified_at, aps_notified_by, aps_reference, ai_review_status, ai_review_issues, ai_review_at",
      )
      .eq("organization_id", m.organization_id)
      .eq("id", data.id)
      .single();
    if (error) throw new Error(error.message);
    return { incident: row };
  });

/** Trends feed: monthly category counts (trailing 6 months, always) and
 *  per-client counts (caller-supplied [from..to], defaults to the same
 *  6-month window). Both are aggregated in the database via RPC — see
 *  incident_monthly_category_counts / incident_client_counts in
 *  docs/SQL_HANDOFF.md — instead of pulling raw rows and summing in JS. */
export const incidentTrends = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      organization_id: z.string().uuid(),
      from: z.string().optional().nullable(),
      to: z.string().optional().nullable(),
    }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: AnySupabase; userId: string };
    if (!supabase || !userId) return { monthly: [], perClient: [] };
    const m = await getMembership(supabase, userId, data.organization_id);
    if (!isManager(m.role)) throw new Error("Admin or manager access required.");

    const now = new Date();
    const sixMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1));
    const rangeFrom = data.from ? new Date(data.from) : sixMonthStart;
    const rangeTo = data.to ? new Date(new Date(data.to).getTime() + 86_399_999) : now;

    const [monthlyRes, perClientRes] = await Promise.all([
      supabase.rpc("incident_monthly_category_counts", {
        _org: m.organization_id,
        _since: sixMonthStart.toISOString(),
      }),
      supabase.rpc("incident_client_counts", {
        _org: m.organization_id,
        _from: rangeFrom.toISOString(),
        _to: rangeTo.toISOString(),
      }),
    ]);
    if (monthlyRes.error) throw new Error(monthlyRes.error.message);
    if (perClientRes.error) throw new Error(perClientRes.error.message);

    return { monthly: monthlyRes.data ?? [], perClient: perClientRes.data ?? [] };
  });


async function requireManager(
  supabase: AnySupabase,
  userId: string,
  organizationId: string,
) {
  const m = await getMembership(supabase, userId, organizationId);
  if (!isManager(m.role)) throw new Error("Admin or manager access required.");
  return m;
}


/** Shared attestation/signature input for the combined UPI-submission duty. */
const attestation = z.object({
  attested: z.literal(true),
  signed_name: z.string().trim().min(2).max(120),
  signed_title: z.string().trim().min(2).max(120),
  attestation_text: z.string().min(10).max(2000),
});

/**
 * The single close action: attests UPI entry (initiation + detailed report)
 * and records the guardian-notification duty in one signed step. UPI itself
 * notifies the Support Coordinator, so there is no separate SC-update duty.
 * Closes the incident immediately.
 */
export const submitToUpi = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    attestation.extend({
      organization_id: z.string().uuid(),
      id: z.string().uuid(),
      guardian_contacted: z.boolean(),
      guardian_method: z.enum(["phone", "email", "face-to-face"]).optional().nullable(),
      guardian_details: z.string().max(2000).optional().nullable(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: AnySupabase; userId: string };
    if (!supabase || !userId) return { ok: false };
    await requireManager(supabase, userId, data.organization_id);

    if (data.guardian_contacted && !data.guardian_method) {
      throw new Error("Guardian contact method is required when the guardian was contacted.");
    }
    const now = new Date().toISOString();
    const { error } = await supabase
      .from("incident_reports")
      .update({
        upi_submitted_at: now,
        upi_submitted_by: userId,
        upi_submitted_attestation_text: data.attestation_text,
        upi_submitted_signed_name: data.signed_name,
        upi_submitted_signed_title: data.signed_title,
        guardian_notified_at: now,
        guardian_notified_method: data.guardian_contacted ? data.guardian_method : "self_guardian_na",
        guardian_notified_by: userId,
        guardian_notified_details: data.guardian_contacted ? (data.guardian_details ?? null) : null,
        status: "State_Confirmed",
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Plain, optional free-text follow-up note. Never blocks closing. */
export const updateIncidentFollowupNotes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      organization_id: z.string().uuid(),
      id: z.string().uuid(),
      followup_notes: z.string().max(8000).optional().nullable(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: AnySupabase; userId: string };
    if (!supabase || !userId) return { ok: false };
    await requireManager(supabase, userId, data.organization_id);

    const { error } = await supabase
      .from("incident_reports")
      .update({ followup_notes: data.followup_notes?.trim() || null })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Resolve reporter / actor names for the attestation trail. */
export const getIncidentActors = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    organization_id: z.string().uuid(),
    user_ids: z.array(z.string().uuid()).max(200),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: AnySupabase; userId: string };
    if (!supabase || !userId) return { profiles: [] };
    await getMembership(supabase, userId, data.organization_id);

    if (!data.user_ids.length) return { profiles: [] };
    const { data: rows } = await supabase
      .from("profiles")
      .select("id, first_name, last_name")
      .in("id", data.user_ids);
    return { profiles: rows ?? [] };
  });

/**
 * Gate query for the NoteTriggerPrompt: did this client have a SUBMITTED
 * incident report on this date? The trigger-prompt's "Open form" path no
 * longer self-resolves — only an actual submission (or a reasoned dismissal)
 * clears the gate.
 */
export const hasSubmittedIncidentForClientDate = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      organization_id: z.string().uuid(),
      client_id: z.string().uuid(),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: AnySupabase; userId: string };
    if (!supabase || !userId) return { submitted: false, incident: null };
    const m = await getMembership(supabase, userId, data.organization_id);

    const start = new Date(`${data.date}T00:00:00`).toISOString();
    const end = new Date(`${data.date}T23:59:59.999`).toISOString();
    const { data: rows, error } = await supabase
      .from("incident_reports")
      .select("id, report_number")
      .eq("organization_id", m.organization_id)
      .eq("client_id", data.client_id)
      .gte("discovered_at", start)
      .lte("discovered_at", end)
      .limit(1);
    if (error) throw new Error(error.message);
    const ir = rows?.[0] ?? null;
    return { submitted: !!ir, incident: ir };
  });

/** Sign storage paths in the incident-photos bucket so the admin view can
 *  display thumbnails. Org-scoped: caller must be a member. */
export const signIncidentPhotos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      organization_id: z.string().uuid(),
      paths: z.array(z.string().min(1)).max(50),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: AnySupabase; userId: string };
    if (!supabase || !userId) return { urls: {} as Record<string, string> };
    await getMembership(supabase, userId, data.organization_id);

    if (!data.paths.length) return { urls: {} as Record<string, string> };
    const out: Record<string, string> = {};
    for (const p of data.paths) {
      const { data: signed } = await supabase.storage
        .from("incident-photos")
        .createSignedUrl(p, 60 * 30); // 30 minutes
      if (signed?.signedUrl) out[p] = signed.signedUrl;
    }
    return { urls: out };
  });
