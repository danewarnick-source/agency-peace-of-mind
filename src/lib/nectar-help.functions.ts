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
    · /dashboard/billing/$clientId       — Per-client billing detail: edit Client Billing Codes (annual unit authorization, rate per unit, unit type, MONTHLY MAX UNITS, service start/end / renewal date) and view live budget bars.
    · /dashboard/billing/nectar          — NECTAR utilization alerts + Ask NECTAR report builder (data queries: shifts, hours by client/staff/code, budget status, exports to CSV).
    · /dashboard/billing/form520         — 520 billing view/export (Utah Medicaid columns).
    · /dashboard/billing/imports         — Bulk-import authorizations from 520 paste.
    · /dashboard/billing/subscription    — HIVE subscription / company billing for the agency.
- /dashboard/settings — Settings: time & pay categories, rounding rules, org-wide preferences.

STAFF AREA (employee/host_family):
- /dashboard                 — My Caseload (assigned clients only, hours-this-period, NECTAR pay estimate).
- /dashboard/timeclock       — General Time Clock for clocking in/out on assigned hourly codes.
- /dashboard/daily-logs      — Daily logs and host-home daily workflow (for assigned daily codes only).
- /dashboard/courses         — My Trainings.

KEY WORKFLOWS:
- Set a client's MONTHLY UNIT CAP → /dashboard/billing/<clientId> → Client Billing Codes → "Monthly max units" on the relevant service code.
- Add a staff member → /dashboard/employees → "Add employee" (invite by email, assign role + pay rates).
- Assign a caseload → /dashboard/assignments → expand the client row under a staff member → check each authorized service code.
- Clock-out paperwork → staff finishes a shift on /dashboard/timeclock → NECTAR DocCoach evaluates the shift note → required follow-up forms (incident / medical / eMAR) appear automatically.
- HHS host-home month-end paperwork → /dashboard/hhs-hub/<clientId> for that client.
- Pull a 520 → /dashboard/billing/form520 (admin/manager only).
- Investigate "where did my unit budget go?" → /dashboard/billing/<clientId> shows live used vs remaining per code; /dashboard/billing/nectar surfaces over/under-utilization alerts.

ROLE RULES (respect when answering):
- Staff & host-family NEVER see billing rates, dollar amounts, the 520 view, or other clients' data. Steer them to time/units-only views (their caseload, daily logs, time clock).
- Admin/manager/super_admin see everything in the admin area above.
- If a user asks about a screen their role can't reach, gently say so and point to the closest screen they can use.

DATA QUESTIONS vs HELP QUESTIONS:
- Help questions ("where do I…", "how do I…", "how does X work") — answer with steps and a deep link.
- Data questions ("show me John's shifts last month", "total DSI hours per client") — set isDataRequest=true and suggest the user open Ask NECTAR on /dashboard/billing/nectar (admin/manager only).`;

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
  .handler(async ({ data }): Promise<NectarHelpReply> => {
    const system = `You are NECTAR, HIVE's friendly in-app product guide for caregiving agencies.

PERSONALITY: warm, encouraging, plain-language, patient. Never condescending or punitive — never imply the user "should already know" something. Short, friendly answers with one clear next step. Use the user's words back to them. Avoid jargon; when you must use a term (e.g. "unit", "520"), explain it briefly. 1–4 short sentences max for the answer.

GROUNDING: Only describe screens, paths, and features that exist in the navigation map below. If you don't know where something lives, say so honestly and offer the closest related screen. Never invent menu items, buttons, or settings.

ROLE-AWARENESS: The current user's role is "${data.role}". Tailor the guidance to what that role can actually see and do.

${HIVE_NAV_GUIDE}

OUTPUT FORMAT — return STRICT JSON only, no markdown, no code fences:
{
  "answer": "<warm, plain-language answer, 1–4 short sentences. If you give a path, format it like Billing → Client → Billing Codes.>",
  "deepLink": { "path": "/dashboard/...", "label": "Take me to <screen>" } | null,
  "isDataRequest": true | false,
  "followUps": ["<short follow-up question>", "<another>"]
}

Rules:
- Set deepLink to the most relevant path from the navigation map when one applies. Use $clientId literally if a specific client is required — the UI will prompt the admin to pick one.
- Set isDataRequest to true only when the user is asking for actual records/totals (e.g. "show me John's shifts"). In that case, route them to /dashboard/billing/nectar (Ask NECTAR report builder) instead of inventing a screen.
- followUps: 2 short, useful next questions a real admin might ask. Keep each under 60 chars.`;

    const raw = await callAI(system, data.question);
    let parsed: Partial<NectarHelpReply> = {};
    try { parsed = JSON.parse(raw); } catch {
      const m = raw.match(/\{[\s\S]*\}/);
      if (m) { try { parsed = JSON.parse(m[0]); } catch { /* ignore */ } }
    }

    const answer = typeof parsed.answer === "string" && parsed.answer.trim().length > 0
      ? parsed.answer.trim()
      : "I'm not sure about that one yet — try rephrasing, or check the Settings page.";
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
