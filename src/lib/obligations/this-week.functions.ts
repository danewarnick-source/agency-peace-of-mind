// This Week queue (Compliance revamp Step 2 + Step 3 scope + Step 5 source 5).

import { loadOrgFacts, unansweredFactsQuietSummary } from "./applicability.ts";
import { unansweredDutyQuietSummary } from "./duty-applicability.ts";
import {
  evaluateEscalations,
  isAdminLevelRole,
  loadEvaluateInput,
  pickAdminLevelRecipient,
  type EscalationHit,
  type EvaluateInput,
  type OrgMemberRow,
} from "./escalation.ts";
import {
  consequenceForPlanKind,
  loadAwaitingApprovalPlans,
  pickPlanOwner,
  planOwnerLabel,
  urgencyForPlan,
} from "./remediation.ts";
import { addDaysYmd, denverYmd } from "../admin-home-data.ts";
import { sowCatalogEntryByKey } from "../sow-obligation-catalog.ts";
import { evvStaffIdsForScope, resolveScopeFromSnapshot } from "./scope.ts";
import {
  buildQuietLine,
  decorateDecision,
  lastSundayLabel,
  rollupDecisions,
  sortThisWeekItems,
  type Decision,
  type QuietLine,
  type QuietSummary,
  type ThisWeekItem,
  type ThisWeekResult,
} from "./this-week.ts";
import {
  automationHeartbeatFrom,
  buildAlreadyAssigned,
  emptyAlreadyAssigned,
  emptyAutomationHeartbeat,
  type AlreadyAssignedStrip,
  type AutomationHeartbeat,
} from "./already-assigned.ts";

export type {
  AlreadyAssignedStrip,
  AutomationHeartbeat,
  Decision,
  DecisionAction,
  DecisionActionKind,
  DecorateDecisionCtx,
  QuietLine,
  QuietSummary,
  ThisWeekItem,
  ThisWeekResult,
} from "./this-week.ts";
export {
  buildQuietLine,
  decorateDecision,
  emptyQuietLine,
  formatQuietLine,
  hasForbiddenDecisionCopy,
  HEADLINE_VERB_RE,
  humanDue,
  licenseTypeKey,
  rollupDecisions,
  sortThisWeekItems,
} from "./this-week.ts";
export {
  emptyAlreadyAssigned,
  emptyAutomationHeartbeat,
  formatAlreadyAssigned,
  formatAutomationLine,
} from "./already-assigned.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any;

function isStandingCatalogKey(key: string | null | undefined): boolean {
  if (!key) return false;
  const entry = sowCatalogEntryByKey(key);
  if (!entry) return false;
  return entry.fulfillment === "standing" || entry.category === "standing_records";
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
  members: OrgMemberRow[],
  now: Date,
): Promise<Decision[]> {
  const rows = await loadAwaitingApprovalPlans(supabase, organizationId);
  return rows.map((row) => {
    const overdue = !!(row.due_at && new Date(row.due_at).getTime() < now.getTime());
    return {
      kind: "decision" as const,
      id: `remediation_plan:${row.id}`,
      title: row.title,
      body: row.plan_text,
      urgency: urgencyForPlan(row.kind, overdue),
      dueAt: row.due_at,
      ownerUserId: pickPlanOwner(row.kind, row.staff_id, members),
      ownerLabel: planOwnerLabel(row.kind),
      consequence: consequenceForPlanKind(row.kind),
      source: "remediation_plan" as const,
      instanceId: row.instance_id,
      obligationId: row.obligation_id,
      obligationKey: row.obligation_key,
      planId: row.id,
      planKind: row.kind,
    };
  });
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
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("review_status", "needs_review");
  if (staffIdsInScope) q = q.in("staff_id", staffIdsInScope);
  const { count, error } = await q;
  if (error) {
    if (tableMissing(error.message)) return null;
    throw new Error(error.message);
  }
  const n = count ?? 0;
  if (n === 0) return null;
  return {
    kind: "quiet_summary",
    id: `evv_needs_review:${organizationId}`,
    title: "EVV timesheets need review",
    body: `${n} timesheet${n === 1 ? "" : "s"} in scope marked needs_review.`,
    count: n,
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

const NOTES_WINDOW_DAYS = 7;

async function loadQuietCounts(
  supabase: AnySupabase,
  orgId: string,
  input: EvaluateInput,
  evvNeedsReview: number,
  now: Date,
): Promise<QuietLine> {
  const obligationsSatisfied = input.instances.filter(
    (i) => i.status === "completed" || !!i.completed_at,
  ).length;

  let standingCurrent = 0;
  for (const ob of input.obligations) {
    if (!isStandingCatalogKey(ob.key)) continue;
    if (input.obligationHasEvidence[ob.id]) standingCurrent += 1;
  }

  const notesSince = addDaysYmd(denverYmd(now), -(NOTES_WINDOW_DAYS - 1));
  const notesBase = () =>
    supabase
      .from("daily_logs")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .gte("log_date", notesSince);

  const [totalRes, passedRes, reviewRes] = await Promise.all([
    notesBase(),
    notesBase().eq("ai_compliance_status", "Verified"),
    supabase
      .from("evv_timesheets")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .or("review_status.eq.approved,reconciliation_status.eq.accepted"),
  ]);

  // daily_logs.ai_compliance_status is the live Nectar column. Fail open on
  // a missing table / column so Home still renders.
  const notesTotal = totalRes.error ? 0 : (totalRes.count ?? 0);
  const notesPassed = passedRes.error ? 0 : (passedRes.count ?? 0);
  const recordsReviewCleared = reviewRes.error ? 0 : (reviewRes.count ?? 0);

  const dutyGaps = input.dutyGaps ?? [];
  const evaluationIncomplete =
    input.dutyFactsKnown === false || dutyGaps.some((g) => g.kind === "evaluation_incomplete");
  const assignmentGaps = dutyGaps.filter((g) => g.kind !== "evaluation_incomplete").length;

  return buildQuietLine({
    obligationsSatisfied,
    notesPassed,
    notesTotal,
    standingCurrent,
    recordsReviewCleared,
    evvReconciledThrough: evvNeedsReview === 0 ? lastSundayLabel() : null,
    assignmentGaps,
    evaluationIncomplete,
  });
}

function finalizeDecisions(raw: Decision[], userId: string, now: Date): Decision[] {
  return sortThisWeekItems(
    rollupDecisions(raw).map((d) => decorateDecision(d, { now, viewerUserId: userId })),
  );
}

export async function getThisWeek(
  supabase: AnySupabase,
  orgId: string,
  userId: string,
  now: Date = new Date(),
): Promise<ThisWeekResult> {
  const raw: Decision[] = [];

  const { data: membership, error: memErr } = await supabase
    .from("organization_members")
    .select("id, user_id, role, manager_id, active")
    .eq("organization_id", orgId)
    .eq("user_id", userId)
    .maybeSingle();
  if (memErr) throw new Error(memErr.message);

  const adminLevel = membership ? isAdminLevelRole(membership.role) : false;

  const input = await loadEvaluateInput(supabase, orgId, now);
  const hits = evaluateEscalations(input);
  const viewerScope = resolveScopeFromSnapshot(orgId, userId, {
    available: true,
    groups: [],
    members: input.scopeMembers ?? [],
    scopeByStaffId: input.scopeByStaffId ?? {},
    leadsByGroupId: input.leadsByGroupId ?? {},
  });

  // 1. Open remediation_plans awaiting approval (Step 4). Owner-scoped
  // like the other sources so each manager sees their cards.
  const planDecisions = await loadRemediationPlansAwaitingApproval(
    supabase,
    orgId,
    input.members as OrgMemberRow[],
    now,
  );
  raw.push(...planDecisions.filter((d) => d.ownerUserId === userId));

  // 2. Escalation triggers true AND resolveRecipient = this user.
  for (const hit of hits) {
    if (hit.recipientUserId !== userId) continue;
    raw.push(hitToDecision(hit));
  }

  // 3. Standing missing, admin-level (already in hits; keep explicit for the brief).
  if (adminLevel) {
    const standing = standingMissingForAdmin(hits, userId, true);
    const have = new Set(raw.map((i) => i.id));
    for (const d of standing) {
      if (!have.has(d.id)) raw.push(d);
    }
  }

  // 4. nectar_requirements approval_state=proposed (live: nectar_drafted), admin-level.
  if (adminLevel) {
    const adminId = pickAdminLevelRecipient(input.members as OrgMemberRow[]);
    if (adminId === userId) {
      raw.push(...(await loadProposedNectarRequirements(supabase, orgId, adminId)));
    }
  }

  // 5. Org-profile facts + assignment gaps stay loadable (QuietLine, not cards).
  if (adminLevel) {
    const facts = await loadOrgFacts(supabase, orgId);
    if (facts) unansweredFactsQuietSummary(orgId, facts);
    unansweredDutyQuietSummary(orgId, input.dutyGaps ?? []);
  }

  // 6. evv_timesheets needs_review in scope — QuietLine, not a card.
  const evv = await loadEvvNeedsReviewCount(supabase, orgId, evvStaffIdsForScope(viewerScope));
  const quiet = await loadQuietCounts(supabase, orgId, input, evv?.count ?? 0, now);
  const decisions = finalizeDecisions(raw, userId, now);
  const decisionInstanceIds = new Set(
    decisions.map((d) => d.instanceId).filter((id): id is string => !!id),
  );
  const alreadyAssigned = buildAlreadyAssigned(input, decisionInstanceIds);
  // No persisted cron heartbeat yet — do not invent a last-check time.
  const automation = automationHeartbeatFrom({});

  return {
    items: decisions,
    quiet,
    alreadyAssigned,
    automation,
  };
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
