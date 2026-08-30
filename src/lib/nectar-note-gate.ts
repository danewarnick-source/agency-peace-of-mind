/** Minimum staff words before NECTAR will draft a progress note. */
export const NECTAR_DRAFT_MIN_WORDS = 30;

export function countNoteWords(text: string): number {
  const t = text.trim();
  if (!t) return 0;
  return t.split(/\s+/).filter(Boolean).length;
}

export function nectarDraftReady(text: string): boolean {
  return countNoteWords(text) >= NECTAR_DRAFT_MIN_WORDS;
}
