/**
 * Annual 12-hour continuing education — placeholder in-Hive shell.
 * No curriculum, quiz, or answer keys. Upload / CE ledger remain the SOW path.
 */

export const ANNUAL_CE_COURSE_ID = "pi-annual-ce-12hr" as const;
export const ANNUAL_CE_COURSE_TITLE = "Annual 12-hour continuing education";
export const ANNUAL_CE_OBLIGATION_TITLE = "Annual 12-Hour Continuing Education";

/** Show Open course on the annual CE card. Flip off to hide the placeholder. */
export const ANNUAL_CE_IN_HIVE_COURSE_ENABLED = true;

/** Placeholder must not write in_hive_course / On file. */
export const ANNUAL_CE_COURSE_FULFILLS_OBLIGATION = false;

export function isAnnualCeObligationTitle(title: string): boolean {
  const t = title.trim();
  return (
    t === ANNUAL_CE_OBLIGATION_TITLE ||
    t.startsWith("Annual 12-Hour") ||
    t.startsWith("Annual 12 Hour")
  );
}
