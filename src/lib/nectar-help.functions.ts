import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireOrgMembership } from "@/integrations/supabase/require-org";

import { gatewayFetch } from "@/lib/ai-bedrock.server";

export interface NectarHelpReply {
  answer: string;
  deepLink: { path: string; label: string } | null;
  isDataRequest: boolean;
  followUps: string[];
}

interface AskInput { question: string; role: string; organizationId: string }

const UUID_RE = /^[0-9a-f-]{36}$/i;

function validate(input: unknown): AskInput {
  const i = (input ?? {}) as Record<string, unknown>;
  const question = typeof i.question === "string" ? i.question.trim() : "";
  const role = typeof i.role === "string" ? i.role : "employee";
  const organizationId = typeof i.organizationId === "string" ? i.organizationId : "";
  if (question.length < 2 || question.length > 1000) {
    throw new Error("Question must be 2–1000 characters.");
  }
  if (!UUID_RE.test(organizationId)) throw new Error("Invalid organizationId.");
  return { question, role, organizationId };
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
  const res = await gatewayFetch({
      model: "bedrock",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
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
  excerpts: Array<{ excerpt: string; score: number }>;
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
  for (const t of tokens) {
    if (STOPWORDS.has(t)) continue;
    out.add(t);
    // Light stemming so "trainings" matches "training", "hires" matches "hire".
    if (t.endsWith("ies") && t.length > 4) out.add(t.slice(0, -3) + "y");
    else if (t.endsWith("ing") && t.length > 5) out.add(t.slice(0, -3));
    else if (t.endsWith("ed") && t.length > 4) out.add(t.slice(0, -2));
    else if (t.endsWith("s") && t.length > 3) out.add(t.slice(0, -1));
  }
  // Conservative domain synonym expansion — helps "training" hit "orientation",
  // "onboarding", "competency", "in-service", etc. that appear in SOW/contracts.
  const synonyms: Record<string, string[]> = {
    training: ["train", "orientation", "onboarding", "in-service", "inservice", "course", "education", "competency", "instruction", "curriculum"],
    train: ["training"],
    hire: ["hired", "hiring", "employment", "employee", "new"],
    staff: ["employee", "personnel", "worker", "caregiver", "dsp", "direct-support"],
    requirement: ["require", "required", "must", "shall"],
    certification: ["certified", "certificate", "credential"],
    cpr: ["first-aid", "first aid", "bls"],
  };
  for (const k of Array.from(out)) {
    const syns = synonyms[k];
    if (syns) for (const s of syns) out.add(s);
  }
  return Array.from(out).slice(0, 40);
}

function findExcerpts(text: string, keywords: string[], max = 14): Array<{ excerpt: string; score: number }> {
  if (!text || keywords.length === 0) return [];
  // Split on sentence boundaries AND paragraph breaks so multi-sentence procedures stay together.
  const chunks = text
    .split(/(?<=[.!?])\s+(?=[A-Z0-9(])|\n{2,}/)
    .map((s) => s.trim())
    .filter((s) => s.length > 20 && s.length < 900);
  const scored: Array<{ excerpt: string; score: number }> = [];
  for (const s of chunks) {
    const lower = s.toLowerCase();
    let n = 0;
    for (const k of keywords) if (lower.includes(k)) n += 1;
    if (n > 0) scored.push({ excerpt: s, score: n });
  }
  scored.sort((a, b) => b.score - a.score);
  const seen = new Set<string>();
  const out: Array<{ excerpt: string; score: number }> = [];
  for (const item of scored) {
    if (seen.has(item.excerpt)) continue;
    seen.add(item.excerpt);
    out.push(item);
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
  _userId: string,
  role: string,
  question: string,
  orgId: string,
): Promise<OrgFacts> {
  const facts: OrgFacts = {
    organization_id: orgId,
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

    // ─── Requirements + authoritative sources (admin scope only) ─────────────
    if (facts.scope === "organization") {
      const keywords = questionKeywords(question);

      // Pull confirmed + needs_attention requirements with their source docs.
      const reqQ = await supabase
        .from("nectar_requirements")
        .select("id,title,description,category,applies_to,source_citation,review_status,origin,source_document_id")
        .eq("organization_id", orgId)
        .neq("review_status", "removed")
        .limit(500);
      const reqRows = (reqQ.data ?? []) as Array<{
        id: string; title: string; description: string | null; category: string | null;
        applies_to: string | null; source_citation: string | null; review_status: string;
        origin: string; source_document_id: string | null;
      }>;

      // Look up source document titles for citation context.
      const docIds = Array.from(new Set(reqRows.map((r) => r.source_document_id).filter((x): x is string => !!x)));
      const docTitles = new Map<string, string>();
      if (docIds.length > 0) {
        const docQ = await supabase
          .from("nectar_documents")
          .select("id,title")
          .in("id", docIds);
        for (const d of (docQ.data ?? []) as Array<{ id: string; title: string }>) {
          docTitles.set(d.id, d.title);
        }
      }

      // Rank requirements: confirmed first, then by keyword hits in title/description/citation.
      const scored = reqRows.map((r) => {
        const hay = `${r.title} ${r.description ?? ""} ${r.category ?? ""} ${r.applies_to ?? ""} ${r.source_citation ?? ""}`.toLowerCase();
        let score = 0;
        for (const k of keywords) if (hay.includes(k)) score += 1;
        if (r.review_status === "confirmed") score += 0.5;
        return { r, score };
      });
      scored.sort((a, b) => b.score - a.score);
      facts.requirements = scored
        .slice(0, keywords.length > 0 ? 40 : 80)
        .map(({ r }) => ({
          id: r.id,
          title: r.title,
          description: r.description,
          category: r.category,
          applies_to: r.applies_to,
          source_citation: r.source_citation,
          review_status: r.review_status,
          origin: r.origin,
          source_document_title: r.source_document_id ? docTitles.get(r.source_document_id) ?? null : null,
        }));
      facts.totals.requirements_confirmed = reqRows.filter((r) => r.review_status === "confirmed").length;

      // Authoritative source documents with keyword-matched excerpts from raw_text.
      const srcQ = await supabase
        .from("nectar_documents")
        .select("id,title,authoritative_kind,jurisdiction,raw_text")
        .eq("organization_id", orgId)
        .eq("is_authoritative_source", true)
        .limit(50);
      const srcRows = (srcQ.data ?? []) as Array<{
        id: string; title: string; authoritative_kind: string | null;
        jurisdiction: string | null; raw_text: string | null;
      }>;
      facts.totals.authoritative_sources = srcRows.length;
      const withExcerpts = srcRows.map((s) => ({
        id: s.id,
        title: s.title,
        authoritative_kind: s.authoritative_kind,
        jurisdiction: s.jurisdiction,
        excerpts: findExcerpts(s.raw_text ?? "", keywords, 14),
      }));
      // Prefer sources that actually have matching excerpts; keep the full set so
      // SOW + contract + DSPD docs all contribute to topic-wide answers.
      withExcerpts.sort((a, b) => b.excerpts.length - a.excerpts.length);
      facts.authoritative_sources = withExcerpts.filter((s) => s.excerpts.length > 0).slice(0, 20);
      // If keyword matching found nothing, still include a small sample so the
      // model can confirm sources exist and recommend opening them.
      if (facts.authoritative_sources.length === 0) {
        facts.authoritative_sources = withExcerpts.slice(0, 5);
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
    await requireOrgMembership(supabase, userId, data.organizationId, "employee");
    const facts = await gatherFacts(supabase as unknown as SupabaseLike, userId, data.role, data.question, data.organizationId);

    const system = `You are NECTAR, the expert system inside HIVE. You have direct access to the company's live data through the FACTS block below and you ANSWER FROM IT.

ABSOLUTE RULES — never violate:
1. NEVER say "I'm not sure without looking at your data", "you can check this yourself", "I'd need to look at your specific data", or any variant. The FACTS block IS the live data. Use it.
2. Lead with the DIRECT ANSWER as the first sentence — a definitive count, list, or fact derived from FACTS. The deepLink and follow-ups come AFTER, never instead of.
3. If FACTS shows 0 of something, say so plainly and definitively ("As of right now there are 0 current clients with PBA services in your company."). Do not hedge.
4. Never fabricate numbers. Every figure you state must come from FACTS. Before saying "I don't have that on file", you MUST scan FACTS.requirements AND FACTS.authoritative_sources.excerpts — if a matching requirement or excerpt exists, ANSWER FROM IT and cite source_citation or the source document title. Only say "I don't have that on file" if no requirement, excerpt, or count in FACTS is relevant.
5. Pair every data answer with a deepLink to the screen where the user can verify or act on it.
6. For past-period questions ("FY24", "two plan years ago"), answer for that period and explicitly note the timeframe you used.
7. REQUIREMENTS & AUTHORITATIVE SOURCES are primary data, not background. When the question is about rules/obligations/timelines/training/policy, you MUST scan BOTH and return EVERYTHING relevant — not just the first match.
   - Step A — Confirmed requirements: from FACTS.requirements where review_status="confirmed", list every item whose title/description/citation matches the topic.
   - Step B — Raw source text: from FACTS.authoritative_sources[*].excerpts, list EVERY excerpt that matches the topic (do not pick just one).
   - Also include needs_attention / drafted requirements under Step B.
   - Never collapse multiple distinct provisions into one sentence — if the SOW lists four trainings, return four bullets, each with its own citation.
   - When Step B has any content, set deepLink to /dashboard/authoritative-sources.
   - You answer factual lookups, but do NOT issue compliance verdicts. If asked for a verdict, state the facts and recommend an admin make the call.

ANSWER FORMATTING — strict markdown, no exceptions:
- The "answer" field is rendered as markdown. Use clean markdown. Never include literal "###" or stray "**" — use real markdown syntax.
- Structure:
  1. First line: a plain-language one-sentence summary (no heading, no bullet) that answers the question directly.
  2. Then, if relevant requirements/excerpts exist, ONE OR BOTH of these sections, each introduced by a bold label on its own line — NOT an "#" heading:
     - "**Confirmed**" — bullets from Step A.
     - "**From your sources (not yet reviewed)**" — bullets from Step B, followed by a single italic line: "_Recommend reviewing these in Authoritative Sources to confirm them as requirements._"
- Each bullet is ONE short sentence stating the rule plainly, followed by a compact citation tag in backticks at the end. Format the citation as \`SOURCE_SHORT · LOCATOR\`, e.g. \`SOW · 1.8\`, \`DSPD Contract · Art 10\`, \`In-Home Respite SOW · Staff Training\`. Keep the source short — strip filenames/extensions, use the document's friendly title.
- Do NOT use long inline parentheses for citations. Do NOT repeat the same citation across consecutive bullets — group them.
- Keep bullets concise (≤ 30 words each). Quote source text only when the exact wording matters; otherwise paraphrase plainly.
- For simple count/lookup questions (no requirements/excerpts involved) skip the sections entirely and return just the 1–3 sentence answer.
- No "###" markdown headings anywhere. Bold labels only.

PERSONALITY: warm, confident, plain-language. Length matches the data — never truncate relevant excerpts to stay short, but never pad either.

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
  organizationId: string;
}

function validateEscalate(input: unknown): EscalateInput {
  const i = (input ?? {}) as Record<string, unknown>;
  const question = typeof i.question === "string" ? i.question.trim() : "";
  const context = typeof i.context === "string" ? i.context.trim() : "";
  const organizationId = typeof i.organizationId === "string" ? i.organizationId : "";
  if (question.length < 2 || question.length > 2000) {
    throw new Error("Question must be 2–2000 characters.");
  }
  if (!UUID_RE.test(organizationId)) throw new Error("Invalid organizationId.");
  return { question, context: context.slice(0, 8000), organizationId };
}

export const escalateHelpToHive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validateEscalate)
  .handler(async ({ data, context }): Promise<{ ticketId: string; status: string }> => {
    const { supabase, userId } = context;
    const orgId = data.organizationId;
    await requireOrgMembership(supabase, userId, orgId, "employee");


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
