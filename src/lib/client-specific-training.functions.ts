// Server functions for Client-Specific Training (Stage 2a — admin build/review/publish).
// NECTAR PRESENTS verbatim — it does NOT author care guidance.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any;

function adminGuard(role: string | undefined) {
  if (!role || !["admin", "manager", "super_admin"].includes(role)) {
    throw new Error("Forbidden: admin access required.");
  }
}

async function getMembership(supabase: AnySupabase, userId: string) {
  const { data, error } = await supabase
    .from("organization_members")
    .select("organization_id, role")
    .eq("user_id", userId)
    .eq("active", true)
    .limit(1)
    .maybeSingle();
  if (error || !data) throw new Error("No active organization membership.");
  return data as { organization_id: string; role: string };
}

async function assertClientInOrg(supabase: AnySupabase, clientId: string, orgId: string) {
  const { data, error } = await supabase
    .from("clients")
    .select("id, organization_id")
    .eq("id", clientId)
    .maybeSingle();
  if (error || !data) throw new Error("Client not found.");
  if (data.organization_id !== orgId) throw new Error("Forbidden: client belongs to another org.");
}

// ── Content shape ────────────────────────────────────────────────────────────
// Sections of VERBATIM values from authoritative client data — no model prose.
// item.kind:
//   'text'  — single verbatim string
//   'list'  — array of verbatim strings/labels
//   'kv'    — array of {label, value} pairs (verbatim)
//   'link'  — array of {label, href} (document filenames + signed/public links)
//   'note'  — short fixed system label (e.g. "No data on file"); never authored care prose
export type CSTItem =
  | { kind: "text"; label: string; value: string }
  | { kind: "list"; label: string; values: string[] }
  | { kind: "kv"; label: string; pairs: Array<{ label: string; value: string }> }
  | { kind: "link"; label: string; links: Array<{ label: string; href: string | null }> }
  | { kind: "note"; label: string; value: string };

export type CSTSection = { id: string; title: string; items: CSTItem[] };
export type CSTContent = { sections: CSTSection[] };

// In-depth PCSP goal — verbatim from the PCSP, admin-reviewed. Training-local
// (NOT the platform-wide clients.pcsp_goals).
export type CSTGoal = {
  id: string;
  goal: string;        // the goal/objective statement (verbatim)
  supports: string;    // what will be done to assist (verbatim from PCSP)
  details: string;     // objective detail: measures, frequency, target, timeline (verbatim)
  job_codes: string[]; // service/job code(s) linked to this goal
};

// Applied-reasoning prompt shown to staff per tab.
export type CSTReviewQuestion = {
  id: string;
  tab: string;     // which tab this question belongs to (e.g. "pcsp", "support_strategies")
  prompt: string;  // the question text
};

// A staff member's written answer, frozen onto the completion.
export type CSTQuestionAnswer = {
  question: string;
  answer: string;
  tab: string;
};

export type CSTTrainingType = "person_specific" | "support_strategies";

const ItemSchema: z.ZodType<CSTItem> = z.union([
  z.object({ kind: z.literal("text"), label: z.string(), value: z.string() }),
  z.object({ kind: z.literal("list"), label: z.string(), values: z.array(z.string()) }),
  z.object({ kind: z.literal("kv"), label: z.string(), pairs: z.array(z.object({ label: z.string(), value: z.string() })) }),
  z.object({ kind: z.literal("link"), label: z.string(), links: z.array(z.object({ label: z.string(), href: z.string().nullable() })) }),
  z.object({ kind: z.literal("note"), label: z.string(), value: z.string() }),
]);
const SectionSchema = z.object({ id: z.string(), title: z.string().min(1).max(200), items: z.array(ItemSchema).max(50) });
const ContentSchema = z.object({ sections: z.array(SectionSchema).max(30) });
const GoalSchema = z.object({
  id: z.string(),
  goal: z.string(),
  supports: z.string(),
  details: z.string(),
  job_codes: z.array(z.string()),
});
const ReviewQuestionSchema = z.object({
  id: z.string(),
  tab: z.string(),
  prompt: z.string(),
});

function sid(): string { return `s_${Math.random().toString(36).slice(2, 10)}`; }

// ── Verbatim assembler ──────────────────────────────────────────────────────
// Pulls authoritative data and renders raw values into sections.
// NO model prose, NO interventions, NO how-to.
async function assembleVerbatim(
  supabase: AnySupabase,
  orgId: string,
  clientId: string,
): Promise<CSTContent> {
  const sections: CSTSection[] = [];

  // Identity & support overview (clients core) — used by the narrative
  // prepend; not rendered as its own section anymore (name/age is covered by
  // the narrative, goals/directions get their own dedicated sections below).
  const { data: client } = await supabase
    .from("clients")
    .select("first_name, last_name, date_of_birth, special_directions, pcsp_goals")
    .eq("id", clientId)
    .maybeSingle();

  // a. Goals & desired outcomes ─────────────────────────────────────────────
  // Prefer richer training-local goals (jsonb on client_specific_trainings)
  // when present — each goal carries supports/details and is the substantive
  // centerpiece. Fall back to the flat clients.pcsp_goals string list.
  try {
    let richGoals: Array<{ goal?: string; supports?: string; details?: string }> = [];
    try {
      const { data: existingTraining } = await supabase
        .from("client_specific_trainings")
        .select("goals")
        .eq("client_id", clientId)
        .eq("training_type", "person_specific")
        .maybeSingle();
      const g = existingTraining?.goals;
      if (Array.isArray(g)) {
        richGoals = g as Array<{ goal?: string; supports?: string; details?: string }>;
      }
    } catch { /* table/column may differ — fall through */ }

    if (richGoals.length) {
      const items: CSTItem[] = richGoals
        .filter((g) => (g?.goal ?? "").toString().trim().length)
        .map((g) => ({
          kind: "kv" as const,
          label: String(g.goal).slice(0, 200),
          pairs: [
            { label: "Supports", value: (g.supports ?? "").toString().trim() || "—" },
            { label: "Detail / measure / timeline", value: (g.details ?? "").toString().trim() || "—" },
          ],
        }));
      if (items.length) sections.push({ id: sid(), title: "Goals & desired outcomes", items });
    } else if (client && Array.isArray(client.pcsp_goals) && client.pcsp_goals.length) {
      sections.push({
        id: sid(),
        title: "Goals & desired outcomes",
        items: [{
          kind: "list",
          label: "Goals",
          values: (client.pcsp_goals as unknown[]).map(String).filter((s) => s.trim().length),
        }],
      });
    }
  } catch { /* ignore */ }

  // b. Support approach & directions ────────────────────────────────────────
  if (client?.special_directions && String(client.special_directions).trim().length) {
    sections.push({
      id: sid(),
      title: "Support approach & directions",
      items: [
        { kind: "text", label: "Special directions", value: String(client.special_directions).trim() },
      ],
    });
  }

  // c. Intake & background (most recent intake form submissions — verbatim)
  const intakeHighlights: string[] = [];
  try {
    const { data: subs } = await supabase
      .from("form_submissions")
      .select("answers, submitted_at, forms(name)")
      .eq("client_id", clientId)
      .order("submitted_at", { ascending: false })
      .limit(3);
    if (subs && subs.length) {
      const items: CSTItem[] = subs.map((s: { answers: unknown; submitted_at: string; forms: { name: string } | null }) => {
        const a = (s.answers ?? {}) as Record<string, unknown>;
        const pairs = Object.entries(a)
          .filter(([, v]) => v != null && String(v).trim().length)
          .slice(0, 12)
          .map(([k, v]) => ({ label: String(k).slice(0, 80), value: String(v).slice(0, 400) }));
        for (const p of pairs.slice(0, 6)) {
          intakeHighlights.push(`${p.label}: ${p.value}`);
        }
        return {
          kind: "kv" as const,
          label: `${s.forms?.name ?? "Intake form"} (${s.submitted_at?.slice(0, 10) ?? ""})`,
          pairs,
        };
      }).filter((it: CSTItem) => (it.kind === "kv" ? it.pairs.length > 0 : true));
      if (items.length) sections.push({ id: sid(), title: "Intake & background", items });
    }
  } catch { /* table may be absent in some orgs */ }

  // d. Authorized services (factual list)
  try {
    const { data: codes } = await supabase
      .from("client_billing_codes")
      .select("service_code, unit_type, service_end_date")
      .eq("client_id", clientId);
    if (codes && codes.length) {
      const today = new Date().toISOString().slice(0, 10);
      const active = (codes as Array<{ service_code: string; unit_type: string | null; service_end_date: string | null }>)
        .filter((c) => !c.service_end_date || c.service_end_date >= today);
      if (active.length) {
        sections.push({
          id: sid(),
          title: "Authorized services",
          items: [{
            kind: "list",
            label: "Codes",
            values: active.map((c) => c.service_code + (c.unit_type ? ` (${c.unit_type})` : "")),
          }],
        });
      }
    }
  } catch { /* ignore */ }

  // e. Medications — SAFETY-CRITICAL — exact structured facts only
  try {
    const { data: meds } = await supabase
      .from("client_medications")
      .select("medication_name, dosage, frequency, is_prn, choking_risk, is_active")
      .eq("client_id", clientId);
    if (meds && meds.length) {
      const active = (meds as Array<{ medication_name: string; dosage: string | null; frequency: string | null; is_prn: boolean | null; choking_risk: boolean | null; is_active: boolean | null }>)
        .filter((m) => m.is_active !== false);
      if (active.length) {
        const items: CSTItem[] = active.map((m) => ({
          kind: "kv" as const,
          label: m.medication_name,
          pairs: [
            { label: "Dose", value: m.dosage ?? "—" },
            { label: "Frequency", value: m.frequency ?? "—" },
            { label: "PRN", value: m.is_prn ? "Yes" : "No" },
            { label: "Choking risk flagged", value: m.choking_risk ? "Yes" : "No" },
          ],
        }));
        sections.push({ id: sid(), title: "Medications", items });
      }
    }
  } catch { /* ignore */ }

  // f. Behavior support — SAFETY-CRITICAL — status + published behaviors, exact
  try {
    const { data: bsc } = await supabase
      .from("behavior_support_clients")
      .select("status")
      .eq("client_id", clientId)
      .maybeSingle();
    const { data: behaviors } = await supabase
      .from("bc_behaviors")
      .select("name, operational_definition, status")
      .eq("client_id", clientId)
      .eq("status", "published");
    const items: CSTItem[] = [];
    if (bsc?.status) items.push({ kind: "text", label: "BSP status", value: String(bsc.status) });
    if (behaviors && behaviors.length) {
      items.push({
        kind: "kv",
        label: "Published behaviors",
        pairs: (behaviors as Array<{ name: string; operational_definition: string | null }>).map((b) => ({
          label: b.name,
          value: b.operational_definition ?? "",
        })),
      });
    }
    if (items.length) sections.push({ id: sid(), title: "Behavior support", items });
  } catch { /* ignore */ }

  // g. Rights & safeguards — SAFETY-CRITICAL — HRC status + restriction_summary, exact
  try {
    const { data: hrc } = await supabase
      .from("hrc_reviews")
      .select("restriction_summary, status, created_at")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (hrc?.restriction_summary || hrc?.status) {
      const items: CSTItem[] = [];
      if (hrc.status) items.push({ kind: "text", label: "Status", value: String(hrc.status) });
      if (hrc.restriction_summary) items.push({ kind: "text", label: "Restriction summary", value: String(hrc.restriction_summary) });
      sections.push({ id: sid(), title: "Rights & safeguards", items });
    }
  } catch { /* ignore */ }

  if (!sections.length) {
    sections.push({
      id: sid(),
      title: "No authoritative data found",
      items: [{ kind: "note", label: "Status", value: "No data on file for this client yet." }],
    });
  }

  // NECTAR-composed narrative overview (prepended). Uses ONLY non-safety-critical
  // facts (identity, goals, special directions, intake highlights). NEVER touches
  // meds / behavior / rights / codes / documents — those remain exact records.
  try {
    if (client) {
      const fullName = `${client.first_name ?? ""} ${client.last_name ?? ""}`.trim() || "This person";
      const goals: string[] = Array.isArray(client.pcsp_goals) ? (client.pcsp_goals as unknown[]).map(String) : [];
      let ageBand = "";
      if (client.date_of_birth) {
        const yrs = Math.floor((Date.now() - new Date(String(client.date_of_birth)).getTime()) / (365.25 * 24 * 3600 * 1000));
        if (yrs > 0 && yrs < 120) {
          ageBand = yrs < 18 ? "under 18" : yrs < 30 ? "in their 20s" : yrs < 40 ? "in their 30s" : yrs < 50 ? "in their 40s" : yrs < 60 ? "in their 50s" : yrs < 70 ? "in their 60s" : "70+";
        }
      }
      const facts = [
        `Name: ${fullName}`,
        ageBand ? `Age band: ${ageBand}` : "",
        client.special_directions ? `Special directions: ${String(client.special_directions)}` : "",
        goals.length ? `PCSP goals:\n${goals.map((g, i) => `  ${i + 1}. ${g}`).join("\n")}` : "",
        intakeHighlights.length ? `Intake highlights:\n${intakeHighlights.slice(0, 12).map((h) => `  - ${h}`).join("\n")}` : "",
      ].filter(Boolean).join("\n");
      const narrative = await draftTrainingNarrative(facts);
      if (narrative && narrative.trim()) {
        sections.unshift({
          id: sid(),
          title: "About this person & how to support them",
          items: [
            { kind: "note", label: "AI draft — review & edit before publishing", value: "NECTAR drafted this overview from this client's records. Review, correct, and attest before it reaches staff." },
            { kind: "text", label: "Overview", value: narrative.trim() },
          ],
        });
      }
    }
  } catch { /* never block assembly on narrative */ }

  // org scope reference (suppress unused warning)
  void orgId;
  return { sections };
}

// NECTAR composes a flowing person-centered overview narrative for the TOP of
// a person-specific training. AI-drafted only — admin must review/edit/attest
// before publishing. Returns "" on any AI failure so assembly degrades safely.
// Deliberately excludes meds, behavior protocols, and legal restrictions —
// those remain as exact structured records elsewhere in the training.
async function draftTrainingNarrative(facts: string): Promise<string> {
  if (!facts.trim()) return "";
  try {
    const { gatewayFetch } = await import("@/lib/ai-bedrock.server");
    const system = [
      "You are NECTAR, writing a brief, warm, professional orientation narrative for a Utah DSPD direct-support worker about to support a specific person.",
      "Using ONLY the facts provided, write 1–3 short flowing paragraphs introducing the person: who they are, what matters to them, their goals, and the general approach to supporting them.",
      "Use natural, respectful, person-centered language — not a bulleted data dump.",
      "Do NOT invent facts that are not provided.",
      "Do NOT state medications, doses, behavior protocols, or legal restrictions — those are presented separately as exact records.",
      "This is a DRAFT the agency admin will review, edit, and attest to before it reaches staff.",
      'Respond ONLY with JSON: { "narrative": "..." }. No preamble, no markdown fences.',
    ].join("\n");
    const res = await gatewayFetch({
      messages: [
        { role: "system", content: system },
        { role: "user", content: `FACTS:\n${facts}` },
      ],
      response_format: { type: "json_object" },
    });
    if (!res.ok) return "";
    const body = await res.json();
    const content: string = body?.choices?.[0]?.message?.content ?? "{}";
    const clean = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    const parsed = JSON.parse(clean || "{}") as { narrative?: string };
    return String(parsed.narrative ?? "").slice(0, 6000);
  } catch {
    return "";
  }
}

// ── Verbatim PCSP goal extractor (admin, NECTAR) ────────────────────────────
// Reads the uploaded PCSP document and returns one CSTGoal per goal/objective
// row. Every field is STRICTLY verbatim — no summarisation, no authored prose.
async function extractGoalsVerbatim(documentText: string): Promise<CSTGoal[]> {
  const { gatewayFetch } = await import("@/lib/ai-bedrock.server");
  const system = [
    "You are NECTAR, a STRICTLY VERBATIM extraction engine for a Utah DSPD PCSP.",
    "Extract each goal from the PCSP as a structured object. Use ONLY text that appears in the document.",
    "Do NOT summarize, paraphrase, infer, or author any care guidance. Quote the document.",
    "PCSP goals typically appear in a table or section with columns/fields like Goal/Objective, Supports/Support Strategy, Details, and Support/Service Code.",
    "For EACH distinct goal emit one object with:",
    "  goal: the goal/objective statement, verbatim.",
    "  supports: what will be done to assist the person (the support strategy text), verbatim. Empty string if not present.",
    "  details: objective detail such as measures, frequency, target, timeline, verbatim. Empty string if not present.",
    "  job_codes: array of any service/support code(s) shown for that goal (e.g. 'SLN','DSI'). Empty array if none.",
    "Omit administrative boilerplate (headers, addresses, signatures). Only the goal rows.",
    'Respond ONLY with JSON: { "goals": [ { "goal": "...", "supports": "...", "details": "...", "job_codes": ["..."] } ] }',
    "No preamble, no markdown fences.",
  ].join("\n");

  const res = await gatewayFetch({
    messages: [
      { role: "system", content: system },
      { role: "user", content: `PCSP DOCUMENT TEXT:\n\n${documentText.slice(0, 120_000)}` },
    ],
    response_format: { type: "json_object" },
  });
  if (!res.ok) throw new Error(`NECTAR extraction failed (${res.status}).`);
  const body = await res.json();
  const content: string = body?.choices?.[0]?.message?.content ?? "{}";
  let parsed: { goals?: Array<{ goal?: string; supports?: string; details?: string; job_codes?: string[] }> };
  try {
    const clean = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    parsed = JSON.parse(clean || "{}");
  } catch {
    throw new Error("NECTAR returned malformed JSON extracting goals.");
  }
  const rows = Array.isArray(parsed.goals) ? parsed.goals : [];
  return rows.map((r) => ({
    id: sid(),
    goal: String(r.goal ?? "").slice(0, 4000),
    supports: String(r.supports ?? "").slice(0, 4000),
    details: String(r.details ?? "").slice(0, 4000),
    job_codes: Array.isArray(r.job_codes) ? r.job_codes.map((c) => String(c).slice(0, 40)) : [],
  }));
}

// ── EXTRACT PCSP goals for person-specific training (admin) ─────────────────
// Downloads the client's most-recent PCSP document, runs extractGoalsVerbatim,
// and stores the result on the client_specific_trainings.goals column.
// Creates a draft training row if none exists.
export const extractPcspGoalsForTraining = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ clientId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: AnySupabase; userId: string };
    const m = await getMembership(supabase, userId);
    adminGuard(m.role);
    await assertClientInOrg(supabase, data.clientId, m.organization_id);

    // 1) Find the most recent PCSP document for this client.
    const { data: docs, error: dErr } = await supabase
      .from("client_documents")
      .select("id, document_type, file_name, storage_path, file_url, uploaded_at")
      .eq("client_id", data.clientId)
      .order("uploaded_at", { ascending: false });
    if (dErr) throw new Error(dErr.message);
    const pcsp = (docs ?? []).find((d: { document_type: string | null }) =>
      (d.document_type ?? "").toLowerCase().includes("pcsp"),
    );
    if (!pcsp) {
      return { ok: false as const, reason: "No PCSP document found on this client. Upload the PCSP first, or enter goals manually." };
    }

    // 2) Download + extract text.
    const path = (pcsp.storage_path as string) || (pcsp.file_url as string);
    const { data: file, error: dlErr } = await supabase.storage.from("client-documents").download(path);
    if (dlErr || !file) {
      return { ok: false as const, reason: `Could not download the PCSP document: ${dlErr?.message ?? "no file"}` };
    }
    const buf = Buffer.from(await file.arrayBuffer());
    const { extractTextFromUpload } = await import("@/lib/document-text.server");
    const text = await extractTextFromUpload(buf, pcsp.file_name as string);
    if (!text || text.trim().length < 20) {
      return { ok: false as const, reason: "NECTAR couldn't read the PCSP text (scanned PDF?). Enter goals manually." };
    }

    // 3) Verbatim goal extraction.
    const goals = await extractGoalsVerbatim(text);

    // 4) Store on the person_specific training row (create draft if none exists).
    const { data: existing } = await supabase
      .from("client_specific_trainings")
      .select("id")
      .eq("client_id", data.clientId)
      .eq("training_type", "person_specific")
      .maybeSingle();

    if (existing) {
      const { error: uErr } = await supabase
        .from("client_specific_trainings")
        .update({ goals: goals as unknown, status: "draft", approved_by: null, approved_at: null })
        .eq("id", existing.id);
      if (uErr) throw new Error(uErr.message);
      return { ok: true as const, goalCount: goals.length, trainingId: existing.id as string };
    } else {
      const content = await assembleVerbatim(supabase, m.organization_id, data.clientId);
      const { data: inserted, error: iErr } = await supabase
        .from("client_specific_trainings")
        .insert({
          organization_id: m.organization_id,
          client_id: data.clientId,
          training_type: "person_specific",
          title: "Client-Specific Training",
          content: content as unknown,
          goals: goals as unknown,
          status: "draft",
          version: 1,
        })
        .select("id")
        .maybeSingle();
      if (iErr) throw new Error(iErr.message);
      return { ok: true as const, goalCount: goals.length, trainingId: (inserted?.id ?? null) as string | null };
    }
  });

// ── GET current training (admin) ────────────────────────────────────────────
export const getClientSpecificTraining = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ clientId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: AnySupabase; userId: string };
    const m = await getMembership(supabase, userId);
    adminGuard(m.role);
    await assertClientInOrg(supabase, data.clientId, m.organization_id);
    const { data: row, error } = await supabase
      .from("client_specific_trainings")
      .select("*")
      .eq("client_id", data.clientId)
      .eq("training_type", "person_specific")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { training: row };
  });

// ── DRAFT (or REBUILD) with NECTAR (admin) ──────────────────────────────────
// Assembles verbatim sections from authoritative client data and upserts a
// draft row (status='draft', version bumped on rebuild).
export const draftClientSpecificTrainingWithNectar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    clientId: z.string().uuid(),
    rebuild: z.boolean().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: AnySupabase; userId: string };
    const m = await getMembership(supabase, userId);
    adminGuard(m.role);
    await assertClientInOrg(supabase, data.clientId, m.organization_id);

    const content = await assembleVerbatim(supabase, m.organization_id, data.clientId);

    const { data: existing } = await supabase
      .from("client_specific_trainings")
      .select("id, version")
      .eq("client_id", data.clientId)
      .eq("training_type", "person_specific")
      .maybeSingle();

    if (existing) {
      const { data: updated, error: uErr } = await supabase
        .from("client_specific_trainings")
        .update({
          content: content as unknown,
          status: "draft",
          version: (existing.version ?? 1) + (data.rebuild ? 1 : 0),
          approved_by: null,
          approved_at: null,
        })
        .eq("id", existing.id)
        .select("*")
        .maybeSingle();
      if (uErr) throw new Error(uErr.message);
      return { training: updated };
    }

    const { data: inserted, error: iErr } = await supabase
      .from("client_specific_trainings")
      .insert({
        organization_id: m.organization_id,
        client_id: data.clientId,
        training_type: "person_specific",
        title: "Client-Specific Training",
        content: content as unknown,
        status: "draft",
        version: 1,
      })
      .select("*")
      .maybeSingle();
    if (iErr) throw new Error(iErr.message);
    return { training: inserted };
  });

// ── DRAFT BLANK person-specific training (admin) ────────────────────────────
// Mirrors draftSupportStrategies mode "blank" but for training_type = "person_specific".
export const draftClientSpecificTrainingBlank = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ clientId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: AnySupabase; userId: string };
    const m = await getMembership(supabase, userId);
    adminGuard(m.role);
    await assertClientInOrg(supabase, data.clientId, m.organization_id);

    const content: CSTContent = { sections: [
      { id: sid(), title: "Client-specific training", items: [
        { kind: "text", label: "Notes", value: "" },
      ] },
    ] };

    const { data: existing } = await supabase
      .from("client_specific_trainings")
      .select("id")
      .eq("client_id", data.clientId)
      .eq("training_type", "person_specific")
      .maybeSingle();

    if (existing) {
      const { data: updated, error: uErr } = await supabase
        .from("client_specific_trainings")
        .update({ content: content as unknown, status: "draft", approved_by: null, approved_at: null })
        .eq("id", existing.id)
        .select("*")
        .maybeSingle();
      if (uErr) throw new Error(uErr.message);
      return { training: updated };
    }

    const { data: inserted, error: iErr } = await supabase
      .from("client_specific_trainings")
      .insert({
        organization_id: m.organization_id,
        client_id: data.clientId,
        training_type: "person_specific",
        title: "Client-Specific Training",
        content: content as unknown,
        status: "draft",
        version: 1,
      })
      .select("*")
      .maybeSingle();
    if (iErr) throw new Error(iErr.message);
    return { training: inserted };
  });

// ── CREATE Person-Centered Profile (admin) ──────────────────────────────────
// Hive-original person-centered profile completed WITH the person. Substance
// lives in the staff's answers to review_questions; content is intentionally
// minimal. Upserts one row per client at training_type = 'person_centered'.
export const createPersonCenteredProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ clientId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: AnySupabase; userId: string };
    const m = await getMembership(supabase, userId);
    adminGuard(m.role);
    await assertClientInOrg(supabase, data.clientId, m.organization_id);

    const attestation_statement =
      "I completed this person-centered profile together with the person and/or those who know them best, reflecting their own preferences and words to the greatest extent possible. I will use this understanding to support them in the ways that matter to them.";

    const prompts: string[] = [
      "What are this person's strengths, gifts, and talents?",
      "What do people who know them well like and admire about them?",
      "What activities, interests, or routines bring them joy?",
      "What does a good day look like for them — and what makes a bad day?",
      "What support do they need to stay healthy and safe?",
      "Are there routines, accommodations, or precautions staff must follow?",
      "Who are the important people in their life, and who should be involved in decisions?",
      "How does this person communicate, and how do they prefer to be supported?",
      "What should staff do — and not do — when supporting them?",
      "What does this person want more of, and what's their vision of a good life?",
    ];
    const review_questions: CSTReviewQuestion[] = prompts.map((prompt) => ({
      id: sid(),
      tab: "profile",
      prompt,
    }));

    const content: CSTContent = {
      sections: [
        {
          id: sid(),
          title: "Person-Centered Profile",
          items: [
            {
              kind: "note",
              label: "About",
              value:
                "Complete this profile WITH the person (and/or those who know them best). Answer each question in their own words wherever possible.",
            },
          ],
        },
      ],
    };

    const { data: existing } = await supabase
      .from("client_specific_trainings")
      .select("id")
      .eq("client_id", data.clientId)
      .eq("training_type", "person_centered")
      .maybeSingle();

    if (existing) {
      const { data: updated, error: uErr } = await supabase
        .from("client_specific_trainings")
        .update({
          content: content as unknown,
          review_questions: review_questions as unknown,
          attestation_statement,
          status: "draft",
          approved_by: null,
          approved_at: null,
        })
        .eq("id", existing.id)
        .select("*")
        .maybeSingle();
      if (uErr) throw new Error(uErr.message);
      return { training: updated };
    }

    const { data: inserted, error: iErr } = await supabase
      .from("client_specific_trainings")
      .insert({
        organization_id: m.organization_id,
        client_id: data.clientId,
        training_type: "person_centered",
        title: "Person-Centered Profile",
        content: content as unknown,
        review_questions: review_questions as unknown,
        attestation_statement,
        status: "draft",
        version: 1,
      })
      .select("*")
      .maybeSingle();
    if (iErr) throw new Error(iErr.message);
    return { training: inserted };
  });

// ── ATTACH uploaded document as person-specific training (admin) ────────────
// Mirrors attachSupportStrategyDocument but for training_type = "person_specific".
export const attachClientSpecificTrainingDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    clientId: z.string().uuid(),
    fileName: z.string().min(1).max(300),
    storagePath: z.string().min(1).max(500),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: AnySupabase; userId: string };
    const m = await getMembership(supabase, userId);
    adminGuard(m.role);
    await assertClientInOrg(supabase, data.clientId, m.organization_id);

    const { data: doc, error: dErr } = await supabase
      .from("client_documents")
      .insert({
        client_id: data.clientId,
        organization_id: m.organization_id,
        document_type: "person_specific_training",
        file_name: data.fileName,
        file_url: data.storagePath,
        storage_path: data.storagePath,
        uploaded_by: userId,
      })
      .select("id")
      .maybeSingle();
    if (dErr) throw new Error(dErr.message);

    const linkContent: CSTContent = { sections: [
      { id: sid(), title: "Uploaded client-specific training", items: [
        { kind: "link", label: "Provider document", links: [{ label: data.fileName, href: null }] },
      ] },
    ] };

    const { data: existing } = await supabase
      .from("client_specific_trainings")
      .select("id")
      .eq("client_id", data.clientId)
      .eq("training_type", "person_specific")
      .maybeSingle();

    if (existing) {
      const { error: uErr } = await supabase
        .from("client_specific_trainings")
        .update({ content: linkContent as unknown, status: "draft", approved_by: null, approved_at: null })
        .eq("id", existing.id);
      if (uErr) throw new Error(uErr.message);
    } else {
      const { error: iErr } = await supabase
        .from("client_specific_trainings")
        .insert({
          organization_id: m.organization_id,
          client_id: data.clientId,
          training_type: "person_specific",
          title: "Client-Specific Training",
          content: linkContent as unknown,
          status: "draft",
          version: 1,
        });
      if (iErr) throw new Error(iErr.message);
    }
    return { ok: true, documentId: doc?.id ?? null };
  });

// ── UPDATE content/title/goals (admin) ─────────────────────────────────────
export const updateClientSpecificTraining = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    id: z.string().uuid(),
    title: z.string().min(1).max(200).optional(),
    content: ContentSchema.optional(),
    goals: z.array(GoalSchema).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: AnySupabase; userId: string };
    const m = await getMembership(supabase, userId);
    adminGuard(m.role);
    const { data: row, error } = await supabase
      .from("client_specific_trainings")
      .select("organization_id, status")
      .eq("id", data.id)
      .maybeSingle();
    if (error || !row) throw new Error("Training not found.");
    if (row.organization_id !== m.organization_id) throw new Error("Forbidden.");
    const patch: Record<string, unknown> = {};
    if (data.title !== undefined) patch.title = data.title;
    if (data.content !== undefined) patch.content = data.content;
    if (data.goals !== undefined) patch.goals = data.goals;
    // Editing a published version returns it to draft (requires re-approval).
    if (row.status === "published") {
      patch.status = "draft";
      patch.approved_by = null;
      patch.approved_at = null;
    }
    const { data: updated, error: uErr } = await supabase
      .from("client_specific_trainings")
      .update(patch)
      .eq("id", data.id)
      .select("*")
      .maybeSingle();
    if (uErr) throw new Error(uErr.message);
    return { training: updated };
  });

// ── APPROVE & PUBLISH (admin) ──────────────────────────────────────────────
export const publishClientSpecificTraining = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: AnySupabase; userId: string };
    const m = await getMembership(supabase, userId);
    adminGuard(m.role);
    const { data: row, error } = await supabase
      .from("client_specific_trainings")
      .select("organization_id")
      .eq("id", data.id)
      .maybeSingle();
    if (error || !row) throw new Error("Training not found.");
    if (row.organization_id !== m.organization_id) throw new Error("Forbidden.");
    const { data: updated, error: uErr } = await supabase
      .from("client_specific_trainings")
      .update({
        status: "published",
        approved_by: userId,
        approved_at: new Date().toISOString(),
      })
      .eq("id", data.id)
      .select("*")
      .maybeSingle();
    if (uErr) throw new Error(uErr.message);
    return { training: updated };
  });

// ── SAVE review questions (admin) ─────────────────────────────────────────
export const saveReviewQuestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    id: z.string().uuid(),
    review_questions: z.array(ReviewQuestionSchema),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: AnySupabase; userId: string };
    const m = await getMembership(supabase, userId);
    adminGuard(m.role);
    const { data: row, error } = await supabase
      .from("client_specific_trainings")
      .select("organization_id, status")
      .eq("id", data.id)
      .maybeSingle();
    if (error || !row) throw new Error("Training not found.");
    if (row.organization_id !== m.organization_id) throw new Error("Forbidden.");
    const patch: Record<string, unknown> = { review_questions: data.review_questions };
    if (row.status === "published") { patch.status = "draft"; patch.approved_by = null; patch.approved_at = null; }
    const { error: uErr } = await supabase.from("client_specific_trainings").update(patch).eq("id", data.id);
    if (uErr) throw new Error(uErr.message);
    return { ok: true };
  });

// ── NECTAR relevance check (staff) — fail-open ────────────────────────────
export const checkAnswerRelevance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    question: z.string().min(1).max(2000),
    answer: z.string().min(1).max(4000),
    context: z.string().max(8000).optional(),
  }).parse(d))
  .handler(async ({ data }) => {
    const { gatewayFetch } = await import("@/lib/ai-bedrock.server");
    const system = [
      "You check whether a direct-support worker's written answer is RELEVANT to the question about a specific client.",
      "Be FORGIVING. Any genuine, on-topic attempt passes. Only fail answers that are clearly off-topic, empty filler, or unrelated to the question/client.",
      "Do NOT grade quality, grammar, or completeness. Relevance only.",
      'Respond ONLY with JSON: { "relevant": true|false, "hint": "one short sentence if not relevant, else empty" }',
    ].join("\n");
    try {
      const res = await gatewayFetch({
        messages: [
          { role: "system", content: system },
          { role: "user", content: `QUESTION: ${data.question}\n\nANSWER: ${data.answer}\n\nCLIENT CONTEXT: ${data.context ?? "(none)"}` },
        ],
        response_format: { type: "json_object" },
      });
      if (!res.ok) return { relevant: true, hint: "" };
      const body = await res.json();
      const content: string = body?.choices?.[0]?.message?.content ?? "{}";
      const clean = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
      const parsed = JSON.parse(clean || "{}") as { relevant?: boolean; hint?: string };
      if (parsed.relevant === false) return { relevant: false, hint: String(parsed.hint ?? "Try connecting your answer to the client's goal.") };
      return { relevant: true, hint: "" };
    } catch {
      return { relevant: true, hint: "" };
    }
  });

// ── Support Strategies ─────────────────────────────────────────────────────
// One row per client (training_type='support_strategies'). Admin-authored:
// stub from PCSP goals (NECTAR verbatim), blank, or uploaded provider doc.

// NECTAR drafts "Instructions to staff" for each PCSP goal. This is an
// AI-drafted starting point only — the agency admin MUST review, edit, and
// attest before publishing. NECTAR never auto-publishes; status stays "draft".
async function draftSupportStrategyInstructions(goals: string[]): Promise<string[]> {
  if (!goals.length) return [];
  try {
    const { gatewayFetch } = await import("@/lib/ai-bedrock.server");
    const system = [
      "You are NECTAR, drafting staff support strategies for a Utah DSPD direct-support worker.",
      "For each PCSP goal, write clear, practical 'instructions to staff' — what the worker should DO on shift to help the client work toward that goal.",
      "Ground every instruction in the goal as written; do not invent diagnoses, clinical interventions, behavioral protocols, or medical procedures.",
      "Write in plain, natural language a support worker can follow. 2–5 sentences per goal.",
      "This is a DRAFT the agency admin will review, edit, and attest to before it reaches staff.",
      'Respond ONLY with JSON: { "strategies": [ { "goal": "...", "instructions": "..." } ] } preserving goal order.',
      "No preamble, no markdown fences.",
    ].join("\n");
    const user = `PCSP GOALS (in order):\n${goals.map((g, i) => `${i + 1}. ${g}`).join("\n")}`;
    const res = await gatewayFetch({
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
    });
    if (!res.ok) return goals.map(() => "");
    const body = await res.json();
    const content: string = body?.choices?.[0]?.message?.content ?? "{}";
    const clean = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    const parsed = JSON.parse(clean || "{}") as {
      strategies?: Array<{ goal?: string; instructions?: string }>;
    };
    const rows = Array.isArray(parsed.strategies) ? parsed.strategies : [];
    return goals.map((_, i) => String(rows[i]?.instructions ?? "").slice(0, 4000));
  } catch {
    return goals.map(() => "");
  }
}

async function assembleSupportStrategyStubs(
  supabase: AnySupabase,
  orgId: string,
  clientId: string,
): Promise<CSTContent> {
  const { data: client } = await supabase
    .from("clients")
    .select("pcsp_goals")
    .eq("id", clientId)
    .maybeSingle();
  const goals: string[] = Array.isArray(client?.pcsp_goals) ? (client!.pcsp_goals as string[]) : [];
  if (!goals.length) {
    void orgId;
    return { sections: [{ id: sid(), title: "Support strategy", items: [
      { kind: "text" as const, label: "Goal this supports", value: "" },
      { kind: "text" as const, label: "Instructions to staff", value: "" },
    ] }] };
  }
  // AI-drafted starting point; admin reviews/edits/attests before publish.
  const instructions = await draftSupportStrategyInstructions(goals);
  const sections: CSTSection[] = goals.map((g, i) => ({
    id: sid(),
    title: "Support strategy",
    items: [
      { kind: "text" as const, label: "Goal this supports", value: String(g) },
      { kind: "text" as const, label: "Instructions to staff", value: instructions[i] ?? "" },
    ],
  }));
  void orgId;
  return { sections };
}


export const getSupportStrategiesTraining = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ clientId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: AnySupabase; userId: string };
    const m = await getMembership(supabase, userId);
    adminGuard(m.role);
    await assertClientInOrg(supabase, data.clientId, m.organization_id);
    const { data: row, error } = await supabase
      .from("client_specific_trainings")
      .select("*")
      .eq("client_id", data.clientId)
      .eq("training_type", "support_strategies")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { training: row };
  });

export const draftSupportStrategies = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    clientId: z.string().uuid(),
    mode: z.enum(["nectar", "blank", "rebuild"]),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: AnySupabase; userId: string };
    const m = await getMembership(supabase, userId);
    adminGuard(m.role);
    await assertClientInOrg(supabase, data.clientId, m.organization_id);

    let content: CSTContent;
    if (data.mode === "blank") {
      content = { sections: [
        { id: sid(), title: "Support strategy", items: [
          { kind: "text", label: "Goal this supports", value: "" },
          { kind: "text", label: "Instructions to staff", value: "" },
        ] },
      ] };
    } else {
      content = await assembleSupportStrategyStubs(supabase, m.organization_id, data.clientId);
    }

    const { data: existing } = await supabase
      .from("client_specific_trainings")
      .select("id, version")
      .eq("client_id", data.clientId)
      .eq("training_type", "support_strategies")
      .maybeSingle();

    if (existing) {
      const { data: updated, error: uErr } = await supabase
        .from("client_specific_trainings")
        .update({
          content: content as unknown,
          status: "draft",
          version: (existing.version ?? 1) + (data.mode === "rebuild" ? 1 : 0),
          approved_by: null,
          approved_at: null,
        })
        .eq("id", existing.id)
        .select("*")
        .maybeSingle();
      if (uErr) throw new Error(uErr.message);
      return { training: updated };
    }

    const { data: inserted, error: iErr } = await supabase
      .from("client_specific_trainings")
      .insert({
        organization_id: m.organization_id,
        client_id: data.clientId,
        training_type: "support_strategies",
        title: "Support Strategies",
        attestation_statement: "I have personally reviewed the support strategies for this client. I understand the instructions for each goal and will implement them as written while supporting this client.",
        content: content as unknown,
        status: "draft",
        version: 1,
      })
      .select("*")
      .maybeSingle();
    if (iErr) throw new Error(iErr.message);
    return { training: inserted };
  });

export const attachSupportStrategyDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    clientId: z.string().uuid(),
    fileName: z.string().min(1).max(300),
    storagePath: z.string().min(1).max(500),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: AnySupabase; userId: string };
    const m = await getMembership(supabase, userId);
    adminGuard(m.role);
    await assertClientInOrg(supabase, data.clientId, m.organization_id);

    const { data: doc, error: dErr } = await supabase
      .from("client_documents")
      .insert({
        client_id: data.clientId,
        organization_id: m.organization_id,
        document_type: "support_strategy",
        file_name: data.fileName,
        file_url: data.storagePath,
        storage_path: data.storagePath,
        uploaded_by: userId,
      })
      .select("id")
      .maybeSingle();
    if (dErr) throw new Error(dErr.message);

    const linkContent: CSTContent = { sections: [
      { id: sid(), title: "Uploaded support strategy", items: [
        { kind: "link", label: "Provider document", links: [{ label: data.fileName, href: null }] },
      ] },
    ] };

    const { data: existing } = await supabase
      .from("client_specific_trainings")
      .select("id")
      .eq("client_id", data.clientId)
      .eq("training_type", "support_strategies")
      .maybeSingle();

    if (existing) {
      const { error: uErr } = await supabase
        .from("client_specific_trainings")
        .update({ content: linkContent as unknown, status: "draft", approved_by: null, approved_at: null })
        .eq("id", existing.id);
      if (uErr) throw new Error(uErr.message);
    } else {
      const { error: iErr } = await supabase
        .from("client_specific_trainings")
        .insert({
          organization_id: m.organization_id,
          client_id: data.clientId,
          training_type: "support_strategies",
          title: "Support Strategies",
          attestation_statement: "I have personally reviewed the support strategies for this client. I understand the instructions for each goal and will implement them as written while supporting this client.",
          content: linkContent as unknown,
          status: "draft",
          version: 1,
        });
      if (iErr) throw new Error(iErr.message);
    }
    return { ok: true, documentId: doc?.id ?? null };
  });

// ───────────────────────────────────────────────────────────────────────────
// STAFF VIEWER + COMPLETION (Stage 2b)
//
// HARD ACCESS CHECK: underlying clients/client_medications/hrc_reviews RLS is
// org-wide (not assignment-scoped). The server fn MUST verify that the
// requesting user is either an admin/manager OR has an active staff_assignments
// row covering this client (direct or via group-home address — same logic
// as the existing clients_for_staff RPC). NEVER rely on table RLS for scope.
// Content rendered to staff comes ENTIRELY from the published snapshot in
// client_specific_trainings.content — we do NOT re-query hrc_reviews etc.
// staff-side (staff have no read policy on hrc_reviews).
// ───────────────────────────────────────────────────────────────────────────

async function assertStaffMayViewClient(
  supabase: AnySupabase,
  orgId: string,
  userId: string,
  role: string,
  clientId: string,
): Promise<void> {
  if (["admin", "manager", "super_admin"].includes(role)) return;
  // Direct assignment first (cheap).
  const { data: direct } = await supabase
    .from("staff_assignments")
    .select("id")
    .eq("organization_id", orgId)
    .eq("staff_id", userId)
    .eq("client_id", clientId)
    .limit(1);
  if (direct && direct.length) return;
  // Group-home fallback via the SECURITY DEFINER RPC.
  const { data: scoped, error: rpcErr } = await supabase
    .rpc("clients_for_staff", { _org: orgId, _staff: userId });
  if (rpcErr) throw new Error("Access check failed.");
  const list = (scoped as Array<{ id: string }> | null) ?? [];
  if (!list.some((c) => c.id === clientId)) {
    throw new Error("Forbidden: you are not assigned to this client.");
  }
}

async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function contentHashOf(training: { id: string; version: number; content: unknown; attestation_statement: string }): Promise<string> {
  // Stable hash: training id + version + canonical JSON of content + attestation.
  const canonical = JSON.stringify({
    id: training.id,
    version: training.version,
    content: training.content,
    attestation: training.attestation_statement,
  });
  return sha256Hex(canonical);
}

// Lazy upsert of the per-org "Client-Specific Training" system requirement.
// staff_checklist_completion.requirement_id is NOT NULL → we need an anchor
// row. Stage 4 (gate wiring) will key off (origin='system', requirement_key
// = 'client_specific_training'). Insert/select via service-role: staff don't
// have nectar_requirements write privilege, and the row itself is non-PHI
// system metadata.
async function ensureClientTrainingRequirementId(
  admin: AnySupabase,
  orgId: string,
): Promise<string> {
  const { data: existing } = await admin
    .from("nectar_requirements")
    .select("id")
    .eq("organization_id", orgId)
    .eq("origin", "system")
    .eq("requirement_key", "client_specific_training")
    .limit(1)
    .maybeSingle();
  if (existing?.id) return existing.id as string;
  const { data: inserted, error } = await admin
    .from("nectar_requirements")
    .insert({
      organization_id: orgId,
      origin: "system",
      requirement_key: "client_specific_training",
      title: "Client-Specific Training",
      description: "Per-client competency: staffer affirms they have reviewed the client's published training snapshot.",
      category: "client_specific_training",
      applies_to: "staff",
      verified: true,
      review_status: "confirmed",
      approval_state: "provider_confirmed",
      metadata: { managed: "system" },
    })
    .select("id")
    .maybeSingle();
  if (error || !inserted) throw new Error(`Could not provision requirement anchor: ${error?.message ?? "unknown"}`);
  return inserted.id as string;
}

// ── STAFF: get published training for an assigned client ───────────────────
export const getStaffClientSpecificTraining = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    clientId: z.string().uuid(),
    trainingType: z.enum(["person_specific", "support_strategies"]).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: AnySupabase; userId: string };
    const m = await getMembership(supabase, userId);
    // HARD scope check — admin/manager bypass; staff must be assigned.
    await assertStaffMayViewClient(supabase, m.organization_id, userId, m.role, data.clientId);

    const trainingType = data.trainingType ?? "person_specific";

    const { data: training, error } = await supabase
      .from("client_specific_trainings")
      .select("id, organization_id, client_id, title, content, goals, review_questions, attestation_statement, status, version, updated_at")
      .eq("client_id", data.clientId)
      .eq("training_type", trainingType)
      .maybeSingle();
    if (error) throw new Error(error.message);
    // Staff only see PUBLISHED versions. Admin/manager get null too if not published yet — they can use admin path.
    if (!training || training.status !== "published") {
      return { training: null, completion: null, hash: null, pinnedToCurrent: false };
    }
    if (training.organization_id !== m.organization_id) throw new Error("Forbidden.");

    const hash = await contentHashOf(training as { id: string; version: number; content: unknown; attestation_statement: string });

    // Most recent current completion by this user for this training (pinned to a hash).
    const { data: completion } = await supabase
      .from("training_completions")
      .select("id, completed_at, content_hash, typed_signature, is_current")
      .eq("user_id", userId)
      .eq("topic_kind", "person")
      .eq("ref_id", training.id)
      .eq("is_current", true)
      .order("completed_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return {
      training: {
        id: training.id,
        client_id: training.client_id,
        title: training.title,
        content: training.content,
        goals: training.goals,
        review_questions: training.review_questions,
        attestation_statement: training.attestation_statement,
        version: training.version,
        updated_at: training.updated_at,
      },
      completion: completion ?? null,
      hash,
      // Echo whether the existing completion is pinned to the current hash.
      pinnedToCurrent: completion?.content_hash === hash,
    };
  });

// ── STAFF: complete the competency (typed-name attestation) ───────────────
export const completeClientSpecificTraining = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    clientId: z.string().uuid(),
    trainingType: z.enum(["person_specific", "support_strategies"]).optional(),
    typedSignature: z.string().trim().min(3).max(120),
    questionAnswers: z.array(z.object({ question: z.string(), answer: z.string(), tab: z.string() })).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: AnySupabase; userId: string };
    const m = await getMembership(supabase, userId);
    // Re-verify assignment scope at write time.
    await assertStaffMayViewClient(supabase, m.organization_id, userId, m.role, data.clientId);

    const trainingType = data.trainingType ?? "person_specific";

    const { data: training, error } = await supabase
      .from("client_specific_trainings")
      .select("id, organization_id, client_id, title, content, attestation_statement, status, version")
      .eq("client_id", data.clientId)
      .eq("training_type", trainingType)
      .maybeSingle();
    if (error || !training) throw new Error("Training not found.");
    if (training.organization_id !== m.organization_id) throw new Error("Forbidden.");
    if (training.status !== "published") throw new Error("This training is not published yet.");

    const hash = await contentHashOf(training as { id: string; version: number; content: unknown; attestation_statement: string });

    const topicCode = trainingType === "support_strategies" ? "support_strategies_training" : "client_specific_training";

    // Frozen snapshot of exactly what the staff member attested to.
    const { data: snapClient } = await supabase
      .from("clients")
      .select("first_name, last_name")
      .eq("id", training.client_id)
      .maybeSingle();
    const clientName =
      `${snapClient?.first_name ?? ""} ${snapClient?.last_name ?? ""}`.trim() || null;
    const sections =
      (training.content as { sections?: Array<{ title?: string }> } | null)?.sections ?? [];
    const contentSnapshot = {
      client_name: clientName,
      client_id: training.client_id,
      training_type: trainingType,
      title: training.title,
      version: training.version,
      section_titles: sections.map((s) => String(s?.title ?? "")).filter(Boolean),
      content: training.content,
      captured_at: new Date().toISOString(),
    };

    // 1) Signed completion (immutable; trigger marks prior versions not-current).
    const { data: tc, error: tcErr } = await supabase
      .from("training_completions")
      .insert({
        user_id: userId,
        topic_kind: "person",
        ref_id: training.id,
        topic_code: topicCode,
        topic_title: training.title,
        attestation_statement: training.attestation_statement,
        typed_signature: data.typedSignature,
        signer_full_name: data.typedSignature,
        consent_statement: training.attestation_statement,
        consent_accepted: true,
        content_version: String(training.version),
        content_hash: hash,
        content_snapshot: contentSnapshot,
        question_answers: data.questionAnswers ?? [],
      })
      .select("id")
      .maybeSingle();
    if (tcErr || !tc) throw new Error(tcErr?.message ?? "Could not record completion.");

    // 2) Per-(staff, client) requirement satisfaction row.
    //    Both nectar_requirements (provisioning) and staff_checklist_completion
    //    writes require admin/manager privilege under RLS — we use the service-
    //    role client because we have already verified server-side that this
    //    user is assignment-scoped to this client and is acting on themselves.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const requirementId = await ensureClientTrainingRequirementId(supabaseAdmin, m.organization_id);
    // Manual upsert against scc_unique_per_client (cannot use onConflict on a partial index).
    const { data: existingScc } = await supabaseAdmin
      .from("staff_checklist_completion")
      .select("id")
      .eq("staff_id", userId)
      .eq("requirement_id", requirementId)
      .eq("client_id", data.clientId)
      .limit(1)
      .maybeSingle();
    const completedDate = new Date().toISOString().slice(0, 10);
    if (existingScc?.id) {
      const { error: uErr } = await supabaseAdmin
        .from("staff_checklist_completion")
        .update({
          status: "complete",
          completed_date: completedDate,
          completed_by: userId,
          training_completion_id: tc.id,
          auto_checked_at: new Date().toISOString(),
        })
        .eq("id", existingScc.id);
      if (uErr) throw new Error(uErr.message);
    } else {
      const { error: iErr } = await supabaseAdmin
        .from("staff_checklist_completion")
        .insert({
          organization_id: m.organization_id,
          staff_id: userId,
          requirement_id: requirementId,
          client_id: data.clientId,
          status: "complete",
          completed_date: completedDate,
          completed_by: userId,
          training_completion_id: tc.id,
          auto_checked_at: new Date().toISOString(),
        });
      if (iErr) throw new Error(iErr.message);
    }

    return { ok: true, completionId: tc.id, requirementId, contentHash: hash };
  });

// ── STAFF/ADMIN: list assigned clients with per-training completion status ──
// Used by the staff training hub to show "Start" / "Completed" links.
export const getMyClientTrainingStatuses = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as { supabase: AnySupabase; userId: string };
    const m = await getMembership(supabase, userId);

    let clientIds: string[] = [];
    if (["admin", "manager", "super_admin"].includes(m.role)) {
      // Admins: show all clients that have at least one training row.
      const { data: rows } = await supabase
        .from("client_specific_trainings")
        .select("client_id")
        .eq("organization_id", m.organization_id);
      clientIds = [...new Set((rows ?? []).map((r: { client_id: string }) => r.client_id))] as string[];
    } else {
      // Staff: direct assignments.
      const { data: assigns } = await supabase
        .from("staff_assignments")
        .select("client_id")
        .eq("organization_id", m.organization_id)
        .eq("staff_id", userId);
      clientIds = [...new Set((assigns ?? []).map((a: { client_id: string }) => a.client_id))] as string[];
      // Group-home fallback via RPC.
      try {
        const { data: rpcClients } = await supabase.rpc("clients_for_staff", { _org: m.organization_id, _staff: userId });
        if (Array.isArray(rpcClients)) {
          const rpcIds = (rpcClients as Array<{ id: string }>).map((c) => c.id);
          clientIds = [...new Set([...clientIds, ...rpcIds])];
        }
      } catch { /* ignore */ }
    }

    if (!clientIds.length) return { items: [] as Array<{ clientId: string; clientName: string; trainings: Array<{ type: "person_specific" | "support_strategies" | "person_centered"; label: string; setupStatus: "not_setup" | "draft" | "published"; completionStatus: "not_started" | "completed"; completedAt: string | null }> }> };

    const { data: clients } = await supabase
      .from("clients")
      .select("id, first_name, last_name")
      .in("id", clientIds);
    const clientMap: Record<string, string> = {};
    for (const c of (clients ?? []) as Array<{ id: string; first_name: string | null; last_name: string | null }>) {
      clientMap[c.id] = `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim();
    }

    const { data: trainings } = await supabase
      .from("client_specific_trainings")
      .select("id, client_id, training_type, status")
      .in("client_id", clientIds);

    const trainingIds = (trainings ?? []).map((t: { id: string }) => t.id);
    const completionMap: Record<string, string> = {};
    if (trainingIds.length) {
      const { data: completions } = await supabase
        .from("training_completions")
        .select("ref_id, completed_at")
        .eq("user_id", userId)
        .eq("topic_kind", "person")
        .eq("is_current", true)
        .in("ref_id", trainingIds);
      for (const c of (completions ?? []) as Array<{ ref_id: string; completed_at: string }>) {
        completionMap[c.ref_id] = c.completed_at;
      }
    }

    type TrainingRow = { id: string; client_id: string; training_type: string; status: string };
    const byClient: Record<string, Record<string, TrainingRow>> = {};
    for (const t of (trainings ?? []) as TrainingRow[]) {
      if (!byClient[t.client_id]) byClient[t.client_id] = {};
      byClient[t.client_id][t.training_type] = t;
    }

    const items = clientIds.map((cid) => {
      const ct = byClient[cid] ?? {};
      return {
        clientId: cid,
        clientName: clientMap[cid] ?? cid,
        trainings: (["person_specific", "support_strategies", "person_centered"] as const).map((type) => {
          const t = ct[type];
          const label =
            type === "person_specific"
              ? "Person-specific"
              : type === "support_strategies"
                ? "Support strategies"
                : "Person-Centered Profile";
          if (!t) return { type, label, setupStatus: "not_setup" as const, completionStatus: "not_started" as const, completedAt: null as string | null };
          if (t.status !== "published") return { type, label, setupStatus: "draft" as const, completionStatus: "not_started" as const, completedAt: null as string | null };
          const completedAt = completionMap[t.id] ?? null;
          return { type, label, setupStatus: "published" as const, completionStatus: completedAt ? "completed" as const : "not_started" as const, completedAt };
        }),
      };
    });

    return { items };
  });
