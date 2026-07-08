/**
 * Point-in-time effective-document resolver (pure helpers).
 *
 * Pass 3 of document effective-dating. Given a set of candidate document
 * versions (current + outdated) with effective ranges, pick the version that
 * governed on a specific date — or the current one for "now" reads.
 *
 * A superseded doc still governs for dates inside its (now-closed) range.
 * Open-ended modes (ongoing / until_replaced) cover from effective_from
 * forward until the doc is superseded. Gaps → null (the caller must surface
 * "no governing source on file for [date]").
 *
 * Reads are explicit about time context via {@link AsOfDate}: pass "now" for
 * current-state reads (default), or a YYYY-MM-DD string for past-period
 * reads. There is no implicit fallback between the two — every call site
 * declares which mode it is in.
 */

/** "now" = current-state read (use the live current doc).
 *  A YYYY-MM-DD string = point-in-time read for that date. */
export type AsOfDate = "now" | string;

export type DocEffectiveRange = {
  id: string;
  status: "current" | "outdated" | string | null;
  effective_from: string | null; // YYYY-MM-DD
  effective_to: string | null; // YYYY-MM-DD (inclusive)
  effective_to_mode: "fixed_date" | "ongoing" | "until_replaced" | string | null;
  // Legacy nectar_documents columns — used as fallback when the pass-1
  // effective_* columns aren't populated on older rows.
  effective_start?: string | null;
  effective_end?: string | null;
  created_at?: string | null;
};

function normFrom<T extends DocEffectiveRange>(d: T): string | null {
  return d.effective_from ?? d.effective_start ?? (d.created_at ? d.created_at.slice(0, 10) : null);
}
function normTo<T extends DocEffectiveRange>(d: T): string | null {
  // Open-ended modes have no end date until they're superseded (at which
  // point pass-1 auto-closes effective_to on the outdated row).
  if (d.effective_to) return d.effective_to;
  if (d.effective_end) return d.effective_end;
  return null;
}

function coversDate<T extends DocEffectiveRange>(d: T, isoDate: string): boolean {
  const from = normFrom(d);
  const to = normTo(d);
  if (from && isoDate < from) return false;
  if (to && isoDate > to) return false;
  return true;
}

/**
 * Resolve which candidate document version governed on {@link asOf}.
 * - "now" → the row with status='current' (or the newest by effective_from
 *   when status isn't set on legacy rows).
 * - YYYY-MM-DD → the row whose effective range contains that date. If more
 *   than one matches (shouldn't happen with pass-1 auto-close, but can with
 *   legacy data), the one with the latest effective_from wins.
 */
export function resolveEffectiveDocument<T extends DocEffectiveRange>(
  candidates: T[],
  asOf: AsOfDate = "now",
): T | null {
  if (!candidates.length) return null;

  if (asOf === "now") {
    const current = candidates.find((c) => c.status === "current");
    if (current) return current;
    // Legacy fallback: newest by effective_from.
    return [...candidates]
      .sort((a, b) => (normFrom(b) ?? "").localeCompare(normFrom(a) ?? ""))[0] ?? null;
  }

  const iso = asOf.slice(0, 10);
  const matching = candidates.filter((c) => coversDate(c, iso));
  if (!matching.length) return null;
  matching.sort((a, b) => (normFrom(b) ?? "").localeCompare(normFrom(a) ?? ""));
  return matching[0];
}

/**
 * Human-readable "Based on the PCSP effective 7/1/2024 – 6/30/2025" label
 * for the governing source pill in reports and evaluations.
 */
export function describeGoverningSource<T extends DocEffectiveRange & { title?: string | null; file_name?: string | null; document_type?: string | null }>(
  doc: T | null,
  fallbackLabel?: string,
): string {
  if (!doc) return fallbackLabel ? `No governing ${fallbackLabel} on file for this date.` : "No governing source on file for this date.";
  const name = (doc.title ?? doc.file_name ?? fallbackLabel ?? "source") as string;
  const from = normFrom(doc);
  const to = normTo(doc);
  const rangeBits: string[] = [];
  if (from) rangeBits.push(from);
  rangeBits.push("–");
  rangeBits.push(to ? to : (doc.effective_to_mode === "ongoing" ? "ongoing" : "present"));
  return `Based on the ${name} effective ${rangeBits.join(" ")}`;
}

export type GoverningSource = {
  documentId: string | null;
  title: string | null;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  effectiveToMode: string | null;
  isCurrent: boolean;
  label: string; // human-readable, safe for badges
};

export function toGoverningSource<T extends DocEffectiveRange & { title?: string | null; file_name?: string | null; document_type?: string | null }>(
  doc: T | null,
  fallbackLabel?: string,
): GoverningSource {
  return {
    documentId: doc?.id ?? null,
    title: (doc?.title ?? doc?.file_name ?? null) as string | null,
    effectiveFrom: doc ? normFrom(doc) : null,
    effectiveTo: doc ? normTo(doc) : null,
    effectiveToMode: doc?.effective_to_mode ?? null,
    isCurrent: doc?.status === "current",
    label: describeGoverningSource(doc, fallbackLabel),
  };
}
