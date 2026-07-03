import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireOrgMembership } from "@/integrations/supabase/require-org";

import { gatewayFetch } from "@/lib/ai-bedrock.server";

/**
 * NECTAR Staff — a scoped, lower-privilege assistant for the staff app.
 *
 * Distinct from admin NECTAR (`askNectarHelp`). The sources are strictly:
 *   - Company policies & training documents (org-wide, but only doc types
 *     staff are allowed to read: policy/procedure/sop/training/contract).
 *   - The caller's OWN profile, role, and pay records.
 *   - The caller's ASSIGNED clients only — resolved at query time via
 *     `clients_for_staff(org, uid)`. PCSP goals, safety/special directions,
 *     and active medications needed to deliver care.
 *
 * Hard denies (enforced server-side, before the model call):
 *   - Any client not on the caller's caseload right now.
 *   - Other staff members' pay, hours, or profile data.
 *   - Billing, financial, admin, business, audit, or hive-exec data.
 *   - Admin NECTAR tools.
 *
 * RLS still applies through the auth-middleware client; this file adds a
 * second tighter scope so the model can never see data the staff member
 * isn't entitled to.
 */

export interface NectarStaffCitation {
  type: "policy" | "training" | "pcsp" | "medication" | "pay";
  id: string;
  title: string;
}

export interface NectarStaffReply {
  answer: string;
  citations: NectarStaffCitation[];
  usedClientIds: string[];
  refused: boolean;
}

interface AskStaffInput {
  question: string;
  clientId?: string;
  organizationId: string;
}

function validate(input: unknown): AskStaffInput {
  const i = (input ?? {}) as Record<string, unknown>;
  const question = typeof i.question === "string" ? i.question.trim() : "";
  if (question.length < 2 || question.length > 2000) {
    throw new Error("Question must be 2–2000 characters.");
  }
  const clientId =
    typeof i.clientId === "string" && /^[0-9a-f-]{36}$/i.test(i.clientId)
      ? i.clientId
      : undefined;
  const organizationId = typeof i.organizationId === "string" ? i.organizationId : "";
  if (!/^[0-9a-f-]{36}$/i.test(organizationId)) throw new Error("Invalid organizationId.");
  return { question, clientId, organizationId };
}


const STAFF_DOC_TYPES = ["policy", "procedure", "sop", "training", "contract"];

// Loose shape — auth-middleware client surface we touch.
type SupabaseLike = {
  from: (table: string) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
};

interface PolicyFact { id: string; title: string; document_type: string; excerpt: string }
interface TrainingFact { id: string; title: string; kind: "doc" | "lesson"; excerpt: string }
interface ClientFact {
  id: string;
  name: string;
  pcsp_goals: string[];
  special_directions: string | null;
  medications: Array<{
    id: string;
    name: string;
    dosage: string | null;
    frequency: string | null;
    route: string | null;
    is_prn: boolean;
    is_controlled: boolean;
    instructions: string | null;
    choking_risk: boolean;
    choking_risk_details: string | null;
    adverse_effects: string | null;
  }>;
}

interface StaffFacts {
  caller: {
    user_id: string;
    full_name: string | null;
    role: string;
    job_title: string | null;
    worker_type: string | null;
  };
  organization_id: string;
  pay_period: {
    hours_this_period: number | null;
    estimated_earnings: number | null;
    period_label: string | null;
  };
  policies: PolicyFact[];
  training: TrainingFact[];
  clients: ClientFact[];
  allowed_client_ids: string[];
  notes: string[];
}

const STOPWORDS = new Set([
  "the","a","an","and","or","of","to","in","for","on","at","by","with","from","is","are","be",
  "what","which","who","that","this","these","those","do","does","did","have","has","had",
  "i","you","we","they","it","my","your","our","their","its","how","when","where","why",
]);

function keywords(q: string): string[] {
  const tokens = q.toLowerCase().match(/[a-z][a-z0-9-]{2,}/g) ?? [];
  const out = new Set<string>();
  for (const t of tokens) {
    if (STOPWORDS.has(t)) continue;
    out.add(t);
    if (t.endsWith("ies") && t.length > 4) out.add(t.slice(0, -3) + "y");
    else if (t.endsWith("ing") && t.length > 5) out.add(t.slice(0, -3));
    else if (t.endsWith("ed") && t.length > 4) out.add(t.slice(0, -2));
    else if (t.endsWith("s") && t.length > 3) out.add(t.slice(0, -1));
  }
  return Array.from(out).slice(0, 30);
}

function bestExcerpt(text: string | null, kw: string[]): string {
  if (!text) return "";
  const chunks = text
    .split(/(?<=[.!?])\s+(?=[A-Z0-9(])|\n{2,}/)
    .map((s) => s.trim())
    .filter((s) => s.length > 20 && s.length < 700);
  let bestScore = 0;
  let best = chunks[0] ?? "";
  for (const c of chunks) {
    const low = c.toLowerCase();
    let s = 0;
    for (const k of kw) if (low.includes(k)) s += 1;
    if (s > bestScore) { bestScore = s; best = c; }
  }
  if (bestScore === 0) return (text.slice(0, 400) || "").trim();
  return best;
}

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
  if (res.status === 429) throw new Error("NECTAR is busy — try again in a moment.");
  if (res.status === 402) throw new Error("AI workspace credits exhausted.");
  if (!res.ok) throw new Error(`AI error (${res.status}).`);
  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return json.choices?.[0]?.message?.content ?? "{}";
}

export const askNectarStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validate)
  .handler(async ({ data, context }): Promise<NectarStaffReply> => {
    const supabase = context.supabase as unknown as SupabaseLike;
    const userId = context.userId;
    const orgId = data.organizationId;
    const kw = keywords(data.question);

    // 1. Verify caller is an active member of the PASSED org (employee+).
    await requireOrgMembership(
      context.supabase as unknown as Parameters<typeof requireOrgMembership>[0],
      userId,
      orgId,
      "employee",
    );

    // Load the caller's role/job_title within this org for prompt context.
    const memQ = await supabase
      .from("organization_members")
      .select("role, job_title")
      .eq("organization_id", orgId)
      .eq("user_id", userId)
      .eq("active", true)
      .maybeSingle();
    const mem = (memQ.data as { role: string; job_title: string | null } | null) ?? {
      role: "employee",
      job_title: null,
    };

    // 2. Build allowed client set via SECURITY DEFINER function.
    const assignedRpc = await supabase.rpc("clients_for_staff", {
      _org: orgId,
      _staff: userId,
    });
    const assignedRows = (assignedRpc.data as Array<{
      id: string; first_name: string; last_name: string;
      pcsp_goals: string[] | null; special_directions: string | null;
    }> | null) ?? [];
    const allowed = new Set(assignedRows.map((r) => r.id));

    // If a focused clientId was passed, assert it's allowed; otherwise drop it.
    let focusedId: string | undefined;
    if (data.clientId) {
      if (!allowed.has(data.clientId)) {
        return {
          answer: "That person isn't on your caseload, so I can't share information about them. Please ask your manager if you think this is a mistake.",
          citations: [],
          usedClientIds: [],
          refused: true,
        };
      }
      focusedId = data.clientId;
    }

    // 3. Caller profile + pay period (own only).
    const [profQ, periodQ] = await Promise.all([
      supabase.from("profiles").select("full_name, worker_type").eq("id", userId).maybeSingle(),
      // Simple self-scoped pay period summary — current month aggregate
      supabase
        .from("evv_timesheets")
        .select("clock_in_timestamp, clock_out_timestamp, total_hours")
        .eq("staff_id", userId)
        .gte("clock_in_timestamp", new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString())
        .limit(500),
    ]);
    const prof = (profQ.data as { full_name: string | null; worker_type: string | null } | null) ?? null;
    const periodRows = (periodQ.data as Array<{ total_hours: number | null }> | null) ?? [];
    const periodHours = periodRows.reduce((sum, r) => sum + (typeof r.total_hours === "number" ? r.total_hours : 0), 0);

    // 4. Policies + training docs (org-wide but type-restricted).
    const docsQ = await supabase
      .from("nectar_documents")
      .select("id, title, document_type, raw_text")
      .eq("organization_id", orgId)
      .in("document_type", STAFF_DOC_TYPES)
      .eq("is_current", true)
      .limit(120);
    const docRows = (docsQ.data as Array<{
      id: string; title: string; document_type: string; raw_text: string | null;
    }> | null) ?? [];
    const policies: PolicyFact[] = [];
    const training: TrainingFact[] = [];
    for (const d of docRows) {
      const excerpt = bestExcerpt(d.raw_text, kw);
      if (d.document_type === "training") {
        training.push({ id: d.id, title: d.title, kind: "doc", excerpt });
      } else {
        policies.push({ id: d.id, title: d.title, document_type: d.document_type, excerpt });
      }
    }

    // 5. Assigned client medical/PCSP details. Scope strictly by allowed set.
    const clientIdsToInclude = focusedId
      ? [focusedId]
      : assignedRows.slice(0, 8).map((c) => c.id);

    const clientFacts: ClientFact[] = [];
    if (clientIdsToInclude.length > 0) {
      const medsQ = await supabase
        .from("client_medications")
        .select("id, client_id, medication_name, dosage, frequency, route, is_prn, is_controlled, instructions, choking_risk, choking_risk_details, adverse_effects, is_active")
        .in("client_id", clientIdsToInclude)
        .eq("is_active", true)
        .limit(200);
      const medsByClient = new Map<string, Array<{
        id: string; client_id: string; medication_name: string; dosage: string | null;
        frequency: string | null; route: string | null; is_prn: boolean; is_controlled: boolean;
        instructions: string | null; choking_risk: boolean; choking_risk_details: string | null;
        adverse_effects: string | null;
      }>>();
      for (const m of (medsQ.data ?? []) as Array<{
        id: string; client_id: string; medication_name: string; dosage: string | null;
        frequency: string | null; route: string | null; is_prn: boolean; is_controlled: boolean;
        instructions: string | null; choking_risk: boolean; choking_risk_details: string | null;
        adverse_effects: string | null;
      }>) {
        const arr = medsByClient.get(m.client_id) ?? [];
        arr.push(m);
        medsByClient.set(m.client_id, arr);
      }
      for (const c of assignedRows.filter((r) => clientIdsToInclude.includes(r.id))) {
        clientFacts.push({
          id: c.id,
          name: `${c.first_name} ${c.last_name}`.trim(),
          pcsp_goals: c.pcsp_goals ?? [],
          special_directions: c.special_directions,
          medications: (medsByClient.get(c.id) ?? []).map((m) => ({
            id: m.id, name: m.medication_name, dosage: m.dosage, frequency: m.frequency,
            route: m.route, is_prn: m.is_prn, is_controlled: m.is_controlled,
            instructions: m.instructions, choking_risk: m.choking_risk,
            choking_risk_details: m.choking_risk_details, adverse_effects: m.adverse_effects,
          })),
        });
      }
    }

    const facts: StaffFacts = {
      caller: {
        user_id: userId,
        full_name: prof?.full_name ?? null,
        role: mem.role,
        job_title: mem.job_title,
        worker_type: prof?.worker_type ?? null,
      },
      organization_id: orgId,
      pay_period: {
        hours_this_period: Math.round(periodHours * 100) / 100,
        estimated_earnings: null,
        period_label: "current month",
      },
      policies,
      training,
      clients: clientFacts,
      allowed_client_ids: Array.from(allowed),
      notes: [],
    };

    const system = `You are NECTAR Staff — a scoped, plain-language shift-manager assistant inside the HIVE staff app. You help one staff member do their job for the people they support.

ABSOLUTE SCOPE RULES (you MUST refuse anything outside these):
1. ALLOWED TOPICS:
   - Company policies & procedures (from FACTS.policies).
   - Training material the staff member has access to (from FACTS.training).
   - The staff member's OWN role/duties/processes (FACTS.caller).
   - The staff member's OWN pay & reimbursement (FACTS.pay_period). NEVER other staff's pay.
   - For clients listed in FACTS.clients: their PCSP goals, special directions (safety), and active medications needed to safely deliver care. These people are on this staff member's caseload right now.
2. FORBIDDEN — REFUSE and direct them to a manager/admin:
   - Any client NOT in FACTS.clients (do not even confirm whether such a person exists in the system).
   - Any other staff member's information (name, pay, hours, role).
   - Billing rates, dollar amounts, financial figures, business operations.
   - Admin tools (audit, 520, PBA, requirement approvals, agency health).
3. You explain policy and process. You do NOT make compliance verdicts or business rulings — if asked for a verdict, state the relevant policy and recommend escalating to a manager.
4. TRAINING INTEGRITY — REFUSE TO ANSWER QUIZ/KNOWLEDGE-CHECK QUESTIONS DIRECTLY. If the staff member asks you to pick the correct answer to a training quiz/knowledge-check/test question (e.g. "what's the answer to question 3", "is A or B correct", "which option is right", "give me the answer"), DO NOT supply the answer or rank the choices. Instead: (a) briefly explain the underlying concept in your own words from the training/policy material, (b) tell them to review the lesson and choose the answer themselves, and (c) remind them the completion is a signed personal attestation of their understanding. This rule overrides everything else when the request looks like a quiz lookup.

ANSWER STYLE:
- Plain, warm, mobile-friendly. Short paragraphs. Bullets when listing meds, goals, or steps.
- Lead with the direct answer. Then specifics. Then a brief "Source:" line with the policy/training title when used.
- For medications, ALWAYS include dosage, frequency, route, and any choking-risk or PRN notes when present.
- For PCSP goals, list them as the goals the staff member should be reporting on in daily paperwork.
- If the question is outside scope, respond ONLY with a short refusal that tells them to ask their manager/admin. Do not hedge or guess.

PRIVACY: Client information here is PHI. The user is authorized for these specific people only.

CALLER:
${JSON.stringify(facts.caller, null, 2)}

PAY (own only):
${JSON.stringify(facts.pay_period, null, 2)}

ASSIGNED CLIENTS (the only people you may discuss):
${JSON.stringify(facts.clients, null, 2)}

POLICIES:
${JSON.stringify(facts.policies.map((p) => ({ id: p.id, title: p.title, type: p.document_type, excerpt: p.excerpt })), null, 2)}

TRAINING:
${JSON.stringify(facts.training.map((t) => ({ id: t.id, title: t.title, excerpt: t.excerpt })), null, 2)}

OUTPUT — STRICT JSON ONLY:
{
  "answer": "<plain-language answer with markdown bullets where helpful>",
  "citations": [{ "type": "policy"|"training"|"pcsp"|"medication"|"pay", "id": "<id from FACTS>", "title": "<title>" }],
  "refused": true | false
}
"refused" = true ONLY when you declined an out-of-scope request.`;

    const raw = await callAI(system, data.question);
    let parsed: Partial<NectarStaffReply> = {};
    try { parsed = JSON.parse(raw); } catch {
      const m = raw.match(/\{[\s\S]*\}/);
      if (m) { try { parsed = JSON.parse(m[0]); } catch { /* ignore */ } }
    }

    const answer = typeof parsed.answer === "string" && parsed.answer.trim().length > 0
      ? parsed.answer.trim()
      : "I don't have that information available to me. Please check with your manager.";

    // Hard-filter citations against allowed sets — never echo unallowed ids.
    const allowedPolicyIds = new Set(policies.map((p) => p.id));
    const allowedTrainingIds = new Set(training.map((t) => t.id));
    const allowedMedIds = new Set(clientFacts.flatMap((c) => c.medications.map((m) => m.id)));
    const allowedClientIds = new Set(clientFacts.map((c) => c.id));
    const rawCitations = Array.isArray(parsed.citations) ? parsed.citations : [];
    const citations: NectarStaffCitation[] = [];
    for (const c of rawCitations) {
      if (!c || typeof c !== "object") continue;
      const cc = c as { type?: unknown; id?: unknown; title?: unknown };
      if (typeof cc.type !== "string" || typeof cc.id !== "string" || typeof cc.title !== "string") continue;
      const id = cc.id;
      if (cc.type === "policy" && allowedPolicyIds.has(id)) citations.push({ type: "policy", id, title: cc.title });
      else if (cc.type === "training" && allowedTrainingIds.has(id)) citations.push({ type: "training", id, title: cc.title });
      else if (cc.type === "pcsp" && allowedClientIds.has(id)) citations.push({ type: "pcsp", id, title: cc.title });
      else if (cc.type === "medication" && allowedMedIds.has(id)) citations.push({ type: "medication", id, title: cc.title });
      else if (cc.type === "pay") citations.push({ type: "pay", id: userId, title: "Your pay period" });
    }

    return {
      answer,
      citations,
      usedClientIds: clientFacts.map((c) => c.id),
      refused: !!parsed.refused,
    };
  });
