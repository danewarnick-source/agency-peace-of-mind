/**
 * CRM Phase A1 — Referrals + Support Coordinators server fns.
 *
 * Gating: A1 uses admin/manager (mirrors `is_org_admin_or_manager`).
 * A3 will swap to the `manage_referrals` / `view_referrals` permissions
 * via `requirePermission()`. Staff have NO access — referral data is
 * PHI-adjacent (intake inquiries about prospective clients).
 *
 * NOT included in A1 (later increments): pipeline stage advancement,
 * activity log entries, match scoring, archive workflow, email send.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requirePermission, requireAnyPermission } from "@/lib/require-permission";

const orgOnly = z.object({ organization_id: z.string().uuid() });

const referralCategory = z.enum(["direct_support", "rhs", "hhs"]);
const referralSource = z.enum(["manual_upload", "call_capture", "email"]);

// ─── Support Coordinators ──────────────────────────────────────

export const listSupportCoordinators = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => orgOnly.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireAnyPermission(supabase, userId, data.organization_id, ["view_referrals", "manage_referrals"]);
    const { data: rows, error } = await supabase
      .from("support_coordinators")
      .select("id, name, agency, email, phone, region")
      .eq("organization_id", data.organization_id)
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

const createScInput = orgOnly.extend({
  name: z.string().trim().min(1).max(120),
  agency: z.string().trim().max(160).optional().nullable(),
  email: z.string().trim().email().max(255).optional().nullable().or(z.literal("")),
  phone: z.string().trim().max(40).optional().nullable(),
  region: z.string().trim().max(80).optional().nullable(),
});

export const createSupportCoordinator = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => createScInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requirePermission(supabase, userId, data.organization_id, "manage_referrals");
    const { data: row, error } = await supabase
      .from("support_coordinators")
      .insert({
        organization_id: data.organization_id,
        name: data.name,
        agency: data.agency || null,
        email: data.email ? data.email : null,
        phone: data.phone || null,
        region: data.region || null,
        created_by: userId,
      })
      .select("id, name, agency, email, phone, region")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

// ─── Referrals ─────────────────────────────────────────────────

const referralBase = {
  first_name: z.string().trim().min(1).max(120),
  age: z.number().int().min(0).max(120).optional().nullable(),
  gender: z.string().trim().max(40).optional().nullable(),
  date_of_birth: z.string().optional().nullable(), // ISO date
  location_city: z.string().trim().max(120).optional().nullable(),
  location_county: z.string().trim().max(120).optional().nullable(),
  disability_types: z.array(z.string().trim().max(80)).max(20).default([]),
  disability_level: z.string().trim().max(80).optional().nullable(),
  requested_codes: z.array(z.string().trim().max(20)).max(40).default([]),
  budget_note: z.string().trim().max(500).optional().nullable(),
  need_level: z.string().trim().max(80).optional().nullable(),
  description: z.string().trim().max(4000).optional().nullable(),
  notes: z.string().trim().max(8000).optional().nullable(),
  category: referralCategory.optional().nullable(),
  source: referralSource.default("manual_upload"),
  support_coordinator_id: z.string().uuid().optional().nullable(),
  due_date: z.string().optional().nullable(), // ISO date
};


const createReferralInput = orgOnly.extend(referralBase);

export const listReferrals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => orgOnly.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireAnyPermission(supabase, userId, data.organization_id, ["view_referrals", "manage_referrals"]);
    const { data: rows, error } = await supabase
      .from("referrals")
      .select(
        "id, first_name, age, gender, location_city, location_county, disability_types, disability_level, requested_codes, budget_note, need_level, description, notes, category, source, support_coordinator_id, due_date, status, stage, stage_entered_at, decision_outcome, decision_reason, created_at",
      )
      .eq("organization_id", data.organization_id)
      .neq("status", "archived")
      .is("archived_at", null)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const createReferral = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => createReferralInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requirePermission(supabase, userId, data.organization_id, "manage_referrals");

    const { data: row, error } = await supabase
      .from("referrals")
      .insert({
        organization_id: data.organization_id,
        first_name: data.first_name,
        age: data.age ?? null,
        gender: data.gender || null,
        date_of_birth: data.date_of_birth || null,
        location_city: data.location_city || null,
        location_county: data.location_county || null,
        disability_types: data.disability_types ?? [],
        disability_level: data.disability_level || null,
        requested_codes: data.requested_codes ?? [],
        budget_note: data.budget_note || null,
        need_level: data.need_level || null,
        description: data.description || null,
        notes: data.notes || null,
        category: data.category ?? null,
        source: data.source ?? "manual_upload",
        support_coordinator_id: data.support_coordinator_id || null,
        due_date: data.due_date || null,
        created_by: userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });


const dupCheckInput = orgOnly.extend({
  first_name: z.string().trim().min(1).max(120),
  age: z.number().int().min(0).max(120).optional().nullable(),
  support_coordinator_id: z.string().uuid().optional().nullable(),
});

export const findPossibleDuplicateReferral = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => dupCheckInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireAnyPermission(supabase, userId, data.organization_id, ["view_referrals", "manage_referrals"]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rows, error } = await (supabase as any).rpc(
      "find_possible_duplicate_referral",
      {
        _organization_id: data.organization_id,
        _first_name: data.first_name,
        _age: data.age ?? null,
        _support_coordinator_id: data.support_coordinator_id ?? null,
      },
    );
    if (error) throw new Error(error.message);
    return (rows ?? []) as Array<{
      id: string;
      first_name: string;
      age: number | null;
      category: string;
      support_coordinator_id: string | null;
      created_at: string;
    }>;
  });

// ════════════════════════════════════════════════════════════════
// A2 — Pipeline stage + immutable activity log
// ════════════════════════════════════════════════════════════════

export const REFERRAL_STAGES = [
  "new",
  "reviewing",
  "initial_contact",
  "iso_meeting",
  "follow_up",
  "decision",
] as const;
export type ReferralStage = (typeof REFERRAL_STAGES)[number];

export const REFERRAL_STAGE_LABEL: Record<ReferralStage, string> = {
  new: "New",
  reviewing: "Reviewing",
  initial_contact: "Initial contact",
  iso_meeting: "ISO meeting",
  follow_up: "Follow-up",
  decision: "Decision",
};

const stageEnum = z.enum(REFERRAL_STAGES);
const outcomeEnum = z.enum(["placed", "passed"]);

// ─── Stage advancement ────────────────────────────────────────
// Stage-change activity row is auto-inserted by the DB trigger.

const updateStageInput = orgOnly.extend({
  referral_id: z.string().uuid(),
  stage: stageEnum,
  decision_outcome: outcomeEnum.optional().nullable(),
  decision_reason: z.string().trim().max(2000).optional().nullable(),
});

export const updateReferralStage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => updateStageInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requirePermission(supabase, userId, data.organization_id, "manage_referrals");

    const patch = {
      stage: data.stage,
      decision_outcome:
        data.stage === "decision" ? (data.decision_outcome ?? null) : null,
      decision_reason:
        data.stage === "decision" ? (data.decision_reason || null) : null,
    };
    if (data.stage === "decision" && !data.decision_outcome) {
      throw new Error("Decision outcome (placed/passed) is required");
    }

    const { error } = await supabase
      .from("referrals")
      .update(patch)
      .eq("id", data.referral_id)
      .eq("organization_id", data.organization_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ─── Activity log ─────────────────────────────────────────────

const activityTypeEnum = z.enum(["contact", "meeting", "note", "email"]);
const channelEnum = z.enum(["phone", "email", "in_person", "zoom"]);

const addActivityInput = orgOnly.extend({
  referral_id: z.string().uuid(),
  activity_type: activityTypeEnum,
  channel: channelEnum.optional().nullable(),
  occurred_at: z.string().optional().nullable(),
  body: z.string().trim().max(8000).optional().nullable(),
});

export const addReferralActivity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => addActivityInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requirePermission(supabase, userId, data.organization_id, "manage_referrals");
    const { data: row, error } = await supabase
      .from("referral_activities")
      .insert({
        organization_id: data.organization_id,
        referral_id: data.referral_id,
        activity_type: data.activity_type,
        channel: data.channel || null,
        occurred_at: data.occurred_at || new Date().toISOString(),
        body: data.body || null,
        created_by: userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

// "Edit" a note → new row that supersedes the original. Original is preserved.
const editNoteInput = orgOnly.extend({
  original_id: z.string().uuid(),
  body: z.string().trim().min(1).max(8000),
});

export const editReferralNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => editNoteInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requirePermission(supabase, userId, data.organization_id, "manage_referrals");
    const { data: orig, error: oErr } = await supabase
      .from("referral_activities")
      .select("id, organization_id, referral_id, activity_type, channel, occurred_at")
      .eq("id", data.original_id)
      .single();
    if (oErr || !orig) throw new Error("Original activity not found");
    if (orig.organization_id !== data.organization_id) throw new Error("Forbidden");

    const { data: row, error } = await supabase
      .from("referral_activities")
      .insert({
        organization_id: orig.organization_id,
        referral_id: orig.referral_id,
        activity_type: orig.activity_type,
        channel: orig.channel,
        occurred_at: orig.occurred_at,
        body: data.body,
        created_by: userId,
        supersedes_id: orig.id,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const listReferralActivities = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    orgOnly.extend({ referral_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireAnyPermission(supabase, userId, data.organization_id, ["view_referrals", "manage_referrals"]);
    const { data: rows, error } = await supabase
      .from("referral_activities")
      .select(
        "id, activity_type, channel, occurred_at, body, created_by, supersedes_id, stage_from, stage_to, created_at",
      )
      .eq("referral_id", data.referral_id)
      .order("occurred_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

// ─── Reporting hook ───────────────────────────────────────────

export const getReferralPipelineStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => orgOnly.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireAnyPermission(supabase, userId, data.organization_id, ["view_referrals", "manage_referrals"]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: stats, error } = await (supabase as any).rpc(
      "get_referral_pipeline_stats",
      { _organization_id: data.organization_id },
    );
    if (error) throw new Error(error.message);
    return stats as {
      by_stage: Partial<Record<ReferralStage, number>>;
      placed: number;
      passed: number;
      total: number;
    };
  });
