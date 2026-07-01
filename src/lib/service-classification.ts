// =============================================================
// Prompt 15 — provider scoping for Smart Import.
//
// Classifies an extracted PCSP service line into one of three buckets,
// using:
//   • the DSPD master list (EVV_SERVICE_CODES) → "is this a real DSPD code?"
//   • the importing org's codes_held (provider-interest-outline) → "do WE
//     bill this code?"
//   • provider_name on the PCSP authorization row vs the tenant org's
//     legal_name / aliases → "is THIS line ours?"
//
// Buckets:
//   ours            → write to client_billing_codes / authorized_dspd_codes
//   other_provider  → coordination only (client_external_services); never
//                     billing, never EVV, never caseload
//   not_a_service   → not on the DSPD master list (transport "UTP",
//                     support coordination "SCE"); coordination info only
//
// Confidence:
//   confident   → safe to act on automatically
//   ambiguous   → ask the admin before billing (unknown provider on a
//                 known code, no codes_held configured, etc.)
// =============================================================

import { EVV_SERVICE_CODES } from "@/lib/evv-codes";

export type ServiceBucket = "ours" | "other_provider" | "not_a_service";

export interface ServiceClassification {
  bucket: ServiceBucket;
  confident: boolean;
  reason: string;
}

export interface TenantIdentity {
  /** Awarded codes for this provider (from provider_interest_outline.codes_held). */
  codesHeld: string[];
  /** Names by which the tenant might appear in a PCSP Provider column. */
  names: string[];
}

const MASTER_CODES: Set<string> = new Set(EVV_SERVICE_CODES.map((c) => c.code));

/**
 * Normalize an org/provider name for comparison: uppercase, strip common
 * suffixes (LLC/INC/CORP/CO), strip punctuation, collapse whitespace.
 */
export function normalizeOrgName(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .toUpperCase()
    .replace(/[.,'"()&]/g, " ")
    .replace(/\b(LLC|L\.L\.C|INC|INCORPORATED|CORP|CORPORATION|CO|COMPANY|LTD|PLLC|PC)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function nameMatchesTenant(providerName: string | null | undefined, tenant: TenantIdentity): boolean {
  const norm = normalizeOrgName(providerName);
  if (!norm) return false;
  for (const n of tenant.names) {
    const t = normalizeOrgName(n);
    if (!t) continue;
    if (norm === t) return true;
    if (norm.includes(t) || t.includes(norm)) return true;
  }
  return false;
}

/**
 * Classify one extracted service line.
 *
 * Fail-safe rule: when classification can't be made confidently, return the
 * least-destructive bucket (other_provider) with confident=false so the
 * review UI prompts the admin instead of silently billing.
 */
export function classifyExtractedService(args: {
  serviceCode: string | null | undefined;
  providerName: string | null | undefined;
  tenant: TenantIdentity;
}): ServiceClassification {
  const code = (args.serviceCode ?? "").trim().toUpperCase();
  if (!code) {
    return { bucket: "not_a_service", confident: true, reason: "No service code." };
  }
  if (!MASTER_CODES.has(code)) {
    return {
      bucket: "not_a_service",
      confident: true,
      reason: `${code} is not on the DSPD master list — informational only.`,
    };
  }

  const provider = (args.providerName ?? "").trim();
  const held = new Set(args.tenant.codesHeld.map((c) => c.toUpperCase()));
  const providerIsTenant = nameMatchesTenant(provider, args.tenant);

  // Strongest signal: provider_name explicitly names the tenant.
  if (providerIsTenant) {
    return { bucket: "ours", confident: true, reason: "Provider on PCSP matches this org." };
  }

  // Provider is named AND is not us → another provider.
  if (provider) {
    return {
      bucket: "other_provider",
      confident: true,
      reason: `Provider "${provider}" is a different organization.`,
    };
  }

  // No provider name. Fall back to codes_held.
  if (held.size === 0) {
    // Org hasn't configured codes_held — can't decide. Default to coordination
    // (won't bill) and surface as needing confirmation.
    return {
      bucket: "other_provider",
      confident: false,
      reason:
        "No awarded codes configured for this org and provider isn't named — confirm before billing.",
    };
  }
  if (held.has(code)) {
    return { bucket: "ours", confident: true, reason: `${code} is on this org's awarded codes.` };
  }
  return {
    bucket: "other_provider",
    confident: true,
    reason: `${code} is not on this org's awarded codes.`,
  };
}

/**
 * Fetch the tenant identity for an organization — legal/display names plus
 * any aliases, and the codes_held list from provider_interest_outline.
 * Returns sensible empties when nothing is configured.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function fetchTenantIdentity(sb: any, orgId: string): Promise<TenantIdentity> {
  const { data: org } = await sb
    .from("organizations")
    .select("name, legal_name, aliases, services_offered")
    .eq("id", orgId)
    .maybeSingle();
  const { data: outline } = await sb
    .from("provider_interest_outline")
    .select("codes_held")
    .eq("organization_id", orgId)
    .eq("name", "Default")
    .maybeSingle();
  const names: string[] = [];
  if (org?.name) names.push(org.name);
  if (org?.legal_name) names.push(org.legal_name);
  if (Array.isArray(org?.aliases)) for (const a of org.aliases) if (a) names.push(String(a));
  const outlineCodes = Array.isArray(outline?.codes_held)
    ? outline.codes_held.map((c: string) => String(c).toUpperCase())
    : [];
  // Fallback to organizations.services_offered when the referral-matching
  // outline hasn't been populated (Company Profile writes services_offered).
  const servicesCodes = Array.isArray(org?.services_offered)
    ? org.services_offered.map((c: string) => String(c).toUpperCase())
    : [];
  const codesHeld = Array.from(new Set([...outlineCodes, ...servicesCodes]));
  return { names, codesHeld };
}

/**
 * Partition resolved code rows into the three buckets, honoring admin
 * overrides set in the review UI. Override keys:
 *   code.bill_as_ours.<CODE>  → force OURS
 *   code.coordination.<CODE>  → force OTHER_PROVIDER
 *   code.ignore.<CODE>        → drop (not billed, not stored)
 */
export interface CodeRowLike {
  service_code: string;
  provider_name?: string | null;
  [k: string]: unknown;
}

export function partitionCodeRows<T extends CodeRowLike>(
  rows: T[],
  tenant: TenantIdentity,
  overrides: Record<string, boolean> = {},
): {
  ours: T[];
  other: Array<T & { _classification: ServiceClassification }>;
  ignored: T[];
  needsReview: Array<T & { _classification: ServiceClassification }>;
} {
  const ours: T[] = [];
  const other: Array<T & { _classification: ServiceClassification }> = [];
  const ignored: T[] = [];
  const needsReview: Array<T & { _classification: ServiceClassification }> = [];
  for (const row of rows) {
    const code = (row.service_code ?? "").toUpperCase();
    if (overrides[`code.ignore.${code}`]) { ignored.push(row); continue; }
    if (overrides[`code.bill_as_ours.${code}`]) { ours.push(row); continue; }
    if (overrides[`code.coordination.${code}`]) {
      other.push({ ...row, _classification: { bucket: "other_provider", confident: true, reason: "Admin chose coordination only." } });
      continue;
    }
    const c = classifyExtractedService({ serviceCode: code, providerName: row.provider_name, tenant });
    if (!c.confident) {
      needsReview.push({ ...row, _classification: c });
      continue;
    }
    if (c.bucket === "ours") ours.push(row);
    else other.push({ ...row, _classification: c });
  }
  return { ours, other, ignored, needsReview };
}
