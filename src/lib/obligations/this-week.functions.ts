// This Week queue (Compliance revamp Step 2 + Step 3 scope + Step 5 source 5).

import { loadOrgFacts, unansweredFactsQuietSummary } from "./applicability.ts";
import {
  evaluateEscalations,
  isAdminLevelRole,
  loadEvaluateInput,
  pickAdminLevelRecipient,
  type EscalationHit,
  type EscalationUrgency,
  type OrgMemberRow,
} from "./escalation.ts";
import { evvStaffIdsForScope, resolveScopeFromSnapshot } from "./scope.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any;

export type Decision = {
  kind: "decision";
  id: string;
  title: string;
  body: string;
  urgency: EscalationUrgency;
  dueAt: string | null;
  ownerUserId: string | null;
  ownerLabel: string;
  consequence: string;
  source: "remediation_plan" | "escalation" | "standing_missing" | "nectar_proposed";
  trigger?: EscalationHit["trigger"];
  instanceId?: string | null;
  obligationId?: string | null;
  obligationKey?: string | null;
  subjectName?: string | null;
};

export type QuietSummary = {
  kind: "quiet_summary";
  id: string;
  title: string;
  body: string;
  count: number;
  urgency: EscalationUrgency;
  dueAt: string | null;
  source: "evv_needs_review" | "org_profile_facts";
};

export type ThisWeekItem = Decision | QuietSummary;

const URGENCY_ORDER: Record<EscalationUrgency, number> = {
  critical: 0,
  high: 1,
  normal: 2,
};

export function sortThisWeekItems(items: ThisWeekItem[]): ThisWeekItem[] {
  return [...items].sort((a, b) => {
    const u = URGENCY_ORDER[a.urgency] - URGENCY_ORDER[b.urgency];
    if (u !== 0) return u;
    const ad = a.dueAt ? new Date(a.dueAt).getTime() : Number.POSITIVE_INFINITY;
    const bd = b.dueAt ? new Date(b.dueAt).getTime() : Number.POSITIVE_INFINITY;
    return ad - bd;
  });
}

function tableMissing(message: string | undefined): boolean {
  return (
    !!message && /does not exist|schema cache|relation|could not find the table/i.test(message)
  );
}

function hitToDecision(hit: EscalationHit): Decision {
  return {
    kind: "decision",
    id: `${hit.trigger}:${hit.instanceId ?? hit.obligationId}`,
    title: hit.title,
    body: hit.message,
    urgency: hit.urgency,
    dueAt: hit.dueAt,
    ownerUserId: hit.recipientUserId,
    ownerLabel: hit.rule.climbs_to,
    consequence: hit.consequence,
    source: hit.trigger === "standing_record_missing_30d" ? "standing_missing" : "escalation",
    trigger: hit.trigger,
    instanceId: hit.instanceId,
    obligationId: hit.obligationId,
    obligationKey: hit.obligationKey,
    subjectName: hit.subject.displayName,
  };
}

async function loadRemediationPlansAwaitingApproval(
  supabase: AnySupabase,
  organizationId: string,
): Promise<Decision[]> {
  // Step 4 is not built. Skip if the table is missing.
  const { error } = await supabase
    .from("remediation_plans")
    .select("id")
    .eq("organization_id", organizationId)
    .limit(1);
  if (error && tableMissing(error.message)) return [];
  if (error) return [];
  return [];
}

async function loadProposedNectarRequirements(
  supabase: AnySupabase,
  organizationId: string,
  adminUserId: string | null,
): Promise<Decision[]> {
  const { data, error } = await supabase
    .from("nectar_requirements")
    .select("id, title, description, approval_state, created_at")
    .eq("organization_id", organizationId)
    .in("approval_state", ["proposed", "nectar_drafted"]);
  if (error) {
    if (tableMissing(error.message)) return [];
    throw new Error(error.message);
  }
  return (
    (data ?? []) as Array<{
      id: string;
      title: string | null;
      description: string | null;
      created_at: string | null;
    }>
  ).map((row) => ({
    kind: "decision" as const,
    id: `nectar_proposed:${row.id}`,
    title: row.title || "Proposed requirement",
    body: row.description || "Nectar drafted a requirement that needs an admin decision.",
    urgency: "normal" as const,
    dueAt: row.created_at,
    ownerUserId: adminUserId,
    ownerLabel: "admin_level",
    consequence: "Admin-level: accept or reject the proposed requirement.",
    source: "nectar_proposed" as const,
    obligationId: row.id,
  }));
}

async function loadEvvNeedsReviewCount(
  supabase: AnySupabase,
  organizationId: string,
  staffIdsInScope: string[] | null,
): Promise<QuietSummary | null> {
  if (staffIdsInScope && staffIdsInScope.length === 0) return null;
  let q = supabase
    .from("evv_timesheets")
    .select("id, staff_id")
    .eq("organization_id", organizationId)
    .eq("review_status", "needs_review");
  if (staffIdsInScope) q = q.in("staff_id", staffIdsInScope);
  const { data, error } = await q;
  if (error) {
    if (tableMissing(error.message)) return null;
    throw new Error(error.message);
  }
  const count = (data ?? []).length;
  if (count === 0) return null;
  return {
    kind: "quiet_summary",
    id: `evv_needs_review:${organizationId}`,
    title: "EVV timesheets need review",
    body: `${count} timesheet${count === 1 ? "" : "s"} in scope marked needs_review.`,
    count,
    urgency: "normal",
    dueAt: null,
    source: "evv_needs_review",
  };
}

function standingMissingForAdmin(
  hits: EscalationHit[],
  userId: string,
  adminLevel: boolean,
): Decision[] {
  if (!adminLevel) return [];
  const seen = new Set<string>();
  const out: Decision[] = [];
  for (const hit of hits) {
    if (hit.trigger !== "standing_record_missing_30d") continue;
    if (hit.recipientUserId !== userId) continue;
    if (seen.has(hit.obligationId)) continue;
    seen.add(hit.obligationId);
    out.push(hitToDecision(hit));
  }
  return out;
}

export async function getThisWeek(
  supabase: AnySupabase,
  orgId: string,
  userId: string,
  now: Date = new Date(),
): Promise<ThisWeekItem[]> {
  const items: ThisWeekItem[] = [];

  const { data: membership, error: memErr } = await supabase
    .from("organization_members")
    .select("id, user_id, role, manager_id, active")
    .eq("organization_id", orgId)
    .eq("user_id", userId)
    .maybeSingle();
  if (memErr) throw new Error(memErr.message);

  const adminLevel = membership ? isAdminLevelRole(membership.role) : false;

  // 1. Open remediation_plans awaiting approval — Step 4 not built.
  items.push(...(await loadRemediationPlansAwaitingApproval(supabase, orgId)));

  const input = await loadEvaluateInput(supabase, orgId, now);
  const hits = evaluateEscalations(input);
  const viewerScope = resolveScopeFromSnapshot(orgId, userId, {
    available: true,
    groups: [],
    members: input.scopeMembers ?? [],
    scopeByStaffId: input.scopeByStaffId ?? {},
    leadsByGroupId: input.leadsByGroupId ?? {},
  });

  // 2. Escalation triggers true AND resolveRecipient = this user.
  for (const hit of hits) {
    if (hit.recipientUserId !== userId) continue;
    items.push(hitToDecision(hit));
  }

  // 3. Standing missing, admin-level (already in hits; keep explicit for the brief).
  if (adminLevel) {
    const standing = standingMissingForAdmin(hits, userId, true);
    const have = new Set(items.filter((i) => i.kind === "decision").map((i) => i.id));
    for (const d of standing) {
      if (!have.has(d.id)) items.push(d);
    }
  }

  // 4. nectar_requirements approval_state=proposed (live: nectar_drafted), admin-level.
  if (adminLevel) {
    const adminId = pickAdminLevelRecipient(input.members as OrgMemberRow[]);
    if (adminId === userId) {
      items.push(...(await loadProposedNectarRequirements(supabase, orgId, adminId)));
    }
  }

  // 5. Unanswered org-profile facts (Step 5). Admin-level only.
  if (adminLevel) {
    const facts = await loadOrgFacts(supabase, orgId);
    if (facts) {
      const card = unansweredFactsQuietSummary(orgId, facts);
      if (card) items.push(card);
    }
  }

  // 6. evv_timesheets needs_review in scope — count only.
  const evv = await loadEvvNeedsReviewCount(supabase, orgId, evvStaffIdsForScope(viewerScope));
  if (evv) items.push(evv);

  return sortThisWeekItems(items);
}

/** Test helper: build This Week from already-evaluated hits + extras. */
export function assembleThisWeekFromHits(
  userId: string,
  hits: EscalationHit[],
  extras: ThisWeekItem[] = [],
): ThisWeekItem[] {
  const items: ThisWeekItem[] = [];
  for (const hit of hits) {
    if (hit.recipientUserId !== userId) continue;
    items.push(hitToDecision(hit));
  }
  items.push(...extras);
  return sortThisWeekItems(items);
}
