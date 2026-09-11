/**
 * Per-client trainings that stay as forms on My Obligations:
 * support strategies and client-specific training.
 * Hire-level "Person-Centered Thinking and Practices" is staff training once.
 * Per-client Person-Centered Thinking — [Client] is retired (not assigned).
 * Not SEI UPI support-strategy entry.
 */

// person_centered stays on the union for retirement helpers/tests only.
// clientFormKindForTitle never returns it. Do not treat it as a live form.
export type ClientFormKind = "person_specific" | "support_strategies" | "person_centered";

export const CLIENT_FORM_EVIDENCE = "form";

export const PCT_CLIENT_OBLIGATION_TITLE = "Person-Centered Thinking — [Client Name]";
export const SUPPORT_STRATEGIES_OBLIGATION_TITLE = "Support Strategies — [Client Name]";
export const CLIENT_SPECIFIC_OBLIGATION_TITLE = "Client-Specific Training — [Client Name]";
export const PCT_HIRE_COURSE_TITLE = "Person-Centered Thinking and Practices Training";
export const SEI_SUPPORT_STRATEGIES_UPI_TITLE = "SEI Employment Support Strategies — UPI Entry";

export const CLIENT_FORM_LABEL: Record<ClientFormKind, string> = {
  person_specific: "Client-specific training",
  support_strategies: "Support strategies",
  person_centered: "Person-centered thinking",
};

/** Per-client PCT form — retired. Hire-level PCT course is not this. */
export function isRetiredPerClientPctTitle(title: string): boolean {
  const t = title.trim();
  if (!t) return false;
  if (t === PCT_HIRE_COURSE_TITLE || t.startsWith("Person-Centered Thinking and Practices")) {
    return false;
  }
  return t === PCT_CLIENT_OBLIGATION_TITLE || t.startsWith("Person-Centered Thinking");
}

export function clientFormKindForTitle(title: string): ClientFormKind | null {
  const t = title.trim();
  if (!t) return null;
  if (t === PCT_HIRE_COURSE_TITLE) return null;
  if (isRetiredPerClientPctTitle(t)) return null;
  if (t === SEI_SUPPORT_STRATEGIES_UPI_TITLE || t.startsWith("SEI Employment Support Strategies")) {
    return null;
  }
  if (t.startsWith("Client-Specific Training")) return "person_specific";
  if (t.startsWith("Support Strategies")) return "support_strategies";
  return null;
}

export function clientFormTitleForKind(kind: ClientFormKind): string {
  if (kind === "person_specific") return CLIENT_SPECIFIC_OBLIGATION_TITLE;
  if (kind === "support_strategies") return SUPPORT_STRATEGIES_OBLIGATION_TITLE;
  return PCT_CLIENT_OBLIGATION_TITLE;
}

export function isClientFormObligationTitle(title: string): boolean {
  return clientFormKindForTitle(title) !== null;
}
