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

/** True when assigned/authorized codes include Host Home Supports. */
export function hasHhsCode(codes: string[]): boolean {
  return codes.some((c) => String(c ?? "").trim().toUpperCase() === "HHS");
}

/** First clockable code (DSI, SLH, SEI, RHS, …). Empty when none. Hosts never clock HHS/PPS/MTP. */
export function firstClockableCode(codes: string[]): string {
  for (const raw of codes) {
    const code = String(raw ?? "").trim();
    const u = code.toUpperCase();
    if (code && u !== "HHS" && u !== "PPS" && u !== "MTP") return code;
  }
  return "";
}

/**
 * Person has HHS plus at least one clockable code on file (DSI/SLH/SEI/…).
 * This is NOT permission to paint Punch pad onto the host-home daily-note
 * card. That card opens `/dashboard/hhs-hub/$clientId` and is daily note
 * only — hosts do not clock there. Punch belongs on a separate clockable
 * shift row (or an in-progress punch), never as a second button on HHS.
 */
export function isDualHhsAndClockable(codes: string[]): boolean {
  return hasHhsCode(codes) && !!firstClockableCode(codes);
}

function isClockableAssignmentCode(code: string): boolean {
  const u = String(code ?? "").trim().toUpperCase();
  return !!u && u !== "HHS" && u !== "PPS" && u !== "MTP";
}

/**
 * Today's surface for this person is the host-home daily note.
 * True for HHS-only, and for dual-code people who have no clockable
 * shift today and are not already on the clock. Codes on file (DSI/SEI/SLH)
 * must not flip this — treat the HOST HOME / HHS card as host-home only.
 */
export function isHostHomeDailyNoteCard(opts: {
  codes: string[];
  todayJobCode?: string | null;
  isOnTheClock?: boolean;
}): boolean {
  if (!hasHostHomeDailyCode(opts.codes)) return false;
  if (opts.isOnTheClock) return false;
  const today = String(opts.todayJobCode ?? "").trim();
  if (today && isClockableAssignmentCode(today)) return false;
  return true;
}

/**
 * Stack Punch pad + daily note on one card.
 * Never true for a host-home daily-note card — even when the person also
 * has a clockable code on file. Dual-code punch stays on a clockable
 * shift row or the in-progress punch.
 */
export function stackDualCaseloadActions(opts: {
  codes: string[];
  isHostHomeDailyNoteCard: boolean;
  hasClockableShiftToday: boolean;
  isOnTheClock: boolean;
}): boolean {
  if (opts.isHostHomeDailyNoteCard) return false;
  if (!isDualHhsAndClockable(opts.codes)) return false;
  return opts.hasClockableShiftToday || opts.isOnTheClock;
}
