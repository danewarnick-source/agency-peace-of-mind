// Server functions for remediation plans, solo-lapse checks, and This Week.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireOrgMembership } from "@/integrations/supabase/require-org";
import {
  emptyAlreadyAssigned,
  emptyAutomationHeartbeat,
  emptyQuietLine,
  getThisWeek,
  type ThisWeekResult,
} from "./this-week.functions.ts";
import {
  hasActiveSoloOverride,
  initialRemediationPlanStatus,
  loadAwaitingApprovalPlans,
  resolveEscalationsForPlan,
  tableMissing,
  type RemediationPlanKind,
  type RemediationPlanRow,
} from "./remediation.ts";
import {
  buildOverrideInsert,
  overrideIsActive,
  parseOverrideScope,
  type OverrideRow,
  type OverrideScope,
} from "./overrides.ts";
import {
  BLOCKS_SOLO_WHEN_LAPSED_KEYS,
  filterSoloLapsesForClient,
  soloLapseLabel,
  type SoloLapse,
  type SoloLapseClientContext,
} from "./solo-lapse.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any;

const KIND_Z = z.enum([
  "solo_lapse",
  "scheduled_while_lapsed",
  "overdue",
  "standing_missing",
  "license_risk",
]);

async function requireManager(
  supabase: AnySupabase,
  userId: string,
  organizationId: string,
): Promise<void> {
  await requireOrgMembership(supabase, userId, organizationId, "manager");
}

export const getThisWeekForUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ organizationId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }): Promise<ThisWeekResult> => {
    const { supabase, userId } = context as { supabase: AnySupabase; userId: string };
    if (!supabase || !userId) {
      return {
        items: [],
        quiet: emptyQuietLine(),
        alreadyAssigned: emptyAlreadyAssigned(),
        automation: emptyAutomationHeartbeat(),
      };
    }
    await requireOrgMembership(supabase, userId, data.organizationId, "employee");
    return getThisWeek(supabase, data.organizationId, userId);
  });

export async function loadSoloLapsesForStaffInternal(
  supabase: AnySupabase,
  organizationId: string,
  staffId: string,
  client?: SoloLapseClientContext | null,
  now: Date = new Date(),
): Promise<SoloLapse[]> {
  const { data: obs, error: oErr } = await supabase
    .from("company_obligations")
    .select("id, title, key")
    .eq("organization_id", organizationId)
    .eq("active", true)
    .in("key", [...BLOCKS_SOLO_WHEN_LAPSED_KEYS]);
  if (oErr) {
    if (tableMissing(oErr.message)) return [];
    throw new Error(oErr.message);
  }
  const obligations = (obs ?? []) as Array<{ id: string; title: string; key: string | null }>;
  if (!obligations.length) return [];
  const byId = new Map(obligations.map((o) => [o.id, o]));

  const { data: insts, error: iErr } = await supabase
    .from("company_obligation_instances")
    .select("id, obligation_id, status, due_at, assignee_staff_id")
    .eq("organization_id", organizationId)
    .in(
      "obligation_id",
      obligations.map((o) => o.id),
    )
    .in("status", ["pending", "overdue"])
    .eq("assignee_staff_id", staffId);
  if (iErr) {
    if (tableMissing(iErr.message)) return [];
    throw new Error(iErr.message);
  }

  const lapses: SoloLapse[] = [];
  const seenKeys = new Set<string>();
  for (const inst of (insts ?? []) as Array<{
    id: string;
    obligation_id: string;
    status: string;
    due_at: string;
    assignee_staff_id: string | null;
  }>) {
    const ob = byId.get(inst.obligation_id);
    if (!ob?.key) continue;
    const dueMs = new Date(inst.due_at).getTime();
    const lapsed = inst.status === "overdue" || (!Number.isNaN(dueMs) && dueMs < now.getTime());
    if (!lapsed) continue;
    if (seenKeys.has(ob.key)) continue;
    seenKeys.add(ob.key);
    lapses.push({
      obligationKey: ob.key,
      obligationId: ob.id,
      instanceId: inst.id,
      title: ob.title,
      dueAt: inst.due_at,
      label: soloLapseLabel(ob.key),
    });
  }

  const applicable = filterSoloLapsesForClient(lapses, client);
  const open: SoloLapse[] = [];
  for (const row of applicable) {
    const covered = await hasActiveSoloOverride(
      supabase,
      organizationId,
      staffId,
      row.obligationKey,
      now,
    );
    if (!covered) open.push(row);
  }
  return open;
}

export const listSoloLapsesForStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        organizationId: z.string().uuid(),
        staffId: z.string().uuid(),
        hasAbi: z.boolean().optional(),
        hasBehaviorPlan: z.boolean().optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }): Promise<SoloLapse[]> => {
    const { supabase, userId } = context as { supabase: AnySupabase; userId: string };
    if (!supabase || !userId) return [];
    await requireOrgMembership(supabase, userId, data.organizationId, "employee");
    return loadSoloLapsesForStaffInternal(supabase, data.organizationId, data.staffId, {
      hasAbi: data.hasAbi,
      hasBehaviorPlan: data.hasBehaviorPlan,
    });
  });

const OVERRIDE_SCOPE_Z = z.enum(["instance", "staff_clock", "shift"]);

const OVERRIDE_SELECT =
  "id, organization_id, staff_id, obligation_id, instance_id, obligation_key, gap_key, gap_type, kind, reason, expires_at, created_by, created_at, shift_id";

export type ObligationOverrideView = OverrideRow & {
  scope: OverrideScope | null;
  active: boolean;
  authorized_by: string | null;
};

async function insertObligationOverride(
  supabase: AnySupabase,
  userId: string,
  data: {
    organizationId: string;
    staffId: string;
    obligationKey: string;
    obligationId?: string | null;
    instanceId?: string | null;
    shiftId?: string | null;
    scope: OverrideScope;
    reason: string;
    expiresAt: string;
  },
  now: Date = new Date(),
): Promise<{ id: string }> {
  const payload = buildOverrideInsert({
    organizationId: data.organizationId,
    staffId: data.staffId,
    obligationKey: data.obligationKey,
    obligationId: data.obligationId,
    instanceId: data.instanceId,
    shiftId: data.shiftId,
    scope: data.scope,
    reason: data.reason,
    expiresAt: data.expiresAt,
    createdBy: userId,
    now,
  });
  const { data: row, error } = await supabase
    .from("compliance_overrides")
    .insert(payload)
    .select("id")
    .single();
  if (error) {
    if (tableMissing(error.message)) {
      throw new Error("Overrides are not available yet.");
    }
    throw new Error(error.message);
  }
  return { id: (row as { id: string }).id };
}

async function mapOverrideViews(
  supabase: AnySupabase,
  rows: OverrideRow[],
  now: Date,
): Promise<ObligationOverrideView[]> {
  const actorIds = Array.from(
    new Set(rows.map((r) => r.created_by).filter((id): id is string => !!id)),
  );
  const names = new Map<string, string>();
  if (actorIds.length) {
    const { data: dir, error } = await supabase
      .from("org_member_directory")
      .select("id, full_name")
      .in("id", actorIds);
    if (error && !tableMissing(error.message)) throw new Error(error.message);
    for (const person of (dir ?? []) as Array<{ id: string | null; full_name: string | null }>) {
      if (person.id && person.full_name) names.set(person.id, person.full_name);
    }
  }
  return rows.map((row) => ({
    ...row,
    scope: parseOverrideScope(row.gap_type) ?? parseOverrideScope(row.kind),
    active: overrideIsActive(row.expires_at, now),
    authorized_by: row.created_by ? (names.get(row.created_by) ?? row.created_by) : null,
  }));
}

export const recordObligationOverride = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        organizationId: z.string().uuid(),
        staffId: z.string().uuid(),
        obligationKey: z.string().min(1).max(80),
        obligationId: z.string().uuid().nullable().optional(),
        instanceId: z.string().uuid().nullable().optional(),
        reason: z.string().min(8).max(500),
        scope: OVERRIDE_SCOPE_Z,
        expiresAt: z.string().min(1),
        shiftId: z.string().uuid().nullable().optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const { supabase, userId } = context as { supabase: AnySupabase; userId: string };
    if (!supabase || !userId) throw new Error("Not authenticated");
    await requireManager(supabase, userId, data.organizationId);
    return insertObligationOverride(supabase, userId, data);
  });

export const recordSoloOverride = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        organizationId: z.string().uuid(),
        staffId: z.string().uuid(),
        obligationKey: z.string().min(1).max(80),
        obligationId: z.string().uuid().nullable().optional(),
        instanceId: z.string().uuid().nullable().optional(),
        reason: z.string().min(8).max(500),
        shiftId: z.string().uuid().nullable().optional(),
        expiresAt: z.string().min(1),
        scope: OVERRIDE_SCOPE_Z.optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const { supabase, userId } = context as { supabase: AnySupabase; userId: string };
    if (!supabase || !userId) throw new Error("Not authenticated");
    await requireManager(supabase, userId, data.organizationId);
    return insertObligationOverride(supabase, userId, {
      ...data,
      scope: data.scope ?? (data.instanceId ? "instance" : "staff_clock"),
    });
  });

export const listOverridesForStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        organizationId: z.string().uuid(),
        staffId: z.string().uuid(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }): Promise<ObligationOverrideView[]> => {
    const { supabase, userId } = context as { supabase: AnySupabase; userId: string };
    if (!supabase || !userId) return [];
    if (data.staffId === userId) {
      await requireOrgMembership(supabase, userId, data.organizationId, "employee");
    } else {
      await requireManager(supabase, userId, data.organizationId);
    }
    const { data: rows, error } = await supabase
      .from("compliance_overrides")
      .select(OVERRIDE_SELECT)
      .eq("organization_id", data.organizationId)
      .eq("staff_id", data.staffId)
      .order("created_at", { ascending: true });
    if (error) {
      if (tableMissing(error.message)) return [];
      throw new Error(error.message);
    }
    return mapOverrideViews(supabase, (rows ?? []) as OverrideRow[], new Date());
  });

export const listOverridesForOrg = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ organizationId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }): Promise<ObligationOverrideView[]> => {
    const { supabase, userId } = context as { supabase: AnySupabase; userId: string };
    if (!supabase || !userId) return [];
    await requireManager(supabase, userId, data.organizationId);
    const { data: rows, error } = await supabase
      .from("compliance_overrides")
      .select(OVERRIDE_SELECT)
      .eq("organization_id", data.organizationId)
      .order("created_at", { ascending: true });
    if (error) {
      if (tableMissing(error.message)) return [];
      throw new Error(error.message);
    }
    return mapOverrideViews(supabase, (rows ?? []) as OverrideRow[], new Date());
  });

export const proposeRemediationPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        organizationId: z.string().uuid(),
        kind: KIND_Z,
        title: z.string().min(1).max(200),
        planText: z.string().min(8).max(2000),
        obligationKey: z.string().max(80).nullable().optional(),
        obligationId: z.string().uuid().nullable().optional(),
        instanceId: z.string().uuid().nullable().optional(),
        staffId: z.string().uuid().nullable().optional(),
        dueAt: z.string().nullable().optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const { supabase, userId } = context as { supabase: AnySupabase; userId: string };
    if (!supabase || !userId) throw new Error("Not authenticated");
    await requireManager(supabase, userId, data.organizationId);
    if (
      (data.kind === "license_risk" ||
        data.kind === "standing_missing" ||
        data.kind === "overdue") &&
      !data.dueAt
    ) {
      throw new Error("Due date is required.");
    }
    const status = initialRemediationPlanStatus(data.kind);
    const now = new Date().toISOString();
    const { data: row, error } = await supabase
      .from("remediation_plans")
      .insert({
        organization_id: data.organizationId,
        kind: data.kind,
        title: data.title,
        plan_text: data.planText,
        obligation_key: data.obligationKey ?? null,
        obligation_id: data.obligationId ?? null,
        instance_id: data.instanceId ?? null,
        staff_id: data.staffId ?? null,
        due_at: data.dueAt ?? null,
        status,
        proposed_by: userId,
        ...(status === "approved"
          ? {
              reviewed_by: userId,
              reviewed_at: now,
              outcome: "approved",
              outcome_at: now,
            }
          : {}),
      })
      .select("id, instance_id, obligation_id")
      .single();
    if (error) {
      if (tableMissing(error.message)) {
        throw new Error(
          "Remediation plans table is not live yet. Soft Core must apply Step 4 SQL.",
        );
      }
      if (/duplicate|unique/i.test(error.message)) {
        const existing = await loadAwaitingApprovalPlans(supabase, data.organizationId);
        const match = existing.find(
          (p) =>
            p.kind === data.kind &&
            (data.instanceId
              ? p.instance_id === data.instanceId
              : p.obligation_id === data.obligationId),
        );
        if (match) return { id: match.id };
      }
      throw new Error(error.message);
    }
    const created = row as Pick<RemediationPlanRow, "id" | "instance_id" | "obligation_id">;
    if (status === "approved") {
      await resolveEscalationsForPlan(supabase, data.organizationId, created);
    }
    return { id: created.id };
  });

export const reviewRemediationPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        organizationId: z.string().uuid(),
        planId: z.string().uuid(),
        decision: z.enum(["approved", "rejected"]),
        note: z.string().max(500).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { supabase, userId } = context as { supabase: AnySupabase; userId: string };
    if (!supabase || !userId) throw new Error("Not authenticated");
    await requireManager(supabase, userId, data.organizationId);
    const now = new Date().toISOString();
    const { data: plan, error: getErr } = await supabase
      .from("remediation_plans")
      .select("id, instance_id, obligation_id, status")
      .eq("organization_id", data.organizationId)
      .eq("id", data.planId)
      .maybeSingle();
    if (getErr) {
      if (tableMissing(getErr.message)) {
        throw new Error(
          "Remediation plans table is not live yet. Soft Core must apply Step 4 SQL.",
        );
      }
      throw new Error(getErr.message);
    }
    if (!plan) throw new Error("Plan not found");
    const row = plan as Pick<RemediationPlanRow, "id" | "instance_id" | "obligation_id" | "status">;
    if (row.status !== "awaiting_approval" && row.status !== "draft") {
      throw new Error("Plan is no longer awaiting approval");
    }
    const { error } = await supabase
      .from("remediation_plans")
      .update({
        status: data.decision,
        outcome: data.decision,
        outcome_note: data.note ?? null,
        outcome_at: now,
        reviewed_by: userId,
        reviewed_at: now,
        updated_at: now,
      })
      .eq("id", data.planId)
      .eq("organization_id", data.organizationId);
    if (error) throw new Error(error.message);
    if (data.decision === "approved") {
      await resolveEscalationsForPlan(supabase, data.organizationId, row);
    }
    return { ok: true };
  });

export type { RemediationPlanKind, SoloLapse };
