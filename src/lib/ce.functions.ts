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

// ──────────────── Types ────────────────────────────────────────────────────

export type CeStepLesson = {
  type: "lesson";
  kicker?: string;
  title: string;
  body: string;
  facts?: [string, string][];
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
  if (lessons < 5) throw new Error(`Module floor not met: needs ≥5 lessons (got ${lessons}).`);
  if (checks < 5) throw new Error(`Module floor not met: needs ≥5 scenario checks (got ${checks}).`);
  if (reflects !== 1) throw new Error("Module must end with exactly one reflection.");
  return out;
}

// ──────────────── Nectar AI call ───────────────────────────────────────────

async function callNectarForCe(prompt: string): Promise<CeStep[]> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY is not configured.");

  const system = `You are NECTAR, a coaching engine for experienced DSPD direct-support staff (year 2+).
Build ONE monthly Continuing Education review of at least 60 minutes of genuine material, framed as coaching: what happened in this staff member's prior month, why it matters, and how to do better. Write at an EXPERIENCED-staff level — finer judgment calls, not the basics already covered in initial training.

Output STRICT JSON, no markdown, matching:
{"steps":[
  {"type":"nectar","body":"<plain-language intro: what you found in their month and what this session covers>"},
  {"type":"lesson","kicker":"...","title":"...","body":"...","facts":[["bold lead","detail"], ...]},
  {"type":"check","kicker":"...","stem":"...","options":[{"label":"A","text":"...","correct":false,"feedback":"..."}, ...]},
  ... more lesson/check pairs ...,
  {"type":"reflect","kicker":"Reflection","prompt":"<final reflection prompt, free text required, ≥150 chars>"}
]}

REQUIREMENTS:
- For EACH real event found, include a coaching lesson + at least one judgment-call scenario (check).
- If real events are sparse, top up with deeper-than-basics refreshers of high-risk core skills (CPR, choking, seizures, de-escalation, med safety, abuse/neglect reporting). Review-level pro pointers, not introductory content.
- FLOOR: at least 5 lessons + 5 checks (each lesson followed by a check), plus exactly 1 reflect at the end, totalling ≥60 minutes engagement.
- Every check has 3–4 options, exactly one correct, every option gets per-option feedback.
- Plain language. No markdown formatting inside body strings.`;

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
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (res.status === 429) throw new Error("AI rate limit reached. Please retry in a moment.");
  if (res.status === 402) throw new Error("AI workspace credits exhausted. Please add credits.");
  if (!res.ok) throw new Error(`Nectar generation failed (${res.status}).`);
  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const raw = json.choices?.[0]?.message?.content ?? "{}";
  let parsed: { steps?: unknown };
  try { parsed = JSON.parse(raw); } catch { throw new Error("Nectar returned non-JSON."); }
  return validateSteps(parsed.steps);
}

// Gather a compact event summary scoped to this staff member, prior ~30 days.
async function gatherStaffEvents(
  supabase: ReturnType<typeof getSupabase>,
  orgId: string,
  staffId: string,
): Promise<{ prompt: string; summary: string }> {
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - 35);
  const sinceIso = since.toISOString();

  // Incidents reported by this staff member.
  const inc = await supabase
    .from("incident_reports")
    .select("report_number, incident_date, incident_types, narrative_during, immediate_actions")
    .eq("organization_id", orgId)
    .eq("reported_by", staffId)
    .gte("incident_date", sinceIso.slice(0, 10))
    .order("incident_date", { ascending: false })
    .limit(15);

  // Med errors / near-misses on their shifts.
  const meds = await supabase
    .from("emar_logs")
    .select("scheduled_for, status, exception_reason, is_medication_error, error_description, is_prn, prn_reason")
    .eq("organization_id", orgId)
    .eq("staff_id", staffId)
    .or("is_medication_error.eq.true,status.eq.missed,status.eq.refused")
    .gte("scheduled_for", sinceIso)
    .order("scheduled_for", { ascending: false })
    .limit(20);

  // Recently added caseload.
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

  const summary = [
    `Incidents filed: ${incidents.length}`,
    `Med exceptions/errors: ${medRows.length}`,
    `New caseload assignments: ${newClients.length}`,
  ].join(" · ");

  const payload = {
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

  const prompt = `Build the staff member's monthly CE review from their REAL prior-30-day activity below.
Coach on every event. Top up with deeper-than-basics refreshers if fewer than 5 events.
Hit the ≥60-minute / ≥5 lesson+check pair floor. End with one reflection prompt.

ACTIVITY JSON:
${JSON.stringify(payload).slice(0, 12000)}`;

  return { prompt, summary };
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
    if (existing && existing.status !== "failed" && (existing.steps as unknown[]).length > 0) return existing;

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
      const gathered = await gatherStaffEvents(supabase, orgId, userId);
      summary = gathered.summary;
      steps = await callNectarForCe(gathered.prompt);
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
        current_step: 0,
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

    // Pull active staff in this org via organization_members + profiles join.
    const membersQ = await supabase
      .from("organization_members")
      .select("user_id, role, profiles:user_id(id, first_name, last_name, email, hire_date, start_date, end_date)")
      .eq("organization_id", orgId)
      .eq("active", true);

    type MemRow = {
      user_id: string;
      role: string;
      profiles: {
        id: string;
        first_name: string | null;
        last_name: string | null;
        email: string | null;
        hire_date: string | null;
        start_date: string | null;
        end_date: string | null;
      } | null;
    };
    const members = ((membersQ.data as MemRow[] | null) ?? []).filter((m) => m.profiles);

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

