// Single authoritative Utah DHHS / Medicaid service-code registry
// (DHHS91172, eff 7/1/26). Reconciles the three existing per-purpose lists —
// never hand-roll a fourth:
//   - evv-codes.ts        canonical code/label list + EVV-mandated flag
//   - service-billing.ts  daily-rate vs hourly billing unit
//   - sow-obligation-catalog.ts  which codes carry code-gated compliance duties
//
// This registry only describes SERVICE codes (what a person or agency is
// authorized/assigned/awarded for). It is deliberately not the place for:
//   - application permission roles (src/lib/rbac.ts Permission / Role) — a
//     completely different axis, set on Team & Access settings, never here.
//   - per-client authorizations (client_billing_codes / clients.authorized_dspd_codes)
//   - per-staff assignments (staff_assignments.service_codes)
// Awarded/authorization/assignment/permission are four different concepts
// that happen to share the same code alphabet — keep them distinct in the UI
// even though they share this registry for code -> label lookups.
import { EVV_SERVICE_CODES } from "./evv-codes.ts";
import { isDailyServiceCode } from "./service-billing.ts";
import { allSowCatalogEntries } from "./sow-obligation-catalog.ts";

export type ServiceCodeEntry = {
  code: string;
  /** "HHS — Host Home Supports" */
  label: string;
  /** "Host Home Supports" */
  shortLabel: string;
  evvMandated: boolean;
  billingUnit: "daily" | "hourly";
  /** How many non-retired SOW catalog entries are gated specifically on this code. */
  catalogDutyCount: number;
  /**
   * False only for a code that appears nowhere in business logic outside the
   * master code list itself. Not "wrong" — just unverified. Never hidden.
   */
  crossReferenced: boolean;
};

// Codes present in the master EVV list but not (yet) referenced by any
// scheduling/billing/compliance logic outside that list. Verified by repo
// grep at authoring time (2026-09-15) — re-check before removing a code from
// this set, and never remove a code from SERVICE_CODE_REGISTRY itself.
const NOT_CROSS_REFERENCED = new Set<string>(["LPS"]);

function shortLabelFor(fullLabel: string, code: string): string {
  const idx = fullLabel.indexOf("—");
  if (idx >= 0) return fullLabel.slice(idx + 1).trim();
  return fullLabel.replace(code, "").trim();
}

function catalogDutyCounts(): Map<string, number> {
  const counts = new Map<string, number>();
  for (const entry of allSowCatalogEntries()) {
    if (entry.disposition === "retired") continue;
    for (const code of entry.service_codes) {
      counts.set(code, (counts.get(code) ?? 0) + 1);
    }
  }
  return counts;
}

function buildRegistry(): ServiceCodeEntry[] {
  const dutyCounts = catalogDutyCounts();
  return EVV_SERVICE_CODES.map((c) => ({
    code: c.code,
    label: c.label,
    shortLabel: shortLabelFor(c.label, c.code),
    evvMandated: c.evvLock,
    billingUnit: isDailyServiceCode(c.code) ? ("daily" as const) : ("hourly" as const),
    catalogDutyCount: dutyCounts.get(c.code) ?? 0,
    crossReferenced: !NOT_CROSS_REFERENCED.has(c.code),
  })).sort((a, b) => a.code.localeCompare(b.code));
}

/** Every SOW service code HIVE knows about. Ordered A-Z by code. */
export const SERVICE_CODE_REGISTRY: ReadonlyArray<ServiceCodeEntry> = buildRegistry();

const BY_CODE = new Map(SERVICE_CODE_REGISTRY.map((e) => [e.code, e]));

export function serviceCodeEntry(code: string | null | undefined): ServiceCodeEntry | null {
  const c = String(code ?? "")
    .trim()
    .toUpperCase();
  return c ? (BY_CODE.get(c) ?? null) : null;
}

export function serviceCodeLabel(code: string | null | undefined): string {
  if (!code) return "—";
  return serviceCodeEntry(code)?.label ?? String(code).trim().toUpperCase();
}

/** Every awardable code, for the agency-setup / company-profile multi-selects. */
export function awardableServiceCodeChoices(): string[] {
  return SERVICE_CODE_REGISTRY.map((e) => e.code);
}

export type ReconciledServiceCodes = {
  /** Selections that resolve to a known registry entry. */
  known: ServiceCodeEntry[];
  /**
   * Selections that do NOT resolve to a known registry entry. Preserved
   * as-is — never dropped, renamed, or aliased. The UI must still show
   * these, flagged for verification.
   */
  unrecognized: string[];
};

/**
 * Reconcile a saved code list (e.g. organizations.services_offered) against
 * the registry. Never discards or rewrites an existing selection — an
 * unrecognized legacy code stays selected and visible, just flagged.
 */
export function reconcileServiceCodes(
  selected: string[] | null | undefined,
): ReconciledServiceCodes {
  const seen = new Set<string>();
  const known: ServiceCodeEntry[] = [];
  const unrecognized: string[] = [];
  for (const raw of selected ?? []) {
    const code = String(raw ?? "")
      .trim()
      .toUpperCase();
    if (!code || seen.has(code)) continue;
    seen.add(code);
    const entry = serviceCodeEntry(code);
    if (entry) known.push(entry);
    else unrecognized.push(code);
  }
  return { known, unrecognized };
}

export function normalizeServiceCodes(codes: string[] | null | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of codes ?? []) {
    const code = String(raw ?? "")
      .trim()
      .toUpperCase();
    if (!code || seen.has(code)) continue;
    seen.add(code);
    out.push(code);
  }
  return out;
}
