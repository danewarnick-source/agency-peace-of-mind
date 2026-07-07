/**
 * One source of truth for "what qualifications does this service code require
 * of the staff running it" — the confirmed `staff_prerequisite` rules whose
 * linked nectar_requirement is active.
 *
 * Also exposes the legacy hardcoded map as a per-code fallback so no code
 * loses its guardrail while providers are still drafting rules. A code drops
 * off the fallback the moment a confirmed rule covers it.
 *
 * Consumers:
 *   - scheduling eligibility (rankStaffForShift)
 *   - shift conflict evaluator (evaluateRange)
 *   - superset verification report (verifyRequiredCertsCoverage)
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { qualificationKey, type QualificationKind } from "@/lib/staff-qualifications.functions";

// ─── Legacy hardcoded requirements (DHHS91172 minimums) ───────────────────
// KEEP as fallback until every listed code has confirmed-rule coverage.
// Values are external_certifications.cert_type keys.
export const HARDCODED_SERVICE_CODE_REQUIRED_CERTS: Record<string, string[]> = {
  HHS: ["cpr-fa", "abuse-neglect"],
  SLH: ["cpr-fa", "abuse-neglect"],
  SLN: ["cpr-fa", "abuse-neglect"],
  RHS: ["cpr-fa", "abuse-neglect"],
  DSI: ["cpr-fa"],
  SEI: ["cpr-fa"],
  CMP: ["cpr-fa"],
  CMS: ["cpr-fa"],
};

// A hardcoded cpr-fa/abuse-neglect key is considered covered by a confirmed
// rule if the rule requires the SAME cert_type under external_cert, OR the
// equivalent baseline_training / hive_course key listed here.
const HARDCODED_EQUIVALENTS: Record<string, string[]> = {
  "cpr-fa": [
    "external_cert:cpr-fa",
    "baseline_training:cpr_first_aid",
    "baseline_training:cpr_first_aid_bbp",
    "hive_course:cpr_first_aid",
  ],
  "abuse-neglect": [
    "external_cert:abuse-neglect",
    "baseline_training:abuse_neglect",
    "baseline_training:abuse_neglect_exploitation",
    "hive_course:abuse_neglect",
  ],
};

export type RequiredQual = {
  kind: QualificationKind;
  key: string;
  must_be_unexpired: boolean;
  /** Namespaced "kind:key" for direct Set lookup against a QualificationsSnapshot. */
  nsKey: string;
};

const ACTIVE_STATES = ["active", "active_by_code"] as const;

type RuleRow = {
  id: string;
  rule_definition: {
    applicable_codes?: unknown;
    required_qualifications?: unknown;
  } | null;
  requirement: { activation_state: string } | null;
};

async function loadConfirmedRules(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  organizationId: string,
): Promise<RuleRow[]> {
  const { data, error } = await supabase
    .from("nectar_compliance_rules")
    .select(
      "id, rule_definition, requirement:nectar_requirements!inner(activation_state)",
    )
    .eq("organization_id", organizationId)
    .eq("rule_type", "staff_prerequisite")
    .eq("status", "confirmed");
  if (error) throw new Error(error.message);
  return ((data ?? []) as RuleRow[]).filter(
    (r) => r.requirement && (ACTIVE_STATES as readonly string[]).includes(r.requirement.activation_state),
  );
}

/**
 * Build per-code required-qualification list from confirmed rules.
 * Codes missing from the returned map have NO confirmed coverage.
 */
function buildRuleCodeMap(rules: RuleRow[]): Map<string, RequiredQual[]> {
  const out = new Map<string, RequiredQual[]>();
  for (const r of rules) {
    const def = r.rule_definition ?? {};
    const codes = Array.isArray(def.applicable_codes)
      ? (def.applicable_codes as unknown[]).map((c) => String(c).toUpperCase()).filter(Boolean)
      : [];
    const quals = Array.isArray(def.required_qualifications)
      ? (def.required_qualifications as Array<{
          kind: QualificationKind;
          key: string;
          must_be_unexpired?: boolean;
        }>)
      : [];
    if (!codes.length || !quals.length) continue;
    for (const code of codes) {
      const list = out.get(code) ?? [];
      for (const q of quals) {
        if (!q?.kind || !q?.key) continue;
        const must = q.must_be_unexpired !== false;
        list.push({
          kind: q.kind,
          key: q.key,
          must_be_unexpired: must,
          nsKey: qualificationKey(q.kind, q.key),
        });
      }
      out.set(code, list);
    }
  }
  return out;
}

function hardcodedAsQuals(code: string): RequiredQual[] {
  const legacy = HARDCODED_SERVICE_CODE_REQUIRED_CERTS[code] ?? [];
  return legacy.map((key) => ({
    kind: "external_cert" as const,
    key,
    must_be_unexpired: true,
    nsKey: qualificationKey("external_cert", key),
  }));
}

/**
 * Resolve required quals for a set of service codes, mixing confirmed rules
 * (preferred) with the hardcoded fallback for codes NOT yet covered.
 * Logs a warning naming each code still on fallback.
 */
export async function resolveRequiredQualsForCodes(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  organizationId: string,
  codes: string[],
): Promise<{
  perCode: Map<string, RequiredQual[]>;
  fallbackCodes: string[];
  ruleCoveredCodes: string[];
}> {
  const upper = Array.from(new Set(codes.map((c) => (c ?? "").toUpperCase()).filter(Boolean)));
  const rules = await loadConfirmedRules(supabase, organizationId);
  const ruleMap = buildRuleCodeMap(rules);
  const perCode = new Map<string, RequiredQual[]>();
  const fallbackCodes: string[] = [];
  const ruleCoveredCodes: string[] = [];
  for (const code of upper) {
    const fromRules = ruleMap.get(code);
    if (fromRules && fromRules.length) {
      perCode.set(code, fromRules);
      ruleCoveredCodes.push(code);
      continue;
    }
    const legacy = hardcodedAsQuals(code);
    if (legacy.length) {
      perCode.set(code, legacy);
      fallbackCodes.push(code);
    }
  }
  if (fallbackCodes.length) {
    // eslint-disable-next-line no-console
    console.warn(
      `[required-qualifications] Using hardcoded fallback for codes with no confirmed staff_prerequisite rule: ${fallbackCodes.join(
        ", ",
      )} (org ${organizationId})`,
    );
  }
  return { perCode, fallbackCodes, ruleCoveredCodes };
}

// ─── Bulk staff qualification loader ─────────────────────────────────────
// Mirrors resolveStaffQualifications but in one bulk pass across many staff.
// Returns a namespaced Set per staff (active-only; expired quals excluded).

export async function loadStaffQualsBulk(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  organizationId: string,
  staffIds: string[],
  atIso: string,
): Promise<Map<string, Set<string>>> {
  const out = new Map<string, Set<string>>();
  if (!staffIds.length) return out;
  for (const id of staffIds) out.set(id, new Set<string>());
  const add = (staffId: string, k: string) => out.get(staffId)?.add(k);

  // 1. external_certifications
  const { data: certs } = await supabase
    .from("external_certifications")
    .select("user_id, cert_type, expires_at, status")
    .in("user_id", staffIds)
    .eq("status", "approved");
  for (const c of (certs ?? []) as Array<{ user_id: string; cert_type: string; expires_at: string | null }>) {
    if (c.expires_at && c.expires_at <= atIso) continue;
    add(c.user_id, qualificationKey("external_cert", c.cert_type));
  }

  // 2. staff_baseline_training_completions
  const { data: baseline } = await supabase
    .from("staff_baseline_training_completions")
    .select("staff_id, training_key, expires_at, completed_date")
    .eq("organization_id", organizationId)
    .in("staff_id", staffIds);
  for (const b of (baseline ?? []) as Array<{
    staff_id: string;
    training_key: string | null;
    expires_at: string | null;
    completed_date: string | null;
  }>) {
    if (!b.training_key || !b.completed_date) continue;
    if (b.expires_at && b.expires_at <= atIso) continue;
    add(b.staff_id, qualificationKey("baseline_training", b.training_key));
  }

  // 3. hive_training_assignments — completed
  const { data: assigns } = await supabase
    .from("hive_training_assignments")
    .select("user_id, course_id, status, expires_at")
    .in("user_id", staffIds);
  const assignRows = (assigns ?? []) as Array<{
    user_id: string;
    course_id: string;
    status: string;
    expires_at: string | null;
  }>;
  const courseIds = Array.from(new Set(assignRows.map((r) => r.course_id).filter(Boolean)));
  const baselineByCourse = new Map<string, string | null>();
  if (courseIds.length) {
    const { data: courses } = await supabase
      .from("hive_training_courses")
      .select("id, baseline_key")
      .in("id", courseIds);
    for (const c of (courses ?? []) as Array<{ id: string; baseline_key: string | null }>) {
      baselineByCourse.set(c.id, c.baseline_key);
    }
  }
  for (const r of assignRows) {
    if (r.status !== "completed") continue;
    if (r.expires_at && r.expires_at <= atIso) continue;
    add(r.user_id, qualificationKey("hive_course", r.course_id));
    const bk = baselineByCourse.get(r.course_id);
    if (bk) add(r.user_id, qualificationKey("hive_course", bk));
  }

  // 4. training_completions — client-specific
  const { data: comps } = await supabase
    .from("training_completions")
    .select("user_id, ref_id, is_current, topic_kind")
    .eq("topic_kind", "person")
    .eq("is_current", true)
    .in("user_id", staffIds);
  for (const c of (comps ?? []) as Array<{ user_id: string; ref_id: string }>) {
    if (!c.ref_id) continue;
    add(c.user_id, qualificationKey("client_specific_training", c.ref_id));
  }

  return out;
}

// ─── Superset verification ───────────────────────────────────────────────

export type CoverageReport = {
  organizationId: string;
  hardcodedMap: Record<string, string[]>;
  perCode: Array<{
    code: string;
    hardcodedRequirements: string[];
    coveredByRule: string[]; // hardcoded keys that are covered
    gaps: string[]; // hardcoded keys with no confirmed rule
    fullyCovered: boolean;
  }>;
  fullyCoveredCodes: string[];
  gapCodes: string[];
  fullDeletionSafe: boolean;
};

export const verifyRequiredCertsCoverage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ organizationId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<CoverageReport> => {
    const { supabase } = context;
    const rules = await loadConfirmedRules(supabase, data.organizationId);
    const ruleMap = buildRuleCodeMap(rules);

    const perCode: CoverageReport["perCode"] = [];
    const fullyCoveredCodes: string[] = [];
    const gapCodes: string[] = [];

    for (const [code, hardcodedKeys] of Object.entries(HARDCODED_SERVICE_CODE_REQUIRED_CERTS)) {
      const ruleQuals = ruleMap.get(code) ?? [];
      const ruleNsKeys = new Set(ruleQuals.map((q) => q.nsKey));
      const covered: string[] = [];
      const gaps: string[] = [];
      for (const legacyKey of hardcodedKeys) {
        const equivalents = HARDCODED_EQUIVALENTS[legacyKey] ?? [
          qualificationKey("external_cert", legacyKey),
        ];
        const isCovered = equivalents.some((eq) => ruleNsKeys.has(eq));
        if (isCovered) covered.push(legacyKey);
        else gaps.push(legacyKey);
      }
      const fullyCovered = gaps.length === 0;
      perCode.push({
        code,
        hardcodedRequirements: hardcodedKeys,
        coveredByRule: covered,
        gaps,
        fullyCovered,
      });
      if (fullyCovered) fullyCoveredCodes.push(code);
      else gapCodes.push(code);
    }

    return {
      organizationId: data.organizationId,
      hardcodedMap: HARDCODED_SERVICE_CODE_REQUIRED_CERTS,
      perCode,
      fullyCoveredCodes,
      gapCodes,
      fullDeletionSafe: gapCodes.length === 0,
    };
  });
