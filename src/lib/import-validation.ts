// =============================================================
// Pure validation pipeline for Smart Import client drafts.
// No I/O. No AI. Uses the existing nectar-quality validators
// plus client-specific contradiction checks.
//
// Runs at TWO gates: (1) before setSubjectReady accepts "Mark
// ready", and (2) immediately before commitClient writes.
//
// Each issue has a stable `key` so admin overrides (persisted in
// import_subjects.validation_overrides) can identify which
// individual issues were waived.
// =============================================================

import {
  isNonAnswer,
  validateAddress,
} from "@/lib/nectar-quality";

import { padMemberId } from "@/lib/evv-codes";
import { isDailyServiceCode } from "@/lib/service-billing";
import {
  classifyExtractedService,
  type TenantIdentity,
} from "@/lib/service-classification";

export type ValidationSeverity = "error" | "warning";

export interface ValidationIssue {
  key: string;           // stable id for override tracking
  severity: ValidationSeverity;
  field?: string;        // primary field this issue is about
  message: string;       // human-readable, surfaced verbatim
}

export interface ClientDraft {
  first_name?: string | null;
  last_name?: string | null;
  full_name?: string | null;
  display_name?: string | null;
  physical_address?: string | null;
  medicaid_id?: string | null;
  date_of_birth?: string | null;
  admission_date?: string | null;
  discharge_date?: string | null;
  form_1056_approved_date?: string | null;
  is_own_guardian?: boolean | null;
  guardian_name?: string | null;
  guardian_phone?: string | null;
  guardian_relationship?: string | null;
  guardian_email?: string | null;
  pcsp_has_medications?: boolean | null;
  medication_count?: number | null;
  dysphagia?: boolean | null;
  swallowing_alerts?: string[] | null;
  billing_codes?: Array<{
    service_code: string;
    rate?: number | null;
    max_units?: number | null;
    unit_type?: string | null;
    plan_start?: string | null;
    plan_end?: string | null;
  }>;
  known_addresses?: string[];
}

// Best-effort split of a free-form name into first/last. Last token is the
// last name; everything before is the first name. Returns nulls if input is
// blank or a known placeholder. Used by the validator + the import readout so
// "Caleb Swanson" never trips name.first_missing / name.last_missing.
export function deriveNameParts(
  raw: string | null | undefined,
): { first: string | null; last: string | null } {
  if (!raw) return { first: null, last: null };
  const trimmed = raw.trim();
  if (!trimmed || isNonAnswer(trimmed)) return { first: null, last: null };
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: null, last: null };
  if (parts.length === 1) return { first: parts[0], last: null };
  const last = parts[parts.length - 1];
  const first = parts.slice(0, -1).join(" ");
  return { first, last };
}


export interface ValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
}

function dateOrder(
  earlier: string | null | undefined,
  later: string | null | undefined,
): "ok" | "swapped" | "invalid" | "skip" {
  if (!earlier || !later) return "skip";
  const a = new Date(earlier).getTime();
  const b = new Date(later).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return "invalid";
  return b < a ? "swapped" : "ok";
}

// ── Shared guardian normalizer ────────────────────────────────
// Detect "empty" guardian values: blank, isNonAnswer placeholders, or
// self-referential phrasing like "N/A — individual is their own guardian".
const SELF_GUARDIAN_PHRASE = /own\s+guardian|self[-\s]?guardian|^n\/?a\b/i;

export function isGuardianValueEmpty(v: unknown): boolean {
  if (typeof v !== "string") return v == null;
  const trimmed = v.trim();
  if (!trimmed) return true;
  if (isNonAnswer(trimmed)) return true;
  if (SELF_GUARDIAN_PHRASE.test(trimmed)) return true;
  return false;
}

// One canonical normalizer used by review, applyFields, and commit. Mutates
// the draft in place AND returns it for chaining. Idempotent.
export function normalizeGuardianFields<T extends ClientDraft & {
  guardian_phone?: string | null;
  guardian_relationship?: string | null;
  guardian_email?: string | null;
}>(d: T): T {
  const nameEmpty = isGuardianValueEmpty(d.guardian_name);
  const phoneEmpty = isGuardianValueEmpty(d.guardian_phone);
  const relEmpty = isGuardianValueEmpty(d.guardian_relationship);
  const emailEmpty = isGuardianValueEmpty(d.guardian_email);
  const noRealGuardian = nameEmpty && phoneEmpty && relEmpty && emailEmpty;

  // Strip self-referential / placeholder strings out of the actual fields
  // so commit + validation see clean nulls.
  if (nameEmpty) d.guardian_name = null;
  if (phoneEmpty) d.guardian_phone = null;
  if (relEmpty) d.guardian_relationship = null;
  if (emailEmpty) d.guardian_email = null;

  if (d.is_own_guardian === true || noRealGuardian) {
    d.is_own_guardian = true;
    d.guardian_name = null;
    d.guardian_phone = null;
    d.guardian_relationship = null;
    d.guardian_email = null;
  } else if (d.is_own_guardian === false && !nameEmpty) {
    // keep guardian fields as-is
  }
  // If is_own_guardian is null/undefined and a real guardian name exists,
  // leave is_own_guardian alone — the commit layer defaults appropriately.
  return d;
}

export function findClientContradictions(d: ClientDraft): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Only fire when self-guardian is explicitly true AND a real (non-empty,
  // non-self-referential) guardian name is present. Demoted to "warning" so
  // the unified review panel renders it as "Needs confirmation" rather than
  // a hard block — the admin resolves with a binary choice.
  if (
    d.is_own_guardian === true &&
    !isGuardianValueEmpty(d.guardian_name)
  ) {
    issues.push({
      key: "contradiction.guardian_self_vs_named",
      severity: "warning",
      field: "is_own_guardian",
      message:
        "Marked as own guardian, but a guardian name is also set. Confirm which is correct.",
    });
  }

  if (
    d.pcsp_has_medications === false &&
    typeof d.medication_count === "number" &&
    d.medication_count > 0
  ) {
    issues.push({
      key: "contradiction.no_meds_but_meds_exist",
      severity: "error",
      field: "pcsp_has_medications",
      message:
        "PCSP says no medications, but medication entries exist for this client.",
    });
  }

  if (
    d.dysphagia === false &&
    Array.isArray(d.swallowing_alerts) &&
    d.swallowing_alerts.length > 0
  ) {
    issues.push({
      key: "contradiction.dysphagia_false_with_alerts",
      severity: "warning",
      field: "dysphagia",
      message:
        "Dysphagia is marked false, but swallowing alerts are recorded. Confirm.",
    });
  }

  return issues;
}


export function validateClientDraft(d: ClientDraft): ValidationResult {
  const issues: ValidationIssue[] = [];

  // ── Person name — derive from full_name / display_name when first or last
  // is missing. The roster card renders display_name, so a subject visibly
  // named "Caleb Swanson" should not be flagged name.first_missing just
  // because the parser didn't split it.
  const derived = deriveNameParts(d.first_name && d.last_name ? null : (d.full_name || d.display_name));
  const effectiveFirst = (d.first_name && d.first_name.trim()) || derived.first || "";
  const effectiveLast = (d.last_name && d.last_name.trim()) || derived.last || "";

  if (effectiveFirst) {
    if (isNonAnswer(effectiveFirst)) {
      issues.push({
        key: "name.first_invalid",
        severity: "error",
        field: "first_name",
        message: "First name looks like a placeholder.",
      });
    }
  } else {
    issues.push({
      key: "name.first_missing",
      severity: "error",
      field: "first_name",
      message: "First name is required.",
    });
  }
  if (effectiveLast) {
    if (isNonAnswer(effectiveLast)) {
      issues.push({
        key: "name.last_invalid",
        severity: "error",
        field: "last_name",
        message: "Last name looks like a placeholder.",
      });
    }
  } else {
    issues.push({
      key: "name.last_missing",
      severity: "error",
      field: "last_name",
      message: "Last name is required.",
    });
  }


  // ── Address (required for EVV-mandated clients; warn otherwise)
  if (d.physical_address && d.physical_address.trim()) {
    const addrMsg = validateAddress(d.physical_address, d.known_addresses ?? []);
    if (addrMsg) {
      issues.push({
        key: "address.invalid",
        severity: "error",
        field: "physical_address",
        message: addrMsg,
      });
    }
  } else {
    issues.push({
      key: "address.missing",
      severity: "warning",
      field: "physical_address",
      message:
        "No physical address yet — required for any EVV-locked service code.",
    });
  }

  // ── Medicaid ID format (10 digits after padding)
  if (d.medicaid_id && d.medicaid_id.trim()) {
    const padded = padMemberId(d.medicaid_id);
    if (!/^\d{10}$/.test(padded)) {
      issues.push({
        key: "medicaid.format",
        severity: "error",
        field: "medicaid_id",
        message: `Medicaid ID "${d.medicaid_id}" isn't 10 digits — UPI rejects non-numeric IDs.`,
      });
    }
  }

  // ── Date logic
  const adVsDc = dateOrder(d.admission_date, d.discharge_date);
  if (adVsDc === "swapped") {
    issues.push({
      key: "dates.admission_after_discharge",
      severity: "error",
      field: "discharge_date",
      message: "Discharge date is before admission date.",
    });
  } else if (adVsDc === "invalid") {
    issues.push({
      key: "dates.admission_discharge_invalid",
      severity: "error",
      message: "Admission or discharge date is unparseable.",
    });
  }

  if (d.form_1056_approved_date) {
    const t = new Date(d.form_1056_approved_date).getTime();
    if (!Number.isNaN(t) && t > Date.now() + 86400000) {
      issues.push({
        key: "dates.form_1056_future",
        severity: "error",
        field: "form_1056_approved_date",
        message: "1056 approval date is in the future.",
      });
    }
  }

  // ── Billing codes: rate-table sanity
  if (Array.isArray(d.billing_codes)) {
    const known = new Set(EVV_SERVICE_CODES.map((c) => c.code));
    for (const r of d.billing_codes) {
      const code = (r.service_code ?? "").toUpperCase();
      if (!code) continue;
      if (!known.has(code)) {
        issues.push({
          key: `code.unknown.${code}`,
          severity: "error",
          field: "billing_codes",
          message: `Service code "${code}" isn't on the Utah DSPD master list.`,
        });
        continue;
      }
      if (typeof r.rate === "number" && r.rate > 0) {
        const daily = isDailyServiceCode(code);
        const lo = daily ? 1 : 0.01;
        const hi = daily ? 10000 : 1000;
        if (r.rate < lo || r.rate > hi) {
          issues.push({
            key: `code.rate_implausible.${code}`,
            severity: "warning",
            field: "billing_codes",
            message: `Rate for ${code} (${r.rate}) is outside the plausible ${daily ? "daily" : "hourly/quarter-hour"} band — confirm OCR.`,
          });
        }
      }
      const planOrder = dateOrder(r.plan_start, r.plan_end);
      if (planOrder === "swapped") {
        issues.push({
          key: `code.plan_order.${code}`,
          severity: "error",
          field: "billing_codes",
          message: `Plan end is before plan start for ${code}.`,
        });
      }
    }
  }

  // ── Guardianship (mirrors the validate_client_guardian Postgres trigger)
  // If we're sure they have a separate guardian, both name and phone are
  // required — the trigger raises otherwise and commit fails. If self-guardian
  // status was never positively determined (null/undefined) AND no real
  // guardian is on file, surface a confirmation so the admin answers
  // "is this person their own guardian?" before commit relies on the column
  // default of false.
  const guardianNameEmpty = isGuardianValueEmpty(d.guardian_name);
  const guardianPhoneEmpty = isGuardianValueEmpty(d.guardian_phone);
  if (d.is_own_guardian === false) {
    if (guardianNameEmpty) {
      issues.push({
        key: "guardian.name_missing",
        severity: "error",
        field: "guardian_name",
        message: "Guardian name is required when the client is not their own guardian.",
      });
    }
    if (guardianPhoneEmpty) {
      issues.push({
        key: "guardian.phone_missing",
        severity: "error",
        field: "guardian_phone",
        message: "Guardian phone is required when the client is not their own guardian.",
      });
    }
  } else if (d.is_own_guardian == null && guardianNameEmpty && guardianPhoneEmpty) {
    issues.push({
      key: "guardian.unknown_status",
      severity: "error",
      field: "is_own_guardian",
      message: "Is this client their own guardian? Confirm before finalizing.",
    });
  }

  // ── Contradictions
  issues.push(...findClientContradictions(d));


  // Only errors actually block; warnings show but don't fail the gate unless
  // overrides are explicitly requested. We return ok=false on ANY error.
  const ok = !issues.some((i) => i.severity === "error");
  return { ok, issues };
}

/** Apply an overrides map (issue.key → true) to filter what still blocks. */
export function filterBlocking(
  issues: ValidationIssue[],
  overrides: Record<string, boolean>,
): ValidationIssue[] {
  return issues.filter((i) => i.severity === "error" && !overrides[i.key]);
}
