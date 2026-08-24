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
      if (norm(f).startsWith(norm(split.first)) || norm(split.first).startsWith(norm(f.split(/\s+/)[0] ?? ""))) {
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
      split.middle ? split.first : f.split(/\s+/)[0] ?? f,
      split.middle,
      l || split.last,
    ) || formatPersonName(f, "", l);

  return { first_name: f, last_name: l, display_name: display };
}

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "");
}
