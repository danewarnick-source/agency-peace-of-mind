/**
 * Stop-writes for the retired nectar_compliance_* register.
 * Tables stay (Step 10h drops later). Callers must not insert/update.
 */

export const NECTAR_COMPLIANCE_WRITES_RETIRED =
  "nectar_compliance_* writes are retired. Clocks live on the Compliance spine.";

export function skipNectarComplianceWrite(): null {
  return null;
}

export function skipNectarComplianceMutation(): { ok: false } {
  return { ok: false };
}
