// Deterministic, pure quality validators for the incident-report wizard.
// No network, no AI. Block low-effort answers like "not sure", "idk", "x".

const NON_ANSWERS = new Set([
  "", "?", "-", "x", "n/a", "na", "idk", "tbd", "later",
  "not sure", "note sure", "unsure", "i don't know", "i dont know",
  "dont know", "don't know", "unknown",
]);

export function isNonAnswer(text: unknown): boolean {
  if (typeof text !== "string") return true;
  const t = text.trim().toLowerCase();
  if (t.length === 0) return true;
  if (t.length === 1) return true;
  return NON_ANSWERS.has(t);
}

export function validateNarrative(text: string): string | null {
  if (isNonAnswer(text)) return "Describe what actually happened — 'not sure' won't pass UPI review.";
  if (text.trim().length < 120) return `Add more detail (at least 120 characters, currently ${text.trim().length}). Cover who/what/when/where/why.`;
  return null;
}

export function validatePersonName(text: string): string | null {
  if (isNonAnswer(text)) return "Enter a real name, not a placeholder.";
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) return "Use the full name (first and last), not just a first name.";
  return null;
}

export function validateRequiredText(text: string, min = 20): string | null {
  if (isNonAnswer(text)) return "This field is required — enter a real answer.";
  if (text.trim().length < min) return `Add more detail (at least ${min} characters).`;
  return null;
}

type Draft = Record<string, unknown>;

const PEER_TERMS = [
  "other client", "another client", "peer", "resident",
  "roommate", "assault", "hit", "attacked", "fought",
];
const INJURY_TERMS = [
  "bruise", "bleeding", "injury", "injured", "hurt",
  "hit", "bit", "fell",
];
const MEDICAL_TERMS = ["911", "ambulance", "er ", "e.r.", "hospital"];

function hasAny(haystack: string, terms: string[]): boolean {
  const h = haystack.toLowerCase();
  return terms.some((t) => h.includes(t));
}

function strField(d: Draft, k: string): string {
  const v = d[k];
  return typeof v === "string" ? v : "";
}

export function findContradictions(draft: Draft): string[] {
  const problems: string[] = [];
  const narrative = strField(draft, "description");
  const people = strField(draft, "people_involved");
  const injuries = strField(draft, "injuries");
  const medical = strField(draft, "medical_attention");

  // Combine narrative + other free-text so a mention anywhere counts.
  const combined = [
    narrative,
    strField(draft, "immediate_actions"),
    strField(draft, "witnesses"),
  ].join(" \n ");

  if (hasAny(combined, PEER_TERMS)) {
    const p = people.trim().toLowerCase();
    if (isNonAnswer(people) || p === "no one" || p === "none" || p === "nobody") {
      problems.push("Your description mentions another person but People Involved says no one. Who else was involved?");
    }
  }

  if (hasAny(combined, INJURY_TERMS) && isNonAnswer(injuries)) {
    problems.push("You mentioned a possible injury — describe it or confirm none.");
  }

  if (hasAny(combined, MEDICAL_TERMS) && isNonAnswer(medical)) {
    problems.push("Medical help was mentioned — record what was provided.");
  }

  return problems;
}
