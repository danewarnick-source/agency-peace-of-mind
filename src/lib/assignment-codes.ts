/**
 * Caseload / punch-pad code resolution.
 *
 * `staff_assignments.service_codes` NULL or [] means "every code this client
 * is authorized for" — not "no codes". Client codes come from
 * `authorized_dspd_codes` first, then `job_code` (legacy).
 */

export type AssignmentMap = Map<string, Set<string> | null>;

export function clientAuthorizedCodes(client: {
  job_code?: string[] | null;
  authorized_dspd_codes?: string[] | null;
}): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const raw = [
    ...(Array.isArray(client.authorized_dspd_codes) ? client.authorized_dspd_codes : []),
    ...(Array.isArray(client.job_code) ? client.job_code : []),
  ];
  for (const item of raw) {
    const code = String(item ?? "").trim();
    if (!code) continue;
    const key = code.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(code);
  }
  return out;
}

/** Returns the allowed codes for a client. `null` allow-list = all. `Set` = restrict. */
export function allowedCodesFor(
  map: AssignmentMap | undefined,
  clientId: string,
  clientCodes: string[],
): string[] {
  if (!map) return clientCodes;
  if (!map.has(clientId)) return [];
  const allow = map.get(clientId);
  if (!allow) return clientCodes;
  return clientCodes.filter((c) => allow.has(c));
}
