/**
 * Stop-writes for nectar_requirement_usage.
 * Table stays (Step 10h). Usage notes are not a second clock register.
 */

export const NECTAR_REQUIREMENT_USAGE_WRITES_RETIRED =
  "nectar_requirement_usage writes are retired. Catalog keys own the file.";

export function skipRequirementUsageWrite(): { ok: false; usage: null } {
  return { ok: false, usage: null };
}
