// Deterministic classifier that assigns DSPD service code(s) to a drafted
// requirement based on its title / description.
//
// Rules (strict on purpose):
//   - Only emits codes present in the canonical EVV_SERVICE_CODES registry.
//   - Matches exact uppercase code tokens at word boundaries only.
//   - No fuzzy matching, no substring search, no label matching.
//   - Case-sensitive so lowercase noise ("com" inside "commit", "sec" inside
//     "second") never produces a false positive.
//
// A requirement whose text mentions no known code returns { primary: null,
// all: [] } — that's a legitimate org-wide obligation, not a failure.

import { EVV_SERVICE_CODES } from "./evv-codes";

const KNOWN_CODES: readonly string[] = EVV_SERVICE_CODES.map((c) => c.code);

// Precompile one regex per code. `\b` handles slash-separated prefixes like
// "SLN/CMP/CMS:" and rejects "DSP" inside "DSPD".
const CODE_REGEXPS: ReadonlyArray<{ code: string; re: RegExp }> = KNOWN_CODES.map(
  (code) => ({ code, re: new RegExp(`\\b${code}\\b`) }),
);

export interface ClassifiedCodes {
  /** First code encountered in EVV_SERVICE_CODES order, or null. */
  primary: string | null;
  /** All distinct known codes found, in registry order. Empty when none match. */
  all: string[];
}

function scan(text: string | null | undefined): string[] {
  if (!text) return [];
  const hits: string[] = [];
  for (const { code, re } of CODE_REGEXPS) {
    if (re.test(text)) hits.push(code);
  }
  return hits;
}

/**
 * Return the service code(s) referenced by a drafted requirement.
 * Scans `title` first; falls back to `description` only when title yields
 * no matches (avoids picking up incidental mentions in long descriptions
 * when the title clearly scopes the requirement).
 */
export function classifyServiceCodes(
  title: string | null | undefined,
  description?: string | null | undefined,
): ClassifiedCodes {
  const titleHits = scan(title);
  const hits = titleHits.length > 0 ? titleHits : scan(description);
  return {
    primary: hits[0] ?? null,
    all: hits,
  };
}
