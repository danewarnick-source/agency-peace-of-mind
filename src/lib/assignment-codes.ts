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

/**
 * First assigned code, else first authorized code. Never invent SEI —
 * that opened Punch pad for Host Home people with no listed codes.
 */
export function defaultCaseloadCode(
  assigned: string[],
  authorized: string[],
): string {
  for (const raw of [...assigned, ...authorized]) {
    const code = String(raw ?? "").trim();
    if (code) return code;
  }
  return "";
}

/** True when this person's assigned/authorized codes include a host-home daily code. */
export function hasHostHomeDailyCode(codes: string[]): boolean {
  return codes.some((c) => {
    const u = String(c ?? "").trim().toUpperCase();
    return u === "HHS" || u === "PPS" || u === "MTP";
  });
}

/** True when every assigned code is host-home daily (hosts do not clock). */
export function isHostHomeOnlyAssignment(codes: string[]): boolean {
  const cleaned = codes.map((c) => String(c ?? "").trim()).filter(Boolean);
  if (cleaned.length === 0) return false;
  return cleaned.every((c) => {
    const u = c.toUpperCase();
    return u === "HHS" || u === "PPS" || u === "MTP";
  });
}
