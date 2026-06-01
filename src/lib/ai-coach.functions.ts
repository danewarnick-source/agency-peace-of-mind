import { createServerFn } from "@tanstack/react-start";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CoachResult {
  status: "Verified" | "Flagged";
  feedback: string;
}

export interface ScanResult {
  hasIncidentTrigger: boolean;
  hasMedicalTrigger: boolean;
  hasEmarTrigger: boolean;
  triggerTypes: string[];
  triggerSummary: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface CoachInput {
  narrative: string;
  goals: string[];
  clientFirstName: string;
}

function validateCoach(input: unknown): CoachInput {
  const i = (input ?? {}) as Record<string, unknown>;
  const narrative = typeof i.narrative === "string" ? i.narrative : "";
  const goals = Array.isArray(i.goals)
    ? (i.goals as unknown[]).map((g) => String(g)).slice(0, 25)
    : [];
  const clientFirstName =
    typeof i.clientFirstName === "string"
      ? i.clientFirstName.slice(0, 80)
      : "the client";
  if (narrative.length === 0 || narrative.length > 8000) {
    throw new Error("Narrative must be 1–8000 characters.");
  }
  return { narrative, goals, clientFirstName };
}

interface ScanInput {
  narrative: string;
  clientFirstName: string;
}

function validateScan(input: unknown): ScanInput {
  const i = (input ?? {}) as Record<string, unknown>;
  const narrative = typeof i.narrative === "string" ? i.narrative : "";
  const clientFirstName =
    typeof i.clientFirstName === "string"
      ? i.clientFirstName.slice(0, 80)
      : "the client";
  if (narrative.length === 0 || narrative.length > 8000) {
    throw new Error("Narrative must be 1–8000 characters.");
  }
  return { narrative, clientFirstName };
}

async function callAI(system: string, user: string): Promise<string> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY is not configured.");

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": apiKey,
      "X-Lovable-AIG-SDK": "fetch",
    },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
    }),
  });

  if (res.status === 429) throw new Error("AI rate limit reached. Please retry in a moment.");
  if (res.status === 402) throw new Error("AI workspace credits exhausted. Please add credits.");
  if (!res.ok) throw new Error(`AI error (${res.status}).`);

  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return json.choices?.[0]?.message?.content ?? "";
}

// ─── Documentation Quality Coach ─────────────────────────────────────────────

export const evaluateShiftNote = createServerFn({ method: "POST" })
  .inputValidator(validateCoach)
  .handler(async ({ data }): Promise<CoachResult> => {
    const system = `You are an encouraging, professional Medicaid DSPD Documentation Coach reviewing a caregiver's end-of-shift progress note.

STRICTNESS LOGIC FRAMEWORK:
- Never reject a note with generic error codes. Always provide a clear, 1–2 sentence constructive tip on what specific information needs to be appended.
- Audit for OBJECTIVE behavior tracking, not vague/subjective statements (flag phrases like "had a good day" if no concrete observations, actions, or metrics are provided).
- SEMANTIC GOAL VERIFICATION: For each checked PCSP goal, confirm the narrative describes functional, real-world actions, coaching prompts, or direct support behaviors that contextually align with the intent of that goal. Do NOT require exact word matches — accept conceptual alignment.
- The narrative must explicitly describe HOW or WHAT the staff member did to support each checked goal.

OUTPUT FORMAT — return STRICT JSON only, no markdown, no code fences:
{"status":"Verified"|"Flagged","feedback":"<1-2 sentence coaching tip>"}

If the note is substantive AND every checked goal is contextually addressed, return status "Verified" with a brief positive confirmation feedback string. Otherwise return "Flagged" with a personalized, constructive improvement tip that names the specific goal(s) missing context and tells the caregiver exactly what to add.`;

    const user = `CLIENT FIRST NAME: ${data.clientFirstName}
CHECKED PCSP GOALS (${data.goals.length}):
${data.goals.length ? data.goals.map((g, i) => `${i + 1}. ${g}`).join("\n") : "(none)"}

CAREGIVER NARRATIVE:
"""
${data.narrative}
"""`;

    const raw = await callAI(system, user);
    let parsed: { status?: string; feedback?: string } = {};
    try {
      parsed = JSON.parse(raw);
    } catch {
      const m = raw.match(/\{[\s\S]*\}/);
      if (m) { try { parsed = JSON.parse(m[0]); } catch { /* ignore */ } }
    }

    const status: "Verified" | "Flagged" =
      parsed.status === "Verified" ? "Verified" : "Flagged";
    const feedback =
      typeof parsed.feedback === "string" && parsed.feedback.trim().length > 0
        ? parsed.feedback.trim()
        : status === "Verified"
          ? "Note meets DSPD documentation standards."
          : "Add 1–2 sentences describing specifically how you supported each checked PCSP goal during this shift.";

    return { status, feedback };
  });

// ─── Draft Assist — expand shorthand/voice into a compliant draft note ───────

interface DraftInput {
  shorthand: string;
  goals: string[];
  clientFirstName: string;
}

function validateDraft(input: unknown): DraftInput {
  const i = (input ?? {}) as Record<string, unknown>;
  const shorthand = typeof i.shorthand === "string" ? i.shorthand.trim() : "";
  const goals = Array.isArray(i.goals)
    ? (i.goals as unknown[]).map((g) => String(g)).slice(0, 25)
    : [];
  const clientFirstName =
    typeof i.clientFirstName === "string"
      ? i.clientFirstName.slice(0, 80)
      : "the client";
  if (shorthand.length < 3 || shorthand.length > 4000) {
    throw new Error("Shorthand must be 3–4000 characters.");
  }
  return { shorthand, goals, clientFirstName };
}

export interface DraftResult {
  draft: string;
  wordCount: number;
}

export const draftShiftNote = createServerFn({ method: "POST" })
  .inputValidator(validateDraft)
  .handler(async ({ data }): Promise<DraftResult> => {
    const system = `You are NECTAR, a Medicaid DSPD progress-note drafting assistant for direct-support caregivers.

GOAL:
Expand the caregiver's shorthand or voice transcript into a professional, audit-ready progress-note narrative for the end-of-shift Shift Verification & Medicaid Compliance Form.

REQUIREMENTS:
- Write 60–120 words (must be at least 55 words to clear the 50-word minimum comfortably).
- Past tense, third person, objective and behavior-focused. No subjective fluff ("had a great day"). Describe what the client did, chose, said, and how staff supported them.
- Explicitly reference each checked PCSP goal by what the caregiver did to support it (functional, real-world actions). Do NOT invent facts that are not implied by the shorthand — if a goal isn't covered by the shorthand, note baseline support for it generically (e.g. "Provided prompting and oversight aligned with [goal]") instead of fabricating events.
- Use the client's first name naturally.
- Keep medical/incident claims only if clearly stated in the shorthand. Never invent injuries, medications, or incidents.
- No markdown, no headings, no bullet lists — return one or two clean paragraphs.

OUTPUT FORMAT — return STRICT JSON only, no markdown, no code fences:
{"draft":"<the narrative paragraph(s)>"}`;

    const user = `CLIENT FIRST NAME: ${data.clientFirstName}
CHECKED PCSP GOALS (${data.goals.length}):
${data.goals.length ? data.goals.map((g, i) => `${i + 1}. ${g}`).join("\n") : "(none — write a general baseline-support narrative)"}

CAREGIVER SHORTHAND / VOICE TRANSCRIPT:
"""
${data.shorthand}
"""`;

    const raw = await callAI(system, user);
    let parsed: { draft?: string } = {};
    try {
      parsed = JSON.parse(raw);
    } catch {
      const m = raw.match(/\{[\s\S]*\}/);
      if (m) { try { parsed = JSON.parse(m[0]); } catch { /* ignore */ } }
    }

    const draft = typeof parsed.draft === "string" ? parsed.draft.trim() : "";
    if (!draft) throw new Error("NECTAR could not generate a draft — please try again or write the note manually.");

    const wordCount = draft.split(/\s+/).filter(Boolean).length;
    return { draft, wordCount };
  });


// ─── Content Scanner — runs AFTER quality coach passes ───────────────────────
// Detects incident/medical/eMAR triggers that require follow-up forms.
// Returns structured JSON so the client can decide which modal to show.

export const scanNoteForTriggers = createServerFn({ method: "POST" })
  .inputValidator(validateScan)
  .handler(async ({ data }): Promise<ScanResult> => {
    const system = `You are a compliance trigger scanner for a Medicaid DSPD caregiving platform. 
Analyze the caregiver's narrative and determine if any of the following reportable events are described.

TRIGGER CATEGORIES:
1. INCIDENT — physical altercation, aggression, self-harm, fall, injury, elopement/missing person, property damage, law enforcement involvement, restraint, abuse/neglect/exploitation, death
2. MEDICAL — hospital visit, ER, urgent care, 911 called, ambulance, seizure, medical emergency, hospitalization, significant health change
3. EMAR — medication refusal, missed dose, wrong medication, wrong dose, adverse reaction, medication side effect, PRN administered for behavioral reason

OUTPUT FORMAT — return STRICT JSON only, no markdown, no code fences:
{
  "hasIncidentTrigger": true|false,
  "hasMedicalTrigger": true|false,
  "hasEmarTrigger": true|false,
  "triggerTypes": ["array of specific trigger labels found, e.g. 'fall', 'medication refusal'"],
  "triggerSummary": "One sentence describing what was detected, or empty string if nothing found"
}

Only flag genuine trigger events described in past tense as having occurred. Do not flag general mentions, hypotheticals, or training references.`;

    const user = `CLIENT FIRST NAME: ${data.clientFirstName}

CAREGIVER NARRATIVE:
"""
${data.narrative}
"""`;

    const raw = await callAI(system, user);
    let parsed: Partial<ScanResult> = {};
    try {
      parsed = JSON.parse(raw);
    } catch {
      const m = raw.match(/\{[\s\S]*\}/);
      if (m) { try { parsed = JSON.parse(m[0]); } catch { /* ignore */ } }
    }

    return {
      hasIncidentTrigger: !!parsed.hasIncidentTrigger,
      hasMedicalTrigger:  !!parsed.hasMedicalTrigger,
      hasEmarTrigger:     !!parsed.hasEmarTrigger,
      triggerTypes:       Array.isArray(parsed.triggerTypes) ? parsed.triggerTypes : [],
      triggerSummary:     typeof parsed.triggerSummary === "string" ? parsed.triggerSummary : "",
    };
  });
