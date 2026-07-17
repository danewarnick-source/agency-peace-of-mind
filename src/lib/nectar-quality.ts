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

// ─── Address ─────────────────────────────────────────────────────────────
// A real street address has at least one digit AND at least one word that
// looks like a street name (3+ letters). "Home", "house", "there" all FAIL.
// Selecting from the client's known addresses (exact match) auto-passes.
const ADDRESS_NONWORDS = new Set([
  "home", "house", "there", "here", "out", "outside", "inside",
  "the home", "their home", "his home", "her home", "the house",
]);
export function validateAddress(text: string, knownAddresses: string[] = []): string | null {
  if (isNonAnswer(text)) return "Enter a street address — UPI reviewers reject 'Home' or blanks.";
  const raw = text.trim();
  const lower = raw.toLowerCase();
  if (knownAddresses.some((a) => a.trim().toLowerCase() === lower)) return null;
  if (ADDRESS_NONWORDS.has(lower)) {
    return "Enter a street address — 'Home' won't work for UPI. Include the house number and street.";
  }
  const hasDigit = /\d/.test(raw);
  const hasStreetWord = /[A-Za-z]{3,}/.test(raw);
  if (!hasDigit || !hasStreetWord) {
    return "Enter a real street address (house number + street name), or pick one from the client's known addresses.";
  }
  return null;
}

// ─── Date logic ──────────────────────────────────────────────────────────
// discoveredAt MUST be >= occurredAt; neither may be in the future.
// Accepts datetime-local strings (no Z) or full ISO — both parse fine via Date.
export function validateDateLogic(occurredAt: string | null, discoveredAt: string | null): string | null {
  const now = Date.now();
  let occ: number | null = null;
  let dis: number | null = null;
  if (occurredAt) {
    const t = new Date(occurredAt).getTime();
    if (Number.isNaN(t)) return "Occurred date/time is invalid.";
    occ = t;
  }
  if (discoveredAt) {
    const t = new Date(discoveredAt).getTime();
    if (Number.isNaN(t)) return "Discovered date/time is invalid.";
    dis = t;
  }
  if (occ !== null && occ > now + 60_000) return "Occurred date/time can't be in the future.";
  if (dis !== null && dis > now + 60_000) return "Discovered date/time can't be in the future.";
  if (occ !== null && dis !== null && dis < occ) {
    return "Discovered must be on or after Occurred — you can't discover something before it happens.";
  }
  return null;
}

type Draft = Record<string, unknown>;

const PEER_TERMS = [
  "other client", "another client", "peer", "resident",
  "roommate", "assault", "hit", "attacked", "fought",
];

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

  // Injury and medical-care detail is captured by the narrative itself and by
  // Nectar's follow-up questions on the narrative step, so no keyword-based
  // contradiction check is run here.

  return problems;
}
