/**
 * Original staff speech / pre-edit shorthand for punch-pad and daily-log notes.
 *
 * The submitted note is editable; the original transcript is frozen at first
 * capture and must never be overwritten with later edits.
 */
export function freezeOriginalTranscript(
  existing: string | null | undefined,
  candidate: string | null | undefined,
): string {
  const kept = (existing ?? "").trim();
  if (kept) return kept;
  return (candidate ?? "").trim();
}
