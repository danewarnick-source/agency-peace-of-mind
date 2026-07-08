/**
 * NECTAR Compliance Engine — rule model + flag→resolve loop.
 *
 * NECTAR proposes machine-checkable rules derived from active requirements.
 * The provider confirms, edits, or dismisses them. Only rules that are
 * BOTH confirmed AND whose source requirement is currently active enforce.
 *
 * Detection raises a flag with a verbatim snapshot of the source requirement.
 * The provider resolves each flag by acknowledging & continuing OR stopping.
 * Once resolved, the flag row is immutable (DB trigger enforces this).
 *
 * This phase implements the framework + billing_conflict detection only.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveStaffQualifications, qualificationKey, type QualificationKind } from "./staff-qualifications.functions";

const RULE_TYPES = ["billing_conflict", "staff_prerequisite", "deadline", "activity"] as const;
const ACTIVE_STATES = ["active", "active_by_code"] as const;

// ─── Rule CRUD ───────────────────────────────────────────────────────────

export const listComplianceRules = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        organizationId: z.string().uuid(),
        status: z.enum(["proposed", "confirmed", "dismissed"]).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    let q = supabase
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from("nectar_compliance_rules" as any)
      .select(
        "id, organization_id, requirement_id, rule_type, rule_definition, status, proposed_by, proposed_rationale, confirmed_by, confirmed_at, dismissed_by, dismissed_at, created_at, updated_at",
      )
      .eq("organization_id", data.organizationId)
      .order("created_at", { ascending: false });
    if (data.status) q = q.eq("status", data.status);
    const { data: rules, error } = await q;
    if (error) throw new Error(error.message);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = (rules ?? []) as any[];
    const reqIds = Array.from(new Set(rows.map((r) => r.requirement_id).filter(Boolean)));
    let reqMap: Record<string, { title: string; description: string | null; activation_state: string; source_citation: string | null; original_title: string | null; original_description: string | null }> = {};
    if (reqIds.length) {
      const { data: reqs } = await supabase
        .from("nectar_requirements")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .select("id, title, description, activation_state, source_citation, original_title, original_description" as any)
        .in("id", reqIds);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const r of (reqs ?? []) as any[]) reqMap[r.id] = r;
    }
    return rows.map((r) => ({ ...r, requirement: reqMap[r.requirement_id] ?? null }));
  });

export const proposeComplianceRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        organizationId: z.string().uuid(),
        requirementId: z.string().uuid(),
        ruleType: z.enum(RULE_TYPES),
        ruleDefinition: z.record(z.string(), z.unknown()),
        rationale: z.string().max(2000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: rule, error } = await supabase
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from("nectar_compliance_rules" as any)
      .insert({
        organization_id: data.organizationId,
        requirement_id: data.requirementId,
        rule_type: data.ruleType,
        rule_definition: data.ruleDefinition,
        proposed_by: "nectar",
        proposed_rationale: data.rationale ?? null,
        status: "proposed",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await supabase
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from("nectar_compliance_rule_history" as any)
      .insert({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        rule_id: (rule as any).id,
        organization_id: data.organizationId,
        action: "proposed",
        actor_id: userId,
        actor_label: "nectar",
        snapshot: { rule_type: data.ruleType, rule_definition: data.ruleDefinition, rationale: data.rationale ?? null },
      });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { id: (rule as any).id };
  });

export const updateComplianceRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        ruleId: z.string().uuid(),
        action: z.enum(["edit", "confirm", "dismiss", "reopen"]),
        ruleDefinition: z.record(z.string(), z.unknown()).optional(),
        note: z.string().max(2000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: existing, error: eErr } = await supabase
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from("nectar_compliance_rules" as any)
      .select("id, organization_id, rule_definition, status")
      .eq("id", data.ruleId)
      .single();
    if (eErr || !existing) throw new Error(eErr?.message ?? "Rule not found");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ex = existing as any;

    const patch: Record<string, unknown> = {};
    let historyAction: "edited" | "confirmed" | "dismissed" | "reopened" = "edited";
    const now = new Date().toISOString();

    if (data.action === "edit") {
      if (!data.ruleDefinition) throw new Error("ruleDefinition required for edit");
      patch.rule_definition = data.ruleDefinition;
      historyAction = "edited";
    } else if (data.action === "confirm") {
      if (data.ruleDefinition) patch.rule_definition = data.ruleDefinition;
      patch.status = "confirmed";
      patch.confirmed_by = userId;
      patch.confirmed_at = now;
      patch.dismissed_by = null;
      patch.dismissed_at = null;
      historyAction = "confirmed";
    } else if (data.action === "dismiss") {
      patch.status = "dismissed";
      patch.dismissed_by = userId;
      patch.dismissed_at = now;
      historyAction = "dismissed";
    } else if (data.action === "reopen") {
      patch.status = "proposed";
      patch.confirmed_by = null;
      patch.confirmed_at = null;
      patch.dismissed_by = null;
      patch.dismissed_at = null;
      historyAction = "reopened";
    }

    const { error: uErr } = await supabase
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from("nectar_compliance_rules" as any)
      .update(patch)
      .eq("id", data.ruleId);
    if (uErr) throw new Error(uErr.message);

    await supabase
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from("nectar_compliance_rule_history" as any)
      .insert({
        rule_id: data.ruleId,
        organization_id: ex.organization_id,
        action: historyAction,
        actor_id: userId,
        actor_label: "provider",
        snapshot: {
          previous: { rule_definition: ex.rule_definition, status: ex.status },
          next: patch,
        },
        note: data.note ?? null,
      });

    return { ok: true };
  });

export const listRuleHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ ruleId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from("nectar_compliance_rule_history" as any)
      .select("id, action, actor_id, actor_label, snapshot, note, created_at")
      .eq("rule_id", data.ruleId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

// ─── Billing-entry detection ─────────────────────────────────────────────

/**
 * Evaluate a candidate billing entry against confirmed billing_conflict rules.
 * Does NOT commit anything. Returns any potential flags the caller should
 * surface to the provider for a Stop / Acknowledge decision.
 *
 * rule_definition shape (billing_conflict):
 *   {
 *     conflicting_codes: string[],          // e.g. ["SLH","HHS"]
 *     scope: "same_day" | "same_client_day" // default same_client_day
 *   }
 */
export const checkBillingEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        organizationId: z.string().uuid(),
        clientId: z.string().uuid().optional(),
        serviceDate: z.string().min(4),
        serviceCodes: z.array(z.string().min(1)).min(1),
        staffId: z.string().uuid().optional(),
        contextExtra: z.record(z.string(), z.unknown()).optional(),
        // Pass 3: which point in time to read the governing source at.
        // "now" = evaluate against current rules; YYYY-MM-DD = evaluate a
        // past event against the sources that governed on that date.
        // Defaults to the serviceDate (audit-correct: an entry billed on
        // 3/1/2025 is judged by the sources effective 3/1/2025).
        asOf: z
          .union([z.literal("now"), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)])
          .optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const upperCodes = data.serviceCodes.map((c) => c.trim().toUpperCase());
    const asOf: "now" | string =
      data.asOf ?? (/^\d{4}-\d{2}-\d{2}/.test(data.serviceDate) ? data.serviceDate.slice(0, 10) : "now");

    // Only confirmed rules whose requirement is active enforce.
    const { data: rules, error } = await supabase
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from("nectar_compliance_rules" as any)
      .select(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        "id, requirement_id, rule_definition, requirement:nectar_requirements!inner(id, title, original_title, description, original_description, source_citation, activation_state, source_document_id)" as any,
      )
      .eq("organization_id", data.organizationId)
      .eq("rule_type", "billing_conflict")
      .eq("status", "confirmed");
    if (error) throw new Error(error.message);

    // Point-in-time: only requirements whose source document was effective
    // on `asOf` should enforce for an event on that date. Requirements with
    // no source document (org-authored) always evaluate.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rulesArr = (rules ?? []) as any[];
    const sourceIds: string[] = Array.from(
      new Set(
        rulesArr
          .map((r) => r.requirement?.source_document_id as string | null)
          .filter((v): v is string => !!v),
      ),
    );
    let governingById: Record<string, import("@/lib/effective-document").GoverningSource> = {};
    let effectiveIds = new Set<string>();
    if (sourceIds.length) {
      const { filterSourcesEffectiveOn } = await import("@/lib/effective-document.functions");
      const res = await filterSourcesEffectiveOn({
        data: {
          organization_id: data.organizationId,
          source_document_ids: sourceIds,
          as_of: asOf,
        },
      });
      governingById = res.governing_by_id;
      effectiveIds = new Set(res.effective_ids);
    }

    const potentialFlags: Array<{
      ruleId: string;
      requirementId: string;
      matchedCodes: string[];
      humanExplanation: string;
      source: { title: string; verbatim: string; citation: string | null };
      governingSource: import("@/lib/effective-document").GoverningSource | null;
    }> = [];

    for (const r of rulesArr) {
      const req = r.requirement;
      if (!req) continue;
      if (!ACTIVE_STATES.includes(req.activation_state)) continue;
      // Skip rules whose source was NOT effective on `asOf` (past event).
      const srcId = req.source_document_id as string | null;
      if (srcId && !effectiveIds.has(srcId)) continue;
      const def = r.rule_definition ?? {};
      const conflicting = Array.isArray(def.conflicting_codes)
        ? (def.conflicting_codes as string[]).map((c) => String(c).toUpperCase())
        : [];
      if (conflicting.length < 2) continue;
      const matched = conflicting.filter((c) => upperCodes.includes(c));
      if (matched.length >= 2) {
        potentialFlags.push({
          ruleId: r.id,
          requirementId: req.id,
          matchedCodes: matched,
          humanExplanation: `Codes ${matched.join(" + ")} appear together on the same entry, which this rule flags as a conflict.`,
          source: {
            title: req.original_title ?? req.title ?? "Requirement",
            verbatim: req.original_description ?? req.description ?? "",
            citation: req.source_citation ?? null,
          },
          governingSource: srcId ? (governingById[srcId] ?? null) : null,
        });
      }
    }
    return { flags: potentialFlags, asOf };
  });

// ─── Flag raise + resolve loop ───────────────────────────────────────────

export const raiseComplianceFlag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        organizationId: z.string().uuid(),
        ruleId: z.string().uuid(),
        requirementId: z.string().uuid(),
        detectionType: z.enum(RULE_TYPES),
        subjectContext: z.record(z.string(), z.unknown()),
        sourceSnapshot: z.object({
          title: z.string(),
          verbatim: z.string(),
          citation: z.string().nullable().optional(),
        }),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: flag, error } = await supabase
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from("nectar_compliance_flags" as any)
      .insert({
        organization_id: data.organizationId,
        rule_id: data.ruleId,
        requirement_id: data.requirementId,
        detection_type: data.detectionType,
        subject_context: data.subjectContext,
        source_snapshot: data.sourceSnapshot,
        raised_to: userId,
      })
      .select("id, raised_at")
      .single();
    if (error) throw new Error(error.message);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return flag as any;
  });

export const resolveComplianceFlag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        flagId: z.string().uuid(),
        resolution: z.enum(["acknowledged_continued", "stopped"]),
        note: z.string().max(4000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from("nectar_compliance_flags" as any)
      .update({
        resolution: data.resolution,
        resolved_by: userId,
        resolved_at: new Date().toISOString(),
        resolution_note: data.note ?? null,
      })
      .eq("id", data.flagId)
      .is("resolution", null);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listComplianceFlags = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        organizationId: z.string().uuid(),
        state: z.enum(["open", "resolved", "all"]).default("all"),
        limit: z.number().int().min(1).max(500).default(100),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    let q = supabase
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from("nectar_compliance_flags" as any)
      .select(
        "id, rule_id, requirement_id, detection_type, subject_context, source_snapshot, raised_at, raised_to, resolution, resolved_by, resolved_at, resolution_note",
      )
      .eq("organization_id", data.organizationId)
      .order("raised_at", { ascending: false })
      .limit(data.limit);
    if (data.state === "open") q = q.is("resolution", null);
    if (data.state === "resolved") q = q.not("resolution", "is", null);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

// ─── Staff-prerequisite detection ────────────────────────────────────────

/**
 * rule_definition shape (staff_prerequisite):
 *   {
 *     applicable_codes: string[],
 *     required_qualifications: [
 *       { kind: 'external_cert' | 'baseline_training' | 'hive_course' | 'client_specific_training',
 *         key: string,
 *         must_be_unexpired: boolean }
 *     ],
 *     scope: 'per_shift' | 'per_visit'
 *   }
 *
 * Two-gate invariant: only rules where status='confirmed' AND the linked
 * nectar_requirement is currently active/active_by_code will produce flags.
 */
const QUAL_KINDS = ["external_cert", "baseline_training", "hive_course", "client_specific_training"] as const;

export const checkStaffPrerequisite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        organizationId: z.string().uuid(),
        staffId: z.string().uuid(),
        serviceCodes: z.array(z.string().min(1)).min(1),
        clientId: z.string().uuid().optional(),
        at: z.string().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const at = data.at ?? new Date().toISOString();
    const upperCodes = data.serviceCodes.map((c) => c.trim().toUpperCase());

    const { data: rules, error } = await supabase
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from("nectar_compliance_rules" as any)
      .select(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        "id, requirement_id, rule_definition, requirement:nectar_requirements!inner(id, title, original_title, description, original_description, source_citation, activation_state)" as any,
      )
      .eq("organization_id", data.organizationId)
      .eq("rule_type", "staff_prerequisite")
      .eq("status", "confirmed");
    if (error) throw new Error(error.message);

    // Load held qualifications once per call (both sets: active + all).
    const held = await resolveStaffQualifications(supabase, {
      organizationId: data.organizationId,
      staffId: data.staffId,
      at,
    });
    const activeSet = new Set(held.activeOnly);
    const allSet = new Set(held.all);

    const potentialFlags: Array<{
      ruleId: string;
      requirementId: string;
      matchedCodes: string[]; // repurposed as "missing qualification labels" for dialog display
      humanExplanation: string;
      source: { title: string; verbatim: string; citation: string | null };
    }> = [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const r of (rules ?? []) as any[]) {
      const req = r.requirement;
      if (!req) continue;
      if (!ACTIVE_STATES.includes(req.activation_state)) continue;
      const def = r.rule_definition ?? {};
      const applicable = Array.isArray(def.applicable_codes)
        ? (def.applicable_codes as string[]).map((c) => String(c).toUpperCase())
        : [];
      const matchedCodes = applicable.filter((c) => upperCodes.includes(c));
      if (matchedCodes.length === 0) continue;

      const required = Array.isArray(def.required_qualifications)
        ? (def.required_qualifications as Array<{
            kind: QualificationKind;
            key: string;
            must_be_unexpired?: boolean;
          }>)
        : [];
      if (required.length === 0) continue;

      const missing: string[] = [];
      for (const q of required) {
        if (!QUAL_KINDS.includes(q.kind)) continue;
        const compareSet = q.must_be_unexpired === false ? allSet : activeSet;
        if (!compareSet.has(qualificationKey(q.kind, q.key))) {
          const label = `${q.kind}:${q.key}${q.must_be_unexpired === false ? "" : " (unexpired)"}`;
          missing.push(label);
        }
      }
      if (missing.length === 0) continue;

      potentialFlags.push({
        ruleId: r.id,
        requirementId: req.id,
        matchedCodes: missing,
        humanExplanation: `Staff is scheduled for ${matchedCodes.join(", ")} but is missing required qualification${
          missing.length > 1 ? "s" : ""
        }: ${missing.join(", ")}.`,
        source: {
          title: req.original_title ?? req.title ?? "Requirement",
          verbatim: req.original_description ?? req.description ?? "",
          citation: req.source_citation ?? null,
        },
      });
    }

    return { flags: potentialFlags };
  });

// ─── NECTAR drafter for staff_prerequisite rules ─────────────────────────

/**
 * Heuristic drafter. Reads active (or active_by_code) nectar_requirements
 * whose applicable_codes is non-empty AND whose text mentions a
 * credential/training keyword we can map to a canonical qualification key.
 * Requirements too vague to make machine-checkable are skipped — the drafter
 * declines rather than forcing a rule. Every drafted rule is written as
 * status='proposed' so a provider must confirm it in the panel (where the
 * verbatim source sits beside the drafted logic).
 */
const CREDENTIAL_HEURISTICS: Array<{
  match: RegExp;
  kind: QualificationKind;
  key: string;
  label: string;
  must_be_unexpired: boolean;
}> = [
  { match: /\b(cpr|first[\s-]?aid)\b/i, kind: "external_cert", key: "cpr-fa", label: "CPR & First Aid", must_be_unexpired: true },
  { match: /\babuse|neglect|reporting\b/i, kind: "external_cert", key: "abuse-neglect", label: "Abuse & Neglect Reporting", must_be_unexpired: true },
  { match: /\b(medication|med[\s-]?admin(istration)?|mar)\b/i, kind: "external_cert", key: "med-admin", label: "Medication Administration", must_be_unexpired: true },
  { match: /\b(bloodborne|blood[\s-]?borne|opim)\b/i, kind: "external_cert", key: "bloodborne", label: "Bloodborne Pathogens", must_be_unexpired: true },
  { match: /\bhipaa\b/i, kind: "external_cert", key: "hipaa", label: "HIPAA", must_be_unexpired: false },
  { match: /\b30[\s-]?day( training| orientation)?|new[\s-]?hire\b/i, kind: "baseline_training", key: "thirty_day", label: "30-Day Training", must_be_unexpired: false },
  { match: /\b(de[\s-]?escalation|crisis (intervention|prevention))\b/i, kind: "baseline_training", key: "deescalation", label: "De-escalation", must_be_unexpired: true },
];

export const draftStaffPrerequisiteRules = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        organizationId: z.string().uuid(),
        dryRun: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: reqs, error } = await supabase
      .from("nectar_requirements")
      .select(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        "id, organization_id, title, description, original_title, original_description, source_citation, activation_state, service_code, service_codes_all" as any,
      )
      .eq("organization_id", data.organizationId)
      .in("activation_state", ["active", "active_by_code"]);
    if (error) throw new Error(error.message);

    // Skip requirements that already have a staff_prereq rule (any status)
    // so we don't spam duplicates on re-run.
    const { data: existing } = await supabase
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from("nectar_compliance_rules" as any)
      .select("requirement_id")
      .eq("organization_id", data.organizationId)
      .eq("rule_type", "staff_prerequisite");
    const skipReqIds = new Set(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((existing ?? []) as any[]).map((r) => r.requirement_id),
    );

    type Draft = {
      requirementId: string;
      requirementTitle: string;
      verbatim: string;
      applicable_codes: string[];
      required_qualifications: Array<{ kind: QualificationKind; key: string; must_be_unexpired: boolean; label: string }>;
      rationale: string;
    };

    const drafts: Draft[] = [];
    const declined: Array<{ requirementId: string; reason: string }> = [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const r of (reqs ?? []) as any[]) {
      if (skipReqIds.has(r.id)) continue;
      const codes: string[] = Array.isArray(r.service_codes_all) && r.service_codes_all.length
        ? r.service_codes_all
        : r.service_code
          ? [r.service_code]
          : [];
      if (codes.length === 0) continue; // no code scope = not machine-checkable at entry surface
      const text = `${r.original_title ?? r.title ?? ""} ${r.original_description ?? r.description ?? ""}`;
      if (text.trim().length < 20) {
        declined.push({ requirementId: r.id, reason: "text too short to interpret" });
        continue;
      }
      const hits = CREDENTIAL_HEURISTICS.filter((h) => h.match.test(text));
      if (hits.length === 0) {
        declined.push({ requirementId: r.id, reason: "no credential/training keyword matched" });
        continue;
      }
      // Dedup hits by (kind,key)
      const seen = new Set<string>();
      const required = hits.filter((h) => {
        const k = `${h.kind}:${h.key}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      }).map((h) => ({ kind: h.kind, key: h.key, must_be_unexpired: h.must_be_unexpired, label: h.label }));

      drafts.push({
        requirementId: r.id,
        requirementTitle: r.original_title ?? r.title ?? "Requirement",
        verbatim: r.original_description ?? r.description ?? "",
        applicable_codes: codes.map((c) => String(c).toUpperCase()),
        required_qualifications: required,
        rationale: `Auto-drafted from active requirement text mentioning: ${required.map((q) => q.label).join(", ")}.`,
      });
    }

    if (data.dryRun) return { drafts, declined, inserted: 0 };

    let inserted = 0;
    for (const d of drafts) {
      const { data: rule, error: iErr } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from("nectar_compliance_rules" as any)
        .insert({
          organization_id: data.organizationId,
          requirement_id: d.requirementId,
          rule_type: "staff_prerequisite",
          rule_definition: {
            applicable_codes: d.applicable_codes,
            required_qualifications: d.required_qualifications.map((q) => ({
              kind: q.kind,
              key: q.key,
              must_be_unexpired: q.must_be_unexpired,
            })),
            scope: "per_shift",
          },
          proposed_by: "nectar",
          proposed_rationale: d.rationale,
          status: "proposed",
        })
        .select("id")
        .single();
      if (iErr) continue;
      inserted++;
      await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from("nectar_compliance_rule_history" as any)
        .insert({
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          rule_id: (rule as any).id,
          organization_id: data.organizationId,
          action: "proposed",
          actor_id: userId,
          actor_label: "nectar",
          snapshot: { source: "draftStaffPrerequisiteRules", requirement_id: d.requirementId, draft: d },
        });
    }

    return { drafts, declined, inserted };
  });
