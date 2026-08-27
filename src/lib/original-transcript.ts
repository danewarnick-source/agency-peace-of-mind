/**
 * Original staff speech / pre-expansion shorthand for Compass notes.
 *
 * Legal split: Cedar (Compass) is the scribe; the staff member is the witness.
 * The expanded note is editable; the original transcript is frozen at first
 * capture and must never be overwritten with the expanded text.
 */
export function freezeOriginalTranscript(
  existing: string | null | undefined,
  candidate: string | null | undefined,
): string {
  const kept = (existing ?? "").trim();
  if (kept) return kept;
  return (candidate ?? "").trim();
}
