// Continuing Education (CE) — Phase 1 server functions.
// Phase 1 scope: schema/RLS, current-month Nectar-generated review,
// active-time + e-sig completion, immutable ledger.
// Phase 2 (later): dashboard reminder, header bell, admin roster + CSV.
//
// PHI GATE: AI generation runs through the existing Lovable AI path.
// It only fires when ce_settings.demo_mode = true for the org (intended for
// seeded test data only). When that HIPAA-compliant Bedrock path lands,
// swap callNectar() over and drop the demo-mode gate.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createHash } from "crypto";

import { gatewayFetch } from "@/lib/ai-bedrock.server";

// ──────────────── Types ────────────────────────────────────────────────────

export type CeStepLesson = {
  type: "lesson";
  kicker?: string;
  title: string;
  body: string;
  facts?: [string, string][];
  /** Source document(s)/clause(s) this lesson is built on (e.g. "Provider P&P §3.2"). */
  citation?: string;
};
export type CeStepCheck = {
  type: "check";
  kicker?: string;
  stem: string;
  options: { label: string; text: string; correct: boolean; feedback: string }[];
};
export type CeStep =
  | { type: "nectar"; body: string }
  | CeStepLesson
  | CeStepCheck
  | { type: "reflect"; kicker?: string; prompt: string };

export interface CeModule {
  id: string;
  staff_id: string;
  organization_id: string;
  period: string;
  status: "generating" | "ready" | "in_progress" | "completed" | "failed";
  steps: CeStep[];
  active_seconds: number;
  current_step: number;
  reflections: Record<string, string>;
  source_summary: string | null;
  generated_at: string | null;
  completed_at: string | null;
}

export interface CeLedgerEntry {
  id: string;
  ce_year_start: string;
  title: string;
  hours: number;
  active_minutes: number;
  type: "monthly" | "required" | "elective";
  source: string | null;
  completed_at: string;
  signature_name: string;
}

export interface CeStatus {
  hireDate: string | null;
  ceApplies: boolean;
  ceYearStart: string | null;
  ceYearEnd: string | null;
  hoursThisYear: number;
  goalHours: number;
  minActiveMinutes: number;
  daysLeftInYear: number;
  demoModeEnabled: boolean;
  isOrgAdmin: boolean;
  organizationId: string | null;
  currentPeriod: string;
  currentModule: CeModule | null;
  ledger: CeLedgerEntry[];
}

// ──────────────── Date helpers ─────────────────────────────────────────────

function todayUtc(): Date {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
}
function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function periodOf(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
function ceYearStart(hireIso: string, today = todayUtc()): Date {
  const h = new Date(hireIso + "T00:00:00Z");
  const cur = new Date(Date.UTC(today.getUTCFullYear(), h.getUTCMonth(), h.getUTCDate()));
  if (cur > today) cur.setUTCFullYear(cur.getUTCFullYear() - 1);
  return cur;
}
function ceYearEnd(start: Date): Date {
  const e = new Date(start);
  e.setUTCFullYear(e.getUTCFullYear() + 1);
  e.setUTCDate(e.getUTCDate() - 1);
  return e;
}
function ceApplies(hireIso: string, today = todayUtc()): boolean {
  const h = new Date(hireIso + "T00:00:00Z");
  const oneYr = new Date(h);
  oneYr.setUTCFullYear(oneYr.getUTCFullYear() + 1);
  return today >= oneYr;
}

// ──────────────── Org resolution ───────────────────────────────────────────

interface MembershipRow { organization_id: string; role: string }

// Shared helper: super_admin is deprecated (collapsed into admin) but still
// accepted defensively so any lingering legacy row keeps access.
const ADMIN_LIKE_ROLES = new Set(["admin", "manager", "owner", "super_admin"]);

async function getCallerOrg(
  supabase: ReturnType<typeof getSupabase>,
  userId: string,
): Promise<{ orgId: string | null; isAdmin: boolean }> {
  const { data } = await supabase
    .from("organization_members")
    .select("organization_id, role")
    .eq("user_id", userId)
    .eq("active", true)
    .order("created_at", { ascending: true })
    .limit(1);
  const row = (data as MembershipRow[] | null)?.[0];
  if (!row) return { orgId: null, isAdmin: false };
  return {
    orgId: row.organization_id,
    isAdmin: ADMIN_LIKE_ROLES.has(row.role),
  };
}

function getSupabase(ctx: unknown) {
  return (ctx as { supabase: { from: (t: string) => unknown; rpc: (f: string, a: unknown) => unknown } })
    .supabase as unknown as {
      from: (t: string) => any;
      rpc: (f: string, a: unknown) => any;
    };
}

// ──────────────── Step validation ──────────────────────────────────────────

function validateSteps(steps: unknown): CeStep[] {
  if (!Array.isArray(steps)) throw new Error("Module steps invalid (not array).");
  const out: CeStep[] = [];
  for (const s of steps as Record<string, unknown>[]) {
    const t = String(s.type ?? "");
    if (t === "nectar" && typeof s.body === "string") out.push({ type: "nectar", body: s.body });
    else if (t === "lesson" && typeof s.title === "string" && typeof s.body === "string") {
      out.push({
        type: "lesson",
        title: s.title,
        body: s.body,
        kicker: typeof s.kicker === "string" ? s.kicker : undefined,
        citation: typeof s.citation === "string" ? s.citation : undefined,
        facts: Array.isArray(s.facts)
          ? (s.facts as unknown[])
              .map((f) => (Array.isArray(f) && f.length >= 2 ? ([String(f[0]), String(f[1])] as [string, string]) : null))
              .filter(Boolean) as [string, string][]
          : undefined,
      });
    } else if (t === "check" && typeof s.stem === "string" && Array.isArray(s.options)) {
      const opts = (s.options as Record<string, unknown>[]).map((o, i) => ({
        label: typeof o.label === "string" ? o.label : String.fromCharCode(65 + i),
        text: String(o.text ?? ""),
        correct: Boolean(o.correct),
        feedback: String(o.feedback ?? ""),
      }));
      if (opts.length >= 2 && opts.some((o) => o.correct))
        out.push({ type: "check", kicker: typeof s.kicker === "string" ? s.kicker : undefined, stem: s.stem, options: opts });
    } else if (t === "reflect" && typeof s.prompt === "string") {
      out.push({ type: "reflect", kicker: typeof s.kicker === "string" ? s.kicker : "Reflection", prompt: s.prompt });
    }
  }
  const lessons = out.filter((s) => s.type === "lesson").length;
  const checks = out.filter((s) => s.type === "check").length;
  const reflects = out.filter((s) => s.type === "reflect").length;
  const totalSlides = out.length;
  // 30-slide / ~60-minute floor (≈2 minutes per slide). When sources are
  // genuinely thin the AI sets material_short=true and the caller treats it
  // as a hold-and-flag — we still require minimum teaching shape here.
  if (lessons < 3) throw new Error(`Module floor not met: needs ≥3 lessons (got ${lessons}).`);
  if (checks < 3) throw new Error(`Module floor not met: needs ≥3 scenario checks (got ${checks}).`);
  if (reflects !== 1) throw new Error("Module must end with exactly one reflection.");
  return out;
}

/** True when the generated module reaches the 30-slide / ~60-minute floor. */
function meetsFullHourFloor(steps: CeStep[]): boolean {
  return steps.length >= 30;
}

// ──────────────── Nectar AI call ───────────────────────────────────────────

async function callNectarForCe(prompt: string): Promise<{ steps: CeStep[]; materialShort: boolean; topicsNeedingSources: string[]; adminNotes: string }> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY is not configured.");

  const system = `You are NECTAR, a coaching engine that builds a monthly Continuing Education review for an experienced DSPD direct-support staff member.

ABSOLUTE GROUND RULE — verify-then-build, source-grounded teaching only.
You may build this review ONLY from:
  (a) the AUTHORITATIVE SOURCES the provider has uploaded (State SOW, contracts, DSPD/DHS requirements, the provider's own policies & procedures, person-specific care plans, and any approved curriculum the provider uploaded), AND
  (b) the staff member's factual event records for the prior month (incidents, medication events, caseload).

GENERATION PRIORITY (build in this order):
  1. ADMIN-SUGGESTED FOCUS TOPICS for this staff member (if any are provided). Treat each as WHAT TO FOCUS ON — never as authoritative content. For each topic, find the supporting passages in the authoritative sources and build grounded, cited teaching on it. If a suggested topic is not covered by any uploaded source, do NOT write it freehand: omit it from the staff-facing content and add it to "admin_flags.topics_needing_sources".
  2. THE STAFF MEMBER'S PRIOR MONTH — incidents, shift/med events, caseload changes — compared against the sources (verified coaching, every substantive claim tied to a source).
  3. DEEP-DIVE FALLBACK — an in-depth, source-grounded review of important recurring topics (deeper than the introductory 30-day Core Training), prioritizing required annual topics not yet covered this CE year — used to reach the 30-slide / ~60-minute floor.
  4. LAST RESORT — if the sources genuinely cannot produce 30 grounded slides, set "material_short": true and produce a shorter but fully-sourced review.

You are the TEACHER of that material. You SHOULD expound on it:
  - Explain a source clause in plain language; summarize and reorganize dense policy into a clear lesson.
  - Give the rationale / the "why" behind a requirement where it aids understanding.
  - Illustrate with clearly-hypothetical examples that show how a sourced rule applies in practice (e.g. a sample strong-vs-weak shift note teaching the agency's own documentation standard).
  - Relate the source to the staff member's real events ("your June 3 incident connects to this policy because…").
  - Ask reflective/application questions and scenarios built on the sourced material.

You MUST NOT:
  - Introduce a new substantive fact, requirement, number, threshold, or procedure step that no source supports — most importantly clinical/safety specifics (a seizure threshold, a medication rule, a CPR detail, a choking response sequence).
  - Override, contradict, or "improve on" a source using outside knowledge.
  - Fill a gap in the source with invented specifics. If the source is silent on a needed clinical point, explain what the source DOES say, then route the staff member to the nurse / the person's care plan / their supervisor — do NOT supply the missing fact.
  - Present your own explanation, example, or illustration as if it were the authority or a new requirement.
  - Pad to reach 30 slides with generic CPR / choking / seizure / first-aid content that is not in any provided source. If you cannot reach 30 grounded slides, set material_short=true and STOP.
  - Show staff an "UNVERIFIED" badge or any unverified section — anything you cannot verify against a source is dropped from the staff view and surfaced to the admin via "admin_flags".

CITATIONS.
  - Every "lesson" step MUST set "citation" to the source document title and (where possible) clause/section it is built on (e.g. "Provider P&P §3.2 – Medication Administration"). If the lesson is a coaching reflection on a real event, "citation" may be the event reference (e.g. "Incident #2026-0034 + Provider P&P §5.1").
  - Explanation, examples, and application exercises do not each need a per-sentence citation, but they must not introduce new substantive facts.
  - Keep a clear voice distinction: when quoting/summarizing a source, say so ("The agency's policy says…"); when explaining or illustrating, say so ("In plain language…", "For example…").

LENGTH FLOOR.
  - Aim for AT LEAST 30 total steps (≈ 2 minutes per slide ≈ 60 minutes of material). Lessons + checks together should comfortably reach 30 when sources support it. The final reflect step counts toward the total.
  - Fill the 30 with grounded material only, per the priority list above.
  - If genuinely impossible from the uploaded sources, set "material_short": true and include one lesson titled "What's missing" listing the topics that would normally be covered.

OUTPUT — STRICT JSON, no markdown, matching this shape:
{
  "material_short": false,
  "admin_flags": {
    "topics_needing_sources": ["<suggested topic the uploaded sources don't cover>", "..."],
    "notes": "<short admin-facing note about gaps, if any>"
  },
  "steps": [
    {"type":"nectar","body":"<plain-language intro: what sources and events this review was built from, and what it covers>"},
    {"type":"lesson","kicker":"...","title":"...","body":"...","citation":"Source title §clause","facts":[["bold lead","detail"]]},
    {"type":"check","kicker":"...","stem":"...","options":[{"label":"A","text":"...","correct":false,"feedback":"..."}, ...]},
    ... more lesson/check pairs, each lesson grounded in a cited source, until ≥30 total steps ...,
    {"type":"reflect","kicker":"Reflection","prompt":"<final reflection prompt grounded in the sourced material, free text required, ≥150 chars>"}
  ]
}

FLOOR: at least 3 lesson+check pairs and exactly 1 reflect. Target ≥30 total steps. Every check has 3–4 options, exactly one correct, every option gets per-option feedback. Plain language. No markdown inside body strings.`;

  const res = await gatewayFetch({
      model: "bedrock",
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
    });
  if (res.status === 429) throw new Error("AI rate limit reached. Please retry in a moment.");
  if (res.status === 402) throw new Error("AI workspace credits exhausted. Please add credits.");
  if (!res.ok) throw new Error(`Nectar generation failed (${res.status}).`);
  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const raw = json.choices?.[0]?.message?.content ?? "{}";
  let parsed: { steps?: unknown; material_short?: unknown; admin_flags?: { topics_needing_sources?: unknown; notes?: unknown } };
  try { parsed = JSON.parse(raw); } catch { throw new Error("Nectar returned non-JSON."); }
  const flags = (parsed.admin_flags ?? {}) as { topics_needing_sources?: unknown; notes?: unknown };
  const topicsNeedingSources = Array.isArray(flags.topics_needing_sources)
    ? (flags.topics_needing_sources as unknown[]).map((t) => String(t)).filter(Boolean).slice(0, 25)
    : [];
  return {
    steps: validateSteps(parsed.steps),
    materialShort: Boolean(parsed.material_short),
    topicsNeedingSources,
    adminNotes: typeof flags.notes === "string" ? flags.notes.slice(0, 800) : "",
  };
}

// Gather authoritative sources + the staff member's factual records.
// CE reviews are built only from these inputs — never from outside knowledge.
async function gatherCeContext(
  supabase: ReturnType<typeof getSupabase>,
  orgId: string,
  staffId: string,
): Promise<{ prompt: string; summary: string; sourceTitles: string[]; sourceCount: number; suggestedTopics: string[] }> {
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - 35);
  const sinceIso = since.toISOString();

  // ---- Admin-suggested CE focus topics for this staff member ----
  const profQ = await supabase
    .from("profiles")
    .select("ce_suggested_topics")
    .eq("id", staffId)
    .maybeSingle();
  const suggestedTopics = ((profQ.data as { ce_suggested_topics: string[] | null } | null)?.ce_suggested_topics ?? [])
    .map((t) => String(t)).filter(Boolean).slice(0, 25);

  // ---- (a) Authoritative sources for the org (current versions only) ----
  const srcQ = await supabase
    .from("nectar_documents")
    .select("id, title, authoritative_kind, raw_text, fiscal_year, effective_start, effective_end")
    .eq("organization_id", orgId)
    .eq("is_authoritative_source", true)
    .eq("is_current", true)
    .order("created_at", { ascending: false })
    .limit(40);
  const allSources = (srcQ.data as {
    id: string; title: string; authoritative_kind: string | null;
    raw_text: string | null; fiscal_year: string | null;
    effective_start: string | null; effective_end: string | null;
  }[] | null) ?? [];

  // ---- Staff's caseload → pull care-plan / person-specific docs for those clients ----
  const caseQ = await supabase
    .from("staff_assignments")
    .select("client_id, clients:client_id(first_name, last_name)")
    .eq("organization_id", orgId)
    .eq("staff_id", staffId)
    .limit(20);
  const caseload = (caseQ.data as {
    client_id: string;
    clients: { first_name: string | null; last_name: string | null } | null;
  }[] | null) ?? [];
  const clientIds = caseload.map((c) => c.client_id);

  let clientDocs: { id: string; title: string; raw_text: string | null; client_id: string | null }[] = [];
  if (clientIds.length > 0) {
    const cdQ = await supabase
      .from("nectar_documents")
      .select("id, title, raw_text, client_id")
      .eq("organization_id", orgId)
      .eq("is_current", true)
      .eq("owner_kind", "client")
      .in("client_id", clientIds)
      .limit(40);
    clientDocs = (cdQ.data as { id: string; title: string; raw_text: string | null; client_id: string | null }[] | null) ?? [];
  }

  // ---- (b) Staff's factual event records (prior ~30 days) ----
  const inc = await supabase
    .from("incident_reports")
    .select("report_number, incident_date, incident_types, narrative_during, immediate_actions")
    .eq("organization_id", orgId)
    .eq("reported_by", staffId)
    .gte("incident_date", sinceIso.slice(0, 10))
    .order("incident_date", { ascending: false })
    .limit(15);

  const meds = await supabase
    .from("emar_logs")
    .select("scheduled_for, status, exception_reason, is_medication_error, error_description, is_prn, prn_reason")
    .eq("organization_id", orgId)
    .eq("staff_id", staffId)
    .or("is_medication_error.eq.true,status.eq.missed,status.eq.refused")
    .gte("scheduled_for", sinceIso)
    .order("scheduled_for", { ascending: false })
    .limit(20);

  const cases = await supabase
    .from("staff_assignments")
    .select("created_at, client_id, clients:client_id(first_name)")
    .eq("organization_id", orgId)
    .eq("staff_id", staffId)
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: false })
    .limit(10);

  const incidents = (inc.data as { report_number: string; incident_date: string; incident_types: string[] | null; narrative_during: string | null; immediate_actions: string | null }[] | null) ?? [];
  const medRows = (meds.data as { scheduled_for: string; status: string; exception_reason: string | null; is_medication_error: boolean; error_description: string | null; is_prn: boolean; prn_reason: string | null }[] | null) ?? [];
  const newClients = (cases.data as { created_at: string; client_id: string; clients: { first_name: string } | null }[] | null) ?? [];

  // ---- Build the source pack for the prompt (capped per source to fit context) ----
  const PER_SOURCE_CHARS = 4000;
  const sourcePack = allSources.map((s) => ({
    title: s.title,
    kind: s.authoritative_kind,
    fiscal_year: s.fiscal_year,
    effective: s.effective_start ? `${s.effective_start} → ${s.effective_end ?? "present"}` : null,
    text: (s.raw_text ?? "").slice(0, PER_SOURCE_CHARS),
  }));
  const clientPack = clientDocs.map((d) => {
    const c = caseload.find((cc) => cc.client_id === d.client_id)?.clients;
    const person = [c?.first_name, c?.last_name].filter(Boolean).join(" ") || "(person)";
    return { person, title: d.title, text: (d.raw_text ?? "").slice(0, PER_SOURCE_CHARS) };
  });

  const sourceTitles = [
    ...sourcePack.map((s) => s.title),
    ...clientPack.map((c) => `${c.title} — ${c.person}`),
  ];

  const summary = [
    `Authoritative sources: ${sourcePack.length}`,
    `Person-specific docs: ${clientPack.length}`,
    `Incidents filed: ${incidents.length}`,
    `Med exceptions/errors: ${medRows.length}`,
    `New caseload: ${newClients.length}`,
  ].join(" · ");

  const events = {
    incidents: incidents.map((i) => ({
      ref: i.report_number,
      date: i.incident_date,
      types: i.incident_types ?? [],
      what_happened: (i.narrative_during ?? "").slice(0, 600),
      actions: (i.immediate_actions ?? "").slice(0, 400),
    })),
    medication_events: medRows.map((m) => ({
      when: m.scheduled_for,
      status: m.status,
      is_error: m.is_medication_error,
      reason: m.exception_reason ?? m.error_description ?? m.prn_reason ?? null,
    })),
    new_caseload: newClients.map((c) => ({ first_name: c.clients?.first_name ?? "(person)", added: c.created_at })),
  };

  const prompt = `Build this staff member's monthly CE review STRICTLY from the AUTHORITATIVE SOURCES and EVENT RECORDS below.
You may explain, illustrate, and apply this material — but you must NOT introduce new substantive facts, clinical specifics, thresholds, or procedure steps that are not in the provided sources. If a needed clinical specific is absent, route to the nurse / care plan / supervisor instead of supplying it.

Cite the source (title + clause/section when possible) on every lesson.
Target ≥30 total steps (~60 minutes at ~2 min/slide). If the uploaded sources cannot responsibly produce 30 grounded steps, set material_short=true and produce a shorter but fully-sourced review with a "What's missing" lesson — never pad.

=== ADMIN-SUGGESTED FOCUS TOPICS (prioritize; treat as focus areas, NOT as authoritative content) ===
${JSON.stringify(suggestedTopics)}
For each focus topic: search ALL authoritative sources below for supporting passages and build cited teaching on what is covered. For any topic the sources do not cover, OMIT it from the staff-facing review and add it to admin_flags.topics_needing_sources verbatim — do not write freehand on it.

=== AUTHORITATIVE SOURCES (provider-uploaded) ===
${JSON.stringify(sourcePack).slice(0, 40000)}

=== PERSON-SPECIFIC DOCUMENTS (for this staff member's caseload) ===
${JSON.stringify(clientPack).slice(0, 20000)}

=== STAFF MEMBER'S FACTUAL EVENT RECORDS (prior ~30 days) ===
${JSON.stringify(events).slice(0, 12000)}`;

  return { prompt, summary, sourceTitles, sourceCount: sourcePack.length + clientPack.length, suggestedTopics };
}

// ──────────────── Server functions ─────────────────────────────────────────

export const getMyCeStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CeStatus> => {
    const supabase = getSupabase(context);
    const userId = (context as { userId: string }).userId;
    const { orgId, isAdmin } = await getCallerOrg(supabase, userId);

    // start_date is the single source of truth for CE eligibility.
    // Fall back to legacy hire_date until every profile is migrated.
    // end_date set → employment ended → no new CE.
    const profileQ = await supabase
      .from("profiles")
      .select("hire_date, start_date, end_date")
      .eq("id", userId)
      .maybeSingle();
    const profileRow =
      (profileQ.data as { hire_date: string | null; start_date: string | null; end_date: string | null } | null) ?? null;
    const hireDate = profileRow?.start_date ?? profileRow?.hire_date ?? null;
    const endDate = profileRow?.end_date ?? null;

    let demoModeEnabled = false;
    let minActiveMinutes = 60;
    let goalHours = 12;
    if (orgId) {
      const settingsQ = await supabase
        .from("ce_settings")
        .select("min_active_minutes, annual_goal_hours, demo_mode")
        .eq("organization_id", orgId)
        .maybeSingle();
      const s = settingsQ.data as { min_active_minutes: number; annual_goal_hours: number; demo_mode: boolean } | null;
      if (s) { minActiveMinutes = s.min_active_minutes; goalHours = s.annual_goal_hours; demoModeEnabled = s.demo_mode; }
    }

    const today = todayUtc();
    const employmentEnded = !!endDate;
    const applies = hireDate && !employmentEnded ? ceApplies(hireDate, today) : false;
    const yearStart = hireDate && applies ? ceYearStart(hireDate, today) : null;
    const yearEnd = yearStart ? ceYearEnd(yearStart) : null;
    const period = periodOf(today);
    const daysLeft = yearEnd ? Math.max(0, Math.round((yearEnd.getTime() - today.getTime()) / 86_400_000)) : 0;

    let hoursThisYear = 0;
    let ledger: CeLedgerEntry[] = [];
    let currentModule: CeModule | null = null;

    if (yearStart) {
      const ledgerQ = await supabase
        .from("ce_ledger")
        .select("id, ce_year_start, title, hours, active_minutes, type, source, completed_at, signature_name")
        .eq("staff_id", userId)
        .eq("ce_year_start", fmtDate(yearStart))
        .order("completed_at", { ascending: false });
      ledger = ((ledgerQ.data as CeLedgerEntry[] | null) ?? []).map((r) => ({ ...r, hours: Number(r.hours) }));
      hoursThisYear = ledger.reduce((acc, e) => acc + Number(e.hours), 0);

      const modQ = await supabase
        .from("ce_modules")
        .select("*")
        .eq("staff_id", userId)
        .eq("period", period)
        .maybeSingle();
      currentModule = (modQ.data as CeModule | null) ?? null;
    }

    return {
      hireDate,
      ceApplies: applies,
      ceYearStart: yearStart ? fmtDate(yearStart) : null,
      ceYearEnd: yearEnd ? fmtDate(yearEnd) : null,
      hoursThisYear,
      goalHours,
      minActiveMinutes,
      daysLeftInYear: daysLeft,
      demoModeEnabled,
      isOrgAdmin: isAdmin,
      organizationId: orgId,
      currentPeriod: period,
      currentModule,
    ledger,
    };
  });

export const ensureCurrentCeModule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CeModule> => {
    const supabase = getSupabase(context);
    const userId = (context as { userId: string }).userId;
    const { orgId } = await getCallerOrg(supabase, userId);
    if (!orgId) throw new Error("No active organization membership.");
    const period = periodOf(todayUtc());

    const existQ = await supabase.from("ce_modules").select("*").eq("staff_id", userId).eq("period", period).maybeSingle();
    const existing = existQ.data as CeModule | null;
    const existingStepCount = existing ? (existing.steps as unknown[]).length : 0;
    // If a previously-generated module is below the 30-slide floor and wasn't
    // flagged material_short, regenerate it (and reset progress so the staff
    // member doesn't land mid-way through a different deck).
    const flaggedShort = (existing?.source_summary ?? "").includes("Authoritative sources couldn't produce");
    const needsRegen =
      !!existing &&
      existing.status !== "completed" &&
      existingStepCount > 0 &&
      existingStepCount < 30 &&
      !flaggedShort;
    if (existing && existing.status !== "failed" && existingStepCount > 0 && !needsRegen) return existing;

    // Ensure org settings row exists; default demo_mode=false.
    await supabase.from("ce_settings").upsert(
      { organization_id: orgId },
      { onConflict: "organization_id", ignoreDuplicates: true },
    );
    const setQ = await supabase.from("ce_settings").select("demo_mode").eq("organization_id", orgId).maybeSingle();
    const demoMode = Boolean((setQ.data as { demo_mode: boolean } | null)?.demo_mode);
    if (!demoMode) {
      throw new Error(
        "CE generation is paused for this organization. Until the HIPAA-compliant AI path is live, an admin must enable demo mode under Continuing Education to generate against seeded test data.",
      );
    }

    // Insert a placeholder so the UI sees status=generating.
    const placeholderId = existing?.id;
    let modId = placeholderId;
    if (!modId) {
      const ins = await supabase
        .from("ce_modules")
        .insert({ organization_id: orgId, staff_id: userId, period, status: "generating", steps: [], current_step: 0 })
        .select("id")
        .single();
      modId = (ins.data as { id: string } | null)?.id;
      if (!modId) throw new Error("Failed to create CE module row.");
    } else {
      await supabase.from("ce_modules").update({ status: "generating" }).eq("id", modId);
    }

    let steps: CeStep[];
    let summary: string;
    try {
      const gathered = await gatherCeContext(supabase, orgId, userId);
      let result = await callNectarForCe(gathered.prompt);
      // If the model under-produces without flagging material_short and we have
      // sources to work with, retry once with an explicit reinforcement of the
      // 30-slide floor and the deep-dive fallback.
      if (!result.materialShort && gathered.sourceCount > 0 && !meetsFullHourFloor(result.steps)) {
        const retryPrompt = `${gathered.prompt}

REGENERATION NOTICE: Your previous draft returned only ${result.steps.length} steps. The minimum is 30 total steps (~60 minutes). The prior month is quiet (few/no events), so you MUST lean on the DEEP-DIVE FALLBACK: build an in-depth, source-grounded review of important recurring topics drawn entirely from the AUTHORITATIVE SOURCES above (deeper than the 30-day introductory training). Do NOT pad with un-sourced clinical or safety content. If — after a thorough pass over every source — you genuinely cannot reach 30 grounded steps, set "material_short": true and explain in admin_flags.notes which topic areas are missing.`;
        result = await callNectarForCe(retryPrompt);
      }
      steps = result.steps;
      const sourceList = gathered.sourceTitles.length > 0
        ? `Sources: ${gathered.sourceTitles.slice(0, 8).join("; ")}${gathered.sourceTitles.length > 8 ? `, +${gathered.sourceTitles.length - 8} more` : ""}`
        : "Sources: (none uploaded yet)";
      const belowFloor = !meetsFullHourFloor(steps);
      const shortFlag = (result.materialShort || gathered.sourceCount === 0 || belowFloor)
        ? ` ⚠ Authoritative sources couldn't produce the full 30-slide / ~60-minute review (got ${steps.length} steps). Admin should upload more sources so future CE reviews are richer.`
        : "";
      const topicsFlag = result.topicsNeedingSources.length > 0
        ? ` ⚠ Suggested CE topics not covered by uploaded sources — upload material on: ${result.topicsNeedingSources.join("; ")}.`
        : "";
      const focusList = gathered.suggestedTopics.length > 0
        ? ` Admin focus topics: ${gathered.suggestedTopics.join("; ")}.`
        : "";
      const notes = result.adminNotes ? ` Admin notes: ${result.adminNotes}` : "";
      summary = `Built from the agency's Authoritative Sources + this staff member's prior-30-day records. ${gathered.summary}. ${sourceList}.${focusList}${shortFlag}${topicsFlag}${notes}`;
    } catch (err) {
      await supabase.from("ce_modules").update({ status: "failed", source_summary: (err as Error).message }).eq("id", modId);
      throw err;
    }

    const upd = await supabase
      .from("ce_modules")
      .update({
        status: "ready",
        steps,
        source_summary: summary,
        generated_at: new Date().toISOString(),
        // Reset progress — slide content has changed, so any saved position,
        // active-time, reflections, or quiz shuffle from the prior deck would
        // be meaningless. Start fresh on slide 1 / 0 min.
        current_step: 0,
        active_seconds: 0,
        reflections: {},
      })
      .eq("id", modId)
      .select("*")
      .single();
    return upd.data as CeModule;
  });

interface SaveProgressInput {
  moduleId: string;
  activeSeconds: number;
  currentStep: number;
  reflections: Record<string, string>;
}
function vSaveProgress(input: unknown): SaveProgressInput {
  const i = (input ?? {}) as Record<string, unknown>;
  const moduleId = String(i.moduleId ?? "");
  const activeSeconds = Math.max(0, Math.min(60 * 60 * 24, Number(i.activeSeconds) || 0));
  const currentStep = Math.max(0, Math.min(500, Number(i.currentStep) || 0));
  const r = (i.reflections ?? {}) as Record<string, unknown>;
  const reflections: Record<string, string> = {};
  for (const [k, v] of Object.entries(r)) reflections[String(k)] = String(v ?? "").slice(0, 5000);
  if (!moduleId) throw new Error("moduleId required");
  return { moduleId, activeSeconds, currentStep, reflections };
}

export const saveCeProgress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(vSaveProgress)
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const supabase = getSupabase(context);
    const userId = (context as { userId: string }).userId;
    const cur = await supabase.from("ce_modules").select("id, staff_id, status, active_seconds").eq("id", data.moduleId).maybeSingle();
    const row = cur.data as { id: string; staff_id: string; status: string; active_seconds: number } | null;
    if (!row || row.staff_id !== userId) throw new Error("Module not found.");
    if (row.status === "completed") return { ok: true };
    // active_seconds is monotonically increasing within the same module.
    const next = Math.max(row.active_seconds, data.activeSeconds);
    await supabase
      .from("ce_modules")
      .update({
        active_seconds: next,
        current_step: data.currentStep,
        reflections: data.reflections,
        status: row.status === "ready" ? "in_progress" : row.status,
      })
      .eq("id", data.moduleId);
    return { ok: true };
  });

interface CompleteInput {
  moduleId: string;
  signatureName: string;
  attestationText: string;
  activeSeconds: number;
  reflections: Record<string, string>;
}
function vComplete(input: unknown): CompleteInput {
  const i = (input ?? {}) as Record<string, unknown>;
  const moduleId = String(i.moduleId ?? "");
  const signatureName = String(i.signatureName ?? "").trim().slice(0, 200);
  const attestationText = String(i.attestationText ?? "").slice(0, 4000);
  const activeSeconds = Math.max(0, Math.min(60 * 60 * 24, Number(i.activeSeconds) || 0));
  const r = (i.reflections ?? {}) as Record<string, unknown>;
  const reflections: Record<string, string> = {};
  for (const [k, v] of Object.entries(r)) reflections[String(k)] = String(v ?? "");
  if (!moduleId) throw new Error("moduleId required");
  if (signatureName.length < 2) throw new Error("Type your full legal name to sign.");
  if (attestationText.length < 30) throw new Error("Attestation text required.");
  return { moduleId, signatureName, attestationText, activeSeconds, reflections };
}

export const completeCeModule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(vComplete)
  .handler(async ({ data, context }): Promise<{ ledgerId: string }> => {
    const supabase = getSupabase(context);
    const userId = (context as { userId: string }).userId;
    const modQ = await supabase
      .from("ce_modules")
      .select("id, staff_id, organization_id, period, steps, active_seconds, status, source_summary")
      .eq("id", data.moduleId)
      .maybeSingle();
    const mod = modQ.data as {
      id: string; staff_id: string; organization_id: string; period: string;
      steps: CeStep[]; active_seconds: number; status: string; source_summary: string | null;
    } | null;
    if (!mod || mod.staff_id !== userId) throw new Error("Module not found.");
    if (mod.status === "completed") throw new Error("Already completed.");

    // Pull org settings + profile hire_date for the gates.
    const setQ = await supabase
      .from("ce_settings")
      .select("min_active_minutes")
      .eq("organization_id", mod.organization_id)
      .maybeSingle();
    const minActiveMin = Number((setQ.data as { min_active_minutes: number } | null)?.min_active_minutes ?? 60);

    const effectiveActive = Math.max(mod.active_seconds, data.activeSeconds);
    if (effectiveActive < minActiveMin * 60) {
      throw new Error(`Active time of ${minActiveMin} minutes not yet met.`);
    }
    // Reflection length gate.
    const reflectIndex = mod.steps.findIndex((s) => s.type === "reflect");
    const reflectionText = (data.reflections[String(reflectIndex)] ?? "").trim();
    if (reflectionText.length < 150) throw new Error("Reflection must be at least 150 characters.");

    const profileQ = await supabase
      .from("profiles")
      .select("hire_date, start_date, end_date")
      .eq("id", userId)
      .maybeSingle();
    const profileRow =
      (profileQ.data as { hire_date: string | null; start_date: string | null; end_date: string | null } | null) ?? null;
    if (profileRow?.end_date) {
      throw new Error("Your employment end date is set — no new CE entries can be added.");
    }
    const hireDate = profileRow?.start_date ?? profileRow?.hire_date ?? null;
    if (!hireDate) throw new Error("Your start date is not set. Ask HR to update your profile.");
    const yearStart = ceYearStart(hireDate);

    const contentHash = createHash("sha256").update(JSON.stringify(mod.steps)).digest("hex");

    const ledIns = await supabase
      .from("ce_ledger")
      .insert({
        organization_id: mod.organization_id,
        staff_id: userId,
        module_id: mod.id,
        ce_year_start: fmtDate(yearStart),
        title: `Monthly CE Review — ${mod.period}`,
        hours: 1.0,
        active_minutes: Math.round(effectiveActive / 60),
        type: "monthly",
        source: mod.source_summary,
        signature_name: data.signatureName,
        attestation_text: data.attestationText,
        content_hash: contentHash,
      })
      .select("id")
      .single();
    const ledgerId = (ledIns.data as { id: string } | null)?.id;
    if (!ledgerId) throw new Error("Failed to write ledger entry.");

    await supabase
      .from("ce_modules")
      .update({
        status: "completed",
        active_seconds: effectiveActive,
        reflections: data.reflections,
        completed_at: new Date().toISOString(),
      })
      .eq("id", mod.id);

    return { ledgerId };
  });

// Admin toggle for the demo-mode PHI gate.
function vDemo(input: unknown): { enabled: boolean } {
  const i = (input ?? {}) as Record<string, unknown>;
  return { enabled: Boolean(i.enabled) };
}
export const setCeDemoMode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(vDemo)
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const supabase = getSupabase(context);
    const userId = (context as { userId: string }).userId;
    const { orgId, isAdmin } = await getCallerOrg(supabase, userId);
    if (!orgId) throw new Error("No active organization.");
    if (!isAdmin) throw new Error("Only admins or managers can change CE settings.");
    await supabase
      .from("ce_settings")
      .upsert({ organization_id: orgId, demo_mode: data.enabled }, { onConflict: "organization_id" });
    return { ok: true };
  });

// ──────────────── Phase 2: Admin roster + reminder ─────────────────────────

export interface CeRosterRow {
  staffId: string;
  fullName: string;
  email: string | null;
  hireDate: string | null;
  ceApplies: boolean;
  ceYearStart: string | null;
  ceYearEnd: string | null;
  hoursThisYear: number;
  goalHours: number;
  daysLeftInYear: number;
  expectedHoursToDate: number;
  monthsIntoYear: number;
  status: "complete" | "on_track" | "behind" | "not_applicable";
  lastCompletedAt: string | null;
}

export interface CeRoster {
  organizationId: string | null;
  goalHours: number;
  rows: CeRosterRow[];
  behindCount: number;
}

function rosterStatus(applies: boolean, hours: number, goal: number, expected: number): CeRosterRow["status"] {
  if (!applies) return "not_applicable";
  if (hours >= goal) return "complete";
  if (hours + 0.001 < expected) return "behind";
  return "on_track";
}

export const getOrgCeRoster = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CeRoster> => {
    const supabase = getSupabase(context);
    const userId = (context as { userId: string }).userId;
    const { orgId, isAdmin } = await getCallerOrg(supabase, userId);
    if (!orgId) return { organizationId: null, goalHours: 12, rows: [], behindCount: 0 };
    if (!isAdmin) return { organizationId: orgId, goalHours: 12, rows: [], behindCount: 0 };

    const setQ = await supabase
      .from("ce_settings")
      .select("annual_goal_hours")
      .eq("organization_id", orgId)
      .maybeSingle();
    const goalHours = Number((setQ.data as { annual_goal_hours: number } | null)?.annual_goal_hours ?? 12);

    // Pull active staff in this org. organization_members has NO FK to
    // profiles (both key off auth.users.id), so a PostgREST embed fails —
    // always two queries joined in JS.
    const membersQ = await supabase
      .from("organization_members")
      .select("user_id, role")
      .eq("organization_id", orgId)
      .eq("active", true);
    const memberRows = (membersQ.data as { user_id: string; role: string }[] | null) ?? [];

    type ProfileRow = {
      id: string;
      first_name: string | null;
      last_name: string | null;
      email: string | null;
      hire_date: string | null;
      start_date: string | null;
      end_date: string | null;
    };
    const memberIds = memberRows.map((m) => m.user_id);
    const profilesQ = memberIds.length
      ? await supabase
          .from("profiles")
          .select("id, first_name, last_name, email, hire_date, start_date, end_date")
          .in("id", memberIds)
      : { data: [] as ProfileRow[] };
    const profById = new Map(((profilesQ.data as ProfileRow[] | null) ?? []).map((p) => [p.id, p]));

    type MemRow = { user_id: string; role: string; profiles: ProfileRow | null };
    const members: MemRow[] = memberRows
      .map((m) => ({ ...m, profiles: profById.get(m.user_id) ?? null }))
      .filter((m) => m.profiles);

    // Pull all ledger rows for this org in one shot, then bucket by staff.
    const ledQ = await supabase
      .from("ce_ledger")
      .select("staff_id, ce_year_start, hours, completed_at")
      .eq("organization_id", orgId);
    const ledger = (ledQ.data as { staff_id: string; ce_year_start: string; hours: number; completed_at: string }[] | null) ?? [];

    const today = todayUtc();
    const rows: CeRosterRow[] = members.map((m) => {
      const p = m.profiles!;
      const fullName = [p.first_name, p.last_name].filter(Boolean).join(" ").trim() || (p.email ?? "Staff");
      const hire = p.start_date ?? p.hire_date;
      const employmentEnded = !!p.end_date;
      const applies = hire && !employmentEnded ? ceApplies(hire, today) : false;
      const yearStart = hire && applies ? ceYearStart(hire, today) : null;
      const yearEnd = yearStart ? ceYearEnd(yearStart) : null;
      const yearStartIso = yearStart ? fmtDate(yearStart) : null;
      const mine = ledger.filter((l) => l.staff_id === p.id && (!yearStartIso || l.ce_year_start === yearStartIso));
      const hoursThisYear = mine.reduce((acc, l) => acc + Number(l.hours), 0);
      const lastCompletedAt = mine
        .map((l) => l.completed_at)
        .sort()
        .reverse()[0] ?? null;
      const daysLeft = yearEnd ? Math.max(0, Math.round((yearEnd.getTime() - today.getTime()) / 86_400_000)) : 0;
      const monthsIn = yearStart
        ? Math.min(12, Math.max(0, Math.round((today.getTime() - yearStart.getTime()) / (86_400_000 * 30))))
        : 0;
      const expected = yearStart ? Math.min(goalHours, (goalHours * monthsIn) / 12) : 0;
      return {
        staffId: p.id,
        fullName,
        email: p.email,
        hireDate: hire,
        ceApplies: applies,
        ceYearStart: yearStartIso,
        ceYearEnd: yearEnd ? fmtDate(yearEnd) : null,
        hoursThisYear,
        goalHours,
        daysLeftInYear: daysLeft,
        expectedHoursToDate: Math.round(expected * 10) / 10,
        monthsIntoYear: monthsIn,
        status: rosterStatus(applies, hoursThisYear, goalHours, expected),
        lastCompletedAt,
      };
    });

    rows.sort((a, b) => {
      const order = { behind: 0, on_track: 1, complete: 2, not_applicable: 3 } as const;
      if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
      return a.fullName.localeCompare(b.fullName);
    });

    const behindCount = rows.filter((r) => r.status === "behind").length;
    return { organizationId: orgId, goalHours, rows, behindCount };
  });

function vStaffDetail(input: unknown): { staffId: string } {
  const i = (input ?? {}) as Record<string, unknown>;
  const staffId = String(i.staffId ?? "");
  if (!staffId) throw new Error("staffId required");
  return { staffId };
}

export const getStaffCeLedger = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(vStaffDetail)
  .handler(async ({ data, context }): Promise<CeLedgerEntry[]> => {
    const supabase = getSupabase(context);
    const userId = (context as { userId: string }).userId;
    const { orgId, isAdmin } = await getCallerOrg(supabase, userId);
    // Fail closed gracefully — return an empty list rather than throwing
    // into the React error boundary on the Records Desk.
    if (!orgId) return [];
    if (!isAdmin) return [];
    const q = await supabase
      .from("ce_ledger")
      .select("id, ce_year_start, title, hours, active_minutes, type, source, completed_at, signature_name")
      .eq("organization_id", orgId)
      .eq("staff_id", data.staffId)
      .order("completed_at", { ascending: false });
    return ((q.data as CeLedgerEntry[] | null) ?? []).map((r) => ({ ...r, hours: Number(r.hours) }));
  });

