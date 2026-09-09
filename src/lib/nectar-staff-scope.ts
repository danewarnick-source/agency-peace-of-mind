/**
 * Staff Ask NECTAR intent + name resolution.
 *
 * Pay / hours stay out of chat. Schedule answers use the caller's own
 * published shifts only. Name lookup: me → caseload → own-shift clients → refuse.
 */

import {
  denverWallToIso,
  denverYmd,
  denverYmdFromInstant,
  parseYmd,
  weekdaySunday0,
  ymdFromParts,
} from "./denver-date.ts";

/** Staff Caseload home — NECTAR pay-period card + submitted timesheets. */
export const STAFF_PAY_PERIOD_PATH = "/dashboard";
export const STAFF_PAY_PERIOD_LINK_LABEL = "Open your pay period";

export const STAFF_PAY_HOURS_REFUSAL =
  "I can't share hours or pay in chat. Open your pay period on Caseload to see time and pay for this period.";

const WEEKDAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

const WEEKDAY_LABELS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

const PERSON_STOP = new Set([
  "the", "a", "an", "and", "or", "of", "to", "in", "for", "on", "at", "by", "with",
  "from", "is", "are", "be", "was", "were", "what", "which", "who", "that", "this",
  "these", "those", "do", "does", "did", "have", "has", "had", "i", "you", "we",
  "they", "it", "my", "your", "our", "their", "its", "how", "when", "where", "why",
  "me", "im", "i'm", "ive", "i've", "id", "i'd", "am", "will", "can", "could",
  "would", "should", "about", "next", "last", "this", "week", "month", "today",
  "tomorrow", "tonight", "morning", "afternoon", "evening", "period", "pay",
  "schedule", "scheduled", "shift", "shifts", "work", "working", "worked",
  "time", "times", "many", "much", "hours", "hour", "day", "days", "client",
  "clients", "caseload", "staff", "please", "tell", "show", "list", "look",
  "like", "need", "know", "see", "check", "ask", "nectar", ...WEEKDAYS,
]);

export type NamedPerson = {
  id: string;
  first_name: string;
  last_name: string;
};

export type ScheduleSubject =
  | { kind: "self" }
  | { kind: "client"; person: NamedPerson; via: "caseload" | "own_shift" }
  | { kind: "unresolved"; token: string };

export function questionWantsPayOrHours(question: string): boolean {
  const q = question.trim();
  if (!q) return false;

  if (
    /\b(paycheck|pay\s*check|payroll|wages?|salary|salaries|earnings?|gross pay|overtime pay|ot pay)\b/i.test(q)
  ) {
    return true;
  }
  if (/\b(my pay|what(?:'s| is) my pay|estimated (?:pay|earnings)|how much did i make)\b/i.test(q)) {
    return true;
  }
  if (/\bhow much\b[\s\S]{0,40}\b(make|earn|get paid|paid|pay|dollars?|money)\b/i.test(q)) {
    return true;
  }
  if (/\b(hourly rate|pay rate|what(?:'s| is) my rate)\b/i.test(q)) {
    return true;
  }
  if (/\$\s*\d/.test(q) && /\b(pay|earn|make|hour|wage|rate)\b/i.test(q)) {
    return true;
  }
  if (/\bhow much\b[\s\S]{0,40}\breimburs/i.test(q)) {
    return true;
  }
  if (/\b(reimbursement|mileage)\s+(amount|total|pay|dollars?)\b/i.test(q)) {
    return true;
  }

  if (/\bhow many\s+shifts?\b/i.test(q)) return false;
  if (/\b(how many|how much)\s+hours\b/i.test(q)) return true;
  if (/\bhours\s+(did|have|i(?:'|’)?ve)\s+i\s+work/i.test(q)) return true;
  if (/\bhours\s+(this|last|the)\s+(week|month|period|pay\s*period)\b/i.test(q)) return true;
  if (/\b(hours worked|hours this (?:pay )?period|clocked hours|time worked)\b/i.test(q)) {
    return true;
  }
  if (/\b(did i|have i|i(?:'|’)?ve)\s+work(?:ed)?\b[\s\S]{0,24}\bhours\b/i.test(q)) {
    return true;
  }
  return false;
}

export function questionWantsSchedule(question: string): boolean {
  const q = question.trim();
  if (!q) return false;
  if (questionWantsPayOrHours(q)) return false;

  if (/\b(my schedule|upcoming (?:shifts?|schedule)|when do i work|am i (?:working|scheduled)|do i work)\b/i.test(q)) {
    return true;
  }
  if (/\bwhen(?:'s| is) (?:my |the )?(?:next )?(?:shift|work)\b/i.test(q)) {
    return true;
  }
  if (/\bnext time i work\b/i.test(q)) return true;
  if (/\bwork with\b/i.test(q)) return true;
  if (/\b(how many|count|number of)\s+shifts?\b/i.test(q)) return true;
  if (/\b(schedule|scheduled|shifts?)\b/i.test(q)) return true;
  if (
    new RegExp(`\\b(?:this |next )?(?:${WEEKDAYS.join("|")})\\b`, "i").test(q) &&
    /\b(work|shift|schedule|on)\b/i.test(q)
  ) {
    return true;
  }
  return false;
}

export function addYmdDays(ymd: string, days: number): string {
  const p = parseYmd(ymd);
  if (!p) return ymd;
  const d = new Date(p.year, p.month - 1, p.day);
  d.setDate(d.getDate() + days);
  return ymdFromParts(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

export function displayName(person: NamedPerson): string {
  return `${person.first_name} ${person.last_name}`.trim();
}

function normToken(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function initialsOf(person: NamedPerson): string {
  const f = person.first_name.trim().charAt(0);
  const l = person.last_name.trim().charAt(0);
  return `${f}${l}`.toLowerCase();
}

export function extractPersonTokens(question: string): string[] {
  const initials = question.match(/\b[A-Za-z]\.?[A-Za-z]\.?\b/g) ?? [];
  const words = question.match(/[A-Za-z][A-Za-z'-]{1,}/g) ?? [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of [...initials, ...words]) {
    const compact = normToken(raw);
    const stem = compact.replace(/(?:s|d|ve|re|ll|m)$/i, "");
    if (
      compact.length < 2 ||
      PERSON_STOP.has(raw.toLowerCase()) ||
      PERSON_STOP.has(compact) ||
      PERSON_STOP.has(stem)
    ) {
      continue;
    }
    if (seen.has(compact)) continue;
    seen.add(compact);
    out.push(raw);
  }
  return out.slice(0, 8);
}

function looksLikeInitials(token: string): boolean {
  return /^[A-Za-z]\.?[A-Za-z]\.?$/.test(token.trim());
}

export function matchNamedPerson(
  token: string,
  people: NamedPerson[],
): { status: "none" } | { status: "one"; person: NamedPerson } | { status: "ambiguous" } {
  const compact = normToken(token);
  if (compact.length < 2 || people.length === 0) return { status: "none" };

  if (looksLikeInitials(token) || compact.length === 2) {
    const hits = people.filter((p) => initialsOf(p) === compact);
    if (hits.length === 1) return { status: "one", person: hits[0] };
    if (hits.length > 1) return { status: "ambiguous" };
  }

  const firstEq = people.filter((p) => normToken(p.first_name) === compact);
  if (firstEq.length === 1) return { status: "one", person: firstEq[0] };
  if (firstEq.length > 1) return { status: "ambiguous" };

  const lastEq = people.filter((p) => normToken(p.last_name) === compact);
  if (lastEq.length === 1) return { status: "one", person: lastEq[0] };
  if (lastEq.length > 1) return { status: "ambiguous" };

  const fullEq = people.filter((p) => normToken(displayName(p)) === compact);
  if (fullEq.length === 1) return { status: "one", person: fullEq[0] };

  const prefix = people.filter((p) => {
    const first = normToken(p.first_name);
    return first.length >= 3 && (first.startsWith(compact) || compact.startsWith(first));
  });
  if (prefix.length === 1) return { status: "one", person: prefix[0] };
  if (prefix.length > 1) return { status: "ambiguous" };

  return { status: "none" };
}

function callerAsPerson(
  userId: string,
  fullName: string | null | undefined,
): NamedPerson | null {
  const parts = (fullName ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return null;
  return {
    id: userId,
    first_name: parts[0] ?? "",
    last_name: parts.slice(1).join(" "),
  };
}

/**
 * Resolve who a schedule question is about.
 * Order: me (I/my/own name) → caseload → clients on the caller's own shifts → refuse.
 */
export function resolveScheduleSubject(
  question: string,
  caller: { user_id: string; full_name: string | null },
  caseload: NamedPerson[],
  ownShiftClients: NamedPerson[],
): ScheduleSubject {
  const tokens = extractPersonTokens(question);
  const me = callerAsPerson(caller.user_id, caller.full_name);

  if (tokens.length === 0) return { kind: "self" };

  for (const token of tokens) {
    if (me) {
      const selfHit = matchNamedPerson(token, [me]);
      if (selfHit.status === "one") return { kind: "self" };
    }
  }

  for (const token of tokens) {
    const caseloadHit = matchNamedPerson(token, caseload);
    if (caseloadHit.status === "one") {
      return { kind: "client", person: caseloadHit.person, via: "caseload" };
    }
    if (caseloadHit.status === "ambiguous") {
      return { kind: "unresolved", token };
    }
  }

  for (const token of tokens) {
    const shiftHit = matchNamedPerson(token, ownShiftClients);
    if (shiftHit.status === "one") {
      return { kind: "client", person: shiftHit.person, via: "own_shift" };
    }
    if (shiftHit.status === "ambiguous") {
      return { kind: "unresolved", token };
    }
  }

  return { kind: "unresolved", token: tokens[0] ?? "that person" };
}

export function staffPayHoursRefusalReply(): {
  answer: string;
  citations: [];
  usedClientIds: [];
  refused: true;
  deepLink: { path: string; label: string };
} {
  return {
    answer: STAFF_PAY_HOURS_REFUSAL,
    citations: [],
    usedClientIds: [],
    refused: true,
    deepLink: { path: STAFF_PAY_PERIOD_PATH, label: STAFF_PAY_PERIOD_LINK_LABEL },
  };
}

export function staffUnresolvedPersonRefusal(token: string): {
  answer: string;
  citations: [];
  usedClientIds: [];
  refused: true;
  deepLink: null;
} {
  return {
    answer:
      `I can only talk about your own schedule and people on your caseload or on a shift assigned to you. I can't look up "${token}" beyond that. Ask your manager if you think this is a mistake.`,
    citations: [],
    usedClientIds: [],
    refused: true,
    deepLink: null,
  };
}

export type StaffShiftRow = {
  id: string;
  client_id: string;
  client_name: string;
  job_code: string | null;
  starts_at: string;
  ends_at: string;
};

export type StaffScheduleFact = {
  id: string;
  client_id: string;
  client_name: string;
  job_code: string | null;
  starts_at: string;
  ends_at: string;
  weekday: string;
  when: string;
};

function denverWhenLabel(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Denver",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

function weekdayLabelForIso(iso: string): string {
  const ymd = denverYmdFromInstant(iso);
  if (!ymd) return "";
  return WEEKDAY_LABELS[weekdaySunday0(ymd)] ?? "";
}

export function toScheduleFact(row: StaffShiftRow): StaffScheduleFact {
  return {
    id: row.id,
    client_id: row.client_id,
    client_name: row.client_name,
    job_code: row.job_code,
    starts_at: row.starts_at,
    ends_at: row.ends_at,
    weekday: weekdayLabelForIso(row.starts_at),
    when: denverWhenLabel(row.starts_at),
  };
}

export function buildSchedulePack(
  rows: StaffShiftRow[],
  now: Date = new Date(),
  focusedClientId?: string,
): {
  today: string;
  upcoming: StaffScheduleFact[];
  this_month: StaffScheduleFact[];
  next_with_client: StaffScheduleFact | null;
  shifts_this_month_with_client: number | null;
} {
  const today = denverYmd(now);
  const monthPrefix = today.slice(0, 8);
  const scoped = focusedClientId
    ? rows.filter((r) => r.client_id === focusedClientId)
    : rows;

  const facts = scoped.map(toScheduleFact);
  const upcoming = facts
    .filter((f) => {
      const ymd = denverYmdFromInstant(f.starts_at);
      return !!ymd && ymd >= today;
    })
    .slice(0, 40);
  const thisMonth = facts.filter((f) => {
    const ymd = denverYmdFromInstant(f.starts_at);
    return !!ymd && ymd.startsWith(monthPrefix);
  });

  return {
    today,
    upcoming,
    this_month: thisMonth,
    next_with_client: focusedClientId ? (upcoming[0] ?? null) : null,
    shifts_this_month_with_client: focusedClientId ? thisMonth.length : null,
  };
}

export function scheduleQueryWindow(now: Date = new Date()): {
  fromIso: string;
  toIso: string;
} {
  const today = denverYmd(now);
  const monthStart = `${today.slice(0, 8)}01`;
  const horizon = addYmdDays(today, 21);
  const nextAfterHorizon = addYmdDays(horizon, 1);
  return {
    fromIso: denverWallToIso(monthStart, 0, 0),
    toIso: denverWallToIso(nextAfterHorizon, 0, 0),
  };
}
