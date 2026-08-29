/** PDF/DOCX and free-text need NECTAR. CSV/Excel roster rows do not. */
export function smartImportNeedsAi(opts: {
  hasPdfOrDocxDocs: boolean;
  hasNonRosterText: boolean;
}): boolean {
  return opts.hasPdfOrDocxDocs || opts.hasNonRosterText;
}
