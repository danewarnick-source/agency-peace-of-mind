// HHS (Host Home Supports) scheduling vocabulary — single source of truth.
//
// DOMAIN (SOW DHHS91172 §11.3): an HHS client lives full-time with a host
// family. The host family provides daily care and NEVER clocks in or holds a
// shift — their artifacts are the daily note + overnight attendance in the
// client portal / HHS hub. The AGENCY separately schedules timed staff visits
// for (a) Direct Support hours to the client (service code HHS — the amount is
// per-client, set by the PCPT on that client's DSPD Worksheet, no statewide
// minimum) and (b) Respite for the host family. Those agency visits are the
// ONLY thing scheduled at a host home, and the staff who deliver them are
// never the host. So a staff-facing card at a host home must say WHAT the
// visit is for — never just "Host Home" or a bare "HHS".

/** Respite service codes (host-family respite, incl. room/board variants). */
const RESPITE_CODES = new Set(["RP2", "RP3", "RP4", "RP5", "RL6", "RPS"]);

export function isRespiteCode(code?: string | null): boolean {
  return !!code && RESPITE_CODES.has(code.toUpperCase());
}

export type HhsVisitKind = "support" | "respite";

/**
 * Classify a shift as an HHS agency visit, or `null` when it is not one (the
 * caller should then fall back to its normal label).
 *
 *  - service code HHS  → "support" everywhere (HHS *is* host-home direct
 *    support; it never means anything else).
 *  - a respite code    → "respite" only when we know the shift is at a host
 *    home (respite delivered elsewhere is just ordinary respite).
 */
export function hhsVisitKind(code?: string | null, isHostHome?: boolean): HhsVisitKind | null {
  const c = (code ?? "").toUpperCase();
  if (c === "HHS") return "support";
  if (isHostHome && isRespiteCode(c)) return "respite";
  return null;
}

/** Purpose-based, staff-facing label, or `null` when not an HHS visit. */
export function hhsVisitLabel(code?: string | null, isHostHome?: boolean): string | null {
  const kind = hhsVisitKind(code, isHostHome);
  if (kind === "support") return "HHS Support Visit";
  if (kind === "respite") return "HHS Respite";
  return null;
}

/** True for any HHS agency visit (support or respite at a host home). */
export function isHhsVisit(code?: string | null, isHostHome?: boolean): boolean {
  return hhsVisitKind(code, isHostHome) !== null;
}

/** The ⓘ explanation shown on every HHS visit card and in the code step. */
export const HHS_VISIT_TOOLTIP =
  "This client lives full-time with a host family who provides daily care. " +
  "You're scheduled for a support or respite visit — clock in/out at the home " +
  "and complete a visit note. The host family never clocks in.";

/** 2–3 sentence one-time explainer (banner copy). */
export const HHS_EXPLAINER_BANNER =
  "HHS clients live full-time with a host family who provides daily care and " +
  "never clocks in — their record is the daily note + overnight attendance. " +
  "The agency separately schedules timed staff visits for the client's required " +
  "Direct Support hours and for the host family's respite. Those agency visits " +
  "are the only thing scheduled at a host home.";

/** localStorage-free, per-user dismissal key for the explainer banner. */
export const HHS_EXPLAINER_PREF_KEY = "hhs_host_home_explainer";

/** "Jane D. — Host Home (HHS)" for a host-home location/row. */
export function hostHomeRowLabel(firstName?: string | null, lastName?: string | null): string {
  const f = (firstName ?? "").trim();
  const li = (lastName ?? "").trim().charAt(0);
  const who = [f, li ? `${li}.` : ""].filter(Boolean).join(" ").trim();
  return who ? `${who} — Host Home (HHS)` : "Host Home (HHS)";
}

/** Weekly→monthly support-hours target (×4.33), or null when none is set. */
export function monthlySupportHoursTarget(weeklyHours?: number | null): number | null {
  if (weeklyHours == null || !Number.isFinite(weeklyHours) || weeklyHours <= 0) return null;
  return Math.round(weeklyHours * 4.33 * 10) / 10;
}
