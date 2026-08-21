// Server functions for the Company Obligations tracker — recurring / per-event
// compliance duties (e.g. "Post the grievance poster quarterly", "File the
// PBA financial statement monthly") that generate due-dated instances, get
// assigned to staff groups or individuals, and are tracked to completion with
// admin/manager notifications on submission and overdue.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireOrgMembership } from "@/integrations/supabase/require-org";
import { resolveGroupMembersInternal, type ResolvedStaffMember } from "./staff-groups.functions";
import { runNectarCertOcrFromStoragePath } from "./nectar-cert-ocr";
import { compareNames } from "./name-matching";
import {
  addDaysUTC,
  addMonthsUTC,
  addYearsUTC,
  computePeriod,
  endOfDayUTC,
  formatShort,
  isCalendarDueRule,
  periodsToEnsure,
  explainDueRule,
} from "./obligation-due-dates";
import { resolveDueRule, sowCatalogEntry } from "./sow-obligation-catalog";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any;

export type CompanyObligationRow = {
  id: string;
  organization_id: string;
  title: string;
  description: string | null;
  source_policy_section: string | null;
  cadence: "weekly" | "monthly" | "quarterly" | "annually" | "per_event" | "one_time";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  due_day_config: any;
  reminder_days_before: number[];
  evidence_type: "attestation" | "upload" | "upload_and_attestation" | "form";
  linked_form_id: string | null;
  attestation_text: string | null;
  requires_individual_completion: boolean;
  assigned_to_groups: string[];
  assigned_to_users: string[];
  assignee_role: "any_assigned" | "managers_only" | "admin_only";
  notify_manager_on_complete: boolean;
  notify_manager_on_overdue: boolean;
  active: boolean;
  source: "sow" | "provider";
  is_locked: boolean;
  scope: "org" | "staff" | "staff_per_client";
  target_service_codes: string[];
  nectar_cert_type_label: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  nectar_keyword_groups: any;
  created_by: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type ObligationInstanceRow = {
  id: string;
  obligation_id: string;
  organization_id: string;
  period_key: string;
  due_at: string;
  status: "pending" | "completed" | "overdue" | "waived";
  completed_at: string | null;
  completed_by_id: string | null;
  completed_by_name: string | null;
  evidence_type_used: string | null;
  upload_path: string | null;
  upload_filename: string | null;
  attestation_signed_at: string | null;
  attestation_signed_by_id: string | null;
  attestation_signed_by_name: string | null;
  attestation_text_snapshot: string | null;
  form_submission_id: string | null;
  event_description: string | null;
  waive_reason: string | null;
  admin_notes: string | null;
  assignee_staff_id: string | null;
  client_id: string | null;
  client_name: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type ObligationRollup = {
  open_count: number;
  overdue_count: number;
  pending_count: number;
  next_due_at: string | null;
  latest_completed_at: string | null;
};

export type ObligationListItem = CompanyObligationRow & {
  current_instance: ObligationInstanceRow | null;
  rollup: ObligationRollup;
};

function emptyRollup(): ObligationRollup {
  return { open_count: 0, overdue_count: 0, pending_count: 0, next_due_at: null, latest_completed_at: null };
}

/** Most urgent open instance wins; otherwise the most recently created. */
function pickCurrentInstance(instances: ObligationInstanceRow[]): ObligationInstanceRow | null {
  if (!instances.length) return null;
  const overdue = instances
    .filter((i) => i.status === "overdue")
    .sort((a, b) => new Date(a.due_at).getTime() - new Date(b.due_at).getTime());
  if (overdue[0]) return overdue[0];
  const pending = instances
    .filter((i) => i.status === "pending")
    .sort((a, b) => new Date(a.due_at).getTime() - new Date(b.due_at).getTime());
  if (pending[0]) return pending[0];
  return [...instances].sort((a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime())[0] ?? null;
}

function rollupFromInstances(instances: ObligationInstanceRow[]): ObligationRollup {
  let overdue_count = 0;
  let pending_count = 0;
  let next_due_at: string | null = null;
  let latest_completed_at: string | null = null;
  for (const inst of instances) {
    if (inst.status === "overdue") overdue_count++;
    if (inst.status === "pending") pending_count++;
    if (inst.status === "pending" || inst.status === "overdue") {
      if (!next_due_at || new Date(inst.due_at).getTime() < new Date(next_due_at).getTime()) {
        next_due_at = inst.due_at;
      }
    }
    if (inst.status === "completed" && inst.completed_at) {
      if (!latest_completed_at || inst.completed_at > latest_completed_at) {
        latest_completed_at = inst.completed_at;
      }
    }
  }
  return {
    open_count: overdue_count + pending_count,
    overdue_count,
    pending_count,
    next_due_at,
    latest_completed_at,
  };
}

function cadenceShortLabel(cadence: string): string {
  switch (cadence) {
    case "weekly": return "Weekly";
    case "monthly": return "Monthly";
    case "quarterly": return "Quarterly";
    case "annually": return "Annually";
    case "per_event": return "Per event";
    case "one_time": return "One-time";
    default: return cadence;
  }
}

/** Human cadence sentence for staff-facing surfaces. Prefers the SOW catalog. */
export function cadenceDescription(ob: Pick<CompanyObligationRow, "title" | "cadence" | "due_day_config">): string {
  const catalog = sowCatalogEntry(ob.title);
  if (catalog) return explainDueRule(catalog.due_rule);
  const rule = resolveDueRule(ob.title, ob.cadence, (ob.due_day_config ?? {}) as Record<string, unknown>);
  if (rule) return explainDueRule(rule);
  return cadenceShortLabel(ob.cadence);
}

// ─── internal helpers (share the caller's request-scoped supabase client) ──

async function fetchObligation(supabase: AnySupabase, organizationId: string, obligationId: string) {
  const { data, error } = await supabase
    .from("company_obligations")
    .select("*")
    .eq("id", obligationId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Obligation not found.");
  return data as CompanyObligationRow;
}

export async function snapshotAssigneesInternal(
  supabase: AnySupabase,
  organizationId: string,
  obligationId: string,
  instanceId: string,
  obligationRow?: CompanyObligationRow,
): Promise<ResolvedStaffMember[]> {
  const ob = obligationRow ?? (await fetchObligation(supabase, organizationId, obligationId));

  const groupMembers = await resolveGroupMembersInternal(
    supabase, organizationId, ob.assigned_to_groups ?? [], ob.assignee_role,
  );

  const directUserIds = ob.assigned_to_users ?? [];
  let directMembers: ResolvedStaffMember[] = [];
  if (directUserIds.length) {
    const [{ data: dirRows, error: dErr }, { data: roleRows, error: rErr }] = await Promise.all([
      supabase.from("org_member_directory").select("id, full_name").in("id", directUserIds),
      supabase.from("organization_members").select("user_id, role")
        .eq("organization_id", organizationId).eq("active", true).in("user_id", directUserIds),
    ]);
    if (dErr) throw new Error(dErr.message);
    if (rErr) throw new Error(rErr.message);
    const nameById = new Map<string, string>(
      ((dirRows ?? []) as unknown as Array<{ id: string | null; full_name: string | null }>)
        .filter((r) => !!r.id)
        .map((r) => [r.id as string, r.full_name ?? "Unknown"] as [string, string]),
    );
    const roleById = new Map<string, string>(
      ((roleRows ?? []) as unknown as Array<{ user_id: string; role: string }>)
        .map((r) => [r.user_id, r.role] as [string, string]),
    );
    directMembers = directUserIds
      .map((uid: string) => {
        const role = roleById.get(uid);
        if (!role) return null;
        if (ob.assignee_role === "managers_only" && !["manager", "super_admin"].includes(role)) return null;
        if (ob.assignee_role === "admin_only" && !["admin", "super_admin"].includes(role)) return null;
        return { staff_id: uid, staff_name: nameById.get(uid) ?? "Unknown", staff_role: role };
      })
      .filter((m): m is ResolvedStaffMember => m !== null);
  }

  const byId = new Map<string, ResolvedStaffMember>();
  for (const m of [...groupMembers, ...directMembers]) byId.set(m.staff_id, m);
  const all = Array.from(byId.values());

  if (all.length) {
    const rows = all.map((m) => ({
      instance_id: instanceId,
      organization_id: organizationId,
      staff_id: m.staff_id,
      staff_name: m.staff_name,
      staff_role: m.staff_role,
    }));
    const { error } = await supabase
      .from("company_obligation_instance_assignees")
      .upsert(rows, { onConflict: "instance_id,staff_id", ignoreDuplicates: true });
    if (error) throw new Error(error.message);
  }

  return all;
}

export async function scheduleRemindersInternal(
  supabase: AnySupabase,
  organizationId: string,
  instanceId: string,
  obligationRow: CompanyObligationRow,
): Promise<void> {
  const days = obligationRow.reminder_days_before ?? [];
  if (!days.length) return;

  const { data: assignees, error: aErr } = await supabase
    .from("company_obligation_instance_assignees")
    .select("staff_id")
    .eq("instance_id", instanceId);
  if (aErr) throw new Error(aErr.message);
  if (!assignees?.length) return;

  const { data: inst, error: iErr } = await supabase
    .from("company_obligation_instances")
    .select("due_at, period_key")
    .eq("id", instanceId)
    .maybeSingle();
  if (iErr) throw new Error(iErr.message);
  if (!inst) return;

  const dueAt = new Date(inst.due_at);
  const linkTo = obligationRow.evidence_type === "form" && obligationRow.linked_form_id
    ? `/dashboard/forms/${obligationRow.linked_form_id}`
    : "/dashboard/my-obligations";
  const cadenceDesc = cadenceShortLabel(obligationRow.cadence);

  for (const a of assignees as Array<{ staff_id: string }>) {
    for (const n of days) {
      const recurrenceKey = `obligation_reminder_${instanceId}_${a.staff_id}_${n}`;
      const { data: existing, error: eErr } = await supabase
        .from("notifications").select("id").eq("organization_id", organizationId)
        .eq("recurrence_key", recurrenceKey).maybeSingle();
      if (eErr) throw new Error(eErr.message);
      if (existing) continue;

      const remindAt = new Date(dueAt.getTime() - n * 24 * 60 * 60 * 1000);
      const title = n === 0
        ? `${obligationRow.title} is due today`
        : `${obligationRow.title} is due in ${n} day${n === 1 ? "" : "s"}`;
      const urgency = n >= 3 ? "normal" : "high";

      const { error: insErr } = await supabase.from("notifications").insert({
        organization_id: organizationId,
        recipient_user_id: a.staff_id,
        recipient_role: "staff",
        type: "company_obligation_reminder",
        urgency,
        title,
        body: `${cadenceDesc} — ${inst.period_key}. ${obligationRow.description ?? ""}`.trim(),
        link_to: linkTo,
        next_remind_at: remindAt.toISOString(),
        related_id: instanceId,
        related_type: "company_obligation_instance",
        recurrence_key: recurrenceKey,
      });
      if (insErr) throw new Error(insErr.message);
    }
  }
}

/**
 * True when an obligation's due_day_config uses a per-staffer date basis
 * (30-day-from-hire onboarding items, or hire-anniversary renewals) rather
 * than a shared calendar date — these generate one instance PER ASSIGNEE
 * (assignee_staff_id set) instead of one shared instance for the group.
 */
function isPerPersonDueConfig(cfg: Record<string, unknown>): boolean {
  return cfg.days_after_hire !== undefined || cfg.anniversary_based === true || cfg.every_n_months !== undefined;
}

function isPerPersonObligation(ob: CompanyObligationRow): boolean {
  if (ob.scope !== "staff") return false;
  if (isPerPersonDueConfig((ob.due_day_config ?? {}) as Record<string, unknown>)) return true;
  const rule = resolveDueRule(ob.title, ob.cadence, (ob.due_day_config ?? {}) as Record<string, unknown>);
  return !!rule && (rule.kind === "days_after_hire" || rule.kind === "hire_anniversary" || rule.kind === "cert_expiration");
}

async function fetchAssigneeHireDates(
  supabase: AnySupabase,
  staffIds: string[],
): Promise<Map<string, { basis_date: string | null }>> {
  const map = new Map<string, { basis_date: string | null }>();
  if (!staffIds.length) return map;
  const { data, error } = await supabase
    .from("profiles")
    .select("id, hire_date, start_date, created_at")
    .in("id", staffIds);
  if (error) throw new Error(error.message);
  for (const p of (data ?? []) as Array<{
    id: string; hire_date: string | null; start_date: string | null; created_at: string | null;
  }>) {
    map.set(p.id, { basis_date: p.hire_date ?? p.start_date ?? p.created_at ?? null });
  }
  return map;
}

async function resolveAllAssigneesInternal(
  supabase: AnySupabase,
  organizationId: string,
  ob: CompanyObligationRow,
): Promise<ResolvedStaffMember[]> {
  const groupMembers = await resolveGroupMembersInternal(
    supabase, organizationId, ob.assigned_to_groups ?? [], ob.assignee_role,
  );
  const directUserIds = ob.assigned_to_users ?? [];
  let directMembers: ResolvedStaffMember[] = [];
  if (directUserIds.length) {
    const [{ data: dirRows, error: dErr }, { data: roleRows, error: rErr }] = await Promise.all([
      supabase.from("org_member_directory").select("id, full_name").in("id", directUserIds),
      supabase.from("organization_members").select("user_id, role")
        .eq("organization_id", organizationId).eq("active", true).in("user_id", directUserIds),
    ]);
    if (dErr) throw new Error(dErr.message);
    if (rErr) throw new Error(rErr.message);
    const nameById = new Map<string, string>(
      ((dirRows ?? []) as unknown as Array<{ id: string | null; full_name: string | null }>)
        .filter((r) => !!r.id)
        .map((r) => [r.id as string, r.full_name ?? "Unknown"] as [string, string]),
    );
    const roleById = new Map<string, string>(
      ((roleRows ?? []) as unknown as Array<{ user_id: string; role: string }>)
        .map((r) => [r.user_id, r.role] as [string, string]),
    );
    directMembers = directUserIds
      .map((uid: string) => {
        const role = roleById.get(uid);
        if (!role) return null;
        if (ob.assignee_role === "managers_only" && !["manager", "super_admin"].includes(role)) return null;
        if (ob.assignee_role === "admin_only" && !["admin", "super_admin"].includes(role)) return null;
        return { staff_id: uid, staff_name: nameById.get(uid) ?? "Unknown", staff_role: role };
      })
      .filter((m): m is ResolvedStaffMember => m !== null);
  }
  const byId = new Map<string, ResolvedStaffMember>();
  for (const m of [...groupMembers, ...directMembers]) byId.set(m.staff_id, m);
  return Array.from(byId.values());
}

/**
 * days_after_hire: due_at = hire_date + N days (fallback to created_at).
 * anniversary_based: due_at = the next hire anniversary on/after today that
 * is >= due_day_config.start_year (default 1) — i.e. only the CURRENT due
 * instance, not every future year at once. One instance per assignee;
 * skips assignees who already have an open (pending/overdue) instance.
 */
async function generatePerPersonInstancesInternal(
  supabase: AnySupabase,
  organizationId: string,
  ob: CompanyObligationRow,
): Promise<ObligationInstanceRow[]> {
  const cfg = (ob.due_day_config ?? {}) as Record<string, unknown>;
  let assignees = await resolveAllAssigneesInternal(supabase, organizationId, ob);
  if (!assignees.length) return [];
  assignees = await filterAssigneesByServiceCodesInternal(supabase, organizationId, ob, assignees);
  if (!assignees.length) return [];

  const hireDates = await fetchAssigneeHireDates(supabase, assignees.map((a) => a.staff_id));
  const now = new Date();
  const todayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  const created: ObligationInstanceRow[] = [];
  const failures: string[] = [];
  for (const a of assignees) {
   try {
    const basisStr = hireDates.get(a.staff_id)?.basis_date;
    if (!basisStr) continue; // no hire_date/start_date/created_at on file — can't compute a due date
    const basisDate = new Date(`${basisStr.slice(0, 10)}T00:00:00Z`);

    let due: Date;
    if (cfg.days_after_hire !== undefined) {
      const days = Number(cfg.days_after_hire);
      if (!Number.isFinite(days)) continue;
      due = addDaysUTC(basisDate, days);

      // Grace period: if the obligation was added to the platform after this
      // staff member's hire date, don't mark them immediately overdue — give
      // them 30 days from the obligation's creation to comply instead.
      const obCreatedAt = new Date(ob.created_at ?? todayUTC.toISOString());
      if (due.getTime() < obCreatedAt.getTime()) {
        due = addDaysUTC(obCreatedAt, 30);
      }
    } else if (cfg.every_n_months !== undefined) {
      // First instance for a not-yet-certified assignee: give them a
      // reasonable window from hire before any cert exists. Later renewals
      // are scheduled directly off the cert's expiration date in
      // recordCompletion, not by this per-assignee generator.
      const months = Number(cfg.every_n_months);
      if (!Number.isFinite(months)) continue;
      due = addMonthsUTC(basisDate, months);
    } else {
      const startYear = Math.max(1, Number(cfg.start_year ?? 1));
      let n = startYear;
      due = addYearsUTC(basisDate, n);
      // Advance to the nearest anniversary on/after today so only the
      // current due instance is generated — never future years at once.
      while (due.getTime() < todayUTC.getTime()) {
        n += 1;
        due = addYearsUTC(basisDate, n);
      }
    }

    const { data: existingOpen, error: openErr } = await supabase
      .from("company_obligation_instances")
      .select("id")
      .eq("obligation_id", ob.id)
      .eq("assignee_staff_id", a.staff_id)
      .in("status", ["pending", "overdue"])
      .maybeSingle();
    if (openErr) throw new Error(openErr.message);
    if (existingOpen) continue; // already has an open instance — don't duplicate

    const periodKey = `Due ${formatShort(due)}`;
    const { data: inserted, error: insErr } = await supabase
      .from("company_obligation_instances")
      .insert({
        obligation_id: ob.id,
        organization_id: organizationId,
        period_key: periodKey,
        due_at: endOfDayUTC(due),
        status: "pending",
        assignee_staff_id: a.staff_id,
      })
      .select("*")
      .maybeSingle();
    if (insErr) {
      // Unique-index race with a concurrent generator call — safe to skip.
      if ((insErr as { code?: string }).code === "23505") continue;
      throw new Error(insErr.message);
    }
    if (!inserted) continue;

    const { error: assErr } = await supabase.from("company_obligation_instance_assignees").upsert(
      [{
        instance_id: inserted.id,
        organization_id: organizationId,
        staff_id: a.staff_id,
        staff_name: a.staff_name,
        staff_role: a.staff_role,
      }],
      { onConflict: "instance_id,staff_id", ignoreDuplicates: true },
    );
    if (assErr) throw new Error(assErr.message);

    // Reminder scheduling must never block instance creation.
    try {
      await scheduleRemindersInternal(supabase, organizationId, inserted.id, ob);
    } catch (remErr) {
      failures.push(`${a.staff_name} (reminders): ${(remErr as Error).message}`);
    }
    created.push(inserted as ObligationInstanceRow);
   } catch (err) {
      // One bad staff row must not abort generation for everyone else.
      failures.push(`${a.staff_name}: ${(err as Error).message}`);
   }
  }
  if (failures.length) {
    console.error(
      `[obligations] per-person generation failed for ${failures.length} staff on ${ob.id}: ${failures.join(" | ")}`,
    );
  }
  return created;
}

function arraysOverlapCaseInsensitive(target: string[], have: string[]): boolean {
  if (!target.length) return true; // empty target list = applies to everyone
  const haveUpper = new Set(have.map((c) => c.toUpperCase()));
  return target.some((c) => haveUpper.has(c.toUpperCase()));
}

/**
 * For scope='staff' obligations with a non-empty target_service_codes list
 * (e.g. ACRE Training, SEI-only), only staff actively assigned to at least
 * one client whose service_codes overlap the target list actually work in
 * that service line — narrows a group-wide assignee list (e.g. "All Staff")
 * down to the staff it should really apply to.
 */
async function filterAssigneesByServiceCodesInternal(
  supabase: AnySupabase,
  organizationId: string,
  ob: CompanyObligationRow,
  assignees: ResolvedStaffMember[],
): Promise<ResolvedStaffMember[]> {
  const targetCodes = (ob.target_service_codes ?? []).map((c: string) => c.toUpperCase());
  if (ob.scope !== "staff" || !targetCodes.length || !assignees.length) return assignees;

  const staffIds = assignees.map((a) => a.staff_id);
  const { data: assignments, error } = await supabase
    .from("staff_assignments")
    .select("staff_id, service_codes")
    .eq("organization_id", organizationId)
    .in("staff_id", staffIds);
  if (error) throw new Error(error.message);

  const staffWithMatchingCode = new Set(
    ((assignments ?? []) as Array<{ staff_id: string; service_codes: string[] | null }>)
      .filter((a) => (a.service_codes ?? []).some((c: string) => targetCodes.includes(c.toUpperCase())))
      .map((a) => a.staff_id),
  );

  return assignees.filter((a) => staffWithMatchingCode.has(a.staff_id));
}

async function fetchClientNamesInternal(supabase: AnySupabase, clientIds: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!clientIds.length) return map;
  const { data, error } = await supabase
    .from("clients")
    .select("id, first_name, last_name")
    .in("id", clientIds);
  if (error) throw new Error(error.message);
  for (const c of (data ?? []) as Array<{ id: string; first_name: string | null; last_name: string | null }>) {
    map.set(c.id, [c.first_name, c.last_name].filter(Boolean).join(" ").trim() || "Client");
  }
  return map;
}

/**
 * scope = 'staff_per_client': one instance per active staff_assignments row
 * whose service_codes overlap the obligation's target_service_codes (empty
 * target = every assignment qualifies). due_day_config.days_after_assignment
 * bases the due date on the assignment's own created_at rather than a
 * shared calendar period; other cadences fall back to computePeriod, with
 * the client name prefixed onto the period key.
 */
async function generatePerClientInstancesInternal(
  supabase: AnySupabase,
  organizationId: string,
  ob: CompanyObligationRow,
): Promise<ObligationInstanceRow[]> {
  const cfg = (ob.due_day_config ?? {}) as Record<string, unknown>;

  const { data: assignments, error: aErr } = await supabase
    .from("staff_assignments")
    .select("staff_id, client_id, service_codes, created_at")
    .eq("organization_id", organizationId);
  if (aErr) throw new Error(aErr.message);
  const list = (assignments ?? []) as Array<{
    staff_id: string; client_id: string; service_codes: string[] | null; created_at: string;
  }>;
  const qualifying = list.filter((a) => arraysOverlapCaseInsensitive(ob.target_service_codes ?? [], a.service_codes ?? []));
  if (!qualifying.length) return [];

  const staffIds = Array.from(new Set(qualifying.map((a) => a.staff_id)));
  const clientIds = Array.from(new Set(qualifying.map((a) => a.client_id)));
  const [{ data: dirRows, error: dErr }, clientNameById] = await Promise.all([
    supabase.from("org_member_directory").select("id, full_name").in("id", staffIds),
    fetchClientNamesInternal(supabase, clientIds),
  ]);
  if (dErr) throw new Error(dErr.message);
  const staffNameById = new Map(
    (dirRows ?? []).map((r: { id: string; full_name: string | null }) => [r.id, r.full_name ?? "Unknown"]),
  );

  const created: ObligationInstanceRow[] = [];
  for (const a of qualifying) {
    const { data: existingOpen, error: openErr } = await supabase
      .from("company_obligation_instances")
      .select("id")
      .eq("obligation_id", ob.id)
      .eq("assignee_staff_id", a.staff_id)
      .eq("client_id", a.client_id)
      .in("status", ["pending", "overdue"])
      .maybeSingle();
    if (openErr) throw new Error(openErr.message);
    if (existingOpen) continue;

    const clientName = clientNameById.get(a.client_id) ?? "Client";
    let due: Date;
    let periodKey: string;
    if (cfg.days_after_assignment !== undefined) {
      const days = Number(cfg.days_after_assignment);
      if (!Number.isFinite(days)) continue;
      const assignedAt = new Date(a.created_at);
      due = addDaysUTC(assignedAt, days);
      periodKey = `${clientName} — Assigned ${formatShort(assignedAt)}`;
    } else {
      const period = computePeriod(ob.cadence, cfg, new Date());
      if (!period) continue;
      due = new Date(period.due_at);
      periodKey = ob.cadence === "one_time" ? clientName : `${clientName} — ${period.period_key}`;
    }

    const { data: inserted, error: insErr } = await supabase
      .from("company_obligation_instances")
      .insert({
        obligation_id: ob.id,
        organization_id: organizationId,
        period_key: periodKey,
        due_at: endOfDayUTC(due),
        status: "pending",
        assignee_staff_id: a.staff_id,
        client_id: a.client_id,
        client_name: clientName,
      })
      .select("*")
      .maybeSingle();
    if (insErr) {
      // Unique-index race with a concurrent generator call — safe to skip.
      if ((insErr as { code?: string }).code === "23505") continue;
      throw new Error(insErr.message);
    }
    if (!inserted) continue;

    const { error: assErr } = await supabase.from("company_obligation_instance_assignees").upsert(
      [{
        instance_id: inserted.id,
        organization_id: organizationId,
        staff_id: a.staff_id,
        staff_name: staffNameById.get(a.staff_id) ?? "Unknown",
        staff_role: "employee",
        client_id: a.client_id,
        client_name: clientName,
      }],
      { onConflict: "instance_id,staff_id", ignoreDuplicates: true },
    );
    if (assErr) throw new Error(assErr.message);

    await scheduleRemindersInternal(supabase, organizationId, inserted.id, ob);
    created.push(inserted as ObligationInstanceRow);
  }
  return created;
}

function dueUtcDay(iso: string): string {
  return iso.slice(0, 10);
}

/**
 * Shared (org-level) calendar periods: insert any missing current/next
 * period. Matches an existing row by period_key OR by the same UTC due
 * day so a catalog period-key rename does not duplicate a live instance.
 */
async function ensureSharedPeriodsInternal(
  supabase: AnySupabase,
  organizationId: string,
  ob: CompanyObligationRow,
  periods: Array<{ period_key: string; due_at: string }>,
): Promise<ObligationInstanceRow | null> {
  if (!periods.length) return null;

  const { data: existingRows, error: exErr } = await supabase
    .from("company_obligation_instances")
    .select("*")
    .eq("obligation_id", ob.id)
    .is("assignee_staff_id", null);
  if (exErr) throw new Error(exErr.message);
  const existing = (existingRows ?? []) as ObligationInstanceRow[];

  let last: ObligationInstanceRow | null = existing[0] ?? null;
  for (const period of periods) {
    const match = existing.find((row) =>
      row.period_key === period.period_key
      || dueUtcDay(row.due_at) === dueUtcDay(period.due_at),
    );
    if (match) {
      last = match;
      continue;
    }

    const { data: inserted, error: insErr } = await supabase
      .from("company_obligation_instances")
      .insert({
        obligation_id: ob.id,
        organization_id: organizationId,
        period_key: period.period_key,
        due_at: period.due_at,
        status: "pending",
      })
      .select("*")
      .maybeSingle();
    if (insErr) {
      if ((insErr as { code?: string }).code === "23505") continue;
      throw new Error(insErr.message);
    }
    if (!inserted) continue;
    last = inserted as ObligationInstanceRow;
    existing.push(last);
    await snapshotAssigneesInternal(supabase, organizationId, ob.id, last.id, ob);
    try {
      await scheduleRemindersInternal(supabase, organizationId, last.id, ob);
    } catch (remErr) {
      console.error(`[obligations] reminder schedule failed for ${ob.id}:`, remErr);
    }
  }
  return last;
}

export async function generateNextInstanceInternal(
  supabase: AnySupabase,
  organizationId: string,
  obligationId: string,
): Promise<ObligationInstanceRow | null> {
  const ob = await fetchObligation(supabase, organizationId, obligationId);
  if (ob.cadence === "per_event") return null;

  if (ob.scope === "staff_per_client") {
    const created = await generatePerClientInstancesInternal(supabase, organizationId, ob);
    return created[0] ?? null;
  }

  const dueCfg = (ob.due_day_config ?? {}) as Record<string, unknown>;
  if (isPerPersonObligation(ob)) {
    const created = await generatePerPersonInstancesInternal(supabase, organizationId, ob);
    return created[0] ?? null;
  }

  const rule = resolveDueRule(ob.title, ob.cadence, dueCfg);
  if (rule && (isCalendarDueRule(rule) || rule.kind === "fixed_date")) {
    return ensureSharedPeriodsInternal(supabase, organizationId, ob, periodsToEnsure(rule));
  }

  let period: { period_key: string; due_at: string } | null = null;
  try {
    period = computePeriod(ob.cadence, dueCfg, new Date());
  } catch (e) {
    console.warn(`[obligations] could not compute period for ${ob.id} (${ob.title}):`, e);
    return null;
  }
  if (!period) return null;
  return ensureSharedPeriodsInternal(supabase, organizationId, ob, [period]);
}

export async function notifyObligationManagersInternal(
  supabase: AnySupabase,
  organizationId: string,
  obligationId: string,
  instanceId: string,
  eventType: "completion" | "overdue",
): Promise<void> {
  const ob = await fetchObligation(supabase, organizationId, obligationId);
  const { data: inst, error: iErr } = await supabase
    .from("company_obligation_instances").select("*").eq("id", instanceId).maybeSingle();
  if (iErr) throw new Error(iErr.message);
  if (!inst) return;

  if (eventType === "completion" && !ob.notify_manager_on_complete) return;
  if (eventType === "overdue" && !ob.notify_manager_on_overdue) return;

  const [{ data: completions, error: cErr }, { data: assignees, error: aErr }] = await Promise.all([
    supabase.from("company_obligation_completions")
      .select("staff_id, staff_name, completed_at, evidence_type_used")
      .eq("instance_id", instanceId).order("completed_at", { ascending: true }),
    supabase.from("company_obligation_instance_assignees")
      .select("staff_id, staff_name").eq("instance_id", instanceId),
  ]);
  if (cErr) throw new Error(cErr.message);
  if (aErr) throw new Error(aErr.message);

  const completedIds = new Set((completions ?? []).map((c: { staff_id: string }) => c.staff_id));
  const completedNames = (completions ?? []).map((c: { staff_name: string }) => c.staff_name);
  const notSubmittedNames = (assignees ?? [])
    .filter((a: { staff_id: string }) => !completedIds.has(a.staff_id))
    .map((a: { staff_name: string }) => a.staff_name);

  // Resolve recipients: managers of linked teams, falling back to org admins.
  const recipientIds = new Set<string>();
  const groupIds = ob.assigned_to_groups ?? [];
  if (groupIds.length) {
    const { data: groups, error: gErr } = await supabase
      .from("staff_groups").select("id, linked_team_id").in("id", groupIds);
    if (gErr) throw new Error(gErr.message);
    const teamIds = (groups ?? [])
      .map((g: { linked_team_id: string | null }) => g.linked_team_id)
      .filter((id: string | null): id is string => !!id);
    if (teamIds.length) {
      const { data: teams, error: tErr } = await supabase
        .from("teams").select("id, manager_id").in("id", teamIds);
      if (tErr) throw new Error(tErr.message);
      for (const t of (teams ?? []) as Array<{ manager_id: string | null }>) {
        if (t.manager_id) recipientIds.add(t.manager_id);
      }
    }
  }
  if (!recipientIds.size) {
    const { data: admins, error: adErr } = await supabase
      .from("organization_members").select("user_id, role")
      .eq("organization_id", organizationId).eq("active", true).in("role", ["admin", "super_admin"]);
    if (adErr) throw new Error(adErr.message);
    for (const a of (admins ?? []) as Array<{ user_id: string }>) recipientIds.add(a.user_id);
  }
  if (!recipientIds.size) return;

  const cadenceDesc = cadenceShortLabel(ob.cadence);
  const lastCompletion = (completions ?? [])[completions.length - 1] as
    { staff_name: string; completed_at: string; evidence_type_used: string } | undefined;

  let title: string;
  let body: string;
  let urgency: string;
  let recurrenceKeyBase: string | null = null;

  if (eventType === "completion") {
    const staffName = lastCompletion?.staff_name ?? "A staff member";
    if (!ob.requires_individual_completion) {
      title = `${staffName} completed "${ob.title}"`;
      body = `${inst.period_key} — ${cadenceDesc}. Submitted ${lastCompletion?.completed_at ?? new Date().toISOString()}. `
        + `Evidence: ${lastCompletion?.evidence_type_used ?? ob.evidence_type}.`;
      urgency = "normal";
    } else {
      const total = (assignees ?? []).length;
      const done = completedIds.size;
      title = `${staffName} submitted "${ob.title}" — ${done} of ${total} complete`;
      body = `Completed: ${completedNames.length ? completedNames.join(", ") : "None"}\n`
        + `Not submitted: ${notSubmittedNames.length ? notSubmittedNames.join(", ") : "All submitted"}`;
      const hoursRemaining = (new Date(inst.due_at).getTime() - Date.now()) / (60 * 60 * 1000);
      urgency = notSubmittedNames.length && hoursRemaining <= 24 ? "high" : "normal";
    }
  } else {
    title = `OVERDUE — "${ob.title}" (${inst.period_key})`;
    body = `Due ${inst.due_at}. ${cadenceDesc}.\n`
      + `Completed: ${completedNames.length ? completedNames.join(", ") : "None submitted"}\n`
      + `Not submitted: ${notSubmittedNames.length ? notSubmittedNames.join(", ") : "All submitted"}`;
    urgency = "critical";
    recurrenceKeyBase = `obligation_overdue_${instanceId}`;
  }

  if (recurrenceKeyBase) {
    // Unique index is (organization_id, recurrence_key), so a per-recipient
    // suffix is needed for the fan-out insert below; this prefix check is
    // what actually enforces "only once per overdue transition".
    const { data: already, error: chkErr } = await supabase
      .from("notifications").select("id")
      .eq("organization_id", organizationId)
      .like("recurrence_key", `${recurrenceKeyBase}%`)
      .limit(1);
    if (chkErr) throw new Error(chkErr.message);
    if (already && already.length) return;
  }

  const rows = Array.from(recipientIds).map((recipientId) => ({
    organization_id: organizationId,
    recipient_user_id: recipientId,
    recipient_role: "admin",
    type: "company_obligation_update",
    urgency,
    title,
    body,
    link_to: "/dashboard/company-obligations",
    related_id: instanceId,
    related_type: "company_obligation_instance",
    recurrence_key: recurrenceKeyBase ? `${recurrenceKeyBase}_${recipientId}` : null,
  }));
  const { error: insErr } = await supabase.from("notifications").insert(rows);
  if (insErr) throw new Error(insErr.message);
}

export async function checkAndMarkOverdueInternal(supabase: AnySupabase, organizationId: string): Promise<void> {
  const { data: overdue, error } = await supabase
    .from("company_obligation_instances")
    .select("id, obligation_id")
    .eq("organization_id", organizationId)
    .eq("status", "pending")
    .lt("due_at", new Date().toISOString());
  if (error) throw new Error(error.message);

  for (const inst of (overdue ?? []) as Array<{ id: string; obligation_id: string }>) {
    const { data: updated, error: upErr } = await supabase
      .from("company_obligation_instances")
      .update({ status: "overdue" })
      .eq("id", inst.id)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();
    if (upErr) throw new Error(upErr.message);
    if (updated) {
      await notifyObligationManagersInternal(supabase, organizationId, inst.obligation_id, inst.id, "overdue");
    }
  }
}

export const checkAndMarkOverdue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ organizationId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: AnySupabase; userId: string };
    if (!supabase || !userId) return { ok: false };
    await requireOrgMembership(supabase, userId, data.organizationId, "employee");
    await checkAndMarkOverdueInternal(supabase, data.organizationId);
    return { ok: true };
  });

export type MyObligationInstanceRow = ObligationInstanceRow & {
  obligation: CompanyObligationRow;
};

/** Instances (open or completed) assigned to the calling staff member, obligation joined in. */
export const listMyObligationInstances = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ organizationId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: AnySupabase; userId: string };
    if (!supabase || !userId) return [] as MyObligationInstanceRow[];
    await requireOrgMembership(supabase, userId, data.organizationId, "employee");

    await checkAndMarkOverdueInternal(supabase, data.organizationId);

    const { data: assigneeRows, error: aErr } = await supabase
      .from("company_obligation_instance_assignees")
      .select("instance_id")
      .eq("organization_id", data.organizationId)
      .eq("staff_id", userId);
    if (aErr) throw new Error(aErr.message);
    const instanceIds = Array.from(new Set((assigneeRows ?? []).map((r: { instance_id: string }) => r.instance_id)));
    if (!instanceIds.length) return [];

    const { data: instances, error: iErr } = await supabase
      .from("company_obligation_instances")
      .select("*")
      .in("id", instanceIds)
      .order("due_at", { ascending: true });
    if (iErr) throw new Error(iErr.message);

    const obligationIds = Array.from(new Set((instances ?? []).map((i: ObligationInstanceRow) => i.obligation_id)));
    if (!obligationIds.length) return [];
    const { data: obligations, error: oErr } = await supabase
      .from("company_obligations").select("*").in("id", obligationIds);
    if (oErr) throw new Error(oErr.message);
    const obligationById = new Map((obligations ?? []).map((o: CompanyObligationRow) => [o.id, o]));

    return (instances ?? [])
      .map((i: ObligationInstanceRow) => {
        const obligation = obligationById.get(i.obligation_id);
        return obligation ? { ...i, obligation } : null;
      })
      .filter((r: MyObligationInstanceRow | null): r is MyObligationInstanceRow => r !== null);
  });

/** Obligation + instance context for the form-fill obligation banner. */
export const getObligationInstanceContext = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    organizationId: z.string().uuid(),
    instanceId: z.string().uuid(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: AnySupabase; userId: string };
    if (!supabase || !userId) return { instance: null as ObligationInstanceRow | null, obligation: null as CompanyObligationRow | null };
    await requireOrgMembership(supabase, userId, data.organizationId, "employee");

    const { data: inst, error: iErr } = await supabase
      .from("company_obligation_instances").select("*")
      .eq("id", data.instanceId).eq("organization_id", data.organizationId).maybeSingle();
    if (iErr) throw new Error(iErr.message);
    if (!inst) return { instance: null, obligation: null };

    const ob = await fetchObligation(supabase, data.organizationId, inst.obligation_id);
    return { instance: inst as ObligationInstanceRow, obligation: ob };
  });

/**
 * Company obligations are org-wide, not tied to a client, but the forms
 * system's submitForm() always requires a caseload client. This inserts the
 * submission directly (client_id null) once the linked form + instance are
 * verified to belong together, so obligation-linked forms don't need a
 * client context to satisfy.
 */
export const submitObligationForm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    organizationId: z.string().uuid(),
    instanceId: z.string().uuid(),
    formId: z.string().uuid(),
    answers: z.record(z.any()),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: AnySupabase; userId: string };
    if (!supabase || !userId) return { submissionId: null as string | null };
    await requireOrgMembership(supabase, userId, data.organizationId, "employee");

    const { data: inst, error: iErr } = await supabase
      .from("company_obligation_instances").select("id, obligation_id")
      .eq("id", data.instanceId).eq("organization_id", data.organizationId).maybeSingle();
    if (iErr) throw new Error(iErr.message);
    if (!inst) throw new Error("Obligation instance not found.");
    const ob = await fetchObligation(supabase, data.organizationId, inst.obligation_id);
    if (ob.evidence_type !== "form" || ob.linked_form_id !== data.formId) {
      throw new Error("This form is not linked to that obligation.");
    }

    const { data: sub, error: sErr } = await supabase
      .from("form_submissions")
      .insert({
        organization_id: data.organizationId,
        form_id: data.formId,
        client_id: null,
        submitted_by: userId,
        answers: data.answers,
      })
      .select("id").maybeSingle();
    if (sErr) throw new Error(sErr.message);
    if (!sub) throw new Error("Failed to submit form.");

    return { submissionId: sub.id as string };
  });

// ─── obligation CRUD ────────────────────────────────────────────────────

const obligationInputSchema = z.object({
  title: z.string().trim().min(1).max(300),
  description: z.string().max(5000).optional().nullable(),
  sourcePolicySection: z.string().max(500).optional().nullable(),
  cadence: z.enum(["weekly", "monthly", "quarterly", "annually", "per_event", "one_time"]),
  dueDayConfig: z.record(z.any()).default({}),
  reminderDaysBefore: z.array(z.number().int().min(0).max(365)).max(20).default([]),
  evidenceType: z.enum(["attestation", "upload", "upload_and_attestation", "form"]),
  linkedFormId: z.string().uuid().optional().nullable(),
  attestationText: z.string().max(20000).optional().nullable(),
  requiresIndividualCompletion: z.boolean().default(false),
  assignedToGroups: z.array(z.string().uuid()).max(200).default([]),
  assignedToUsers: z.array(z.string().uuid()).max(500).default([]),
  assigneeRole: z.enum(["any_assigned", "managers_only", "admin_only"]).default("any_assigned"),
  scope: z.enum(["org", "staff", "staff_per_client"]).default("staff"),
  targetServiceCodes: z.array(z.string().max(20)).max(50).default([]),
  notifyManagerOnComplete: z.boolean().default(true),
  notifyManagerOnOverdue: z.boolean().default(true),
  nectarCertTypeLabel: z.string().max(300).optional().nullable(),
  nectarKeywordGroups: z.array(z.object({
    label: z.string().max(200),
    any_of: z.array(z.string().max(120)).max(20),
  })).max(20).default([]),
});

export const listCompanyObligations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ organizationId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: AnySupabase; userId: string };
    if (!supabase || !userId) return [] as ObligationListItem[];
    await requireOrgMembership(supabase, userId, data.organizationId, "employee");

    await checkAndMarkOverdueInternal(supabase, data.organizationId);

    const { data: obligations, error } = await supabase
      .from("company_obligations").select("*")
      .eq("organization_id", data.organizationId)
      .order("title", { ascending: true });
    if (error) throw new Error(error.message);

    // Fetch active client service codes for this org — used to hide
    // obligations whose target_service_codes don't apply to any active
    // client (e.g. SOW-seeded obligations for service codes TNS doesn't run).
    const { data: clientCodes, error: ccErr } = await supabase
      .from("clients")
      .select("authorized_dspd_codes")
      .eq("organization_id", data.organizationId)
      .eq("account_status", "active");
    if (ccErr) throw new Error(ccErr.message);

    const activeCodes = new Set(
      (clientCodes ?? []).flatMap(
        (c: { authorized_dspd_codes: string[] | null }) =>
          (c.authorized_dspd_codes ?? []).map((code: string) => code.toUpperCase()),
      ),
    );

    const visibleObligations = (obligations ?? []).filter((o: CompanyObligationRow) => {
      const targets = (o.target_service_codes ?? []).map((c: string) => c.toUpperCase());
      if (!targets.length) return true;
      return targets.some((c: string) => activeCodes.has(c));
    });

    const obligationIds = visibleObligations.map((o: CompanyObligationRow) => o.id);
    const instancesByObligation = new Map<string, ObligationInstanceRow[]>();
    if (obligationIds.length) {
      const { data: instances, error: iErr } = await supabase
        .from("company_obligation_instances").select("*")
        .in("obligation_id", obligationIds)
        .order("due_at", { ascending: true });
      if (iErr) throw new Error(iErr.message);
      for (const inst of (instances ?? []) as ObligationInstanceRow[]) {
        const list = instancesByObligation.get(inst.obligation_id) ?? [];
        list.push(inst);
        instancesByObligation.set(inst.obligation_id, list);
      }
    }

    // Ensure current + next calendar periods for org-level duties, and
    // bootstrap staff duties that have no OPEN instance (so a completed
    // anniversary year still generates the next one; new hires still get
    // a first instance).
    const needsGeneration = visibleObligations.filter((o: CompanyObligationRow) => {
      if (!o.active) return false;
      const rows = instancesByObligation.get(o.id) ?? [];
      if (o.scope === "org") return true;
      const hasOpen = rows.some((r) => r.status === "pending" || r.status === "overdue");
      return !hasOpen;
    });
    for (const ob of needsGeneration) {
      try {
        await generateNextInstanceInternal(supabase, data.organizationId, ob.id);
      } catch (e) {
        console.warn(`[bootstrap] Could not generate instance for ${ob.id}:`, e);
      }
    }
    if (needsGeneration.length > 0 && obligationIds.length) {
      const { data: freshInstances, error: fErr } = await supabase
        .from("company_obligation_instances").select("*")
        .in("obligation_id", obligationIds)
        .order("due_at", { ascending: true });
      if (fErr) throw new Error(fErr.message);
      instancesByObligation.clear();
      for (const inst of (freshInstances ?? []) as ObligationInstanceRow[]) {
        const list = instancesByObligation.get(inst.obligation_id) ?? [];
        list.push(inst);
        instancesByObligation.set(inst.obligation_id, list);
      }
    }

    return visibleObligations.map((o: CompanyObligationRow) => {
      const rows = instancesByObligation.get(o.id) ?? [];
      return {
        ...o,
        current_instance: pickCurrentInstance(rows),
        rollup: rows.length ? rollupFromInstances(rows) : emptyRollup(),
      };
    });
  });

/** Full resolved assignee roster for an obligation (group membership +
 *  direct assignees, filtered by target_service_codes where applicable) —
 *  independent of any one instance's assignee snapshot, so staff who were
 *  added to the group after an instance was created still show up as
 *  "not yet submitted" instead of silently disappearing. */
export const listObligationAssignees = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    organizationId: z.string().uuid(),
    obligationId: z.string().uuid(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: AnySupabase; userId: string };
    if (!supabase || !userId) return [] as ResolvedStaffMember[];
    await requireOrgMembership(supabase, userId, data.organizationId, "employee");

    const ob = await fetchObligation(supabase, data.organizationId, data.obligationId);
    const assignees = await resolveAllAssigneesInternal(supabase, data.organizationId, ob);
    return filterAssigneesByServiceCodesInternal(supabase, data.organizationId, ob, assignees);
  });

/** Count of an obligation's assignees with no hire_date and no start_date on
 *  file — those staff can't have a due date computed for days_after_hire /
 *  anniversary_based cadences, so the admin needs a nudge to set one. */
export const countObligationAssigneesMissingHireDate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    organizationId: z.string().uuid(),
    obligationId: z.string().uuid(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: AnySupabase; userId: string };
    if (!supabase || !userId) return { missing: 0 };
    await requireOrgMembership(supabase, userId, data.organizationId, "employee");

    const ob = await fetchObligation(supabase, data.organizationId, data.obligationId);
    let assignees = await resolveAllAssigneesInternal(supabase, data.organizationId, ob);
    assignees = await filterAssigneesByServiceCodesInternal(supabase, data.organizationId, ob, assignees);
    if (!assignees.length) return { missing: 0 };

    const { data: rows, error } = await supabase
      .from("profiles")
      .select("id, hire_date, start_date")
      .in("id", assignees.map((a) => a.staff_id));
    if (error) throw new Error(error.message);

    const missing = ((rows ?? []) as Array<{ id: string; hire_date: string | null; start_date: string | null }>)
      .filter((r) => !r.hire_date && !r.start_date).length;
    return { missing };
  });

export const getCompanyObligation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    organizationId: z.string().uuid(),
    obligationId: z.string().uuid(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: AnySupabase; userId: string };
    if (!supabase || !userId) return { obligation: null, current_instance: null };
    await requireOrgMembership(supabase, userId, data.organizationId, "employee");

    const ob = await fetchObligation(supabase, data.organizationId, data.obligationId);
    const { data: inst, error: iErr } = await supabase
      .from("company_obligation_instances").select("*")
      .eq("obligation_id", data.obligationId)
      .order("created_at", { ascending: false })
      .limit(1).maybeSingle();
    if (iErr) throw new Error(iErr.message);

    return { obligation: ob, current_instance: (inst ?? null) as ObligationInstanceRow | null };
  });

export const createCompanyObligation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ organizationId: z.string().uuid() }).merge(obligationInputSchema).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: AnySupabase; userId: string };
    if (!supabase || !userId) return { obligation: null as CompanyObligationRow | null, instance: null as ObligationInstanceRow | null };
    await requireOrgMembership(supabase, userId, data.organizationId, "manager");

    const { data: inserted, error } = await supabase
      .from("company_obligations")
      .insert({
        organization_id: data.organizationId,
        title: data.title,
        description: data.description ?? null,
        source_policy_section: data.sourcePolicySection ?? null,
        cadence: data.cadence,
        due_day_config: data.dueDayConfig,
        reminder_days_before: data.reminderDaysBefore,
        evidence_type: data.evidenceType,
        linked_form_id: data.linkedFormId ?? null,
        attestation_text: data.attestationText ?? null,
        requires_individual_completion: data.requiresIndividualCompletion,
        assigned_to_groups: data.assignedToGroups,
        assigned_to_users: data.assignedToUsers,
        assignee_role: data.assigneeRole,
        scope: data.scope,
        target_service_codes: data.targetServiceCodes,
        notify_manager_on_complete: data.notifyManagerOnComplete,
        notify_manager_on_overdue: data.notifyManagerOnOverdue,
        nectar_cert_type_label: data.nectarCertTypeLabel ?? null,
        nectar_keyword_groups: data.nectarKeywordGroups,
        created_by: userId,
      })
      .select("*").maybeSingle();
    if (error) throw new Error(error.message);
    if (!inserted) throw new Error("Failed to create obligation.");

    const instance = await generateNextInstanceInternal(supabase, data.organizationId, inserted.id);
    return { obligation: inserted as CompanyObligationRow, instance };
  });

export const updateCompanyObligation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    organizationId: z.string().uuid(),
    obligationId: z.string().uuid(),
  }).merge(obligationInputSchema).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: AnySupabase; userId: string };
    if (!supabase || !userId) return { obligation: null as CompanyObligationRow | null };
    await requireOrgMembership(supabase, userId, data.organizationId, "manager");

    const existing = await fetchObligation(supabase, data.organizationId, data.obligationId);
    if (existing.is_locked) throw new Error("This obligation is required by the state contract and cannot be modified.");

    const { data: updated, error } = await supabase
      .from("company_obligations")
      .update({
        title: data.title,
        description: data.description ?? null,
        source_policy_section: data.sourcePolicySection ?? null,
        cadence: data.cadence,
        due_day_config: data.dueDayConfig,
        reminder_days_before: data.reminderDaysBefore,
        evidence_type: data.evidenceType,
        linked_form_id: data.linkedFormId ?? null,
        attestation_text: data.attestationText ?? null,
        requires_individual_completion: data.requiresIndividualCompletion,
        assigned_to_groups: data.assignedToGroups,
        assigned_to_users: data.assignedToUsers,
        assignee_role: data.assigneeRole,
        scope: data.scope,
        target_service_codes: data.targetServiceCodes,
        notify_manager_on_complete: data.notifyManagerOnComplete,
        notify_manager_on_overdue: data.notifyManagerOnOverdue,
        nectar_cert_type_label: data.nectarCertTypeLabel ?? null,
        nectar_keyword_groups: data.nectarKeywordGroups,
      })
      .eq("id", data.obligationId)
      .eq("organization_id", data.organizationId)
      .select("*").maybeSingle();
    if (error) throw new Error(error.message);
    return { obligation: (updated ?? null) as CompanyObligationRow | null };
  });

export const toggleObligationActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    organizationId: z.string().uuid(),
    obligationId: z.string().uuid(),
    active: z.boolean(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: AnySupabase; userId: string };
    if (!supabase || !userId) return { obligation: null as CompanyObligationRow | null, instance: null as ObligationInstanceRow | null };
    await requireOrgMembership(supabase, userId, data.organizationId, "manager");

    const existing = await fetchObligation(supabase, data.organizationId, data.obligationId);
    if (existing.is_locked) throw new Error("This obligation is required by the state contract and cannot be modified.");

    const { data: updated, error } = await supabase
      .from("company_obligations")
      .update({ active: data.active })
      .eq("id", data.obligationId)
      .eq("organization_id", data.organizationId)
      .select("*").maybeSingle();
    if (error) throw new Error(error.message);
    if (!updated) throw new Error("Obligation not found.");

    let instance: ObligationInstanceRow | null = null;
    if (data.active) {
      instance = await generateNextInstanceInternal(supabase, data.organizationId, data.obligationId);
    }
    return { obligation: updated as CompanyObligationRow, instance };
  });

export const deleteCompanyObligation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    organizationId: z.string().uuid(),
    obligationId: z.string().uuid(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: AnySupabase; userId: string };
    if (!supabase || !userId) return { ok: false };
    await requireOrgMembership(supabase, userId, data.organizationId, "manager");

    const existing = await fetchObligation(supabase, data.organizationId, data.obligationId);
    if (existing.is_locked) throw new Error("This obligation is required by the state contract and cannot be modified.");

    const { error } = await supabase
      .from("company_obligations").delete()
      .eq("id", data.obligationId).eq("organization_id", data.organizationId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Called when an admin archives a form that active obligations depend on:
 * pauses those obligations (so they stop generating new instances) and
 * notifies org admins so someone links a replacement form.
 */
export const pauseObligationsForArchivedForm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    organizationId: z.string().uuid(),
    formId: z.string().uuid(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: AnySupabase; userId: string };
    if (!supabase || !userId) return { paused: [] as string[] };
    await requireOrgMembership(supabase, userId, data.organizationId, "manager");

    const { data: obligations, error } = await supabase
      .from("company_obligations")
      .select("id, title")
      .eq("organization_id", data.organizationId)
      .eq("linked_form_id", data.formId)
      .eq("active", true);
    if (error) throw new Error(error.message);
    const list = (obligations ?? []) as Array<{ id: string; title: string }>;
    if (!list.length) return { paused: [] };

    const { error: upErr } = await supabase
      .from("company_obligations")
      .update({ active: false })
      .in("id", list.map((o) => o.id));
    if (upErr) throw new Error(upErr.message);

    const { data: form } = await supabase.from("forms").select("name").eq("id", data.formId).maybeSingle();
    const formName = (form as { name: string } | null)?.name ?? "Unknown form";
    const titles = list.map((o) => o.title).join(", ");

    const { data: admins, error: adErr } = await supabase
      .from("organization_members").select("user_id")
      .eq("organization_id", data.organizationId).eq("active", true).in("role", ["admin", "super_admin"]);
    if (adErr) throw new Error(adErr.message);

    if (admins?.length) {
      const rows = (admins as Array<{ user_id: string }>).map((a) => ({
        organization_id: data.organizationId,
        recipient_user_id: a.user_id,
        recipient_role: "admin",
        type: "company_obligation_update",
        urgency: "high",
        title: "Obligation paused — linked form archived",
        body: `${list.length} obligation(s) were paused because their linked form '${formName}' was archived: ${titles}. `
          + `Edit each obligation in Company Obligations to restore it.`,
        link_to: "/dashboard/company-obligations",
      }));
      const { error: notifErr } = await supabase.from("notifications").insert(rows);
      if (notifErr) throw new Error(notifErr.message);
    }

    return { paused: list.map((o) => o.title) };
  });

// ─── per-event instance logging ─────────────────────────────────────────

export const logObligationEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    organizationId: z.string().uuid(),
    obligationId: z.string().uuid(),
    eventDescription: z.string().trim().min(1).max(2000),
    eventDate: z.string().min(1),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: AnySupabase; userId: string };
    if (!supabase || !userId) return { instance: null as ObligationInstanceRow | null };
    await requireOrgMembership(supabase, userId, data.organizationId, "manager");

    const ob = await fetchObligation(supabase, data.organizationId, data.obligationId);
    if (ob.cadence !== "per_event") throw new Error("logObligationEvent is only valid for per_event obligations.");

    const cfg = (ob.due_day_config ?? {}) as Record<string, unknown>;
    const daysAfter = Number.isFinite(Number(cfg.days_after_trigger)) ? Number(cfg.days_after_trigger) : 0;
    const eventDate = new Date(`${data.eventDate}T00:00:00Z`);
    const dueDate = addDaysUTC(eventDate, daysAfter);
    const periodKey = `Event — ${formatShort(eventDate)}`;

    const { data: inserted, error } = await supabase
      .from("company_obligation_instances")
      .insert({
        obligation_id: ob.id,
        organization_id: data.organizationId,
        period_key: periodKey,
        due_at: endOfDayUTC(dueDate),
        status: "pending",
        event_description: data.eventDescription,
      })
      .select("*").maybeSingle();
    if (error) throw new Error(error.message);
    if (!inserted) throw new Error("Failed to create obligation instance.");

    const assignees = await snapshotAssigneesInternal(supabase, data.organizationId, ob.id, inserted.id, ob);

    if (assignees.length) {
      const rows = assignees.map((a) => ({
        organization_id: data.organizationId,
        recipient_user_id: a.staff_id,
        recipient_role: "staff",
        type: "company_obligation_reminder",
        urgency: "high",
        title: `${ob.title} is due — new event logged`,
        body: `${data.eventDescription}. Due ${formatShort(dueDate)}.`,
        link_to: "/dashboard/my-obligations",
        related_id: inserted.id,
        related_type: "company_obligation_instance",
      }));
      const { error: notifErr } = await supabase.from("notifications").insert(rows);
      if (notifErr) throw new Error(notifErr.message);
    }

    return { instance: inserted as ObligationInstanceRow };
  });

// ─── NECTAR document validation for upload evidence ────────────────────────
// Mirrors the validation pattern in staff-training-requirements.functions.ts
// (attachBaselineCertificate): OCR the upload, check it against the
// obligation's expected keyword groups + staffer name match, and produce a
// pass/fail with human-readable reasons. Applies only when the obligation
// has nectar_cert_type_label configured — provider-created obligations
// without it skip validation entirely (upload always "passes").
type NectarValidationOutcome = {
  ran: boolean;
  status: "passed" | "failed" | null;
  reasons: string[];
  cert_type: string | null;
  name: string | null;
  completed_date: string | null;
  expires_date: string | null;
  name_match: "match" | "mismatch" | "unreadable" | null;
  confidence: number | null;
};

const NO_VALIDATION: NectarValidationOutcome = {
  ran: false, status: null, reasons: [], cert_type: null, name: null,
  completed_date: null, expires_date: null, name_match: null, confidence: null,
};

async function runObligationNectarValidation(
  supabase: AnySupabase,
  ob: CompanyObligationRow,
  staffId: string,
  uploadPath: string,
  uploadFilename: string | null,
): Promise<NectarValidationOutcome> {
  if (!ob.nectar_cert_type_label) return NO_VALIDATION;

  const keywordGroups = (Array.isArray(ob.nectar_keyword_groups) ? ob.nectar_keyword_groups : []) as
    Array<{ label: string; any_of: string[] }>;

  const { data: prof, error: pErr } = await supabase
    .from("profiles").select("full_name").eq("id", staffId).maybeSingle();
  if (pErr) throw new Error(pErr.message);
  const profileName: string | null = (prof?.full_name as string | null) ?? null;

  let ocr: Awaited<ReturnType<typeof runNectarCertOcrFromStoragePath>>;
  try {
    ocr = await runNectarCertOcrFromStoragePath(
      supabase, "obligation-evidence", uploadPath, null, uploadFilename,
      { title: ob.title, validation: { cert_type_label: ob.nectar_cert_type_label, required_keyword_groups: keywordGroups } },
    );
  } catch (e) {
    return {
      ran: true, status: "failed",
      reasons: [`Nectar could not read this document (${(e as Error).message}).`],
      cert_type: null, name: null, completed_date: null, expires_date: null,
      name_match: "unreadable", confidence: null,
    };
  }

  const nameMatch = compareNames(profileName, ocr.name_on_certificate);
  const reasons: string[] = [];
  const haystack = ((ocr.summary ?? "") + " " + (ocr.cert_type ?? "")).toLowerCase();
  for (const group of keywordGroups) {
    const hit = (group.any_of ?? []).some((kw) => haystack.includes(kw.toLowerCase()));
    if (!hit) reasons.push(`Missing ${group.label} (expected one of: ${(group.any_of ?? []).join(", ")}).`);
  }
  if (nameMatch === "unreadable") {
    reasons.push("Could not read the staff member's name on the document.");
  } else if (nameMatch === "mismatch") {
    reasons.push(`Name on document ("${ocr.name_on_certificate ?? "—"}") does not match staff profile ("${profileName ?? "—"}").`);
  }

  return {
    ran: true,
    status: reasons.length === 0 ? "passed" : "failed",
    reasons,
    cert_type: ocr.cert_type,
    name: ocr.name_on_certificate,
    completed_date: ocr.completed_on,
    expires_date: ocr.expires_on,
    name_match: nameMatch,
    confidence: ocr.confidence,
  };
}

// ─── instance completion ────────────────────────────────────────────────

export const recordCompletion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    organizationId: z.string().uuid(),
    instanceId: z.string().uuid(),
    evidenceTypeUsed: z.string().min(1).max(60),
    uploadPath: z.string().max(2000).optional().nullable(),
    uploadFilename: z.string().max(500).optional().nullable(),
    attestationSignedAt: z.string().optional().nullable(),
    attestationTextSnapshot: z.string().max(20000).optional().nullable(),
    formSubmissionId: z.string().uuid().optional().nullable(),
    notes: z.string().max(5000).optional().nullable(),
    isManualEntry: z.boolean().optional(),
    manualEntryByName: z.string().max(200).optional().nullable(),
    // On-behalf entry: staffId/staffName of the person credited, when
    // different from the submitting admin/manager (requires manager role).
    staffId: z.string().uuid().optional(),
    staffName: z.string().max(200).optional(),
    // Manual-entry backdating: when the admin records the completed date/time.
    completedAt: z.string().optional(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: AnySupabase; userId: string };
    if (!supabase || !userId) return { instance: null as ObligationInstanceRow | null };
    await requireOrgMembership(supabase, userId, data.organizationId, "employee");

    const targetStaffId = data.staffId ?? userId;
    const isOnBehalf = targetStaffId !== userId;
    if (isOnBehalf) {
      await requireOrgMembership(supabase, userId, data.organizationId, "manager");
    }

    const { data: inst, error: iErr } = await supabase
      .from("company_obligation_instances").select("*")
      .eq("id", data.instanceId).eq("organization_id", data.organizationId).maybeSingle();
    if (iErr) throw new Error(iErr.message);
    if (!inst) throw new Error("Instance not found.");
    const ob = await fetchObligation(supabase, data.organizationId, inst.obligation_id);

    let staffName = data.staffName;
    if (!staffName) {
      const { data: dir, error: dErr } = await supabase
        .from("org_member_directory").select("full_name").eq("id", targetStaffId).maybeSingle();
      if (dErr) throw new Error(dErr.message);
      staffName = dir?.full_name ?? "Unknown";
    }
    const isManual = data.isManualEntry ?? isOnBehalf;

    // Run NECTAR validation on upload evidence when the obligation has an
    // expected cert type configured. Manual admin entries (recorded via the
    // "Add manual completion" drawer) skip it — an admin vouching for the
    // record IS the verification.
    const needsValidation =
      !isManual &&
      (data.evidenceTypeUsed === "upload" || data.evidenceTypeUsed === "upload_and_attestation") &&
      !!data.uploadPath;
    const validation = needsValidation
      ? await runObligationNectarValidation(supabase, ob, targetStaffId, data.uploadPath as string, data.uploadFilename ?? null)
      : NO_VALIDATION;

    const completedAt = (validation.status === "passed" && validation.completed_date)
      ? new Date(`${validation.completed_date}T00:00:00Z`).toISOString()
      : (data.completedAt ?? new Date().toISOString());

    // Renewal cadences that track a certificate's own printed expiration
    // date (e.g. CPR/First Aid) fall back to completed_at + N months when
    // NECTAR couldn't read an expiration off the upload (or the completion
    // was entered manually, so NECTAR never ran) — flag that on the record
    // so an admin knows to verify the real expiration.
    const dueCfgForRenewal = (ob.due_day_config ?? {}) as Record<string, unknown>;
    const usesCertExpirationCadence =
      dueCfgForRenewal.every_n_months !== undefined && dueCfgForRenewal.from === "cert_expiration";
    const expirationFallbackWarning =
      usesCertExpirationCadence && !validation.expires_date
        ? `Expiration date could not be extracted — renewal defaulted to ${Number(dueCfgForRenewal.every_n_months)} months from upload date. Admin should verify.`
        : null;

    const { error: cErr } = await supabase.from("company_obligation_completions").insert({
      instance_id: data.instanceId,
      organization_id: data.organizationId,
      staff_id: targetStaffId,
      staff_name: staffName,
      evidence_type_used: data.evidenceTypeUsed,
      upload_path: data.uploadPath ?? null,
      upload_filename: data.uploadFilename ?? null,
      attestation_signed_at: data.attestationSignedAt ?? null,
      attestation_text_snapshot: data.attestationTextSnapshot ?? null,
      form_submission_id: data.formSubmissionId ?? null,
      notes: data.notes ?? null,
      is_manual_entry: isManual,
      manual_entry_by: isManual ? userId : null,
      manual_entry_by_name: isManual ? (data.manualEntryByName ?? null) : null,
      completed_at: completedAt,
      nectar_validation_status: validation.ran ? validation.status : null,
      nectar_validation_reasons: expirationFallbackWarning
        ? [...validation.reasons, expirationFallbackWarning]
        : validation.reasons,
      nectar_extracted_cert_type: validation.cert_type,
      nectar_extracted_name: validation.name,
      nectar_extracted_completed_date: validation.completed_date,
      nectar_extracted_expires_date: validation.expires_date,
      nectar_name_match: validation.name_match,
      nectar_confidence: validation.confidence,
    });
    if (cErr) throw new Error(cErr.message);

    // A failed NECTAR validation saves the completion record (so the UI can
    // show what was uploaded and why it didn't pass) but does NOT close the
    // instance — an admin must manually confirm before it counts. Notify
    // admins directly instead of going through the generic completion
    // notifier below.
    if (validation.ran && validation.status === "failed") {
      const recipients = await resolveAdminRecipients(supabase, data.organizationId, ob);
      if (recipients.length) {
        const rows = recipients.map((recipientId) => ({
          organization_id: data.organizationId,
          recipient_user_id: recipientId,
          recipient_role: "admin",
          type: "company_obligation_update",
          urgency: "high",
          title: `NECTAR could not verify "${ob.title}" upload`,
          body: `${staffName} uploaded evidence for "${ob.title}" but NECTAR could not verify it: `
            + `${validation.reasons.join("; ")}. An admin can manually confirm the upload.`,
          link_to: "/dashboard/company-obligations",
          related_id: data.instanceId,
          related_type: "company_obligation_instance",
        }));
        const { error: notifErr } = await supabase.from("notifications").insert(rows);
        if (notifErr) throw new Error(notifErr.message);
      }
      return { instance: inst as ObligationInstanceRow, nectarValidation: validation };
    }

    let updatedInstance = inst as ObligationInstanceRow;
    const nowIso = completedAt;

    if (!ob.requires_individual_completion) {
      const { data: closed, error: upErr } = await supabase
        .from("company_obligation_instances")
        .update({ status: "completed", completed_at: nowIso, completed_by_id: targetStaffId, completed_by_name: staffName })
        .eq("id", data.instanceId)
        .in("status", ["pending", "overdue"])
        .select("*").maybeSingle();
      if (upErr) throw new Error(upErr.message);
      if (closed) {
        updatedInstance = closed as ObligationInstanceRow;
        await resolveInstanceNotifications(supabase, data.instanceId);
      }
    } else {
      const [{ count: assigneeCount, error: acErr }, { count: completionCount, error: ccErr }] = await Promise.all([
        supabase.from("company_obligation_instance_assignees")
          .select("id", { count: "exact", head: true }).eq("instance_id", data.instanceId),
        supabase.from("company_obligation_completions")
          .select("id", { count: "exact", head: true }).eq("instance_id", data.instanceId),
      ]);
      if (acErr) throw new Error(acErr.message);
      if (ccErr) throw new Error(ccErr.message);
      if ((assigneeCount ?? 0) > 0 && assigneeCount === completionCount) {
        const { data: closed, error: upErr } = await supabase
          .from("company_obligation_instances")
          .update({ status: "completed", completed_at: nowIso, completed_by_id: targetStaffId, completed_by_name: staffName })
          .eq("id", data.instanceId)
          .in("status", ["pending", "overdue"])
          .select("*").maybeSingle();
        if (upErr) throw new Error(upErr.message);
        if (closed) {
          updatedInstance = closed as ObligationInstanceRow;
          await resolveInstanceNotifications(supabase, data.instanceId);
        }
      }
    }

    await notifyObligationManagersInternal(supabase, data.organizationId, ob.id, data.instanceId, "completion");

    // Passed a NECTAR-verified renewal cert (background screening, fraud
    // exclusion, etc.): schedule the next instance from the certificate's
    // own expiration date rather than waiting for the normal
    // hire-anniversary generator, so renewal dates track the real cert.
    if (
      validation.ran && validation.status === "passed" && validation.expires_date &&
      dueCfgForRenewal.anniversary_based === true && updatedInstance.status === "completed"
    ) {
      const { data: alreadyOpen } = await supabase
        .from("company_obligation_instances")
        .select("id")
        .eq("obligation_id", ob.id)
        .eq("assignee_staff_id", targetStaffId)
        .in("status", ["pending", "overdue"])
        .maybeSingle();
      if (!alreadyOpen) {
        const expiresDue = new Date(`${validation.expires_date}T00:00:00Z`);
        const { data: nextInst, error: nextErr } = await supabase
          .from("company_obligation_instances")
          .insert({
            obligation_id: ob.id,
            organization_id: data.organizationId,
            period_key: `Due ${formatShort(expiresDue)}`,
            due_at: endOfDayUTC(expiresDue),
            status: "pending",
            assignee_staff_id: targetStaffId,
          })
          .select("*").maybeSingle();
        if (!nextErr && nextInst) {
          await supabase.from("company_obligation_instance_assignees").upsert(
            [{ instance_id: nextInst.id, organization_id: data.organizationId, staff_id: targetStaffId, staff_name: staffName, staff_role: "employee" }],
            { onConflict: "instance_id,staff_id", ignoreDuplicates: true },
          );
          await scheduleRemindersInternal(supabase, data.organizationId, nextInst.id, ob);
        }
      }
    }

    // every_n_months renewal (e.g. CPR/First Aid): due on the cert's own
    // printed expiration date when NECTAR read one off the upload;
    // otherwise fall back to completed_at + N months (the completion
    // record already carries an admin-facing warning for that case).
    if (dueCfgForRenewal.every_n_months !== undefined && updatedInstance.status === "completed") {
      const months = Number(dueCfgForRenewal.every_n_months);
      if (Number.isFinite(months)) {
        const { data: alreadyOpen } = await supabase
          .from("company_obligation_instances")
          .select("id")
          .eq("obligation_id", ob.id)
          .eq("assignee_staff_id", targetStaffId)
          .in("status", ["pending", "overdue"])
          .maybeSingle();
        if (!alreadyOpen) {
          const nextDue = usesCertExpirationCadence && validation.expires_date
            ? new Date(`${validation.expires_date}T00:00:00Z`)
            : addMonthsUTC(new Date(completedAt), months);
          const { data: nextInst, error: nextErr } = await supabase
            .from("company_obligation_instances")
            .insert({
              obligation_id: ob.id,
              organization_id: data.organizationId,
              period_key: `Due ${formatShort(nextDue)}`,
              due_at: endOfDayUTC(nextDue),
              status: "pending",
              assignee_staff_id: targetStaffId,
            })
            .select("*").maybeSingle();
          if (!nextErr && nextInst) {
            await supabase.from("company_obligation_instance_assignees").upsert(
              [{ instance_id: nextInst.id, organization_id: data.organizationId, staff_id: targetStaffId, staff_name: staffName, staff_role: "employee" }],
              { onConflict: "instance_id,staff_id", ignoreDuplicates: true },
            );
            await scheduleRemindersInternal(supabase, data.organizationId, nextInst.id, ob);
          }
        }
      }
    }

    return { instance: updatedInstance, nectarValidation: validation };
  });

async function resolveAdminRecipients(
  supabase: AnySupabase,
  organizationId: string,
  ob: CompanyObligationRow,
): Promise<string[]> {
  const recipientIds = new Set<string>();
  const groupIds = ob.assigned_to_groups ?? [];
  if (groupIds.length) {
    const { data: groups, error: gErr } = await supabase
      .from("staff_groups").select("id, linked_team_id").in("id", groupIds);
    if (gErr) throw new Error(gErr.message);
    const teamIds = (groups ?? [])
      .map((g: { linked_team_id: string | null }) => g.linked_team_id)
      .filter((id: string | null): id is string => !!id);
    if (teamIds.length) {
      const { data: teams, error: tErr } = await supabase
        .from("teams").select("id, manager_id").in("id", teamIds);
      if (tErr) throw new Error(tErr.message);
      for (const t of (teams ?? []) as Array<{ manager_id: string | null }>) {
        if (t.manager_id) recipientIds.add(t.manager_id);
      }
    }
  }
  if (!recipientIds.size) {
    const { data: admins, error: adErr } = await supabase
      .from("organization_members").select("user_id, role")
      .eq("organization_id", organizationId).eq("active", true).in("role", ["admin", "super_admin"]);
    if (adErr) throw new Error(adErr.message);
    for (const a of (admins ?? []) as Array<{ user_id: string }>) recipientIds.add(a.user_id);
  }
  return Array.from(recipientIds);
}

async function resolveInstanceNotifications(supabase: AnySupabase, instanceId: string): Promise<void> {
  const { error } = await supabase
    .from("notifications")
    .update({ resolved_at: new Date().toISOString() })
    .eq("related_id", instanceId)
    .eq("related_type", "company_obligation_instance")
    .is("resolved_at", null);
  if (error) throw new Error(error.message);
}

/**
 * Admin override for a completion NECTAR flagged as failed: the admin has
 * looked at the uploaded document themselves and confirms it's valid. Marks
 * that completion row as a manual entry (preserving the original NECTAR
 * fields for the audit trail) and closes the instance same as any other
 * completion.
 */
export const confirmFailedObligationCompletion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    organizationId: z.string().uuid(),
    instanceId: z.string().uuid(),
    completionId: z.string().uuid(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: AnySupabase; userId: string };
    if (!supabase || !userId) return { instance: null as ObligationInstanceRow | null };
    await requireOrgMembership(supabase, userId, data.organizationId, "manager");

    const { data: completion, error: cErr } = await supabase
      .from("company_obligation_completions").select("*")
      .eq("id", data.completionId).eq("instance_id", data.instanceId).maybeSingle();
    if (cErr) throw new Error(cErr.message);
    if (!completion) throw new Error("Completion not found.");

    const { data: adminDir } = await supabase
      .from("org_member_directory").select("full_name").eq("id", userId).maybeSingle();

    const { error: upErr } = await supabase
      .from("company_obligation_completions")
      .update({
        is_manual_entry: true,
        manual_entry_by: userId,
        manual_entry_by_name: adminDir?.full_name ?? "an admin",
        admin_notes: "Admin override: NECTAR validation failed but admin confirmed document is valid",
      })
      .eq("id", data.completionId);
    if (upErr) throw new Error(upErr.message);

    const { data: inst, error: iErr } = await supabase
      .from("company_obligation_instances").select("*")
      .eq("id", data.instanceId).eq("organization_id", data.organizationId).maybeSingle();
    if (iErr) throw new Error(iErr.message);
    if (!inst) throw new Error("Instance not found.");
    const ob = await fetchObligation(supabase, data.organizationId, inst.obligation_id);

    let updatedInstance = inst as ObligationInstanceRow;
    const nowIso = new Date().toISOString();

    if (!ob.requires_individual_completion) {
      const { data: closed, error: closeErr } = await supabase
        .from("company_obligation_instances")
        .update({ status: "completed", completed_at: nowIso, completed_by_id: completion.staff_id, completed_by_name: completion.staff_name })
        .eq("id", data.instanceId)
        .in("status", ["pending", "overdue"])
        .select("*").maybeSingle();
      if (closeErr) throw new Error(closeErr.message);
      if (closed) {
        updatedInstance = closed as ObligationInstanceRow;
        await resolveInstanceNotifications(supabase, data.instanceId);
      }
    } else {
      const [{ count: assigneeCount, error: acErr }, { count: completionCount, error: ccErr }] = await Promise.all([
        supabase.from("company_obligation_instance_assignees")
          .select("id", { count: "exact", head: true }).eq("instance_id", data.instanceId),
        supabase.from("company_obligation_completions")
          .select("id", { count: "exact", head: true }).eq("instance_id", data.instanceId),
      ]);
      if (acErr) throw new Error(acErr.message);
      if (ccErr) throw new Error(ccErr.message);
      if ((assigneeCount ?? 0) > 0 && assigneeCount === completionCount) {
        const { data: closed, error: closeErr } = await supabase
          .from("company_obligation_instances")
          .update({ status: "completed", completed_at: nowIso, completed_by_id: completion.staff_id, completed_by_name: completion.staff_name })
          .eq("id", data.instanceId)
          .in("status", ["pending", "overdue"])
          .select("*").maybeSingle();
        if (closeErr) throw new Error(closeErr.message);
        if (closed) {
          updatedInstance = closed as ObligationInstanceRow;
          await resolveInstanceNotifications(supabase, data.instanceId);
        }
      }
    }

    return { instance: updatedInstance };
  });

/**
 * Admin "Notify outstanding →" action: reminds every assignee on an
 * instance who has not yet submitted a completion. Used for evidence types
 * an admin cannot complete on a staff member's behalf (attestation, form) —
 * the admin's role there is to nudge, not to submit. Dedupes to once per
 * instance/staff/day via recurrence_key.
 */
export const remindOutstandingAssignees = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    organizationId: z.string().uuid(),
    instanceId: z.string().uuid(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: AnySupabase; userId: string };
    if (!supabase || !userId) return { reminded: 0 };
    await requireOrgMembership(supabase, userId, data.organizationId, "manager");

    const { data: inst, error: iErr } = await supabase
      .from("company_obligation_instances").select("*")
      .eq("id", data.instanceId).eq("organization_id", data.organizationId).maybeSingle();
    if (iErr) throw new Error(iErr.message);
    if (!inst) throw new Error("Instance not found.");
    const ob = await fetchObligation(supabase, data.organizationId, inst.obligation_id);

    const [{ data: assignees, error: aErr }, { data: completions, error: cErr }] = await Promise.all([
      supabase.from("company_obligation_instance_assignees")
        .select("staff_id, staff_name").eq("instance_id", data.instanceId),
      supabase.from("company_obligation_completions")
        .select("staff_id").eq("instance_id", data.instanceId),
    ]);
    if (aErr) throw new Error(aErr.message);
    if (cErr) throw new Error(cErr.message);

    const completedIds = new Set((completions ?? []).map((c: { staff_id: string }) => c.staff_id));
    const outstanding = (assignees ?? []).filter((a: { staff_id: string }) => !completedIds.has(a.staff_id));
    if (!outstanding.length) return { reminded: 0 };

    const today = new Date().toISOString().slice(0, 10);
    const urgency = inst.status === "overdue" ? "critical" : "high";

    const rows = (outstanding as Array<{ staff_id: string; staff_name: string }>).map((a) => ({
      organization_id: data.organizationId,
      recipient_user_id: a.staff_id,
      recipient_role: "staff",
      type: "company_obligation_reminder",
      urgency,
      title: `${ob.title} requires your attention`,
      body: `${inst.period_key}. Please complete this in your My Obligations page.`
        + `${ob.description ? " " + ob.description.slice(0, 120) : ""}`,
      link_to: "/dashboard/my-obligations",
      related_id: data.instanceId,
      related_type: "company_obligation_instance",
      recurrence_key: `obligation_admin_remind_${data.instanceId}_${a.staff_id}_${today}`,
    }));

    const { data: existing, error: exErr } = await supabase
      .from("notifications").select("recurrence_key")
      .eq("organization_id", data.organizationId)
      .in("recurrence_key", rows.map((r) => r.recurrence_key));
    if (exErr) throw new Error(exErr.message);
    const existingKeys = new Set((existing ?? []).map((e: { recurrence_key: string }) => e.recurrence_key));
    const toInsert = rows.filter((r) => !existingKeys.has(r.recurrence_key));
    if (!toInsert.length) return { reminded: 0 };

    const { error: insErr } = await supabase.from("notifications").insert(toInsert);
    if (insErr) throw new Error(insErr.message);

    return { reminded: toInsert.length };
  });

export const waiveInstance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    organizationId: z.string().uuid(),
    instanceId: z.string().uuid(),
    waiveReason: z.string().trim().min(1).max(2000),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: AnySupabase; userId: string };
    if (!supabase || !userId) return { ok: false };
    await requireOrgMembership(supabase, userId, data.organizationId, "manager");

    const { error: upErr } = await supabase
      .from("company_obligation_instances")
      .update({ status: "waived", waive_reason: data.waiveReason })
      .eq("id", data.instanceId)
      .eq("organization_id", data.organizationId);
    if (upErr) throw new Error(upErr.message);

    await resolveInstanceNotifications(supabase, data.instanceId);

    return { ok: true };
  });
