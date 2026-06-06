/**
 * Annual training hours tracker — cumulative-progress requirement support.
 *
 * Computes per-staff progress toward the "12 hours / employment year" target
 * (configurable via the requirement's metadata: target_hours,
 * enforced_after_months, window='employment_year'). Hours come from BOTH:
 *  (a) signed `training_completions` whose mapped training topic carries a
 *      `default_hours` value (fallback 1.0 hr/topic when null), and
 *  (b) manual hour entries logged by an admin / team manager.
 *
 * Evaluation is tenure-gated: before the staffer's 1-year anniversary the
 * status is `tracking_pre_tenure` (informational, NEVER a gap or audit
 * deficiency); at/after the anniversary the status becomes
 * complete | on_target | behind.
 *
 * Reads use `can_view_staff_pii` for the per-staff gate; writes additionally
 * require `auth.uid() <> staff_id` so staff cannot self-edit their own
 * hours (mirrors the checklist completion policy).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireOrgMembership } from "@/integrations/supabase/require-org";

const orgStaff = z.object({
  organization_id: z.string().uuid(),
  staff_id: z.string().uuid(),
});

export type CumulativeStatus =
  | "complete"
  | "on_target"
  | "behind"
  | "tracking_pre_tenure"
  | "no_hire_date";

export interface CumulativeRequirementConfig {
  requirement_id: string;
  requirement_key: string;
  title: string;
  target_hours: number;
  enforced_after_months: number;
  window: "employment_year";
}

export interface HoursEntry {
  id: string;
  entry_date: string;
  hours: number;
  note: string | null;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
}

export interface TrainingContribution {
  training_completion_id: string;
  topic_id: string;
  topic_title: string;
  completed_at: string;
  hours: number;
  hours_source: "topic_default" | "fallback_one_hour";
}

export interface AnnualHoursProgress {
  requirement_id: string;
  hire_date: string | null;
  tenure_months: number | null;
  enforced: boolean;
  status: CumulativeStatus;
  window_start: string | null;
  window_end: string | null;
  target_hours: number;
  hours_to_date: number;
  target_to_date: number;
  months_elapsed_in_window: number;
  training_hours: number;
  manual_hours: number;
}

export interface AnnualHoursDetail extends AnnualHoursProgress {
  config: CumulativeRequirementConfig;
  entries: HoursEntry[];
  training_contributions: TrainingContribution[];
}

const DEFAULT_TARGET_HOURS = 12;
const DEFAULT_ENFORCED_AFTER_MONTHS = 12;
const FALLBACK_TOPIC_HOURS = 1.0;

function addMonths(d: Date, months: number): Date {
  const c = new Date(d.getTime());
  c.setUTCMonth(c.getUTCMonth() + months);
  return c;
}

function monthsBetween(a: Date, b: Date): number {
  // Whole months from a → b, capped at >=0.
  let m = (b.getUTCFullYear() - a.getUTCFullYear()) * 12;
  m += b.getUTCMonth() - a.getUTCMonth();
  if (b.getUTCDate() < a.getUTCDate()) m -= 1;
  return Math.max(0, m);
}

export interface ComputeArgs {
  config: CumulativeRequirementConfig;
  hire_date: string | null;
  training_contributions: TrainingContribution[];
  entries: HoursEntry[];
  now?: Date;
}

/** Pure computation — used by both per-staff and bulk paths. */
export function computeAnnualHoursProgress(args: ComputeArgs): AnnualHoursProgress {
  const now = args.now ?? new Date();
  const cfg = args.config;
  if (!args.hire_date) {
    return {
      requirement_id: cfg.requirement_id,
      hire_date: null,
      tenure_months: null,
      enforced: false,
      status: "no_hire_date",
      window_start: null,
      window_end: null,
      target_hours: cfg.target_hours,
      hours_to_date: 0,
      target_to_date: 0,
      months_elapsed_in_window: 0,
      training_hours: 0,
      manual_hours: 0,
    };
  }
  const hire = new Date(args.hire_date + "T00:00:00Z");
  if (Number.isNaN(hire.getTime())) {
    return {
      requirement_id: cfg.requirement_id,
      hire_date: args.hire_date,
      tenure_months: null,
      enforced: false,
      status: "no_hire_date",
      window_start: null,
      window_end: null,
      target_hours: cfg.target_hours,
      hours_to_date: 0,
      target_to_date: 0,
      months_elapsed_in_window: 0,
      training_hours: 0,
      manual_hours: 0,
    };
  }
  const tenureMonths = monthsBetween(hire, now);
  const yearsCompleted = Math.floor(tenureMonths / 12);
  const windowStart = addMonths(hire, yearsCompleted * 12);
  const windowEnd = addMonths(windowStart, 12);
  const monthsElapsed = Math.min(12, monthsBetween(windowStart, now));
  const targetToDate = Math.min(cfg.target_hours, monthsElapsed); // ~1 hr/mo

  const wsMs = windowStart.getTime();
  const weMs = windowEnd.getTime();
  let training = 0;
  for (const t of args.training_contributions) {
    const ts = new Date(t.completed_at).getTime();
    if (ts >= wsMs && ts < weMs) training += t.hours;
  }
  let manual = 0;
  for (const e of args.entries) {
    const ts = new Date(e.entry_date + "T00:00:00Z").getTime();
    if (ts >= wsMs && ts < weMs) manual += e.hours;
  }
  const total = Math.round((training + manual) * 100) / 100;

  const enforced = tenureMonths >= cfg.enforced_after_months;
  let status: CumulativeStatus;
  if (!enforced) status = "tracking_pre_tenure";
  else if (total >= cfg.target_hours) status = "complete";
  else if (total >= targetToDate) status = "on_target";
  else status = "behind";

  return {
    requirement_id: cfg.requirement_id,
    hire_date: args.hire_date,
    tenure_months: tenureMonths,
    enforced,
    status,
    window_start: windowStart.toISOString().slice(0, 10),
    window_end: windowEnd.toISOString().slice(0, 10),
    target_hours: cfg.target_hours,
    hours_to_date: total,
    target_to_date: targetToDate,
    months_elapsed_in_window: monthsElapsed,
    training_hours: Math.round(training * 100) / 100,
    manual_hours: Math.round(manual * 100) / 100,
  };
}

export function parseCumulativeConfig(
  reqRow: Record<string, unknown>,
): CumulativeRequirementConfig | null {
  const meta = (reqRow.metadata ?? {}) as Record<string, unknown>;
  if (meta.requirement_type !== "cumulative_hours") return null;
  return {
    requirement_id: reqRow.id as string,
    requirement_key: (reqRow.requirement_key as string) ?? "",
    title:
      (reqRow.title as string) ??
      (reqRow.short_label as string) ??
      "Cumulative hours",
    target_hours:
      typeof meta.target_hours === "number"
        ? (meta.target_hours as number)
        : DEFAULT_TARGET_HOURS,
    enforced_after_months:
      typeof meta.enforced_after_months === "number"
        ? (meta.enforced_after_months as number)
        : DEFAULT_ENFORCED_AFTER_MONTHS,
    window: "employment_year",
  };
}

// --- Server fns ------------------------------------------------------------

/** Bulk fetcher: returns progress for all cumulative requirements × all staff
 *  the caller is allowed to see in this org (gated by list_staff_pii). */
export const getOrgAnnualHoursProgress = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ organization_id: z.string().uuid() }).parse(d),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<{
      configs: CumulativeRequirementConfig[];
      progress: Record<string, Record<string, AnnualHoursProgress>>;
    }> => {
      const { supabase, userId } = context;
      await requireOrgMembership(supabase, userId, data.organization_id);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = supabase as any;

      const { data: piiRows, error: piiErr } = await sb.rpc("list_staff_pii", {
        _org: data.organization_id,
      });
      if (piiErr) throw new Error(piiErr.message);
      const staffIds: string[] = (piiRows ?? []).map(
        (r: { staff_id: string }) => r.staff_id,
      );
      if (staffIds.length === 0) return { configs: [], progress: {} };

      const { data: base, error: baseErr } = await sb.rpc(
        "get_hr_staff_checklist_base",
        { _org: data.organization_id },
      );
      if (baseErr) throw new Error(baseErr.message);
      const configs: CumulativeRequirementConfig[] = [];
      for (const r of base ?? []) {
        const cfg = parseCumulativeConfig(r);
        if (cfg) configs.push(cfg);
      }
      if (configs.length === 0) return { configs, progress: {} };

      const [{ data: profs }, { data: entries }, { data: completions }, { data: mappings }, { data: topics }] =
        await Promise.all([
          sb
            .from("profiles")
            .select("id, hire_date")
            .in("id", staffIds),
          sb
            .from("staff_training_hours_entries")
            .select("id, staff_id, requirement_id, entry_date, hours, note, created_by, created_at")
            .eq("organization_id", data.organization_id)
            .in("staff_id", staffIds),
          sb
            .from("training_completions")
            .select("id, user_id, ref_id, topic_kind, topic_title, completed_at, is_current")
            .in("user_id", staffIds)
            .eq("topic_kind", "core")
            .eq("is_current", true),
          sb
            .from("training_checklist_mappings")
            .select("training_topic_id, requirement_key, is_active")
            .eq("is_active", true),
          sb.from("training_topics").select("id, title, default_hours"),
        ]);

      const hireByStaff = new Map<string, string | null>();
      for (const p of profs ?? []) hireByStaff.set(p.id, p.hire_date ?? null);

      const topicById = new Map<string, { title: string; default_hours: number | null }>();
      for (const t of topics ?? [])
        topicById.set(t.id, { title: t.title, default_hours: t.default_hours });

      // Map training topic → cumulative requirement (via mapping.requirement_key).
      const reqKeyToCfg = new Map<string, CumulativeRequirementConfig>();
      for (const c of configs) reqKeyToCfg.set(c.requirement_key, c);
      const topicToReqId = new Map<string, string>();
      for (const m of mappings ?? []) {
        const cfg = reqKeyToCfg.get(m.requirement_key);
        if (cfg) topicToReqId.set(m.training_topic_id, cfg.requirement_id);
      }

      // Group contributions by staff × requirement.
      const contribByStaffReq = new Map<string, TrainingContribution[]>();
      const key = (s: string, r: string) => `${s}::${r}`;
      for (const tc of completions ?? []) {
        const reqId = topicToReqId.get(tc.ref_id);
        if (!reqId) continue;
        const topic = topicById.get(tc.ref_id);
        const rawHours =
          topic?.default_hours != null ? Number(topic.default_hours) : null;
        const hours = rawHours && rawHours > 0 ? rawHours : FALLBACK_TOPIC_HOURS;
        const k = key(tc.user_id, reqId);
        if (!contribByStaffReq.has(k)) contribByStaffReq.set(k, []);
        contribByStaffReq.get(k)!.push({
          training_completion_id: tc.id,
          topic_id: tc.ref_id,
          topic_title: tc.topic_title ?? topic?.title ?? "Training",
          completed_at: tc.completed_at,
          hours,
          hours_source: rawHours ? "topic_default" : "fallback_one_hour",
        });
      }

      // Group entries by staff × requirement (entries with NULL requirement_id apply to all cumulative reqs only if there's exactly one — otherwise we attach to the single config).
      const entriesByStaffReq = new Map<string, HoursEntry[]>();
      for (const e of entries ?? []) {
        const reqId =
          e.requirement_id ??
          (configs.length === 1 ? configs[0].requirement_id : null);
        if (!reqId) continue;
        const k = key(e.staff_id, reqId);
        if (!entriesByStaffReq.has(k)) entriesByStaffReq.set(k, []);
        entriesByStaffReq.get(k)!.push({
          id: e.id,
          entry_date: e.entry_date,
          hours: Number(e.hours),
          note: e.note,
          created_by: e.created_by,
          created_by_name: null,
          created_at: e.created_at,
        });
      }

      const progress: Record<string, Record<string, AnnualHoursProgress>> = {};
      const now = new Date();
      for (const sid of staffIds) {
        progress[sid] = {};
        const hire = hireByStaff.get(sid) ?? null;
        for (const cfg of configs) {
          const k = key(sid, cfg.requirement_id);
          progress[sid][cfg.requirement_id] = computeAnnualHoursProgress({
            config: cfg,
            hire_date: hire,
            training_contributions: contribByStaffReq.get(k) ?? [],
            entries: entriesByStaffReq.get(k) ?? [],
            now,
          });
        }
      }

      return { configs, progress };
    },
  );

/** Per-staff detail: full progress + entries + training contributions. */
export const getStaffAnnualHoursDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => orgStaff.parse(d))
  .handler(
    async ({ data, context }): Promise<AnnualHoursDetail[]> => {
      const { supabase, userId } = context;
      await requireOrgMembership(supabase, userId, data.organization_id);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = supabase as any;
      const { data: canView } = await sb.rpc("can_view_staff_pii", {
        _org: data.organization_id,
        _staff: data.staff_id,
        _viewer: userId,
      });
      if (!canView) throw new Error("Forbidden: cannot view staff HR record");

      const { data: base, error: baseErr } = await sb.rpc(
        "get_hr_staff_checklist_base",
        { _org: data.organization_id },
      );
      if (baseErr) throw new Error(baseErr.message);
      const configs: CumulativeRequirementConfig[] = [];
      for (const r of base ?? []) {
        const cfg = parseCumulativeConfig(r);
        if (cfg) configs.push(cfg);
      }
      if (configs.length === 0) return [];

      const [{ data: prof }, { data: entries }, { data: completions }, { data: mappings }, { data: topics }] =
        await Promise.all([
          sb
            .from("profiles")
            .select("id, hire_date")
            .eq("id", data.staff_id)
            .maybeSingle(),
          sb
            .from("staff_training_hours_entries")
            .select("id, requirement_id, entry_date, hours, note, created_by, created_at")
            .eq("organization_id", data.organization_id)
            .eq("staff_id", data.staff_id)
            .order("entry_date", { ascending: false }),
          sb
            .from("training_completions")
            .select("id, ref_id, topic_kind, topic_title, completed_at, is_current")
            .eq("user_id", data.staff_id)
            .eq("topic_kind", "core")
            .eq("is_current", true),
          sb
            .from("training_checklist_mappings")
            .select("training_topic_id, requirement_key, is_active")
            .eq("is_active", true),
          sb.from("training_topics").select("id, title, default_hours"),
        ]);

      const topicById = new Map<string, { title: string; default_hours: number | null }>();
      for (const t of topics ?? [])
        topicById.set(t.id, { title: t.title, default_hours: t.default_hours });
      const reqKeyToCfg = new Map<string, CumulativeRequirementConfig>();
      for (const c of configs) reqKeyToCfg.set(c.requirement_key, c);
      const topicToReqId = new Map<string, string>();
      for (const m of mappings ?? []) {
        const cfg = reqKeyToCfg.get(m.requirement_key);
        if (cfg) topicToReqId.set(m.training_topic_id, cfg.requirement_id);
      }

      // Resolve created_by names for entries.
      const creatorIds = Array.from(
        new Set(
          (entries ?? [])
            .map((e: { created_by: string | null }) => e.created_by)
            .filter((x: string | null): x is string => !!x),
        ),
      );
      const creatorNames = new Map<string, string>();
      if (creatorIds.length > 0) {
        const { data: people } = await sb
          .from("profiles")
          .select("id, full_name")
          .in("id", creatorIds);
        for (const p of people ?? [])
          creatorNames.set(p.id, p.full_name ?? "—");
      }

      const contribsByReq = new Map<string, TrainingContribution[]>();
      for (const tc of completions ?? []) {
        const reqId = topicToReqId.get(tc.ref_id);
        if (!reqId) continue;
        const topic = topicById.get(tc.ref_id);
        const rawHours =
          topic?.default_hours != null ? Number(topic.default_hours) : null;
        const hours = rawHours && rawHours > 0 ? rawHours : FALLBACK_TOPIC_HOURS;
        if (!contribsByReq.has(reqId)) contribsByReq.set(reqId, []);
        contribsByReq.get(reqId)!.push({
          training_completion_id: tc.id,
          topic_id: tc.ref_id,
          topic_title: tc.topic_title ?? topic?.title ?? "Training",
          completed_at: tc.completed_at,
          hours,
          hours_source: rawHours ? "topic_default" : "fallback_one_hour",
        });
      }

      const entriesByReq = new Map<string, HoursEntry[]>();
      for (const e of entries ?? []) {
        const reqId =
          e.requirement_id ??
          (configs.length === 1 ? configs[0].requirement_id : null);
        if (!reqId) continue;
        if (!entriesByReq.has(reqId)) entriesByReq.set(reqId, []);
        entriesByReq.get(reqId)!.push({
          id: e.id,
          entry_date: e.entry_date,
          hours: Number(e.hours),
          note: e.note,
          created_by: e.created_by,
          created_by_name: e.created_by
            ? (creatorNames.get(e.created_by) ?? null)
            : null,
          created_at: e.created_at,
        });
      }

      const now = new Date();
      const hire = (prof?.hire_date as string | null) ?? null;
      return configs.map((cfg) => {
        const entriesForReq = entriesByReq.get(cfg.requirement_id) ?? [];
        const contribs = contribsByReq.get(cfg.requirement_id) ?? [];
        const progress = computeAnnualHoursProgress({
          config: cfg,
          hire_date: hire,
          training_contributions: contribs,
          entries: entriesForReq,
          now,
        });
        return {
          ...progress,
          config: cfg,
          entries: entriesForReq,
          training_contributions: contribs,
        };
      });
    },
  );

export const addStaffHoursEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        organization_id: z.string().uuid(),
        staff_id: z.string().uuid(),
        requirement_id: z.string().uuid(),
        entry_date: z.string().date(),
        hours: z.number().positive().max(24),
        note: z.string().max(2000).optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireOrgMembership(supabase, userId, data.organization_id);
    if (userId === data.staff_id) {
      throw new Error("Forbidden: staff may not log own hours");
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("staff_training_hours_entries")
      .insert({
        organization_id: data.organization_id,
        staff_id: data.staff_id,
        requirement_id: data.requirement_id,
        entry_date: data.entry_date,
        hours: data.hours,
        note: data.note ?? null,
        created_by: userId,
      });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteStaffHoursEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        organization_id: z.string().uuid(),
        entry_id: z.string().uuid(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireOrgMembership(supabase, userId, data.organization_id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("staff_training_hours_entries")
      .delete()
      .eq("id", data.entry_id)
      .eq("organization_id", data.organization_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
