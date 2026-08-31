const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isPerClientTrainingFormTitle(title: string): boolean {
  const t = title.trim();
  if (t === "Person-Centered Thinking and Practices Training") return false;
  if (t.startsWith("SEI Employment Support Strategies")) return false;
  return (
    t.startsWith("Client-Specific Training") ||
    t.startsWith("Support Strategies") ||
    t.startsWith("Person-Centered Thinking")
  );
}

/** True only for a real form UUID — never the string "null". */
export function isFormUuid(id: string | null | undefined): id is string {
  return typeof id === "string" && UUID_RE.test(id);
}

/** Form-typed duty with no published form UUID — unactionable for staff.
 *  Per-client PCT / support strategies / client-specific forms live on the
 *  existing client-training viewer, not a company Forms UUID. */
export function isUnlinkedFormDuty(ob: {
  evidence_type: string;
  linked_form_id: string | null | undefined;
  title?: string;
}): boolean {
  if (ob.title && isPerClientTrainingFormTitle(ob.title)) return false;
  return ob.evidence_type === "form" && !isFormUuid(ob.linked_form_id);
}

function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Obligation form links must never interpolate the string "null".
 * Prefer the stored UUID; otherwise match a published form by name.
 */
export function resolveObligationFormId(
  linkedFormId: string | null | undefined,
  forms: Array<{ id: string; name: string }>,
  obligationTitle: string,
): string | null {
  if (isFormUuid(linkedFormId)) return linkedFormId;
  const title = norm(obligationTitle);
  if (!title || !forms.length) return null;
  const exact = forms.find((f) => norm(f.name) === title);
  if (exact) return exact.id;
  const fuzzy = forms.find((f) => {
    const n = norm(f.name);
    return n.length >= 4 && (title.includes(n) || n.includes(title));
  });
  return fuzzy?.id ?? null;
}
