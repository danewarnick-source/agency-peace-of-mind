/**
 * DSPD service codes whose rate-per-unit is set per client (varies by the
 * individual's PCSP / 1056 worksheet budget) rather than a fixed statewide
 * table value: HHS, RHS, DSI, SEI. SLH/SLN are table rates.
 */
export const VARIABLE_RATE_CODES = new Set<string>(["HHS", "RHS", "DSI", "SEI"]);

export function isVariableRateCode(serviceCode: string): boolean {
  return VARIABLE_RATE_CODES.has(serviceCode.toUpperCase());
}
