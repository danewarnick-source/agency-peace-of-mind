// Escalation rules + evaluator (Compliance revamp Step 2).
// Hive-authored catalog in SQL; this module is the only writer of
// notifications.type = "escalation". Do not add a second overdue/escalation
// fan-out.

import { ROLE_RANK, type Role } from "../rbac.ts";
import {
  sowCatalogEntry,
  sowCatalogEntryByKey,
  type ObligationCategory,
} from "../sow-obligation-catalog.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any;

export const TNS_ORG_ID = "7fabcf5d-f826-487f-8730-8b0c3f1969bb";

export type EscalationTrigger =
  | "half_window_not_started"
  | "overdue"
  | "would_create_finding_if_scheduled"
  | "license_or_repayment_risk"
  | "standing_record_missing_30d";

export type ClimbsTo = "manager" | "manager_of_manager" | "admin_level";

export type EscalationUrgency = "normal" | "high" | "critical";

export type EscalationRule = {
  trigger: EscalationTrigger;
  climbs_to: ClimbsTo;
  urgency: EscalationUrgency;
  message_template: string;
  state_code?: string;
};

export const LICENSE_REPAYMENT_CITATIONS = ["§1.34", "§1.13", "§30.5", "§33.5"] as const;

export const SEED_ESCALATION_RULES: EscalationRule[] = [
  {
    trigger: "half_window_not_started",
    climbs_to: "manager",
    urgency: "normal",
    message_template: "{subject}: {title} not started, due {due}. {n_days} days left.",
    state_code: "UT",
  },
  {
    trigger: "overdue",
    climbs_to: "manager_of_manager",
    urgency: "high",
    message_template: "{subject}: {title} is {days_overdue} days overdue.",
    state_code: "UT",
  },
  {
    trigger: "would_create_finding_if_scheduled",
    climbs_to: "manager",
    urgency: "high",
    message_template:
      "{subject} is scheduled {n_shifts} shifts while {title} is lapsed. Each is a {audit_ref} finding.",
    state_code: "UT",
  },
  {
    trigger: "license_or_repayment_risk",
    climbs_to: "admin_level",
    urgency: "critical",
    message_template: "{title} — {status}. This is a license/repayment item ({citation}).",
    state_code: "UT",
  },
  {
    trigger: "standing_record_missing_30d",
    climbs_to: "admin_level",
    urgency: "high",
    message_template: "{title} has been missing for 30 days.",
    state_code: "UT",
  },
];

export type OrgMemberRow = {
  id: string;
  user_id: string;
  role: string;
  manager_id: string | null;
  active?: boolean;
};

export type EscalationSubject = {
  organizationId: string;
  kind: "person" | "org";
  /** Person-bound staff (profiles / auth user id). */
  staffUserId: string | null;
  /** Primary assigned staff when the clock is shared. */
  primaryAssignedStaffId: string | null;
  /** Step 3 — unused until scope groups exist. */
  scopeGroupId?: string | null;
  displayName: string;
};

export type EscalationHit = {
  trigger: EscalationTrigger;
  rule: EscalationRule;
  instanceId: string | null;
  obligationId: string;
  obligationKey: string | null;
  title: string;
  subject: EscalationSubject;
  recipientUserId: string | null;
  urgency: EscalationUrgency;
  dueAt: string | null;
  message: string;
  consequence: string;
  vars: Record<string, string>;
};

export type ObligationSnapshot = {
  id: string;
  title: string;
  key?: string | null;
  disposition?: string | null;
  scope?: string | null;
  created_at?: string | null;
  source_policy_section?: string | null;
};

export type InstanceSnapshot = {
  id: string;
  obligation_id: string;
  status: string;
  due_at: string;
  created_at?: string | null;
  completed_at?: string | null;
  attestation_signed_at?: string | null;
  upload_path?: string | null;
  form_submission_id?: string | null;
  assignee_staff_id?: string | null;
  client_name?: string | null;
};

export type EvaluateInput = {
  organizationId: string;
  now: Date;
  rules?: EscalationRule[];
  obligations: ObligationSnapshot[];
  instances: InstanceSnapshot[];
  startedInstanceIds: Set<string>;
  members: OrgMemberRow[];
  /** staff_id → future published shift count */
  futureShiftCounts: Record<string, number>;
  /** obligation_id → has any completion / upload / attestation */
  obligationHasEvidence: Record<string, boolean>;
  subjectNames?: Record<string, string>;
};

const MS_DAY = 24 * 60 * 60 * 1000;

export function calendarDaysBetween(from: Date, to: Date): number {
  const a = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  const b = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  return Math.round((b - a) / MS_DAY);
}

export function formatDue(iso: string | null | undefined): string {
  if (!iso) return "unscheduled";
  return iso.slice(0, 10);
}

export function citationIsLicenseOrRepayment(citation: string | null | undefined): boolean {
  if (!citation) return false;
  return LICENSE_REPAYMENT_CITATIONS.some((c) => citation.includes(c));
}

export function isLicenseOrRepaymentCatalog(opts: {
  category?: ObligationCategory | null;
  citation?: string | null;
}): boolean {
  if (opts.category === "licensing") return true;
  return citationIsLicenseOrRepayment(opts.citation);
}

export function instanceIsStarted(
  instance: InstanceSnapshot,
  startedInstanceIds: Set<string>,
): boolean {
  if (startedInstanceIds.has(instance.id)) return true;
  if (instance.completed_at) return true;
  if (instance.attestation_signed_at) return true;
  if (instance.upload_path) return true;
  if (instance.form_submission_id) return true;
  if (instance.status === "completed") return true;
  return false;
}

export function isHalfWindowNotStarted(
  instance: InstanceSnapshot,
  now: Date,
  startedInstanceIds: Set<string>,
): boolean {
  if (instance.status !== "pending") return false;
  if (instanceIsStarted(instance, startedInstanceIds)) return false;
  const due = new Date(instance.due_at);
  if (Number.isNaN(due.getTime()) || due.getTime() <= now.getTime()) return false;
  const start = instance.created_at ? new Date(instance.created_at) : null;
  if (!start || Number.isNaN(start.getTime()) || start.getTime() >= due.getTime()) return false;
  const mid = start.getTime() + (due.getTime() - start.getTime()) / 2;
  return now.getTime() >= mid;
}

export function isInstanceOverdue(instance: InstanceSnapshot, now: Date): boolean {
  if (instance.status === "completed" || instance.status === "waived") return false;
  if (instance.status === "overdue") return true;
  return new Date(instance.due_at).getTime() < now.getTime();
}

export function daysUntilDue(instance: InstanceSnapshot, now: Date): number {
  return calendarDaysBetween(now, new Date(instance.due_at));
}

export function catalogForObligation(ob: ObligationSnapshot) {
  return (ob.key ? sowCatalogEntryByKey(ob.key) : null) ?? sowCatalogEntry(ob.title);
}

/** Review-tool row ids for staff clocks that become findings if scheduled while lapsed. */
const AUDIT_REF_BY_KEY: Record<string, string> = {
  cpr_first_aid_initial: "IV-7",
  cpr_first_aid_renewal: "IV-7",
  pct_hire_practices: "IV-7",
  hhs_home_cert_annual: "I-2-HHS",
  background_screening_annual: "IV-BG",
  dhhs_code_of_conduct_signed: "IV-COC",
  medicaid_exclusion_annual: "IV-3",
  behavior_intervention_cert: "IV-8",
};

export function auditRefForObligationKey(key: string | null | undefined): string {
  if (!key) return "review-tool";
  return AUDIT_REF_BY_KEY[key] ?? key;
}

export function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{([a-z_]+)\}/g, (_, name: string) => vars[name] ?? "");
}

export function consequenceForTrigger(
  trigger: EscalationTrigger,
  vars: Record<string, string>,
): string {
  switch (trigger) {
    case "half_window_not_started":
      return `Not started with ${vars.n_days ?? "?"} days left. Manager owns the start.`;
    case "overdue":
      return `Overdue ${vars.days_overdue ?? "?"} days. Manager of manager owns closure.`;
    case "would_create_finding_if_scheduled":
      return `Each scheduled shift while lapsed is a ${vars.audit_ref ?? "review-tool"} finding.`;
    case "license_or_repayment_risk":
      return `License/repayment item (${vars.citation ?? "citation"}). Admin-level.`;
    case "standing_record_missing_30d":
      return "Standing record has been missing for 30 days. Admin-level.";
  }
}

function memberRole(role: string): Role {
  if (role in ROLE_RANK) return role as Role;
  return "employee";
}

export function isAdminLevelRole(role: string): boolean {
  return ROLE_RANK[memberRole(role)] >= 4;
}

function activeMembers(members: OrgMemberRow[]): OrgMemberRow[] {
  return members.filter((m) => m.active !== false);
}

function userIdForMembershipId(
  members: OrgMemberRow[],
  membershipId: string | null,
): string | null {
  if (!membershipId) return null;
  const byId = members.find((m) => m.id === membershipId);
  if (byId) return byId.user_id;
  const byUser = members.find((m) => m.user_id === membershipId);
  return byUser?.user_id ?? null;
}

function managerUserId(members: OrgMemberRow[], staffUserId: string | null): string | null {
  if (!staffUserId) return null;
  const row = members.find((m) => m.user_id === staffUserId);
  if (!row?.manager_id) return null;
  return userIdForMembershipId(members, row.manager_id);
}

export function pickAdminLevelRecipient(members: OrgMemberRow[]): string | null {
  const pool = activeMembers(members).filter((m) => isAdminLevelRole(m.role));
  if (!pool.length) return null;
  const supers = pool
    .filter((m) => m.role === "super_admin")
    .sort((a, b) => a.user_id.localeCompare(b.user_id));
  if (supers[0]) return supers[0].user_id;
  return [...pool].sort((a, b) => {
    const rank = ROLE_RANK[memberRole(b.role)] - ROLE_RANK[memberRole(a.role)];
    if (rank !== 0) return rank;
    return a.user_id.localeCompare(b.user_id);
  })[0]!.user_id;
}

/** Lowest admin-level (admin before super_admin) — org-item manager fallback. */
export function pickLowestAdminLevel(members: OrgMemberRow[]): string | null {
  const pool = activeMembers(members).filter((m) => isAdminLevelRole(m.role));
  if (!pool.length) return null;
  return [...pool].sort((a, b) => {
    const rank = ROLE_RANK[memberRole(a.role)] - ROLE_RANK[memberRole(b.role)];
    if (rank !== 0) return rank;
    return a.user_id.localeCompare(b.user_id);
  })[0]!.user_id;
}

function resolveAdminLevel(subject: EscalationSubject, members: OrgMemberRow[]): string | null {
  // Step 3 scope_group match is not built. Missing scope_group_id → one
  // admin-level user gets all (prefer super_admin, else any rank ≥ 4).
  if (subject.scopeGroupId) {
    // No scope_group table yet — fall through.
  }
  return pickAdminLevelRecipient(members);
}

function resolveManager(subject: EscalationSubject, members: OrgMemberRow[]): string | null {
  if (subject.kind === "person") {
    const staffId = subject.primaryAssignedStaffId ?? subject.staffUserId;
    const mgr = managerUserId(members, staffId);
    if (mgr) return mgr;
  }
  return pickLowestAdminLevel(members);
}

export function resolveRecipient(
  rule: Pick<EscalationRule, "climbs_to">,
  subject: EscalationSubject,
  members: OrgMemberRow[],
): string | null {
  if (rule.climbs_to === "admin_level") {
    return resolveAdminLevel(subject, members);
  }
  if (rule.climbs_to === "manager") {
    return resolveManager(subject, members);
  }
  // manager_of_manager: walk once; null → admin_level
  const first = resolveManager(subject, members);
  if (!first) return resolveAdminLevel(subject, members);
  const second = managerUserId(members, first);
  return second ?? resolveAdminLevel(subject, members);
}

function subjectFor(
  organizationId: string,
  ob: ObligationSnapshot,
  instance: InstanceSnapshot | null,
  names: Record<string, string>,
): EscalationSubject {
  const staffId = instance?.assignee_staff_id ?? null;
  const personBound = ob.scope === "staff" || ob.scope === "staff_per_client" || !!staffId;
  const displayName = staffId
    ? (names[staffId] ?? "Staff")
    : instance?.client_name
      ? instance.client_name
      : "Organization";
  return {
    organizationId,
    kind: personBound ? "person" : "org",
    staffUserId: staffId,
    primaryAssignedStaffId: staffId,
    scopeGroupId: null,
    displayName,
  };
}

function standingMissingDays(ob: ObligationSnapshot, now: Date): number | null {
  const catalog = catalogForObligation(ob);
  const disposition = ob.disposition ?? catalog?.disposition ?? null;
  if (disposition !== "standing") return null;
  if (!ob.created_at) return 30;
  return calendarDaysBetween(new Date(ob.created_at), now);
}

export function evaluateEscalations(input: EvaluateInput): EscalationHit[] {
  const rules = input.rules ?? SEED_ESCALATION_RULES;
  const ruleByTrigger = new Map(rules.map((r) => [r.trigger, r]));
  const names = input.subjectNames ?? {};
  const hits: EscalationHit[] = [];

  const pushHit = (
    trigger: EscalationTrigger,
    ob: ObligationSnapshot,
    instance: InstanceSnapshot | null,
    vars: Record<string, string>,
    subject: EscalationSubject,
  ) => {
    const rule = ruleByTrigger.get(trigger);
    if (!rule) return;
    const recipientUserId = resolveRecipient(rule, subject, input.members);
    hits.push({
      trigger,
      rule,
      instanceId: instance?.id ?? null,
      obligationId: ob.id,
      obligationKey: ob.key ?? catalogForObligation(ob)?.key ?? null,
      title: ob.title,
      subject,
      recipientUserId,
      urgency: rule.urgency,
      dueAt: instance?.due_at ?? null,
      message: renderTemplate(rule.message_template, vars),
      consequence: consequenceForTrigger(trigger, vars),
      vars,
    });
  };

  for (const instance of input.instances) {
    const ob = input.obligations.find((o) => o.id === instance.obligation_id);
    if (!ob) continue;
    const catalog = catalogForObligation(ob);
    const subject = subjectFor(input.organizationId, ob, instance, names);
    const started = instanceIsStarted(instance, input.startedInstanceIds);
    const overdue = isInstanceOverdue(instance, input.now);
    const dueDays = daysUntilDue(instance, input.now);

    if (isHalfWindowNotStarted(instance, input.now, input.startedInstanceIds)) {
      pushHit(
        "half_window_not_started",
        ob,
        instance,
        {
          subject: subject.displayName,
          title: ob.title,
          due: formatDue(instance.due_at),
          n_days: String(Math.max(0, dueDays)),
        },
        subject,
      );
    }

    if (overdue) {
      const daysOverdue = Math.max(0, -dueDays);
      pushHit(
        "overdue",
        ob,
        instance,
        {
          subject: subject.displayName,
          title: ob.title,
          days_overdue: String(daysOverdue),
        },
        subject,
      );
    }

    const staffId = instance.assignee_staff_id;
    const nShifts = staffId ? (input.futureShiftCounts[staffId] ?? 0) : 0;
    if (overdue && nShifts > 0) {
      const key = ob.key ?? catalog?.key ?? null;
      pushHit(
        "would_create_finding_if_scheduled",
        ob,
        instance,
        {
          subject: subject.displayName,
          title: ob.title,
          n_shifts: String(nShifts),
          audit_ref: auditRefForObligationKey(key),
        },
        subject,
      );
    }

    if (
      isLicenseOrRepaymentCatalog({
        category: catalog?.category,
        citation: catalog?.citation ?? ob.source_policy_section,
      }) &&
      (overdue || (dueDays >= 0 && dueDays <= 14 && !started))
    ) {
      pushHit(
        "license_or_repayment_risk",
        ob,
        instance,
        {
          title: ob.title,
          status: overdue ? "overdue" : `expires in ${dueDays} days`,
          citation: catalog?.citation ?? ob.source_policy_section ?? "citation",
        },
        subject,
      );
    }
  }

  for (const ob of input.obligations) {
    const catalog = catalogForObligation(ob);
    const disposition = ob.disposition ?? catalog?.disposition ?? null;
    if (disposition !== "standing") continue;
    if (input.obligationHasEvidence[ob.id]) continue;
    const missingDays = standingMissingDays(ob, input.now);
    if (missingDays === null || missingDays < 30) continue;
    const subject = subjectFor(input.organizationId, ob, null, names);
    pushHit("standing_record_missing_30d", ob, null, { title: ob.title }, subject);

    if (
      isLicenseOrRepaymentCatalog({
        category: catalog?.category,
        citation: catalog?.citation ?? ob.source_policy_section,
      })
    ) {
      pushHit(
        "license_or_repayment_risk",
        ob,
        null,
        {
          title: ob.title,
          status: "missing",
          citation: catalog?.citation ?? ob.source_policy_section ?? "citation",
        },
        subject,
      );
    }
  }

  return hits;
}

export function recurrenceKey(
  instanceId: string | null,
  obligationId: string,
  trigger: EscalationTrigger,
): string {
  return `${instanceId ?? obligationId}:${trigger}`;
}

export type PersistResult = {
  inserted: number;
  skipped: number;
  resolved: number;
};

function tableMissing(message: string | undefined): boolean {
  return (
    !!message && /does not exist|schema cache|relation|could not find the table/i.test(message)
  );
}

export async function loadEscalationRules(supabase: AnySupabase): Promise<EscalationRule[]> {
  const { data, error } = await supabase
    .from("escalation_rules")
    .select("trigger, climbs_to, urgency, message_template, state_code, archived_at")
    .is("archived_at", null);
  if (error) {
    if (tableMissing(error.message)) return SEED_ESCALATION_RULES;
    throw new Error(error.message);
  }
  const rows = (data ?? []) as Array<EscalationRule & { archived_at?: string | null }>;
  return rows.length ? rows : SEED_ESCALATION_RULES;
}

export async function persistEscalationHits(
  supabase: AnySupabase,
  organizationId: string,
  hits: EscalationHit[],
): Promise<PersistResult> {
  const result: PersistResult = { inserted: 0, skipped: 0, resolved: 0 };
  if (!hits.length) return result;

  const keys = hits.map((h) => recurrenceKey(h.instanceId, h.obligationId, h.trigger));
  const { data: existing, error: eErr } = await supabase
    .from("notifications")
    .select("id, recurrence_key, resolved_at")
    .eq("organization_id", organizationId)
    .eq("type", "escalation")
    .in("recurrence_key", keys);
  if (eErr) {
    if (tableMissing(eErr.message)) return result;
    throw new Error(eErr.message);
  }
  const unresolved = new Set(
    ((existing ?? []) as Array<{ recurrence_key: string; resolved_at: string | null }>)
      .filter((r) => !r.resolved_at)
      .map((r) => r.recurrence_key),
  );

  const rows = [];
  for (const hit of hits) {
    if (!hit.recipientUserId) {
      result.skipped += 1;
      continue;
    }
    const key = recurrenceKey(hit.instanceId, hit.obligationId, hit.trigger);
    if (unresolved.has(key)) {
      result.skipped += 1;
      continue;
    }
    rows.push({
      organization_id: organizationId,
      recipient_user_id: hit.recipientUserId,
      recipient_role: hit.rule.climbs_to,
      type: "escalation",
      urgency: hit.urgency,
      title: hit.title,
      body: hit.message,
      link_to: "/dashboard/agency-documents",
      next_remind_at: null,
      related_id: hit.instanceId ?? hit.obligationId,
      related_type: hit.instanceId ? "company_obligation_instance" : "company_obligation",
      recurrence_key: key,
    });
  }

  if (rows.length) {
    const { error: insErr } = await supabase.from("notifications").insert(rows);
    if (insErr) throw new Error(insErr.message);
    result.inserted = rows.length;
  }
  return result;
}

export async function resolveEscalationsForInstance(
  supabase: AnySupabase,
  instanceId: string,
): Promise<void> {
  const { error } = await supabase
    .from("notifications")
    .update({ resolved_at: new Date().toISOString() })
    .eq("related_id", instanceId)
    .eq("type", "escalation")
    .is("resolved_at", null);
  if (error && !tableMissing(error.message)) throw new Error(error.message);
}

export async function resolveStaleEscalations(
  supabase: AnySupabase,
  organizationId: string,
  liveKeys: Set<string>,
): Promise<number> {
  const { data, error } = await supabase
    .from("notifications")
    .select("id, recurrence_key")
    .eq("organization_id", organizationId)
    .eq("type", "escalation")
    .is("resolved_at", null);
  if (error) {
    if (tableMissing(error.message)) return 0;
    throw new Error(error.message);
  }
  const stale = ((data ?? []) as Array<{ id: string; recurrence_key: string }>).filter(
    (r) => r.recurrence_key && !liveKeys.has(r.recurrence_key),
  );
  if (!stale.length) return 0;
  const { error: upErr } = await supabase
    .from("notifications")
    .update({ resolved_at: new Date().toISOString() })
    .in(
      "id",
      stale.map((s) => s.id),
    );
  if (upErr) throw new Error(upErr.message);
  return stale.length;
}

export async function loadEvaluateInput(
  supabase: AnySupabase,
  organizationId: string,
  now: Date,
): Promise<EvaluateInput> {
  const rules = await loadEscalationRules(supabase);

  const { data: obligations, error: oErr } = await supabase
    .from("company_obligations")
    .select("id, title, key, disposition, scope, created_at, source_policy_section, active")
    .eq("organization_id", organizationId)
    .eq("active", true);
  if (oErr) throw new Error(oErr.message);
  const obs = (obligations ?? []) as Array<ObligationSnapshot & { active?: boolean }>;

  const { data: instances, error: iErr } = await supabase
    .from("company_obligation_instances")
    .select(
      "id, obligation_id, status, due_at, created_at, completed_at, attestation_signed_at, upload_path, form_submission_id, assignee_staff_id, client_name",
    )
    .eq("organization_id", organizationId)
    .in("status", ["pending", "overdue"]);
  if (iErr) throw new Error(iErr.message);
  const insts = (instances ?? []) as InstanceSnapshot[];

  const instanceIds = insts.map((i) => i.id);
  const startedInstanceIds = new Set<string>();
  const obligationHasEvidence: Record<string, boolean> = {};

  if (instanceIds.length) {
    const { data: completions, error: cErr } = await supabase
      .from("company_obligation_completions")
      .select("instance_id")
      .in("instance_id", instanceIds);
    if (cErr && !tableMissing(cErr.message)) throw new Error(cErr.message);
    for (const c of (completions ?? []) as Array<{ instance_id: string }>) {
      startedInstanceIds.add(c.instance_id);
    }
  }

  const allObIds = obs.map((o) => o.id);
  if (allObIds.length) {
    const { data: doneInst, error: dErr } = await supabase
      .from("company_obligation_instances")
      .select("id, obligation_id, status, upload_path, attestation_signed_at, completed_at")
      .eq("organization_id", organizationId)
      .in("obligation_id", allObIds);
    if (!dErr) {
      const doneIds = (doneInst ?? []) as Array<{
        id: string;
        obligation_id: string;
        status: string;
        upload_path: string | null;
        attestation_signed_at: string | null;
        completed_at: string | null;
      }>;
      for (const row of doneIds) {
        if (
          row.status === "completed" ||
          row.upload_path ||
          row.attestation_signed_at ||
          row.completed_at
        ) {
          obligationHasEvidence[row.obligation_id] = true;
        }
      }
      const histIds = doneIds.map((r) => r.id);
      if (histIds.length) {
        const { data: histCompletions, error: hcErr } = await supabase
          .from("company_obligation_completions")
          .select("instance_id")
          .in("instance_id", histIds);
        if (!hcErr) {
          const instById = new Map(doneIds.map((r) => [r.id, r.obligation_id]));
          for (const c of (histCompletions ?? []) as Array<{ instance_id: string }>) {
            const obId = instById.get(c.instance_id);
            if (obId) obligationHasEvidence[obId] = true;
          }
        }
      }
    }
  }

  const { data: members, error: mErr } = await supabase
    .from("organization_members")
    .select("id, user_id, role, manager_id, active")
    .eq("organization_id", organizationId)
    .eq("active", true);
  if (mErr) throw new Error(mErr.message);

  const staffIds = [
    ...new Set(insts.map((i) => i.assignee_staff_id).filter((id): id is string => !!id)),
  ];
  const futureShiftCounts: Record<string, number> = {};
  if (staffIds.length) {
    const { data: shifts, error: sErr } = await supabase
      .from("scheduled_shifts")
      .select("id, staff_id, starts_at, status")
      .eq("organization_id", organizationId)
      .in("staff_id", staffIds)
      .gte("starts_at", now.toISOString());
    if (sErr && !tableMissing(sErr.message)) throw new Error(sErr.message);
    for (const s of (shifts ?? []) as Array<{ staff_id: string | null; status: string }>) {
      if (!s.staff_id) continue;
      if (["cancelled", "canceled", "callout", "declined", "open"].includes(s.status)) continue;
      futureShiftCounts[s.staff_id] = (futureShiftCounts[s.staff_id] ?? 0) + 1;
    }
  }

  const subjectNames: Record<string, string> = {};
  if (staffIds.length) {
    const { data: profiles, error: pErr } = await supabase
      .from("profiles")
      .select("id, full_name, first_name")
      .in("id", staffIds);
    if (!pErr) {
      for (const p of (profiles ?? []) as Array<{
        id: string;
        full_name: string | null;
        first_name: string | null;
      }>) {
        subjectNames[p.id] = p.full_name || p.first_name || "Staff";
      }
    }
  }

  return {
    organizationId,
    now,
    rules,
    obligations: obs,
    instances: insts,
    startedInstanceIds,
    members: (members ?? []) as OrgMemberRow[],
    futureShiftCounts,
    obligationHasEvidence,
    subjectNames,
  };
}

export async function evaluateOrgEscalations(
  supabase: AnySupabase,
  organizationId: string,
  now: Date = new Date(),
): Promise<{ hits: EscalationHit[]; persist: PersistResult }> {
  const input = await loadEvaluateInput(supabase, organizationId, now);
  const hits = evaluateEscalations(input);
  const persist = await persistEscalationHits(supabase, organizationId, hits);
  const liveKeys = new Set(hits.map((h) => recurrenceKey(h.instanceId, h.obligationId, h.trigger)));
  persist.resolved += await resolveStaleEscalations(supabase, organizationId, liveKeys);
  return { hits, persist };
}

export async function listActiveOrganizationIds(supabase: AnySupabase): Promise<string[]> {
  const { data, error } = await supabase.from("organizations").select("id, training_only");
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<{ id: string; training_only?: boolean | null }>)
    .filter((o) => o.training_only !== true)
    .map((o) => o.id);
}

export async function runNightlyEscalationEvaluator(
  supabase: AnySupabase,
  now: Date = new Date(),
): Promise<{
  orgs: number;
  inserted: number;
  skipped: number;
  resolved: number;
  errors: string[];
}> {
  const orgIds = await listActiveOrganizationIds(supabase);
  const summary = {
    orgs: orgIds.length,
    inserted: 0,
    skipped: 0,
    resolved: 0,
    errors: [] as string[],
  };
  for (const orgId of orgIds) {
    try {
      const { persist } = await evaluateOrgEscalations(supabase, orgId, now);
      summary.inserted += persist.inserted;
      summary.skipped += persist.skipped;
      summary.resolved += persist.resolved;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      summary.errors.push(`${orgId}: ${msg}`);
    }
  }
  return summary;
}
