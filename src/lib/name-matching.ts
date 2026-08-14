// Shared tolerant name comparison — used to check a name NECTAR extracted
// from an uploaded certificate against a staffer's profile name. Handles
// middle initials and "Last, First" reordering.

function normalizeName(s: string | null): string {
  if (!s) return "";
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents
    .replace(/[.,'’"`-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function compareNames(
  profileName: string | null,
  extractedName: string | null,
): "match" | "mismatch" | "unreadable" {
  if (!extractedName || !extractedName.trim()) return "unreadable";
  if (!profileName || !profileName.trim()) return "unreadable";
  const a = normalizeName(profileName).split(" ").filter(Boolean);
  const b = normalizeName(extractedName).split(" ").filter(Boolean);
  if (a.length === 0 || b.length === 0) return "unreadable";
  // First + last name match (ignore middle names/initials)
  const aFirst = a[0];
  const aLast = a[a.length - 1];
  const bFirst = b[0];
  const bLast = b[b.length - 1];
  if (aFirst === bFirst && aLast === bLast) return "match";
  // Allow reversed order (Last, First)
  if (aFirst === bLast && aLast === bFirst) return "match";
  return "mismatch";
}
