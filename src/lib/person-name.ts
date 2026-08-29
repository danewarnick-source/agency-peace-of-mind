/**
 * Person-name helpers for import / intake.
 * clients has first_name + last_name only (no middle_name column), so a middle
 * initial or middle name is folded into first_name as "Marcus T." while
 * display strings keep the full "Marcus T. Rivera".
 */

export type SplitPersonName = {
  first: string;
  middle: string;
  last: string;
};

/** Split a display/full name into first / middle / last. */
export function splitPersonName(full: string | null | undefined): SplitPersonName {
  const parts = (full ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p.replace(/,/g, ""));
  if (parts.length === 0) return { first: "", middle: "", last: "" };
  if (parts.length === 1) return { first: parts[0], middle: "", last: "" };
  if (parts.length === 2) return { first: parts[0], middle: "", last: parts[1] };
  return {
    first: parts[0],
    middle: parts.slice(1, -1).join(" "),
    last: parts[parts.length - 1],
  };
}

/** first_name column value that preserves middle initial(s). */
export function firstNameWithMiddle(first: string, middle: string): string {
  const f = first.trim();
  const m = middle.trim();
  if (!f) return m;
  if (!m) return f;
  return `${f} ${m}`;
}

/** Display / full name from parts. */
export function formatPersonName(first: string, middle: string, last: string): string {
  return [first.trim(), middle.trim(), last.trim()].filter(Boolean).join(" ");
}

const SUFFIX = /^(jr|sr|ii|iii|iv|md|phd)\.?$/i;

function titleCaseToken(word: string): string {
  if (!word) return word;
  if (word.includes("-")) return word.split("-").map(titleCaseToken).join("-");
  if (word.includes("'")) return word.split("'").map(titleCaseToken).join("'");

  const letters = word.replace(/[^A-Za-z]/g, "");
  if (
    letters.length > 0 &&
    letters !== letters.toUpperCase() &&
    letters !== letters.toLowerCase()
  ) {
    return word;
  }
  if (SUFFIX.test(word)) {
    const core = word.replace(/\.$/, "").toUpperCase();
    return word.endsWith(".") ? `${core}.` : core;
  }

  const lower = word.toLowerCase();
  if (/^mc[a-z]/.test(lower) && lower.length > 3) {
    return `Mc${lower.charAt(2).toUpperCase()}${lower.slice(3)}`;
  }
  if (/^mac[a-z]/.test(lower) && lower.length > 4) {
    return `Mac${lower.charAt(3).toUpperCase()}${lower.slice(4)}`;
  }
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/**
 * Display-layer title case. Does not rewrite stored legal names.
 * ALL CAPS imports become "Stephen Prince"; mixed-case legal names are kept.
 */
export function toDisplayNameCase(raw: string): string {
  return raw.trim().split(/\s+/).filter(Boolean).map(titleCaseToken).join(" ");
}

export function displayPersonName(first: string, last: string, middle = ""): string {
  return toDisplayNameCase(formatPersonName(first, middle, last));
}

/**
 * Prefer a richer full_name when first/last alone would drop a middle initial.
 * Returns updated first/last suitable for the clients table.
 */
export function enrichNamesFromFull(
  first: string | null | undefined,
  last: string | null | undefined,
  full: string | null | undefined,
): { first_name: string; last_name: string; display_name: string } {
  const split = splitPersonName(full);
  let f = (first ?? "").trim();
  let l = (last ?? "").trim();

  if (split.middle) {
    // Full name carries a middle — prefer it for first_name storage.
    if (!f || norm(f) === norm(split.first)) {
      f = firstNameWithMiddle(split.first || f, split.middle);
    } else if (!f.toLowerCase().includes(split.middle.toLowerCase().replace(/\./g, ""))) {
      // first exists but lacks middle token — append when first matches given name
      if (
        norm(f).startsWith(norm(split.first)) ||
        norm(split.first).startsWith(norm(f.split(/\s+/)[0] ?? ""))
      ) {
        f = firstNameWithMiddle(split.first || f, split.middle);
      }
    }
    if (!l) l = split.last;
  } else if ((!f || !l) && (split.first || split.last)) {
    if (!f) f = split.first;
    if (!l) l = split.last;
  }

  const display =
    formatPersonName(
      split.middle ? split.first : (f.split(/\s+/)[0] ?? f),
      split.middle,
      l || split.last,
    ) || formatPersonName(f, "", l);

  return { first_name: f, last_name: l, display_name: display };
}

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "");
}
