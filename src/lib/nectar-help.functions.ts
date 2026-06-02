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

// ─── Data-facts gathering ──────────────────────────────────────────────────
// NECTAR must answer from real data, not deflect. Before calling the model we
// gather a structured snapshot of the user's organization scoped to their role
// and pass it as ground truth. The model is then instructed to answer DIRECTLY
// from the snapshot — never "I don't know, go check yourself".

// Loose shape — we only call the small subset of the Supabase client surface
// we need, and the auth-middleware client already enforces RLS for this user.
type SupabaseLike = {
  from: (table: string) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
};

interface RequirementFact {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  applies_to: string | null;
  source_citation: string | null;
  review_status: string;
  origin: string;
  source_document_title: string | null;
}

interface AuthoritativeSourceFact {
  id: string;
  title: string;
  authoritative_kind: string | null;
  jurisdiction: string | null;
  excerpts: string[];
}

interface OrgFacts {
  organization_id: string | null;
  role: string;
  scope: "organization" | "self";
  generated_at: string;
  totals: {
    clients_active: number | null;
    clients_total: number | null;
    staff_active: number | null;
    pba_accounts: number | null;
    requirements_confirmed: number | null;
    authoritative_sources: number | null;
  };
  service_codes: {
    all_distinct: string[];
    referenced_in_question: Array<{ code: string; client_count: number }>;
  };
  client_matches: Array<{
    id: string;
    name: string;
    status: string;
    service_codes: string[];
  }>;
  requirements: RequirementFact[];
  authoritative_sources: AuthoritativeSourceFact[];
  notes: string[];
}

const STOPWORDS = new Set([
  "the","a","an","and","or","of","to","in","for","on","at","by","with","from","is","are","be",
  "what","which","who","whom","that","this","these","those","do","does","did","have","has","had",
  "will","would","should","can","could","may","might","must","i","you","we","they","it","my",
  "your","our","their","its","as","if","then","than","there","here","about","into","within",
  "over","under","between","also","any","all","some","each","per","not","no","yes","how","when",
  "where","why","need","needs","require","required","requires"
]);

function questionKeywords(q: string): string[] {
  const tokens = q.toLowerCase().match(/[a-z][a-z0-9-]{2,}/g) ?? [];
  const out = new Set<string>();
  for (const t of tokens) if (!STOPWORDS.has(t)) out.add(t);
  return Array.from(out).slice(0, 12);
}

function findExcerpts(text: string, keywords: string[], max = 4): string[] {
  if (!text || keywords.length === 0) return [];
  const sentences = text.split(/(?<=[.!?])\s+(?=[A-Z0-9])/).filter((s) => s.length > 20 && s.length < 600);
  const scored: Array<{ s: string; n: number }> = [];
  for (const s of sentences) {
    const lower = s.toLowerCase();
    let n = 0;
    for (const k of keywords) if (lower.includes(k)) n += 1;
    if (n > 0) scored.push({ s: s.trim(), n });
  }
  scored.sort((a, b) => b.n - a.n);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const { s } of scored) {
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
    if (out.length >= max) break;
  }
  return out;
}

// Common DSPD / waiver service-code tokens NECTAR should recognise.
const SERVICE_CODE_TOKENS = [
  "PBA", "DSI", "DSL", "RES", "HCBS", "HHS", "ELS", "EVV", "PCSP",
  "S5100", "S5101", "S5102", "S5125", "S5126", "S5135", "S5136", "S5150",
  "T1019", "T1020", "T2017", "T2021", "T2022", "T2025",
];

function detectServiceCodes(q: string): string[] {
  const upper = q.toUpperCase();
  const hits = new Set<string>();
  for (const t of SERVICE_CODE_TOKENS) {
    const re = new RegExp(`(^|[^A-Z0-9])${t}([^A-Z0-9]|$)`);
    if (re.test(upper)) hits.add(t);
  }
  return Array.from(hits);
}

async function gatherFacts(
  supabase: SupabaseLike,
  userId: string,
  role: string,
  question: string,
): Promise<OrgFacts> {
  const facts: OrgFacts = {
    organization_id: null,
    role,
    scope: role === "employee" || role === "host_family" ? "self" : "organization",
    generated_at: new Date().toISOString(),
    totals: {
      clients_active: null, clients_total: null, staff_active: null, pba_accounts: null,
      requirements_confirmed: null, authoritative_sources: null,
    },
    service_codes: { all_distinct: [], referenced_in_question: [] },
    client_matches: [],
    requirements: [],
    authoritative_sources: [],
    notes: [],
  };

  try {
    const memQ = await supabase
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", userId)
      .eq("active", true)
      .limit(1);
    const orgId = (memQ.data as Array<{ organization_id: string }> | null)?.[0]?.organization_id ?? null;
    facts.organization_id = orgId;
    if (!orgId) {
      facts.notes.push("No active organization membership for this user.");
      return facts;
    }

    const [clientsActive, clientsTotal, staffActive, pbaAll, allCodes] = await Promise.all([
      supabase.from("clients").select("id", { count: "exact", head: true }).eq("organization_id", orgId).eq("account_status", "active"),
      supabase.from("clients").select("id", { count: "exact", head: true }).eq("organization_id", orgId),
      supabase.from("organization_members").select("id", { count: "exact", head: true }).eq("organization_id", orgId).eq("active", true),
      supabase.from("pba_accounts").select("id", { count: "exact", head: true }).eq("organization_id", orgId),
      supabase.from("client_billing_codes").select("service_code,client_id").eq("organization_id", orgId).limit(1000),
    ]);

    facts.totals.clients_active = clientsActive.count ?? 0;
    facts.totals.clients_total = clientsTotal.count ?? 0;
    facts.totals.staff_active = staffActive.count ?? 0;
    facts.totals.pba_accounts = pbaAll.count ?? 0;

    const codeRows: Array<{ service_code: string; client_id: string }> = allCodes.data ?? [];
    facts.service_codes.all_distinct = Array.from(new Set(codeRows.map((r) => r.service_code))).sort();

    const detected = detectServiceCodes(question);
    for (const code of detected) {
      const clientIds = new Set<string>();
      if (code === "PBA") {
        const pbaClients = await supabase.from("pba_accounts").select("client_id").eq("organization_id", orgId);
        for (const r of (pbaClients.data ?? []) as Array<{ client_id: string }>) clientIds.add(r.client_id);
      }
      for (const r of codeRows) {
        if (r.service_code.toUpperCase().includes(code)) clientIds.add(r.client_id);
      }
      facts.service_codes.referenced_in_question.push({ code, client_count: clientIds.size });
    }

    // Best-effort client-name lookup for admin scope.
    if (facts.scope === "organization") {
      const tokens = (question.match(/[A-Z][a-zA-Z'-]{2,}/g) ?? [])
        .filter((t) => !SERVICE_CODE_TOKENS.includes(t.toUpperCase()))
        .slice(0, 4);
      const seen = new Set<string>();
      for (const tok of tokens) {
        const r = await supabase
          .from("clients")
          .select("id,first_name,last_name,account_status,authorized_dspd_codes")
          .eq("organization_id", orgId)
          .ilike("last_name", `${tok}%`)
          .limit(5);
        for (const c of (r.data ?? []) as Array<{ id: string; first_name: string; last_name: string; account_status: string; authorized_dspd_codes: string[] | null }>) {
          if (seen.has(c.id)) continue;
          seen.add(c.id);
          const codes = codeRows.filter((cr) => cr.client_id === c.id).map((cr) => cr.service_code);
          facts.client_matches.push({
            id: c.id,
            name: `${c.first_name} ${c.last_name}`,
            status: c.account_status,
            service_codes: Array.from(new Set([...(c.authorized_dspd_codes ?? []), ...codes])),
          });
        }
      }
    }
  } catch (e) {
    facts.notes.push(`Data lookup partial failure: ${e instanceof Error ? e.message : "unknown"}`);
  }

  return facts;
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
