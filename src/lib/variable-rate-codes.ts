/**
 * DSPD service codes whose rate-per-unit is set per client (varies by
 * individual's PCSP / 1056 budget) rather than a fixed statewide value.
 */
export const VARIABLE_RATE_CODES = new Set<string>(["DSI", "SEI"]);

export function isVariableRateCode(serviceCode: string): boolean {
  return VARIABLE_RATE_CODES.has(serviceCode.toUpperCase());
}
