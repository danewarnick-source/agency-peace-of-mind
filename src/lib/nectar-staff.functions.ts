import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireOrgMembership } from "@/integrations/supabase/require-org";

import { assertBedrockConfigured, gatewayFetch } from "@/lib/ai-bedrock.server";
import {
  questionWantsClientContext,
  questionWantsMedications,
  slimPcspGoals,
  staffNectarFailureMessage,
} from "@/lib/nectar-staff-errors";
import {
  buildSchedulePack,
  questionWantsPayOrHours,
  questionWantsSchedule,
  resolveScheduleSubject,
  scheduleQueryWindow,
  staffPayHoursRefusalReply,
  staffUnresolvedPersonRefusal,
  type NamedPerson,
  type StaffScheduleFact,
  type StaffShiftRow,
} from "@/lib/nectar-staff-scope";

/**
 * NECTAR Staff — a scoped, lower-privilege assistant for the staff app.
 *
 * Distinct from admin NECTAR (`askNectarHelp`). The sources are strictly:
 *   - Company policies & training documents (org-wide, but only doc types
 *     staff are allowed to read: policy/procedure/sop/training/contract).
 *   - The caller's OWN profile and role (never pay, hours, or earnings).
 *   - The caller's OWN published upcoming / recent shifts (`scheduled_shifts`
 *     where staff_id = caller).
 *   - The caller's ASSIGNED clients — resolved at query time via
 *     `clients_for_staff(org, uid)`. PCSP goals, safety/special directions,
 *     and active medications needed to deliver care.
 *   - Schedule questions about a named person only when that person is the
 *     caller, on the caseload, or on a shift assigned to the caller.
 *
 * Hard denies (enforced server-side, before the model call):
 *   - Pay, rates, overtime pay, estimated earnings, and hours worked.
 *   - Any client not on the caller's caseload and not on the caller's shifts.
 *   - Other staff members' pay, hours, profile, or schedules.
 *   - Billing, financial, admin, business, audit, or hive-exec data.
 *   - Admin NECTAR tools.
 *
 * RLS still applies through the auth-middleware client; this file adds a
 * second tighter scope so the model can never see data the staff member
 * isn't entitled to.
 */

export interface NectarStaffCitation {
  type: "policy" | "training" | "pcsp" | "medication" | "schedule";
  id: string;
  title: string;
}

export interface NectarStaffReply {
  answer: string;
  citations: NectarStaffCitation[];
  usedClientIds: string[];
  refused: boolean;
  deepLink?: { path: string; label: string } | null;
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
  schedule: {
    today: string;
    upcoming: StaffScheduleFact[];
    this_month: StaffScheduleFact[];
    next_with_client: StaffScheduleFact | null;
    shifts_this_month_with_client: number | null;
    focused_client_id: string | null;
    note: string;
  } | null;
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

const MAX_SYSTEM_CHARS = 12_000;

function clipSystem(system: string): string {
  if (system.length <= MAX_SYSTEM_CHARS) return system;
  return `${system.slice(0, MAX_SYSTEM_CHARS)}\n\n[context truncated]`;
}

async function callAI(system: string, user: string): Promise<string> {
  try {
    assertBedrockConfigured();
  } catch (e) {
    const status = typeof (e as { status?: number }).status === "number"
      ? (e as { status: number }).status
      : 500;
    const raw = e instanceof Error ? e.message : "";
    throw new Error(staffNectarFailureMessage(status, raw));
  }
  const slim = clipSystem(system);
  const res = await gatewayFetch({
      model: "bedrock",
      messages: [
        { role: "system", content: slim },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
    });
  if (res.ok) {
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return json.choices?.[0]?.message?.content ?? "{}";
  }
  const firstText = await res.text().catch(() => "");
  if (res.status === 400) {
    const retry = await gatewayFetch({
      model: "bedrock",
      messages: [
        {
          role: "system",
          content: `You are NECTAR Staff. Answer this staff how-to question in plain language. OUTPUT STRICT JSON: {"answer":"...","citations":[],"refused":false}`,
        },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
    });
    if (retry.ok) {
      const json = (await retry.json()) as { choices?: Array<{ message?: { content?: string } }> };
      return json.choices?.[0]?.message?.content ?? "{}";
    }
    const retryText = await retry.text().catch(() => "");
    throw new Error(staffNectarFailureMessage(retry.status, retryText || firstText));
  }
  throw new Error(staffNectarFailureMessage(res.status, firstText));
}

export const askNectarStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validate)
  .handler(async ({ data, context }): Promise<NectarStaffReply> => {
    const supabase = context.supabase as unknown as SupabaseLike;
    const userId = context.userId;
    if (!supabase || !userId) {
      return {
        answer: "I don't have that information available to me. Please check with your manager.",
        citations: [],
        usedClientIds: [],
        refused: true,
        deepLink: null,
      };
    }
    const orgId = data.organizationId;
    const kw = keywords(data.question);

    // 1. Verify caller is an active member of the PASSED org (employee+).
    await requireOrgMembership(
      context.supabase as unknown as Parameters<typeof requireOrgMembership>[0],
      userId,
      orgId,
      "employee",
    );

    if (questionWantsPayOrHours(data.question)) {
      return staffPayHoursRefusalReply();
    }

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
    const caseloadPeople: NamedPerson[] = assignedRows.map((r) => ({
      id: r.id,
      first_name: r.first_name,
      last_name: r.last_name,
    }));

    // 3. Caller profile + own published shifts (never pay / clocked hours).
    const window = scheduleQueryWindow();
    const [profQ, shiftsQ] = await Promise.all([
      supabase.from("profiles").select("full_name, worker_type").eq("id", userId).maybeSingle(),
      supabase
        .from("scheduled_shifts")
        .select("id, client_id, job_code, starts_at, ends_at, status, published, clients:client_id(first_name, last_name)")
        .eq("staff_id", userId)
        .eq("organization_id", orgId)
        .eq("published", true)
        .neq("status", "cancelled")
        .gte("starts_at", window.fromIso)
        .lt("starts_at", window.toIso)
        .order("starts_at", { ascending: true })
        .limit(200),
    ]);
    const prof = (profQ.data as { full_name: string | null; worker_type: string | null } | null) ?? null;

    const rawShifts = (shiftsQ.data ?? []) as Array<{
      id: string;
      client_id: string;
      job_code: string | null;
      starts_at: string;
      ends_at: string;
      clients: { first_name: string; last_name: string } | { first_name: string; last_name: string }[] | null;
    }>;
    const ownShifts: StaffShiftRow[] = rawShifts.map((r) => {
      const client = Array.isArray(r.clients) ? r.clients[0] : r.clients;
      const fromCaseload = assignedRows.find((c) => c.id === r.client_id);
      const name = client
        ? `${client.first_name ?? ""} ${client.last_name ?? ""}`.trim()
        : fromCaseload
          ? `${fromCaseload.first_name} ${fromCaseload.last_name}`.trim()
          : "Client";
      return {
        id: r.id,
        client_id: r.client_id,
        client_name: name || "Client",
        job_code: r.job_code,
        starts_at: r.starts_at,
        ends_at: r.ends_at,
      };
    });
    const ownShiftClientIds = new Set(ownShifts.map((s) => s.client_id));
    const ownShiftPeople: NamedPerson[] = [];
    const seenShiftClient = new Set<string>();
    for (const s of ownShifts) {
      if (seenShiftClient.has(s.client_id)) continue;
      seenShiftClient.add(s.client_id);
      const fromCase = caseloadPeople.find((c) => c.id === s.client_id);
      if (fromCase) {
        ownShiftPeople.push(fromCase);
        continue;
      }
      const parts = s.client_name.split(/\s+/).filter(Boolean);
      ownShiftPeople.push({
        id: s.client_id,
        first_name: parts[0] ?? "Client",
        last_name: parts.slice(1).join(" "),
      });
    }

    const wantsSchedule = questionWantsSchedule(data.question);

    // Focused clientId: caseload (PHI + schedule) or own published shift (schedule only).
    let focusedId: string | undefined;
    if (data.clientId) {
      if (!allowed.has(data.clientId) && !ownShiftClientIds.has(data.clientId)) {
        return {
          answer: "That person isn't on your caseload or on a shift assigned to you, so I can't share information about them. Please ask your manager if you think this is a mistake.",
          citations: [],
          usedClientIds: [],
          refused: true,
          deepLink: null,
        };
      }
      focusedId = data.clientId;
    }

    let scheduleSubjectClientId: string | undefined;
    if (wantsSchedule) {
      const subject = resolveScheduleSubject(
        data.question,
        { user_id: userId, full_name: prof?.full_name ?? null },
        caseloadPeople,
        ownShiftPeople,
      );
      if (subject.kind === "unresolved") {
        return staffUnresolvedPersonRefusal(subject.token);
      }
      if (subject.kind === "client") {
        scheduleSubjectClientId = subject.person.id;
      }
    }

    // 4. Policies + training docs (org-wide but type-restricted).
    const docsQ = await supabase
      .from("nectar_documents")
      .select("id, title, document_type, raw_text")
      .eq("organization_id", orgId)
      .in("document_type", STAFF_DOC_TYPES)
      .eq("is_current", true)
      .limit(24);
    const docRows = (docsQ.data as Array<{
      id: string; title: string; document_type: string; raw_text: string | null;
    }> | null) ?? [];
    const policies: PolicyFact[] = [];
    const training: TrainingFact[] = [];
    for (const d of docRows) {
      const excerpt = bestExcerpt(d.raw_text, kw);
      const scored = kw.length === 0 ? 1 : kw.filter((k) => `${d.title} ${excerpt}`.toLowerCase().includes(k)).length;
      if (scored === 0 && (policies.length + training.length) >= 6) continue;
      if (d.document_type === "training") {
        training.push({ id: d.id, title: d.title, kind: "doc", excerpt });
      } else {
        policies.push({ id: d.id, title: d.title, document_type: d.document_type, excerpt });
      }
    }

    // 5. Assigned client medical/PCSP details. Scope strictly by allowed set.
    // How-to questions ("How do I clock in?") do not need a PHI dump — a
    // bloated system prompt was 400ing Bedrock on CloudFront.
    const looksClientSpecific =
      !!focusedId || questionWantsClientContext(data.question);
    const wantsMeds = questionWantsMedications(data.question);
    const maxClients = focusedId ? 1 : 4;
    const clientIdsToInclude = !looksClientSpecific
      ? []
      : focusedId
        ? [focusedId]
        : assignedRows.slice(0, maxClients).map((c) => c.id);

    const clientFacts: ClientFact[] = [];
    if (clientIdsToInclude.length > 0) {
      const medsByClient = new Map<string, Array<{
        id: string; client_id: string; medication_name: string; dosage: string | null;
        frequency: string | null; route: string | null; is_prn: boolean; is_controlled: boolean;
        instructions: string | null; choking_risk: boolean; choking_risk_details: string | null;
        adverse_effects: string | null;
      }>>();
      if (wantsMeds) {
        const medsQ = await supabase
          .from("client_medications")
          .select("id, client_id, medication_name, dosage, frequency, route, is_prn, is_controlled, instructions, choking_risk, choking_risk_details, adverse_effects, is_active")
          .in("client_id", clientIdsToInclude)
          .eq("is_active", true)
          .limit(80);
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
      }
      for (const c of assignedRows.filter((r) => clientIdsToInclude.includes(r.id))) {
        const directions = c.special_directions?.trim() ?? "";
        clientFacts.push({
          id: c.id,
          name: `${c.first_name} ${c.last_name}`.trim(),
          pcsp_goals: slimPcspGoals(c.pcsp_goals),
          special_directions: directions ? directions.slice(0, wantsMeds ? 400 : 200) : null,
          medications: wantsMeds
            ? (medsByClient.get(c.id) ?? []).map((m) => ({
                id: m.id, name: m.medication_name, dosage: m.dosage, frequency: m.frequency,
                route: m.route, is_prn: m.is_prn, is_controlled: m.is_controlled,
                instructions: m.instructions, choking_risk: m.choking_risk,
                choking_risk_details: m.choking_risk_details, adverse_effects: m.adverse_effects,
              }))
            : [],
        });
      }
    }

    const scheduleFocusId = scheduleSubjectClientId ?? (wantsSchedule ? focusedId : undefined);
    const schedulePack = wantsSchedule
      ? {
          ...buildSchedulePack(ownShifts, new Date(), scheduleFocusId),
          focused_client_id: scheduleFocusId ?? null,
          note: "These are THIS staff member's published shifts only. Never invent shifts. Never report hours or pay. Count = number of these rows, not duration.",
        }
      : null;

    const facts: StaffFacts = {
      caller: {
        user_id: userId,
        full_name: prof?.full_name ?? null,
        role: mem.role,
        job_title: mem.job_title,
        worker_type: prof?.worker_type ?? null,
      },
      organization_id: orgId,
      schedule: schedulePack,
      policies,
      training,
      clients: clientFacts,
      allowed_client_ids: Array.from(allowed),
      notes: [],
    };

    const system = `You are NECTAR Staff — a scoped, plain-language shift-manager assistant inside the Provider Interface staff app. You help one staff member do their job for the people they support.

ABSOLUTE SCOPE RULES (you MUST refuse anything outside these):
1. ALLOWED TOPICS:
   - Company policies & procedures (from FACTS.policies).
   - Training material the staff member has access to (from FACTS.training).
   - The staff member's OWN role/duties/processes (FACTS.caller).
   - The staff member's OWN published schedule (FACTS.schedule) — upcoming shifts and how many of THEIR shifts they have with a named person this month. Times are Mountain Time. Answer day-name questions from this pack.
   - For clients listed in FACTS.clients: their PCSP goals, special directions (safety), and active medications needed to safely deliver care. These people are on this staff member's caseload right now.
2. FORBIDDEN — REFUSE and direct them to a manager/admin (do not compute or guess):
   - Pay, rates, dollars, overtime pay, estimated earnings, "how much did I make", or any money.
   - Hours worked / hours this week / month / pay period. Even if you can see shift start/end times, do not add them up as hours worked.
   - Any client NOT in FACTS.clients and NOT named in FACTS.schedule (do not even confirm whether such a person exists in the system).
   - Any other staff member's information (name, pay, hours, role, schedule). Never another DSP's calendar or a client's full roster.
   - Billing rates, invoices, 520, PBA, financial figures, business operations.
   - Admin tools (audit, requirement approvals, agency health). Quiz answer keys and audit verdicts.
3. You explain policy and process. You do NOT make compliance verdicts or business rulings — if asked for a verdict, state the relevant policy and recommend escalating to a manager.
4. TRAINING INTEGRITY — REFUSE TO ANSWER QUIZ/KNOWLEDGE-CHECK QUESTIONS DIRECTLY. If the staff member asks you to pick the correct answer to a training quiz/knowledge-check/test question (e.g. "what's the answer to question 3", "is A or B correct", "which option is right", "give me the answer"), DO NOT supply the answer or rank the choices. Instead: (a) briefly explain the underlying concept in your own words from the training/policy material, (b) tell them to review the lesson and choose the answer themselves, and (c) remind them the completion is a signed personal attestation of their understanding. This rule overrides everything else when the request looks like a quiz lookup.

ANSWER STYLE:
- Plain, warm, mobile-friendly. Short paragraphs. Bullets when listing shifts, meds, goals, or steps.
- Lead with the direct answer. Then specifics. Then a brief "Source:" line with the policy/training/schedule title when used.
- For schedule answers, list weekday + time + person + service code from FACTS.schedule. If the pack is empty, say you do not see published shifts in this window.
- For medications, ALWAYS include dosage, frequency, route, and any choking-risk or PRN notes when present.
- For PCSP goals, list them as the goals the staff member should be reporting on in daily paperwork.
- If the question is outside scope, respond ONLY with a short refusal that tells them to ask their manager/admin. Do not hedge or guess.

PRIVACY: Client information here is PHI. The user is authorized for these specific people only.

CALLER:
${JSON.stringify(facts.caller, null, 2)}

YOUR SCHEDULE (own published shifts only; omit hours and pay):
${facts.schedule ? JSON.stringify(facts.schedule, null, 2) : "not loaded — question is not a schedule question"}

ASSIGNED CLIENTS (the only people you may discuss for care details):
${JSON.stringify(facts.clients, null, 2)}

POLICIES:
${JSON.stringify(facts.policies.map((p) => ({ id: p.id, title: p.title, type: p.document_type, excerpt: p.excerpt })), null, 2)}

TRAINING:
${JSON.stringify(facts.training.map((t) => ({ id: t.id, title: t.title, excerpt: t.excerpt })), null, 2)}

OUTPUT — STRICT JSON ONLY:
{
  "answer": "<plain-language answer with markdown bullets where helpful>",
  "citations": [{ "type": "policy"|"training"|"pcsp"|"medication"|"schedule", "id": "<id from FACTS>", "title": "<title>" }],
  "refused": true | false
}
"refused" = true ONLY when you declined an out-of-scope request. When you used FACTS.schedule, include a citation { "type": "schedule", "id": "own-schedule", "title": "Your schedule" }.`;

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
    const allowedShiftIds = new Set(ownShifts.map((s) => s.id));
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
      else if (
        cc.type === "schedule" &&
        (id === "own-schedule" || allowedShiftIds.has(id) || (scheduleFocusId && id === scheduleFocusId))
      ) {
        citations.push({ type: "schedule", id, title: cc.title || "Your schedule" });
      }
    }
    if (wantsSchedule && !parsed.refused && !citations.some((c) => c.type === "schedule")) {
      citations.push({ type: "schedule", id: "own-schedule", title: "Your schedule" });
    }

    const usedClientIds = [
      ...clientFacts.map((c) => c.id),
      ...(scheduleFocusId ? [scheduleFocusId] : []),
    ].filter((id, i, arr) => arr.indexOf(id) === i);

    return {
      answer,
      citations,
      usedClientIds,
      refused: !!parsed.refused,
      deepLink: null,
    };
  });
