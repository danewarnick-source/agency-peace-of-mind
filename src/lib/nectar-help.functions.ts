import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface NectarHelpReply {
  answer: string;
  deepLink: { path: string; label: string } | null;
  isDataRequest: boolean;
  followUps: string[];
}

interface AskInput { question: string; role: string }

function validate(input: unknown): AskInput {
  const i = (input ?? {}) as Record<string, unknown>;
  const question = typeof i.question === "string" ? i.question.trim() : "";
  const role = typeof i.role === "string" ? i.role : "employee";
  if (question.length < 2 || question.length > 1000) {
    throw new Error("Question must be 2–1000 characters.");
  }
  return { question, role };
}

const HIVE_NAV_GUIDE = `HIVE NAVIGATION MAP (use these paths verbatim — never invent screens):

ADMIN AREA (admin/manager/super_admin):
- /dashboard/records-desk — Records Desk: review submitted timesheets, daily logs, EVV punches, incidents.
- /dashboard/pba-ledger — PBA Trust Ledger: client personal-budget accounts, deposits, withdrawals, audit samples.
- /dashboard/scheduling — Scheduling: publish/edit staff shifts on a calendar.
- /dashboard/employees — Employees: staff roster, profiles, pay rates, certifications, role assignments.
- /dashboard/clients — Clients: client profiles, demographics, medications, documents, custom fields.
- /dashboard/teams — Teams & Homes: org structure, host-home sites, team membership.
- /dashboard/assignments — Caseload Assignment Center: per staff × client × service-code toggles.
- /dashboard/billing — Billing hub (admin-only, never visible to staff):
    · /dashboard/billing                 — Overview list of clients with annual vs used units.
    · /dashboard/billing/$clientId       — Per-client billing detail: Client Billing Codes (annual unit authorization, rate, unit type, MONTHLY MAX UNITS, renewal date) and live budget bars.
    · /dashboard/billing/nectar          — NECTAR utilization alerts + Ask NECTAR report builder.
    · /dashboard/billing/form520         — 520 billing view/export.
    · /dashboard/billing/imports         — Bulk-import authorizations from 520 paste.
- /dashboard/settings — Settings: time & pay categories, rounding rules, org-wide preferences.

STAFF AREA (employee/host_family):
- /dashboard                 — My Caseload.
- /dashboard/timeclock       — General Time Clock.
- /dashboard/daily-logs      — Daily logs and host-home daily workflow.
- /dashboard/courses         — My Trainings.

ROLE RULES: Staff & host-family NEVER see billing rates, dollar amounts, the 520 view, or other clients' data.`;

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
  if (res.status === 429) throw new Error("NECTAR is busy right now — please try again in a moment.");
  if (res.status === 402) throw new Error("AI workspace credits exhausted. Add credits to continue.");
  if (!res.ok) throw new Error(`AI error (${res.status}).`);
  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return json.choices?.[0]?.message?.content ?? "{}";
}

export const askNectarHelp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validate)
  .handler(async ({ data, context }): Promise<NectarHelpReply> => {
    const { supabase, userId } = context;
    const facts = await gatherFacts(supabase as unknown as SupabaseLike, userId, data.role, data.question);

    const system = `You are NECTAR, the expert system inside HIVE. You have direct access to the company's live data through the FACTS block below and you ANSWER FROM IT.

ABSOLUTE RULES — never violate:
1. NEVER say "I'm not sure without looking at your data", "you can check this yourself", "I'd need to look at your specific data", or any variant. The FACTS block IS the live data. Use it.
2. Lead with the DIRECT ANSWER as the first sentence — a definitive count, list, or fact derived from FACTS. The deepLink and follow-ups come AFTER, never instead of.
3. If FACTS shows 0 of something, say so plainly and definitively ("As of right now there are 0 current clients with PBA services in your company."). Do not hedge.
4. Never fabricate numbers. Every figure you state must come from FACTS. If a needed datum truly isn't in FACTS, say "I don't have that on file" — but still try to answer adjacent parts of the question from what IS in FACTS.
5. Pair every data answer with a deepLink to the screen where the user can verify or act on it.
6. For past-period questions ("FY24", "two plan years ago"), answer for that period and explicitly note the timeframe you used.

PERSONALITY: warm, confident, plain-language. 1–4 short sentences. The direct answer is the headline; the link and any follow-ups are secondary.

ROLE-AWARENESS: Current user role: "${data.role}". Scope of FACTS: "${facts.scope}".

${HIVE_NAV_GUIDE}

FACTS (live data, generated ${facts.generated_at}):
${JSON.stringify(facts, null, 2)}

OUTPUT FORMAT — return STRICT JSON only:
{
  "answer": "<direct answer first, 1–4 sentences>",
  "deepLink": { "path": "/dashboard/...", "label": "View <screen>" } | null,
  "isDataRequest": true | false,
  "followUps": ["<short follow-up>", "<another>"]
}`;

    const raw = await callAI(system, data.question);
    let parsed: Partial<NectarHelpReply> = {};
    try { parsed = JSON.parse(raw); } catch {
      const m = raw.match(/\{[\s\S]*\}/);
      if (m) { try { parsed = JSON.parse(m[0]); } catch { /* ignore */ } }
    }

    const answer = typeof parsed.answer === "string" && parsed.answer.trim().length > 0
      ? parsed.answer.trim()
      : "I don't have that on file yet — try rephrasing and I'll look again.";
    const dl = parsed.deepLink && typeof parsed.deepLink === "object"
      ? parsed.deepLink as { path?: unknown; label?: unknown }
      : null;
    const deepLink = dl && typeof dl.path === "string" && dl.path.startsWith("/dashboard")
      ? { path: dl.path, label: typeof dl.label === "string" && dl.label.trim() ? dl.label : "Take me there" }
      : null;
    const followUps = Array.isArray(parsed.followUps)
      ? parsed.followUps.filter((s): s is string => typeof s === "string").slice(0, 4)
      : [];

    return {
      answer,
      deepLink,
      isDataRequest: !!parsed.isDataRequest,
      followUps,
    };
  });

// ─── Escalation to HIVE team ───────────────────────────────────────────────

interface EscalateInput {
  question: string;
  context: string;
}

function validateEscalate(input: unknown): EscalateInput {
  const i = (input ?? {}) as Record<string, unknown>;
  const question = typeof i.question === "string" ? i.question.trim() : "";
  const context = typeof i.context === "string" ? i.context.trim() : "";
  if (question.length < 2 || question.length > 2000) {
    throw new Error("Question must be 2–2000 characters.");
  }
  return { question, context: context.slice(0, 8000) };
}

export const escalateHelpToHive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validateEscalate)
  .handler(async ({ data, context }): Promise<{ ticketId: string; status: string }> => {
    const { supabase, userId } = context;

    const { data: memberships } = await supabase
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", userId)
      .eq("active", true)
      .limit(1);
    const orgId = memberships?.[0]?.organization_id;
    if (!orgId) throw new Error("No active organization membership.");

    const subject = data.question.length > 120 ? data.question.slice(0, 117) + "…" : data.question;

    const { data: inserted, error } = await supabase
      .from("org_support_tickets")
      .insert({
        organization_id: orgId,
        opened_by: userId,
        source: "nectar_help",
        subject,
        body: data.context ? `${data.question}\n\n— Recent NECTAR context —\n${data.context}` : data.question,
        status: "submitted",
        severity: "normal",
      })
      .select("id, status")
      .single();
    if (error) throw error;

    return { ticketId: inserted.id, status: inserted.status };
  });

interface TicketStatusInput { ticketId: string }
function validateStatusInput(input: unknown): TicketStatusInput {
  const i = (input ?? {}) as Record<string, unknown>;
  const ticketId = typeof i.ticketId === "string" ? i.ticketId : "";
  if (!/^[0-9a-f-]{36}$/i.test(ticketId)) throw new Error("Invalid ticket id.");
  return { ticketId };
}

export const getHelpTicketStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validateStatusInput)
  .handler(async ({ data, context }): Promise<{ status: string; updated_at: string } | null> => {
    const { supabase } = context;
    const { data: t } = await supabase
      .from("org_support_tickets")
      .select("status, updated_at")
      .eq("id", data.ticketId)
      .maybeSingle();
    return t ?? null;
  });
