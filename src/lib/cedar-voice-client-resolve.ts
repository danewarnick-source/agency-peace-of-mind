/**
 * Resolve Compass clock-in clientId against the staff caseload.
 *
 * Bedrock is asked for a uuid, but the prompt used to omit ids — the model
 * would invent a name-like string. createClockIn still requires a real uuid,
 * so this is the post-Bedrock (and client-side) safety net: only proceed
 * with an id that exists on the caseload that was sent in.
 */

export type VoiceCaseloadPerson = {
  id: string;
  firstName: string;
  lastName: string;
};

export type ClockInFields = {
  clientId: string;
  clientName: string;
  serviceCode: string;
};

export type ClockInOrClarify =
  | { intent: "clock_in"; clientId: string; clientName: string; serviceCode: string }
  | {
      intent: "clarify";
      question: string;
      candidates: VoiceCaseloadPerson[];
      serviceCode: string;
    };

export type ClockInClientResolution =
  | { status: "resolved"; person: VoiceCaseloadPerson }
  | { status: "ambiguous"; matches: VoiceCaseloadPerson[] }
  | { status: "none" };

/** Same RFC-4122 shape Zod's z.string().uuid() accepts (v1–v8, variant 8/9/a/b). */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value.trim());
}

export function caseloadDisplayName(person: VoiceCaseloadPerson): string {
  return `${person.firstName} ${person.lastName}`.replace(/\s+/g, " ").trim();
}

export function formatCaseloadForPrompt(
  caseload: Array<VoiceCaseloadPerson & { authorizedCodes?: string[] | null }>,
): string {
  if (caseload.length === 0) return "(no clients on caseload)";
  return caseload
    .map((c) => {
      const codes = c.authorizedCodes?.join(", ") ?? "unknown";
      const id = c.id.trim() || "(missing id)";
      return `${c.firstName} ${c.lastName} | id=${id} | authorized: ${codes}`;
    })
    .join("; ");
}

function normName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function firstToken(value: string): string {
  return normName(value).split(" ")[0] ?? "";
}

function personFullName(person: VoiceCaseloadPerson): string {
  return normName(`${person.firstName} ${person.lastName}`);
}

function uniquePeople(people: VoiceCaseloadPerson[]): VoiceCaseloadPerson[] {
  const seen = new Set<string>();
  const out: VoiceCaseloadPerson[] = [];
  for (const p of people) {
    if (!p.id || seen.has(p.id)) continue;
    seen.add(p.id);
    out.push(p);
  }
  return out;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function nameHintsFromReturn(clientId: string, clientName: string): string[] {
  const hints: string[] = [];
  const name = clientName.trim();
  if (name && name.toLowerCase() !== "this client") hints.push(name);
  const id = clientId.trim();
  if (id && !isUuid(id)) hints.push(id);
  return uniqueStrings(hints);
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const key = normName(v);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}

function matchHint(caseload: VoiceCaseloadPerson[], hint: string): ClockInClientResolution {
  const n = normName(hint);
  if (!n) return { status: "none" };

  const first = firstToken(n);
  const firstMatches = caseload.filter((c) => firstToken(c.firstName) === first);

  if (firstMatches.length === 1) {
    return { status: "resolved", person: firstMatches[0] };
  }

  if (firstMatches.length > 1) {
    if (n.includes(" ")) {
      const fullMatches = firstMatches.filter((c) => personFullName(c) === n);
      if (fullMatches.length === 1) return { status: "resolved", person: fullMatches[0] };
      if (fullMatches.length > 1) return { status: "ambiguous", matches: fullMatches };
    }
    return { status: "ambiguous", matches: firstMatches };
  }

  if (n.includes(" ")) {
    const fullMatches = caseload.filter((c) => personFullName(c) === n);
    if (fullMatches.length === 1) return { status: "resolved", person: fullMatches[0] };
    if (fullMatches.length > 1) return { status: "ambiguous", matches: fullMatches };
  }

  return { status: "none" };
}

function matchSpokenNames(
  caseload: VoiceCaseloadPerson[],
  spokenText: string,
): ClockInClientResolution {
  const spoken = normName(spokenText);
  if (!spoken) return { status: "none" };

  const firstHits = caseload.filter((c) => {
    const fn = firstToken(c.firstName);
    if (fn.length < 2) return false;
    return new RegExp(`\\b${escapeRegExp(fn)}\\b`, "i").test(spoken);
  });

  if (firstHits.length === 1) return { status: "resolved", person: firstHits[0] };
  if (firstHits.length > 1) {
    const fullHits = firstHits.filter((c) => {
      const full = personFullName(c);
      return full.includes(" ") && new RegExp(`\\b${escapeRegExp(full)}\\b`, "i").test(spoken);
    });
    if (fullHits.length === 1) return { status: "resolved", person: fullHits[0] };
    return { status: "ambiguous", matches: firstHits };
  }

  return { status: "none" };
}

/**
 * If clientId is a uuid on the caseload, use it. Otherwise match the
 * spoken/returned name: case-insensitive first name, then first+last.
 * Several or zero matches → not resolved (caller must clarify).
 */
export function resolveClockInAgainstCaseload(opts: {
  caseload: VoiceCaseloadPerson[];
  clientId: string;
  clientName: string;
  spokenText?: string;
}): ClockInClientResolution {
  const caseload = uniquePeople(opts.caseload.filter((c) => c.id.trim()));
  const id = opts.clientId.trim();

  if (isUuid(id)) {
    const hit = caseload.find((c) => c.id.toLowerCase() === id.toLowerCase());
    if (hit) return { status: "resolved", person: hit };
  }

  for (const hint of nameHintsFromReturn(opts.clientId, opts.clientName)) {
    const matched = matchHint(caseload, hint);
    if (matched.status !== "none") return matched;
  }

  if (opts.spokenText) {
    const spoken = matchSpokenNames(caseload, opts.spokenText);
    if (spoken.status !== "none") return spoken;
  }

  return { status: "none" };
}

function clarifyWhichClient(
  matches: VoiceCaseloadPerson[],
  serviceCode: string,
): Extract<ClockInOrClarify, { intent: "clarify" }> {
  const names = matches.slice(0, 8).map(caseloadDisplayName).filter(Boolean);
  const question =
    names.length === 0
      ? "Which client should I clock you in with?"
      : names.length === 1
        ? `Did you mean ${names[0]}?`
        : names.length === 2
          ? `Which client — ${names[0]} or ${names[1]}?`
          : `Which client — ${names.slice(0, -1).join(", ")}, or ${names[names.length - 1]}?`;
  return { intent: "clarify", question, candidates: matches, serviceCode };
}

/**
 * Post-Bedrock clock_in guard: replace invented ids with the caseload uuid,
 * or return clarify. Never forwards a clientId that is not on the caseload.
 */
export function clockInOrClarify(
  clockIn: ClockInFields,
  caseload: VoiceCaseloadPerson[],
  spokenText?: string,
): ClockInOrClarify {
  const resolved = resolveClockInAgainstCaseload({
    caseload,
    clientId: clockIn.clientId,
    clientName: clockIn.clientName,
    spokenText,
  });

  if (resolved.status === "resolved") {
    return {
      intent: "clock_in",
      clientId: resolved.person.id,
      clientName: caseloadDisplayName(resolved.person) || clockIn.clientName || "this client",
      serviceCode: clockIn.serviceCode,
    };
  }

  const matches =
    resolved.status === "ambiguous"
      ? resolved.matches
      : caseload.length <= 12
        ? uniquePeople(caseload)
        : [];
  return clarifyWhichClient(matches, clockIn.serviceCode);
}

/**
 * People to offer as tappable chips when Compass needs "which client?".
 * Prefer name matches from the utterance; if the question is about a client
 * and the caseload is small, show everyone so staff can pick.
 */
export function suggestClarifyCandidates(
  caseload: VoiceCaseloadPerson[],
  spokenText: string,
  question: string,
): VoiceCaseloadPerson[] {
  const spoken = resolveClockInAgainstCaseload({
    caseload,
    clientId: "",
    clientName: "",
    spokenText,
  });
  if (spoken.status === "ambiguous") return spoken.matches;
  if (spoken.status === "resolved") return [spoken.person];
  if (!/\bclient\b|\bwho\b|\bwhich (person|one)\b/i.test(question)) return [];
  if (caseload.length > 0 && caseload.length <= 12) return uniquePeople(caseload);
  return [];
}
