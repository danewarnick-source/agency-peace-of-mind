/**
 * Three-party approval chain for HIVE-assisted requirement intake.
 *
 *   NECTAR drafts requirement   →   HIVE Executive approves the extraction
 *                                   →   Provider admin confirms applicability
 *
 * The HIVE Executive stage is explicitly a structural/accuracy check on what
 * NECTAR pulled from the authoritative source — NOT an endorsement of whether
 * the provider must follow the requirement. The provider is always the final
 * authority on their own obligations.
 *
 * Self-serve requirements (uploads where the provider did NOT request HIVE
 * assistance) skip this chain entirely and continue to use review_status as
 * they always have. Assisted-chain requirements are identified by
 * `approval_state IS NOT NULL` on nectar_requirements.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Json } from "@/integrations/supabase/types";

type ApprovalState =
  | "nectar_drafted"
  | "hive_exec_approved"
  | "hive_exec_rejected"
  | "provider_confirmed"
  | "provider_rejected";

async function resolveActorLabel(userId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("full_name, email")
    .eq("id", userId)
    .maybeSingle();
  return (
    (data?.full_name as string | null) ??
    (data?.email as string | null) ??
    null
  );
}

async function logEvent(input: {
  organizationId: string;
  requirementId: string;
  stage: "nectar" | "hive_exec" | "provider";
  action: "drafted" | "approved" | "rejected" | "confirmed" | "reopened";
  actorUserId: string | null;
  actorLabel: string | null;
  reason?: string | null;
}) {
  await supabaseAdmin.from("nectar_requirement_approval_events").insert({
    organization_id: input.organizationId,
    requirement_id: input.requirementId,
    stage: input.stage,
    action: input.action,
    actor_user_id: input.actorUserId,
    actor_label: input.actorLabel,
    reason: input.reason ?? null,
  });
}

/**
 * Called by the drafting pipeline (authoritative-sources.functions.ts) right
 * after a requirement row is inserted, when the source was uploaded with
 * "Request HIVE-assisted setup" turned on. Sets initial approval_state and
 * logs the draft event.
 */
export async function markDraftedByNectar(input: {
  organizationId: string;
  requirementId: string;
}) {
  await supabaseAdmin
    .from("nectar_requirements")
    .update({ approval_state: "nectar_drafted" as ApprovalState })
    .eq("id", input.requirementId);
  await logEvent({
    organizationId: input.organizationId,
    requirementId: input.requirementId,
    stage: "nectar",
    action: "drafted",
    actorUserId: null,
    actorLabel: "NECTAR",
  });
}

/** HIVE Executive queue — all requirements awaiting HIVE Exec approval. */
export const listPendingHiveExecApprovals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // Guard: only HIVE Executives.
    const { data: isExec } = await context.supabase.rpc("is_hive_executive", {
      _user: context.userId,
    });
    if (!isExec) throw new Error("HIVE Executive access required");

    const { data: rows, error } = await supabaseAdmin
      .from("nectar_requirements")
      .select(
        "id, organization_id, source_document_id, title, description, category, source_citation, applies_to, created_at",
      )
      .eq("approval_state", "nectar_drafted")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);

    const orgIds = [
      ...new Set((rows ?? []).map((r) => r.organization_id as string)),
    ];
    const docIds = [
      ...new Set(
        (rows ?? [])
          .map((r) => r.source_document_id as string | null)
          .filter((v): v is string => !!v),
      ),
    ];

    const [{ data: orgs }, { data: docs }] = await Promise.all([
      orgIds.length
        ? supabaseAdmin.from("organizations").select("id, name").in("id", orgIds)
        : Promise.resolve({ data: [] }),
      docIds.length
        ? supabaseAdmin
            .from("nectar_documents")
            .select("id, title, authoritative_kind")
            .in("id", docIds)
        : Promise.resolve({ data: [] }),
    ]);
    const orgMap = new Map(
      (orgs ?? []).map((o) => [o.id as string, o.name as string]),
    );
    const docMap = new Map(
      (docs ?? []).map((d) => [
        d.id as string,
        {
          title: d.title as string,
          kind: (d.authoritative_kind as string | null) ?? null,
        },
      ]),
    );

    return {
      items: (rows ?? []).map((r) => ({
        id: r.id as string,
        organizationId: r.organization_id as string,
        organizationName: orgMap.get(r.organization_id as string) ?? "Unknown",
        sourceDocumentId: r.source_document_id as string | null,
        sourceTitle:
          (r.source_document_id &&
            docMap.get(r.source_document_id as string)?.title) ||
          null,
        sourceKind:
          (r.source_document_id &&
            docMap.get(r.source_document_id as string)?.kind) ||
          null,
        title: r.title as string,
        description: (r.description as string | null) ?? null,
        category: (r.category as string | null) ?? null,
        sourceCitation: (r.source_citation as string | null) ?? null,
        appliesTo: (r.applies_to as string | null) ?? null,
        createdAt: r.created_at as string,
      })),
    };
  });

/** HIVE Executive approves NECTAR's extraction → ball moves to provider. */
export const hiveExecApproveRequirement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        requirementId: z.string().uuid(),
        note: z.string().max(2000).optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: isExec } = await context.supabase.rpc("is_hive_executive", {
      _user: context.userId,
    });
    if (!isExec) throw new Error("HIVE Executive access required");

    const { data: req, error: rErr } = await supabaseAdmin
      .from("nectar_requirements")
      .select("id, organization_id, title, approval_state")
      .eq("id", data.requirementId)
      .single();
    if (rErr || !req) throw new Error(rErr?.message ?? "Requirement not found");
    if (req.approval_state !== "nectar_drafted") {
      throw new Error(
        `Cannot approve from state "${req.approval_state}". Only NECTAR drafts can be approved.`,
      );
    }

    await supabaseAdmin
      .from("nectar_requirements")
      .update({ approval_state: "hive_exec_approved" as ApprovalState })
      .eq("id", data.requirementId);

    const actorLabel = await resolveActorLabel(context.userId);
    await logEvent({
      organizationId: req.organization_id as string,
      requirementId: req.id as string,
      stage: "hive_exec",
      action: "approved",
      actorUserId: context.userId,
      actorLabel,
      reason: data.note ?? null,
    });

    // Notify provider admins.
    await supabaseAdmin.from("notifications").insert({
      organization_id: req.organization_id,
      recipient_role: "admin",
      type: "requirement_awaiting_confirmation",
      urgency: "normal",
      title: "Requirement ready for your final confirmation",
      body: `NECTAR drafted "${(req.title as string).slice(0, 120)}" from one of your authoritative sources, and HIVE Executive has verified the extraction. Your confirmation is the final step before it becomes active.`,
      link_to: "/dashboard/authoritative-sources",
      related_id: req.id,
      related_type: "nectar_requirement",
    });

    return { ok: true };
  });

/** HIVE Executive sends draft back to NECTAR (rejected for re-extraction). */
export const hiveExecRejectRequirement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        requirementId: z.string().uuid(),
        reason: z.string().min(3).max(2000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: isExec } = await context.supabase.rpc("is_hive_executive", {
      _user: context.userId,
    });
    if (!isExec) throw new Error("HIVE Executive access required");

    const { data: req, error: rErr } = await supabaseAdmin
      .from("nectar_requirements")
      .select("id, organization_id, approval_state")
      .eq("id", data.requirementId)
      .single();
    if (rErr || !req) throw new Error(rErr?.message ?? "Requirement not found");

    await supabaseAdmin
      .from("nectar_requirements")
      .update({ approval_state: "hive_exec_rejected" as ApprovalState })
      .eq("id", data.requirementId);

    const actorLabel = await resolveActorLabel(context.userId);
    await logEvent({
      organizationId: req.organization_id as string,
      requirementId: req.id as string,
      stage: "hive_exec",
      action: "rejected",
      actorUserId: context.userId,
      actorLabel,
      reason: data.reason,
    });
    return { ok: true };
  });

/** Provider view — items waiting on their final confirmation. */
export const listProviderPendingConfirmations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ organizationId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    // RLS will scope reads; require org member explicitly for clarity.
    const { data: member } = await context.supabase
      .from("organization_members")
      .select("role, active")
      .eq("organization_id", data.organizationId)
      .eq("user_id", context.userId)
      .eq("active", true)
      .maybeSingle();
    if (!member) throw new Error("Not a member of this workspace");

    const { data: rows, error } = await context.supabase
      .from("nectar_requirements")
      .select(
        "id, title, description, category, source_citation, source_document_id, applies_to, created_at",
      )
      .eq("organization_id", data.organizationId)
      .eq("approval_state", "hive_exec_approved")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { items: rows ?? [] };
  });

/** Provider confirms → requirement becomes active. */
export const providerConfirmRequirement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        requirementId: z.string().uuid(),
        note: z.string().max(2000).optional().nullable(),
        // Optional provider-declared tracking at confirm-time.
        frequency: z
          .enum([
            "one_time",
            "per_employee",
            "per_shift",
            "per_code",
            "per_day",
            "per_week",
            "per_month",
            "per_quarter",
            "per_year",
            "per_billing_rate_unit",
            "ongoing",
          ])
          .nullable()
          .optional(),
        tellNectarNote: z.string().max(2000).nullable().optional(),
        lastCheckedAt: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .nullable()
          .optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: req, error: rErr } = await context.supabase
      .from("nectar_requirements")
      .select("id, organization_id, approval_state, metadata")
      .eq("id", data.requirementId)
      .single();
    if (rErr || !req) throw new Error(rErr?.message ?? "Requirement not found");

    const { data: isAdmin } = await context.supabase.rpc(
      "is_org_admin_or_manager",
      { _org: req.organization_id, _user: context.userId },
    );
    if (!isAdmin) throw new Error("Admin or Manager role required");

    if (req.approval_state !== "hive_exec_approved") {
      throw new Error(
        `Cannot confirm from state "${req.approval_state}". Awaits HIVE Executive approval first.`,
      );
    }

    const md = (req.metadata as Record<string, Json> | null) ?? {};
    const prevTracking = ((md["tracking"] as Record<string, Json> | undefined) ?? {}) as Record<
      string,
      Json
    >;
    const hasTracking =
      data.frequency !== undefined ||
      data.tellNectarNote !== undefined ||
      data.lastCheckedAt !== undefined;
    const nextTracking: Record<string, Json> = { ...prevTracking };
    if (data.frequency !== undefined) nextTracking.frequency = data.frequency ?? null;
    if (data.tellNectarNote !== undefined)
      nextTracking.tell_nectar_note =
        data.tellNectarNote && data.tellNectarNote.trim().length
          ? data.tellNectarNote.trim()
          : null;
    if (data.lastCheckedAt !== undefined)
      nextTracking.last_checked_at = data.lastCheckedAt ?? null;
    if (hasTracking) {
      nextTracking.updated_at = new Date().toISOString();
      nextTracking.updated_by = context.userId;
    }

    const baseUpdate = {
      approval_state: "provider_confirmed" as ApprovalState,
      review_status: "confirmed",
      verified: true,
      verified_by: context.userId,
      verified_at: new Date().toISOString(),
    };

    if (hasTracking) {
      const newMeta = { ...md, tracking: nextTracking } as Json;
      await context.supabase
        .from("nectar_requirements")
        .update({ ...baseUpdate, metadata: newMeta })
        .eq("id", data.requirementId);
    } else {
      await context.supabase
        .from("nectar_requirements")
        .update(baseUpdate)
        .eq("id", data.requirementId);
    } else {
      await context.supabase
        .from("nectar_requirements")
        .update(baseUpdate)
        .eq("id", data.requirementId);
    }

    const actorLabel = await resolveActorLabel(context.userId);
    await logEvent({
      organizationId: req.organization_id as string,
      requirementId: req.id as string,
      stage: "provider",
      action: "confirmed",
      actorUserId: context.userId,
      actorLabel,
      reason: data.note ?? null,
    });
    return { ok: true };
  });

/** Provider sends back — requirement is not active, returns to needs-review. */
export const providerRejectRequirement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        requirementId: z.string().uuid(),
        reason: z.string().min(3).max(2000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: req, error: rErr } = await context.supabase
      .from("nectar_requirements")
      .select("id, organization_id, approval_state")
      .eq("id", data.requirementId)
      .single();
    if (rErr || !req) throw new Error(rErr?.message ?? "Requirement not found");

    const { data: isAdmin } = await context.supabase.rpc(
      "is_org_admin_or_manager",
      { _org: req.organization_id, _user: context.userId },
    );
    if (!isAdmin) throw new Error("Admin or Manager role required");

    await context.supabase
      .from("nectar_requirements")
      .update({
        approval_state: "provider_rejected" as ApprovalState,
        review_status: "needs_attention",
      })
      .eq("id", data.requirementId);

    const actorLabel = await resolveActorLabel(context.userId);
    await logEvent({
      organizationId: req.organization_id as string,
      requirementId: req.id as string,
      stage: "provider",
      action: "rejected",
      actorUserId: context.userId,
      actorLabel,
      reason: data.reason,
    });

    // Notify HIVE Execs via an in-platform ticket-like notification on the
    // provider's behalf (recipient_role 'admin' inside provider org is fine —
    // HIVE Exec portal reads its own queue independently). Keep it simple.
    return { ok: true };
  });

/** Full approval-chain history for a single requirement. */
export const getApprovalHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ requirementId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("nectar_requirement_approval_events")
      .select("id, stage, action, actor_label, reason, created_at")
      .eq("requirement_id", data.requirementId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return { events: rows ?? [] };
  });
