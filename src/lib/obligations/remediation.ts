// Remediation plans + override outcomes (Compliance revamp Step 4).
// Nightly path is called from the Step 2 evaluator. getThisWeek source 1
// maps awaiting_approval rows. No second escalation writer.

import {
  evaluateOrgEscalations,
  isAdminLevelRole,
  listActiveOrganizationIds,
  pickAdminLevelRecipient,
  type EscalationHit,
  type EscalationUrgency,
  type OrgMemberRow,
  type PersistResult,
} from "./escalation.ts";
import {
  BLOCKS_SOLO_WHEN_LAPSED_KEYS,
  isBlocksSoloWhenLapsedKey,
  overrideIsActive,
} from "./solo-lapse.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any;

export const REMEDIATION_PLAN_KINDS = [
  "solo_lapse",
  "scheduled_while_lapsed",
  "overdue",
  "standing_missing",
  "license_risk",
] as const;

export type RemediationPlanKind = (typeof REMEDIATION_PLAN_KINDS)[number];

export const REMEDIATION_PLAN_STATUSES = [
  "draft",
  "awaiting_approval",
  "approved",
  "rejected",
  "completed",
  "expired",
] as const;

export type RemediationPlanStatus = (typeof REMEDIATION_PLAN_STATUSES)[number];

export const OPEN_REMEDIATION_STATUSES: RemediationPlanStatus[] = [
  "draft",
  "awaiting_approval",
];

export type RemediationPlanRow = {
  id: string;
  organization_id: string;
  obligation_id: string | null;
  instance_id: string | null;
  staff_id: string | null;
  obligation_key: string | null;
  title: string;
  kind: RemediationPlanKind;
  status: RemediationPlanStatus;
  plan_text: string;
  due_at: string | null;
  proposed_by: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  outcome: string | null;
  outcome_note: string | null;
  outcome_at: string | null;
  created_at?: string | null;
};

export type PlanOutcomeSummary = {
  ensured: number;
  completed: number;
  expired: number;
  resolvedNotifications: number;
  skipped: number;
};

export function tableMissing(message: string | undefined): boolean {
  return (
    !!message && /does not exist|schema cache|relation|could not find the table/i.test(message)
  );
}

export function kindFromEscalationTrigger(
  trigger: EscalationHit["trigger"],
  obligationKey: string | null | undefined,
): RemediationPlanKind | null {
  if (trigger === "would_create_finding_if_scheduled") return "scheduled_while_lapsed";
  if (trigger === "standing_record_missing_30d") return "standing_missing";
  if (trigger === "license_or_repayment_risk") return "license_risk";
  if (trigger === "overdue" && isBlocksSoloWhenLapsedKey(obligationKey)) return "solo_lapse";
  if (trigger === "overdue") return "overdue";
  return null;
}

export function urgencyForPlan(kind: RemediationPlanKind, overdue: boolean): EscalationUrgency {
  if (kind === "license_risk") return "critical";
  if (kind === "solo_lapse" || kind === "scheduled_while_lapsed") return "high";
  if (overdue) return "high";
  if (kind === "standing_missing") return "high";
  return "normal";
}

export function consequenceForPlanKind(kind: RemediationPlanKind): string {
  switch (kind) {
    case "solo_lapse":
      return "Staff cannot work alone until this clock is current or a manager override is recorded.";
    case "scheduled_while_lapsed":
      return "Each scheduled shift while lapsed is a review-tool finding. Approve a plan or reassign.";
    case "overdue":
      return "Plan is awaiting approval so the overdue clock can close.";
    case "standing_missing":
      return "Standing record is still missing. Admin-level approval required.";
    case "license_risk":
      return "License or repayment item. Admin-level plan approval required.";
  }
}

export function planOwnerLabel(kind: RemediationPlanKind): "admin_level" | "manager" {
  return kind === "license_risk" || kind === "standing_missing" ? "admin_level" : "manager";
}

/** Status on first insert. Overdue follows planOwnerLabel — do not guess. */
export function initialRemediationPlanStatus(
  kind: RemediationPlanKind,
): Extract<RemediationPlanStatus, "awaiting_approval" | "approved"> {
  if (kind !== "overdue") return "awaiting_approval";
  return planOwnerLabel(kind) === "admin_level" ? "awaiting_approval" : "approved";
}

export function pickPlanOwner(
  kind: RemediationPlanKind,
  staffId: string | null,
  members: OrgMemberRow[],
): string | null {
  if (kind === "license_risk" || kind === "standing_missing") {
    return pickAdminLevelRecipient(members);
  }
  if (staffId) {
    const row = members.find((m) => m.user_id === staffId);
    if (row?.manager_id) {
      const byId = members.find((m) => m.id === row.manager_id);
      if (byId) return byId.user_id;
      const byUser = members.find((m) => m.user_id === row.manager_id);
      if (byUser) return byUser.user_id;
    }
  }
  const managers = members.filter((m) => {
    if (m.active === false) return false;
    return m.role === "manager" || m.role === "program_manager" || isAdminLevelRole(m.role);
  });
  if (!managers.length) return pickAdminLevelRecipient(members);
  return [...managers].sort((a, b) => a.user_id.localeCompare(b.user_id))[0]!.user_id;
}

function planTextForHit(hit: EscalationHit): string {
  // Obligation title + trigger only. No client or staff names in stored copy
  // that could later land in push.
  if (hit.trigger === "would_create_finding_if_scheduled") {
    return `Restore ${hit.title} before the next published shift.`;
  }
  if (hit.trigger === "overdue" && isBlocksSoloWhenLapsedKey(hit.obligationKey)) {
    return `Restore ${hit.title} before this staff works alone.`;
  }
  return `Close ${hit.title}. ${hit.consequence}`;
}

export async function loadAwaitingApprovalPlans(
  supabase: AnySupabase,
  organizationId: string,
): Promise<RemediationPlanRow[]> {
  const { data, error } = await supabase
    .from("remediation_plans")
    .select(
      "id, organization_id, obligation_id, instance_id, staff_id, obligation_key, title, kind, status, plan_text, due_at, proposed_by, reviewed_by, reviewed_at, outcome, outcome_note, outcome_at, created_at",
    )
    .eq("organization_id", organizationId)
    .eq("status", "awaiting_approval");
  if (error) {
    if (tableMissing(error.message)) return [];
    throw new Error(error.message);
  }
  return (data ?? []) as RemediationPlanRow[];
}

export async function resolveEscalationsForPlan(
  supabase: AnySupabase,
  organizationId: string,
  plan: Pick<RemediationPlanRow, "instance_id" | "obligation_id">,
): Promise<number> {
  const related = [plan.instance_id, plan.obligation_id].filter((id): id is string => !!id);
  if (!related.length) return 0;
  const { data, error } = await supabase
    .from("notifications")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("type", "escalation")
    .is("resolved_at", null)
    .in("related_id", related);
  if (error) {
    if (tableMissing(error.message)) return 0;
    throw new Error(error.message);
  }
  const ids = ((data ?? []) as Array<{ id: string }>).map((r) => r.id);
  if (!ids.length) return 0;
  const { error: upErr } = await supabase
    .from("notifications")
    .update({ resolved_at: new Date().toISOString() })
    .in("id", ids);
  if (upErr) throw new Error(upErr.message);
  return ids.length;
}

async function markPlanOutcome(
  supabase: AnySupabase,
  planId: string,
  status: RemediationPlanStatus,
  outcome: string,
  note: string,
): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("remediation_plans")
    .update({
      status,
      outcome,
      outcome_note: note,
      outcome_at: now,
      updated_at: now,
    })
    .eq("id", planId);
  if (error) throw new Error(error.message);
}

export async function ensurePlansFromHits(
  supabase: AnySupabase,
  organizationId: string,
  hits: EscalationHit[],
): Promise<number> {
  let ensured = 0;
  for (const hit of hits) {
    const kind = kindFromEscalationTrigger(hit.trigger, hit.obligationKey);
    if (!kind) continue;
    if (
      kind !== "solo_lapse" &&
      kind !== "scheduled_while_lapsed" &&
      kind !== "license_risk"
    ) {
      continue;
    }
    const row = {
      organization_id: organizationId,
      obligation_id: hit.obligationId,
      instance_id: hit.instanceId,
      staff_id: hit.subject.staffUserId,
      obligation_key: hit.obligationKey,
      title: hit.title,
      kind,
      status: "awaiting_approval",
      plan_text: planTextForHit(hit),
      due_at: hit.dueAt,
      proposed_by: null,
    };
    const { error } = await supabase.from("remediation_plans").insert(row);
    if (error) {
      if (tableMissing(error.message)) return ensured;
      if (/duplicate|unique|open_instance|open_ob/i.test(error.message)) continue;
      throw new Error(error.message);
    }
    ensured += 1;
  }
  return ensured;
}

export async function applyRemediationPlanOutcomes(
  supabase: AnySupabase,
  organizationId: string,
  hits: EscalationHit[],
  now: Date = new Date(),
): Promise<PlanOutcomeSummary> {
  const summary: PlanOutcomeSummary = {
    ensured: 0,
    completed: 0,
    expired: 0,
    resolvedNotifications: 0,
    skipped: 0,
  };

  const { data: openRows, error: openErr } = await supabase
    .from("remediation_plans")
    .select(
      "id, organization_id, obligation_id, instance_id, staff_id, obligation_key, title, kind, status, plan_text, due_at, proposed_by, reviewed_by, reviewed_at, outcome, outcome_note, outcome_at",
    )
    .eq("organization_id", organizationId)
    .in("status", OPEN_REMEDIATION_STATUSES);
  if (openErr) {
    if (tableMissing(openErr.message)) return summary;
    throw new Error(openErr.message);
  }
  const open = (openRows ?? []) as RemediationPlanRow[];

  const instanceIds = [
    ...new Set(open.map((p) => p.instance_id).filter((id): id is string => !!id)),
  ];
  const completedIds = new Set<string>();
  if (instanceIds.length) {
    const { data: insts, error: iErr } = await supabase
      .from("company_obligation_instances")
      .select("id, status, completed_at")
      .in("id", instanceIds);
    if (iErr && !tableMissing(iErr.message)) throw new Error(iErr.message);
    for (const row of (insts ?? []) as Array<{
      id: string;
      status: string;
      completed_at: string | null;
    }>) {
      if (row.status === "completed" || row.completed_at) completedIds.add(row.id);
    }
  }

  for (const plan of open) {
    if (plan.instance_id && completedIds.has(plan.instance_id)) {
      await markPlanOutcome(
        supabase,
        plan.id,
        "completed",
        "completed",
        "Instance completed.",
      );
      summary.completed += 1;
      summary.resolvedNotifications += await resolveEscalationsForPlan(
        supabase,
        organizationId,
        plan,
      );
      continue;
    }
    if (plan.status === "approved") {
      summary.resolvedNotifications += await resolveEscalationsForPlan(
        supabase,
        organizationId,
        plan,
      );
      continue;
    }
    if (
      plan.status === "awaiting_approval" &&
      plan.due_at &&
      new Date(plan.due_at).getTime() < now.getTime() &&
      plan.kind !== "solo_lapse" &&
      plan.kind !== "scheduled_while_lapsed"
    ) {
      // Solo / scheduled-while-lapsed stay open until current — do not expire
      // a safety plan just because the original clock was already overdue.
      await markPlanOutcome(
        supabase,
        plan.id,
        "expired",
        "expired",
        "Plan window elapsed without approval.",
      );
      summary.expired += 1;
      continue;
    }
    summary.skipped += 1;
  }

  const { data: approvedRows, error: apErr } = await supabase
    .from("remediation_plans")
    .select("id, instance_id, obligation_id, outcome")
    .eq("organization_id", organizationId)
    .eq("status", "approved")
    .is("outcome_at", null);
  if (!apErr) {
    for (const plan of (approvedRows ?? []) as Array<
      Pick<RemediationPlanRow, "id" | "instance_id" | "obligation_id">
    >) {
      const nowIso = now.toISOString();
      const { error: stampErr } = await supabase
        .from("remediation_plans")
        .update({
          outcome: "approved",
          outcome_at: nowIso,
          updated_at: nowIso,
        })
        .eq("id", plan.id)
        .is("outcome_at", null);
      if (stampErr && !tableMissing(stampErr.message)) throw new Error(stampErr.message);
      summary.resolvedNotifications += await resolveEscalationsForPlan(
        supabase,
        organizationId,
        plan,
      );
    }
  } else if (!tableMissing(apErr.message)) {
    throw new Error(apErr.message);
  }

  summary.ensured += await ensurePlansFromHits(supabase, organizationId, hits);
  return summary;
}

export async function hasActiveSoloOverride(
  supabase: AnySupabase,
  organizationId: string,
  staffId: string,
  obligationKey: string,
  now: Date = new Date(),
): Promise<boolean> {
  const { data, error } = await supabase
    .from("compliance_overrides")
    .select("id, expires_at, obligation_key, gap_key")
    .eq("organization_id", organizationId)
    .eq("staff_id", staffId);
  if (error) {
    if (tableMissing(error.message)) return false;
    throw new Error(error.message);
  }
  return ((data ?? []) as Array<{
    expires_at: string | null;
    obligation_key: string | null;
    gap_key: string | null;
  }>).some(
    (row) =>
      (row.obligation_key === obligationKey || row.gap_key === obligationKey) &&
      overrideIsActive(row.expires_at, now),
  );
}

export async function evaluateOrgEscalationsWithPlans(
  supabase: AnySupabase,
  organizationId: string,
  now: Date = new Date(),
): Promise<{ hits: EscalationHit[]; persist: PersistResult; plans: PlanOutcomeSummary }> {
  const { hits, persist } = await evaluateOrgEscalations(supabase, organizationId, now);
  const plans = await applyRemediationPlanOutcomes(supabase, organizationId, hits, now);
  persist.resolved += plans.resolvedNotifications;
  return { hits, persist, plans };
}

export async function runNightlyEscalationAndPlans(
  supabase: AnySupabase,
  now: Date = new Date(),
): Promise<{
  orgs: number;
  inserted: number;
  skipped: number;
  resolved: number;
  plansEnsured: number;
  plansCompleted: number;
  plansExpired: number;
  errors: string[];
}> {
  const orgIds = await listActiveOrganizationIds(supabase);
  const summary = {
    orgs: orgIds.length,
    inserted: 0,
    skipped: 0,
    resolved: 0,
    plansEnsured: 0,
    plansCompleted: 0,
    plansExpired: 0,
    errors: [] as string[],
  };
  for (const orgId of orgIds) {
    try {
      const { persist, plans } = await evaluateOrgEscalationsWithPlans(supabase, orgId, now);
      summary.inserted += persist.inserted;
      summary.skipped += persist.skipped;
      summary.resolved += persist.resolved;
      summary.plansEnsured += plans.ensured;
      summary.plansCompleted += plans.completed;
      summary.plansExpired += plans.expired;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      summary.errors.push(`${orgId}: ${msg}`);
    }
  }
  return summary;
}

export { BLOCKS_SOLO_WHEN_LAPSED_KEYS };
