/**
 * DSPD service codes whose rate-per-unit is set per client (RFS / 1056
 * worksheet budget) rather than a fixed statewide table value.
 *
 * For DSG/DSP/HHS the fee-schedule dollar figure is a CAP — the per-client
 * rate (from the RFS determination) must be ≤ cap. See
 * src/lib/day-program-billing.ts → validateClientRateAgainstCap().
 *
 * SLH/SLN bill at fixed table rates. MTP is FLAT statewide (not variable).
 */
export const VARIABLE_RATE_CODES = new Set<string>([
  "HHS", "RHS", "DSI", "SEI", "DSG", "DSP",
]);

export function isVariableRateCode(serviceCode: string): boolean {
  return VARIABLE_RATE_CODES.has(serviceCode.toUpperCase());
}
