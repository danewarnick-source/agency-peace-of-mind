/**
 * SOW §1.24(5) coverage check: every billed service code (except the exempt
 * list below) must be associated with at least one published Support
 * Strategy section's job_codes.
 */

export const SUPPORT_STRATEGY_EXEMPT_CODES = [
  "ELS", "MTP", "PBA", "PM1", "PM2", "PN1", "PN2",
  "RP2", "RP3", "RP4", "RP5", "RPS",
] as const;

export type SupportStrategyCoverage = {
  /** Active, non-exempt codes that appear in at least one section's job_codes. */
  covered: string[];
  /** Active, non-exempt codes with no covering strategy — the compliance gap. */
  gaps: string[];
};

function normalizeCode(raw: unknown): string {
  return String(raw ?? "").trim().toUpperCase();
}

/** Union of job_codes across every section of a Support Strategies document. */
export function collectSupportStrategyCodes(
  sections: Array<{ job_codes?: string[] | null }> | null | undefined,
): Set<string> {
  const codes = new Set<string>();
  for (const s of sections ?? []) {
    for (const c of s.job_codes ?? []) {
      const code = normalizeCode(c);
      if (code) codes.add(code);
    }
  }
  return codes;
}

export function isSupportStrategyExemptCode(code: string): boolean {
  return (SUPPORT_STRATEGY_EXEMPT_CODES as readonly string[]).includes(normalizeCode(code));
}

export function computeSupportStrategyCoverage(
  activeServiceCodes: Array<string | null | undefined>,
  sections: Array<{ job_codes?: string[] | null }> | null | undefined,
): SupportStrategyCoverage {
  const strategyCodes = collectSupportStrategyCodes(sections);
  const covered: string[] = [];
  const gaps: string[] = [];
  const seen = new Set<string>();
  for (const raw of activeServiceCodes) {
    const code = normalizeCode(raw);
    if (!code || seen.has(code)) continue;
    seen.add(code);
    if (isSupportStrategyExemptCode(code)) continue;
    if (strategyCodes.has(code)) covered.push(code);
    else gaps.push(code);
  }
  covered.sort();
  gaps.sort();
  return { covered, gaps };
}
