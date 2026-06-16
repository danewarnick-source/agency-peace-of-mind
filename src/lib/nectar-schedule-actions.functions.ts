/**
 * NECTAR scheduling actions — conversational + import.
 *
 * Reuses the existing Lovable AI Gateway integration (same fetch shape as
 * src/lib/nectar-schedule-parse.functions.ts). Returns a STRUCTURED PROPOSAL;
 * never writes. The UI shows the proposed actions as a reviewable draft.
 * Approval triggers the Phase-2 saveShift mutation in the browser, scoped to
 * the caller's org by RLS + the explicit org filter we already apply.
 *
 * NOTE (PHI / BAA): This route currently runs on the Lovable AI Gateway
 * because the platform is on FAKE DATA ONLY. Before any real PHI flows, the
 * NECTAR AI layer must move to AWS Bedrock under BAA (pre-launch checklist).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ClientRef = z.object({
  id: z.string(),
  name: z.string(),
  team_id: z.string().nullable(),
  team_name: z.string().nullable(),
  schedulable_codes: z.array(z.string()).default([]),
});
const StaffRef = z.object({ id: z.string(), name: z.string() });
const TeamRef = z.object({ id: z.string(), name: z.string() });
const ShiftRef = z.object({
  id: z.string(),
  client_id: z.string(),
  staff_id: z.string(),
  job_code: z.string().nullable(),
  starts_at: z.string(),
  ends_at: z.string(),
});

const ContextSchema = z.object({
  clients: z.array(ClientRef).max(800),
  staff: z.array(StaffRef).max(800),
  teams: z.array(TeamRef).max(200),
  shifts: z.array(ShiftRef).max(800),
  week_start_iso: z.string(),
});

const ConvInput = ContextSchema.extend({
  sentence: z.string().min(2).max(800),
});

const ImportInput = ContextSchema.extend({
  raw_text: z.string().min(2).max(60_000),
});

// ─── Action schema returned to the UI ──────────────────────────────────────
export type ProposedAction =
  | {
      op: "create";
      client_id: string;
      client_name: string;
      staff_id: string;
      staff_name: string;
      team_id: string | null;
      team_name: string | null;
      job_code: string;
      starts_at: string; // ISO
      ends_at: string;   // ISO
      reason: string;
    }
  | {
      op: "reassign";
      shift_id: string;
      from_staff_id: string;
      from_staff_name: string;
      to_staff_id: string;
      to_staff_name: string;
      reason: string;
    }
  | {
      op: "edit";
      shift_id: string;
      client_name: string;
      staff_name: string;
      current: { starts_at: string; ends_at: string; job_code: string | null };
      patch: { starts_at?: string; ends_at?: string; job_code?: string };
      reason: string;
    };

export type Unmatched = { line: string; reason: string };
export type AskReplyOption = { id: string; label: string };
export type NectarProposal =
  | {
      kind: "ask";
      question: string;
      reply_type?: "yes_no" | "options" | "text";
      options?: AskReplyOption[];
    }
  | { kind: "ok"; actions: ProposedAction[]; unmatched: Unmatched[]; summary: string };

// ─── Shared gateway call (AWS Bedrock / Claude via Converse API) ───────────
async function callGateway(_apiKey: string, system: string, user: string) {
  const { callBedrockChatCompletions, BedrockError } = await import("@/lib/ai-bedrock.server");
  try {
    const json = await callBedrockChatCompletions({
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
    });
    return json.choices?.[0]?.message?.content ?? "{}";
  } catch (e) {
    if (e instanceof BedrockError) {
      if (e.status === 429) throw new Error("NECTAR is busy — try again in a moment.");
      if (e.status === 401) throw new Error(e.message);
      throw new Error(`AI error (${e.status}): ${e.message}`);
    }
    throw e;
  }
}

// Parse a model response that should be JSON. Strips code fences, falls back
// to extracting the first {...} block. Throws with a snippet of the raw
// output if it still won't parse, so callers can surface what the model said.
function parseModelJson(raw: string, label: string): unknown {
  const cleaned = raw.replace(/```json\s*|```/gi, "").trim();
  try { return JSON.parse(cleaned); } catch { /* fall through */ }
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (match) {
    try { return JSON.parse(match[0]); } catch { /* fall through */ }
  }
  // Model output can quote client/staff names from the schedule — never log it.
  console.error(`[${label}] non-JSON model output (${raw.length} chars)`);
  const snippet = raw.trim().slice(0, 300).replace(/\s+/g, " ");
  throw new Error(`NECTAR returned an unexpected response: ${snippet || "(empty)"}`);
}

// ─── Action validators (resolve names → IDs against context) ───────────────
const RawCreate = z.object({
  op: z.literal("create"),
  client_id: z.string(),
  staff_id: z.string(),
  job_code: z.string(),
  starts_at: z.string(),
  ends_at: z.string(),
  reason: z.string().optional().default(""),
});
const RawReassign = z.object({
  op: z.literal("reassign"),
  shift_id: z.string(),
  to_staff_id: z.string(),
  reason: z.string().optional().default(""),
});
const RawEdit = z.object({
  op: z.literal("edit"),
  shift_id: z.string(),
  starts_at: z.string().optional(),
  ends_at: z.string().optional(),
  job_code: z.string().optional(),
  reason: z.string().optional().default(""),
});
const RawAction = z.union([RawCreate, RawReassign, RawEdit]);
const Ask = z.object({
  kind: z.literal("ask"),
  question: z.string().min(1).max(400),
  reply_type: z.enum(["yes_no", "options", "text"]).optional(),
  options: z
    .array(z.object({ id: z.string().min(1).max(40), label: z.string().min(1).max(80) }))
    .max(5)
    .optional(),
});
const Ok = z.object({
  kind: z.literal("ok"),
  actions: z.array(RawAction).max(200),
  unmatched: z.array(z.object({ line: z.string(), reason: z.string() })).optional().default([]),
});

function validateAndResolve(
  parsed: unknown,
  ctx: z.infer<typeof ContextSchema>,
): NectarProposal {
  const asAsk = Ask.safeParse(parsed);
  if (asAsk.success) return asAsk.data;
  const asOk = Ok.safeParse(parsed);
  if (!asOk.success) {
    return { kind: "ask", question: "I couldn't structure that. Try naming a person, a date/time window, and what to do." };
  }
  const clientById = new Map(ctx.clients.map((c) => [c.id, c] as const));
  const staffById = new Map(ctx.staff.map((s) => [s.id, s] as const));
  const teamById = new Map(ctx.teams.map((t) => [t.id, t] as const));
  const shiftById = new Map(ctx.shifts.map((s) => [s.id, s] as const));

  const out: ProposedAction[] = [];
  const dropped: Unmatched[] = [];

  for (const a of asOk.data.actions) {
    if (a.op === "create") {
      const c = clientById.get(a.client_id);
      const s = staffById.get(a.staff_id);
      if (!c) { dropped.push({ line: JSON.stringify(a), reason: "Unknown client" }); continue; }
      if (!s) { dropped.push({ line: JSON.stringify(a), reason: "Unknown staff" }); continue; }
      if (!c.schedulable_codes.includes(a.job_code)) {
        dropped.push({ line: JSON.stringify(a), reason: `Code ${a.job_code} not authorized for ${c.name}` }); continue;
      }
      const sa = Date.parse(a.starts_at); const ea = Date.parse(a.ends_at);
      if (Number.isNaN(sa) || Number.isNaN(ea) || ea <= sa) {
        dropped.push({ line: JSON.stringify(a), reason: "Bad start/end" }); continue;
      }
      const team = c.team_id ? teamById.get(c.team_id) ?? null : null;
      out.push({
        op: "create",
        client_id: c.id, client_name: c.name,
        staff_id: s.id, staff_name: s.name,
        team_id: c.team_id, team_name: team?.name ?? c.team_name ?? null,
        job_code: a.job_code,
        starts_at: new Date(sa).toISOString(),
        ends_at: new Date(ea).toISOString(),
        reason: a.reason || "",
      });
    } else if (a.op === "reassign") {
      const sh = shiftById.get(a.shift_id);
      const to = staffById.get(a.to_staff_id);
      if (!sh) { dropped.push({ line: JSON.stringify(a), reason: "Unknown shift" }); continue; }
      if (!to) { dropped.push({ line: JSON.stringify(a), reason: "Unknown new staff" }); continue; }
      const from = staffById.get(sh.staff_id);
      out.push({
        op: "reassign",
        shift_id: sh.id,
        from_staff_id: sh.staff_id, from_staff_name: from?.name ?? "Staff",
        to_staff_id: to.id, to_staff_name: to.name,
        reason: a.reason || "",
      });
    } else {
      const sh = shiftById.get(a.shift_id);
      if (!sh) { dropped.push({ line: JSON.stringify(a), reason: "Unknown shift" }); continue; }
      const patch: { starts_at?: string; ends_at?: string; job_code?: string } = {};
      if (a.starts_at) {
        const t = Date.parse(a.starts_at);
        if (!Number.isNaN(t)) patch.starts_at = new Date(t).toISOString();
      }
      if (a.ends_at) {
        const t = Date.parse(a.ends_at);
        if (!Number.isNaN(t)) patch.ends_at = new Date(t).toISOString();
      }
      if (a.job_code) {
        const c = clientById.get(sh.client_id);
        if (c && !c.schedulable_codes.includes(a.job_code)) {
          dropped.push({ line: JSON.stringify(a), reason: `Code ${a.job_code} not authorized for client` }); continue;
        }
        patch.job_code = a.job_code;
      }
      if (Object.keys(patch).length === 0) {
        dropped.push({ line: JSON.stringify(a), reason: "Edit has no changes" }); continue;
      }
      const c = clientById.get(sh.client_id);
      const s = staffById.get(sh.staff_id);
      out.push({
        op: "edit",
        shift_id: sh.id,
        client_name: c?.name ?? "Client",
        staff_name: s?.name ?? "Staff",
        current: { starts_at: sh.starts_at, ends_at: sh.ends_at, job_code: sh.job_code },
        patch,
        reason: a.reason || "",
      });
    }
  }

  for (const u of asOk.data.unmatched ?? []) dropped.push(u);

  const summary =
    out.length === 0
      ? "No actionable changes — see unmatched."
      : `${out.length} proposed change${out.length === 1 ? "" : "s"}` +
        (dropped.length ? ` · ${dropped.length} unmatched` : "");

  return { kind: "ok", actions: out, unmatched: dropped, summary };
}

// ─── Conversational scheduling ─────────────────────────────────────────────
export const proposeSchedulingActions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ConvInput.parse(input))
  .handler(async ({ data }): Promise<NectarProposal> => {
    // Bedrock credentials are validated inside callBedrockChatCompletions /
    // getClient(). No LOVABLE_API_KEY check — NECTAR routes to AWS Bedrock.
    const apiKey = "";

    const system = `You are NECTAR, a scheduling assistant for a residential / day-services agency.
You translate a manager's natural-language request into a STRUCTURED PROPOSAL of
shift actions. You NEVER write to the database — the UI shows your proposal and
the manager approves or discards it.

Return strict JSON, ONE of:

1) { "kind": "ask", "question": "<one short specific question>", "reply_type": "yes_no" | "options" | "text", "options"?: [{ "id": "...", "label": "..." }] }
2) {
     "kind": "ok",
     "actions": [
       { "op": "create",   "client_id": "...", "staff_id": "...", "job_code": "...", "starts_at": "<ISO>", "ends_at": "<ISO>", "reason": "..." },
       { "op": "reassign", "shift_id": "...", "to_staff_id": "...", "reason": "..." },
       { "op": "edit",     "shift_id": "...", "starts_at": "<ISO>?", "ends_at": "<ISO>?", "job_code": "...?", "reason": "..." }
     ],
     "unmatched": [{ "line": "...", "reason": "..." }]
   }

Hard rules:
- Use ONLY IDs from the provided context (clients, staff, teams, shifts). Never invent.
- Match a client to a site/team via their team_id; do not assign cross-site.
- Pick a job_code only from that client's schedulable_codes.
- Times must be full ISO 8601 with the local offset. The week starts at week_start_iso (Sunday).
- For phrases like "this week" use days within [week_start, week_start + 7d).
- Prefer "reassign" when the user describes giving an existing shift to another staffer; prefer "create" when they describe a brand-new slot.
- If the user is ambiguous (which client? which day? which code?) return "ask" with ONE specific question.
- When you return "ask", also set "reply_type":
  - "yes_no" when the answer is strictly yes/no (omit "options").
  - "options" with 2–5 short labels when there are concrete alternatives (e.g. specific days, specific staff, "Cancel the shift"). Use plain text labels; "id" can equal the label.
  - "text" (or omit reply_type entirely) when a free-form answer is needed.
- Return JSON ONLY.`;

    const user = JSON.stringify({
      sentence: data.sentence,
      week_start_iso: data.week_start_iso,
      teams: data.teams,
      clients: data.clients,
      staff: data.staff,
      shifts: data.shifts,
      today_iso: new Date().toISOString(),
    });

    const raw = await callGateway(apiKey, system, user);
    const parsed = parseModelJson(raw, "nectar-schedule");
    return validateAndResolve(parsed, data);
  });

// ─── Import (CSV / pasted schedule) ────────────────────────────────────────
export const proposeScheduleImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ImportInput.parse(input))
  .handler(async ({ data }): Promise<NectarProposal> => {
    // Bedrock credentials are validated inside callBedrockChatCompletions /
    // getClient(). No LOVABLE_API_KEY check — NECTAR routes to AWS Bedrock.
    const apiKey = "";

    const system = `You are NECTAR, importing a schedule from another scheduler.
The input is raw text — usually CSV with a header row, sometimes a pasted table.
Map each row to a CREATE action on scheduled_shifts. For rows you cannot
confidently match, put them in "unmatched" with a short reason.

Return strict JSON, ONE of:

1) { "kind": "ask", "question": "<one short specific question>", "reply_type": "yes_no" | "options" | "text", "options"?: [{ "id": "...", "label": "..." }] }
2) {
     "kind": "ok",
     "actions": [
       { "op": "create", "client_id": "...", "staff_id": "...", "job_code": "...", "starts_at": "<ISO>", "ends_at": "<ISO>", "reason": "row N" }
     ],
     "unmatched": [{ "line": "<original row text>", "reason": "..." }]
   }

Hard rules:
- Use ONLY IDs from the provided context. Match by case-insensitive first/last name for staff and clients.
- A client may appear with just first name; if it's unambiguous use it, otherwise put the row in "unmatched".
- Pick a job_code only from that client's schedulable_codes. If the code in the row is not in the list, put the row in "unmatched".
- Times must be full ISO 8601 with the local offset. Resolve dates from columns like "date", "shift_date", or combined "start"/"end".
- Skip the header row and any blank lines.
- If you must return "ask", also set "reply_type": "yes_no" for binary, "options" with 2–5 short labels for concrete choices, or "text" / omit for free-form.
- Return JSON ONLY.`;

    const user = JSON.stringify({
      raw_text: data.raw_text,
      week_start_iso: data.week_start_iso,
      teams: data.teams,
      clients: data.clients,
      staff: data.staff,
      today_iso: new Date().toISOString(),
    });

    const raw = await callGateway(apiKey, system, user);
    const parsed = parseModelJson(raw, "nectar-import");
    return validateAndResolve(parsed, data);
  });
