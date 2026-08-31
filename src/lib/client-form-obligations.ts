/**
 * Per-client trainings that stay as forms on My Obligations:
 * person-centered thinking, support strategies, and client-specific training.
 * Not the hire-level "Person-Centered Thinking and Practices" course,
 * and not SEI UPI support-strategy entry.
 */

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

export function clientFormKindForTitle(title: string): ClientFormKind | null {
  const t = title.trim();
  if (!t) return null;
  if (t === PCT_HIRE_COURSE_TITLE) return null;
  if (t === SEI_SUPPORT_STRATEGIES_UPI_TITLE || t.startsWith("SEI Employment Support Strategies")) {
    return null;
  }
  if (t.startsWith("Client-Specific Training")) return "person_specific";
  if (t.startsWith("Support Strategies")) return "support_strategies";
  if (t.startsWith("Person-Centered Thinking")) return "person_centered";
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
