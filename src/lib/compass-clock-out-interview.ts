/**
 * Compass clock-out interview — match spoken answers to on-file PCSP goals
 * and target behaviors, and encode the punch-pad handoff.
 *
 * Compass asks; staff remain the witness. This module never auto-attests,
 * auto-submits clock-out, files an incident, or invents goals/behaviors.
 */

export const BASELINE_GOAL_LABEL = "General baseline monitoring & safety oversight";

export type CompassInterviewPhase =
  | "goals"
  | "incident"
  | "behaviors"
  | "behavior-names"
  | "finishing";

export type CompassClockOutHandoff = {
  note?: string;
  spoken?: string;
  selectedGoals: string[];
  baseline: boolean;
  incident: "yes" | "no";
  /** null = org has behavior observations off; skip that block. */
  behaviorsObserved: boolean | null;
  targetBehaviors: string[];
};

export type WorkspaceClockOutSearch = {
  tab: "clock-in";
  verify: "1";
  note?: string;
  spoken?: string;
  goals?: string;
  baseline?: "0" | "1";
  incident?: "yes" | "no";
  behaviors?: "yes" | "no";
  targets?: string;
};

const STOP_WORDS = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "to",
  "of",
  "for",
  "with",
  "on",
  "in",
  "this",
  "that",
  "shift",
  "goal",
  "goals",
  "worked",
  "please",
  "just",
  "only",
  "the",
]);

export function normalizeSpeech(s: string): string {
  return s
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseYesNo(spoken: string): "yes" | "no" | null {
  const n = normalizeSpeech(spoken);
  if (!n) return null;

  if (
    /^(no|nope|nah|negative|not really)(\s|$)/.test(n) ||
    /\b(nothing happened|no incident|nothing|none)\b/.test(n)
  ) {
    if (!/\b(yes|yeah|yep)\b/.test(n)) return "no";
  }

  if (
    /^(yes|yeah|yep|yup|yea|sure|affirmative|correct)(\s|$)/.test(n) ||
    /\b(something happened|an incident|incident report)\b/.test(n)
  ) {
    if (!/\bno\b/.test(n)) return "yes";
  }

  const words = n.split(" ");
  if (words.length <= 4 && /^(yes|yeah|yep|yup|yea)$/.test(n)) return "yes";
  if (words.length <= 4 && /^(no|nope|nah)$/.test(n)) return "no";
  return null;
}

export function spokenWantsBaseline(spoken: string): boolean {
  const n = normalizeSpeech(spoken);
  return /\b(baseline|safety oversight|safety monitoring|general monitoring|oversight)\b/.test(n);
}

export function spokenWantsAllGoals(spoken: string): boolean {
  const n = normalizeSpeech(spoken);
  return /\b(all of them|all goals|every goal|all of the goals|all of em)\b/.test(n);
}

export function spokenInterviewContinue(spoken: string): boolean {
  const n = normalizeSpeech(spoken);
  return /\b(thats all|that is all|done|continue|next|im done|i am done)\b/.test(n);
}

export function spokenOnlyThose(spoken: string): boolean {
  const n = normalizeSpeech(spoken);
  return /\b(just|only)\b/.test(n);
}

/**
 * Match spoken text to on-file option names. Never invents a name that
 * is not in `options`.
 */
export function matchNamedOptions(spoken: string, options: string[]): string[] {
  const n = normalizeSpeech(spoken);
  if (!n || options.length === 0) return [];

  const hits: string[] = [];
  for (const opt of options) {
    const o = normalizeSpeech(opt);
    if (!o) continue;
    if (n.includes(o)) {
      hits.push(opt);
      continue;
    }
    if (o.length >= 8 && n.length >= 4 && o.includes(n)) {
      hits.push(opt);
      continue;
    }
    const tokens = o.split(" ").filter((t) => t.length > 3 && !STOP_WORDS.has(t));
    if (tokens.length === 0) {
      const compact = o.replace(/\s/g, "");
      if (compact.length >= 3 && n.includes(compact)) hits.push(opt);
      continue;
    }
    const matched = tokens.filter((t) => n.includes(t));
    if (matched.length >= Math.min(2, tokens.length)) {
      hits.push(opt);
      continue;
    }
    if (matched.length === 1 && matched[0].length >= 5) {
      const token = matched[0];
      const shared = options.some(
        (other) => other !== opt && normalizeSpeech(other).includes(token),
      );
      if (!shared || token.length >= 7) hits.push(opt);
    }
  }
  return hits;
}

export type GoalSpeechResult = {
  selectedGoals: string[];
  baseline: boolean;
  advance: boolean;
  unclear: boolean;
};

export function applyGoalSpeech(
  spoken: string,
  options: string[],
  current: { selectedGoals: string[]; baseline: boolean },
): GoalSpeechResult {
  const matched = matchNamedOptions(spoken, options);
  const wantsAll = spokenWantsAllGoals(spoken);
  const wantsBaseline = spokenWantsBaseline(spoken);
  const wantsContinue = spokenInterviewContinue(spoken);
  const only = spokenOnlyThose(spoken);

  let selected = [...current.selectedGoals];
  let baseline = current.baseline;

  if (wantsAll) selected = [...options];
  if (matched.length) {
    if (only) selected = [...matched];
    else {
      for (const m of matched) {
        if (!selected.includes(m)) selected.push(m);
      }
    }
  }
  if (wantsBaseline) {
    baseline = true;
    if (only && matched.length === 0 && !wantsAll) selected = [];
  }

  const hasPick = baseline || selected.length > 0;
  if (wantsContinue && hasPick) {
    return { selectedGoals: selected, baseline, advance: true, unclear: false };
  }
  if (only && hasPick && (wantsBaseline || matched.length > 0)) {
    return { selectedGoals: selected, baseline, advance: true, unclear: false };
  }
  if (matched.length || wantsAll || wantsBaseline) {
    return { selectedGoals: selected, baseline, advance: false, unclear: false };
  }
  return {
    selectedGoals: current.selectedGoals,
    baseline: current.baseline,
    advance: false,
    unclear: true,
  };
}

export type BehaviorNameSpeechResult = {
  targetBehaviors: string[];
  advance: boolean;
  unclear: boolean;
};

export function applyBehaviorNameSpeech(
  spoken: string,
  options: string[],
  current: string[],
): BehaviorNameSpeechResult {
  const matched = matchNamedOptions(spoken, options);
  const wantsAll = spokenWantsAllGoals(spoken);
  const wantsContinue = spokenInterviewContinue(spoken);
  const only = spokenOnlyThose(spoken);

  let selected = [...current];
  if (wantsAll) selected = [...options];
  if (matched.length) {
    if (only) selected = [...matched];
    else {
      for (const m of matched) {
        if (!selected.includes(m)) selected.push(m);
      }
    }
  }

  if (wantsContinue) {
    return { targetBehaviors: selected, advance: true, unclear: false };
  }
  if (matched.length || wantsAll) {
    return { targetBehaviors: selected, advance: false, unclear: false };
  }
  return { targetBehaviors: current, advance: false, unclear: true };
}

export function canAutoSubmitInterviewReply(text: string, kind: "yesno" | "names"): boolean {
  const t = text.trim();
  if (!t) return false;
  if (kind === "yesno") return parseYesNo(t) !== null;
  if (spokenInterviewContinue(t) || spokenWantsAllGoals(t) || spokenWantsBaseline(t)) {
    return true;
  }
  return t.split(/\s+/).filter(Boolean).length >= 1 && t.length >= 3;
}

export function buildGoalsPrompt(goals: string[]): string {
  if (goals.length === 0) {
    return "No PCSP goals are tagged for this service. I'll mark general baseline monitoring and safety oversight.";
  }
  const listed = goals.slice(0, 6).join(". ");
  const more = goals.length > 6 ? ` And ${goals.length - 6} more on the screen.` : "";
  return `Which goals did you work on this shift? ${listed}.${more} Or general baseline monitoring and safety oversight. Tap one or say the name.`;
}

export function buildIncidentPrompt(): string {
  return "Did anything happen that needs an incident report? Yes or no.";
}

export function buildBehaviorsPrompt(): string {
  return "Any target behaviors this shift? Yes or no.";
}

export function buildBehaviorNamesPrompt(names: string[]): string {
  if (names.length === 0) {
    return "No named target behaviors are on file. I'll mark yes and you can finish the details on the punch pad.";
  }
  const listed = names.slice(0, 6).join(". ");
  const more = names.length > 6 ? ` And ${names.length - 6} more on the screen.` : "";
  return `Which target behaviors? ${listed}.${more} Tap or say the names.`;
}

function stringifyStringArray(values: string[], maxLen: number): string | undefined {
  if (values.length === 0) return undefined;
  const raw = JSON.stringify(values.map((v) => v.slice(0, 400)).slice(0, 25));
  if (raw.length <= maxLen) return raw;
  return raw.slice(0, maxLen);
}

export function parseStringArrayParam(raw: string | undefined | null): string[] {
  if (!raw || !raw.trim()) return [];
  try {
    const v = JSON.parse(raw) as unknown;
    if (!Array.isArray(v)) return [];
    return v
      .map((x) => String(x).trim())
      .filter(Boolean)
      .slice(0, 25);
  } catch {
    return [];
  }
}

export function compassHandoffToSearch(h: CompassClockOutHandoff): WorkspaceClockOutSearch {
  const search: WorkspaceClockOutSearch = {
    tab: "clock-in",
    verify: "1",
    incident: h.incident,
    baseline: h.baseline ? "1" : "0",
  };
  if (h.note?.trim()) search.note = h.note.trim().slice(0, 5000);
  if (h.spoken?.trim()) search.spoken = h.spoken.trim().slice(0, 2000);
  const goals = stringifyStringArray(h.selectedGoals, 4000);
  if (goals) search.goals = goals;
  if (h.behaviorsObserved !== null) {
    search.behaviors = h.behaviorsObserved ? "yes" : "no";
    if (h.behaviorsObserved) {
      const targets = stringifyStringArray(h.targetBehaviors, 2000);
      if (targets) search.targets = targets;
    }
  }
  return search;
}

export function searchToCompassHandoff(search: {
  note?: string;
  spoken?: string;
  goals?: string;
  baseline?: string;
  incident?: string;
  behaviors?: string;
  targets?: string;
}): CompassClockOutHandoff | null {
  if (search.incident !== "yes" && search.incident !== "no") return null;
  const behaviorsObserved =
    search.behaviors === "yes" ? true : search.behaviors === "no" ? false : null;
  return {
    note: search.note,
    spoken: search.spoken,
    selectedGoals: parseStringArrayParam(search.goals),
    baseline: search.baseline === "1" || search.baseline === "true",
    incident: search.incident,
    behaviorsObserved,
    targetBehaviors: behaviorsObserved === true ? parseStringArrayParam(search.targets) : [],
  };
}

export function speakPromptTimeoutMs(text: string): number {
  return Math.min(20_000, Math.max(2_400, text.length * 55));
}
