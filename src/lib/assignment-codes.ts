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
 * Codes on file are NOT permission to paint a start-punch button onto the
 * caseload card. Time clock on that card is only for an already-open punch.
 */
export function isDualHhsAndClockable(codes: string[]): boolean {
  return hasHhsCode(codes) && !!firstClockableCode(codes);
}

/** Host-home daily-note code for labels. Prefer HHS; else PPS/MTP. */
export function hostHomeDailyNoteCode(codes: string[]): string {
  for (const raw of codes) {
    const u = String(raw ?? "").trim().toUpperCase();
    if (u === "HHS") return "HHS";
  }
  for (const raw of codes) {
    const u = String(raw ?? "").trim().toUpperCase();
    if (u === "PPS" || u === "MTP") return u;
  }
  return "HHS";
}

/** Caseload daily-note CTA. "Complete" only when today's note already exists. */
export function caseloadDailyNoteLabel(opts: {
  code?: string | null;
  alreadyDoneToday?: boolean;
}): string {
  const code = String(opts.code ?? "").trim() || "HHS";
  return opts.alreadyDoneToday
    ? `Complete daily note (${code})`
    : `Open daily note (${code})`;
}

/** Caseload end-shift CTA. CODE is the job on that open punch. */
export function caseloadTimeClockLabel(code?: string | null): string {
  const c = String(code ?? "").trim();
  return c ? `End shift (${c})` : "End shift";
}

/**
 * What the caseload card may show.
 * Daily note: every host-home / HHS person, every day — even with DSI/SLH/SEI
 * on file or a scheduled clockable shift. Time clock: only an in-progress
 * open punch. A scheduled shift is not enough; start that from Punch pad.
 */
export function caseloadCardActions(opts: {
  codes: string[];
  isOnTheClock: boolean;
  hasClockableShiftToday?: boolean;
  /** Today's HHS daily note is already filed — drop the open-work CTA. */
  dailyNoteDoneToday?: boolean;
}): { showDailyNote: boolean; showTimeClock: boolean } {
  void opts.hasClockableShiftToday;
  return {
    showDailyNote: hasHostHomeDailyCode(opts.codes) && !opts.dailyNoteDoneToday,
    showTimeClock: !!opts.isOnTheClock,
  };
}

/**
 * Today's surface for this person is the host-home daily note.
 * True whenever they have a host-home code and are not already punched in.
 * A clockable code on file or a scheduled DSI/SLH/SEI shift today must not
 * flip this into a start-punch card.
 */
export function isHostHomeDailyNoteCard(opts: {
  codes: string[];
  todayJobCode?: string | null;
  isOnTheClock?: boolean;
}): boolean {
  void opts.todayJobCode;
  if (!hasHostHomeDailyCode(opts.codes)) return false;
  if (opts.isOnTheClock) return false;
  return true;
}

/**
 * Stack daily note + open time clock on one card.
 * Only when this person is HHS/host-home AND the staff member already has
 * an in-progress punch. Never because they have a clockable code on file
 * or a scheduled shift today.
 */
export function stackDualCaseloadActions(opts: {
  codes: string[];
  isHostHomeDailyNoteCard: boolean;
  hasClockableShiftToday: boolean;
  isOnTheClock: boolean;
}): boolean {
  void opts.isHostHomeDailyNoteCard;
  const actions = caseloadCardActions({
    codes: opts.codes,
    isOnTheClock: opts.isOnTheClock,
    hasClockableShiftToday: opts.hasClockableShiftToday,
  });
  return actions.showDailyNote && actions.showTimeClock;
}
