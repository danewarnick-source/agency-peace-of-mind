import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * NECTAR — parse a natural-language scheduling sentence into a structured
 * draft proposal. The caller supplies a small reference set (this client's
 * authorized schedulable codes, the org's staff) so the model resolves names
 * to IDs without hitting the database. Advisory only — the UI shows a preview
 * and the user confirms before any blocks are written. Nothing publishes.
 */

const ReferenceClient = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  schedulable_codes: z.array(z.string()).default([]),
});
const ReferenceStaff = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
});

const InputSchema = z.object({
  sentence: z.string().min(3).max(500),
  clients: z.array(ReferenceClient).max(500),
  staff: z.array(ReferenceStaff).max(500),
});

export type NectarSchedulePlan = {
  kind: "ok";
  client_id: string;
  client_name: string;
  staff_id: string;
  staff_name: string;
  code: string;
  // Days: array of weekday indices 0=Sun … 6=Sat
  days: number[];
  start: string; // HH:MM (24-hour)
  end: string;   // HH:MM
  recurrence: "once" | "weekly";
  summary: string;
};
export type NectarScheduleAsk = { kind: "ask"; question: string };
export type NectarScheduleResult = NectarSchedulePlan | NectarScheduleAsk;

export const parseScheduleSentence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }): Promise<NectarScheduleResult> => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("AI gateway is not configured.");

    const system = `You are NECTAR, a scheduling assistant. Parse the user's sentence
into a structured shift proposal for ONE client.

You must return strict JSON matching ONE of these shapes:

1) Successful parse:
{
  "kind": "ok",
  "client_id": string,            // must be one of the provided client IDs
  "staff_id": string,             // must be one of the provided staff IDs
  "code": string,                 // must be one of that client's schedulable_codes
  "days": number[],               // weekday indices, 0=Sun..6=Sat, deduped & sorted
  "start": string,                // "HH:MM" 24-hour
  "end": string,                  // "HH:MM" 24-hour, after start
  "recurrence": "once" | "weekly"
}

2) Needs clarification (only one short question):
{ "kind": "ask", "question": string }

Rules:
- Resolve client and staff by case-insensitive first/last name match against the provided lists.
- If the client has MORE THAN ONE schedulable_code and the sentence does not name one, return "ask" with: "Which service code for <client>? (<codes joined by />)".
- If the client has exactly one schedulable_code, use it.
- If client, staff, or time window is ambiguous or missing, return "ask" with a single specific question.
- Times like "10am", "10:00", "3 p.m." -> 24-hour HH:MM ("10:00", "15:00").
- Day phrases: "Mon/Wed/Fri", "every weekday", "weekends", "tomorrow", "today" -> weekday indices.
- "every week" / "weekly" / "recurring" -> recurrence "weekly"; otherwise "once".
- Return JSON ONLY, no commentary.`;

    const user = JSON.stringify({
      sentence: data.sentence,
      clients: data.clients,
      staff: data.staff,
      today_weekday_index: new Date().getDay(),
    });

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

    if (res.status === 429) throw new Error("NECTAR is busy — try again in a moment.");
    if (res.status === 402) throw new Error("AI workspace credits exhausted. Add credits to continue.");
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`AI error (${res.status}): ${txt.slice(0, 200)}`);
    }

    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const raw = json.choices?.[0]?.message?.content ?? "{}";

    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch {
      return { kind: "ask", question: "I didn't catch that — try: 'Schedule Dane with Johnny every Mon/Wed/Fri 10a–3p'." };
    }

    const Ask = z.object({ kind: z.literal("ask"), question: z.string().min(1).max(300) });
    const Ok = z.object({
      kind: z.literal("ok"),
      client_id: z.string().min(1),
      staff_id: z.string().min(1),
      code: z.string().min(1),
      days: z.array(z.number().int().min(0).max(6)).min(1),
      start: z.string().regex(/^\d{2}:\d{2}$/),
      end: z.string().regex(/^\d{2}:\d{2}$/),
      recurrence: z.enum(["once", "weekly"]),
    });

    const asAsk = Ask.safeParse(parsed);
    if (asAsk.success) return asAsk.data;

    const asOk = Ok.safeParse(parsed);
    if (!asOk.success) {
      return { kind: "ask", question: "I didn't understand all of that — who, what days, and what time window?" };
    }

    // Validate references on the server.
    const client = data.clients.find((c) => c.id === asOk.data.client_id);
    const staff = data.staff.find((s) => s.id === asOk.data.staff_id);
    if (!client) return { kind: "ask", question: "Which client did you mean?" };
    if (!staff) return { kind: "ask", question: "Which staffer should work this shift?" };
    if (!client.schedulable_codes.includes(asOk.data.code)) {
      return {
        kind: "ask",
        question: `${client.name} isn't authorized for ${asOk.data.code}. Pick one of: ${client.schedulable_codes.join(" / ") || "—"}.`,
      };
    }
    if (asOk.data.start >= asOk.data.end) {
      return { kind: "ask", question: "End time must be after start time — what's the window?" };
    }

    const days = Array.from(new Set(asOk.data.days)).sort((a, b) => a - b);
    const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const dayLabel = days.map((d) => DAYS[d]).join(" / ");
    const summary = `${asOk.data.code} · ${client.name} · ${staff.name} · ${dayLabel} · ${asOk.data.start}–${asOk.data.end} · ${asOk.data.recurrence === "weekly" ? "every week" : "this week only"}`;

    return {
      kind: "ok",
      client_id: client.id,
      client_name: client.name,
      staff_id: staff.id,
      staff_name: staff.name,
      code: asOk.data.code,
      days,
      start: asOk.data.start,
      end: asOk.data.end,
      recurrence: asOk.data.recurrence,
      summary,
    };
  });
