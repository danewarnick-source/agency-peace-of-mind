import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireOrgMembership } from "@/integrations/supabase/require-org";
import { assertBedrockConfigured, gatewayFetch } from "@/lib/ai-bedrock.server";
import { MONTHLY_SUMMARY_REQUIRED_FIELDS } from "@/lib/progress-summaries";

/**
 * Nectar drafter for periodic progress summaries.
 *
 * Built on the same Bedrock gateway path used by draftIncidentNarrative,
 * with the same NEVER-FABRICATE contract. If the source bundle is empty
 * (no approved notes, no incidents), the caller is expected to flag the
 * row as `no_source` BEFORE invoking this function — this drafter throws
 * if asked to draft from nothing.
 *
 * Source scoping: goals carry job_codes (CST). Notes/shift reports stamped
 * with matching service codes (or goal tags) are preferred; untagged sources
 * are listed separately for human review — Nectar must not invent a job code.
 */

async function callAI(system: string, user: string): Promise<string> {
  assertBedrockConfigured();
  const res = await gatewayFetch({
    model: "bedrock",
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    response_format: { type: "json_object" },
  });
  if (res.status === 429) throw new Error("AI rate limit reached. Please retry in a moment.");
  if (res.status === 402) throw new Error("AI workspace credits exhausted. Please add credits.");
  if (!res.ok) throw new Error(`AI error (${res.status}).`);
  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return json.choices?.[0]?.message?.content ?? "";
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + "…" : s;
}

type GoalIn = { id: string; goal: string; job_codes: string[] };

/**
 * Pulls the source bundle and asks Nectar to draft the summary. Writes the
 * result back to `client_progress_summaries.draft_content` + draft_source +
 * status. If no source documentation exists, marks the row as `no_source`
 * (and does NOT call the AI).
 */
export const draftProgressSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({
    organizationId: z.string().uuid(),
    summaryId: z.string().uuid(),
    /** Optional: draft only this one goal's progress paragraph. */
    goalId: z.string().optional(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!supabase || !userId) return { status: "no_source" as const, draft: null };
    await requireOrgMembership(supabase, userId, data.organizationId, "manager");

    // 1. Load the summary row.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: row, error: rErr } = await (supabase as any)
      .from("client_progress_summaries")
      .select("id, client_id, period_start, period_end, period_kind, period_label, service_codes, summary_kind, include_goal_progress, status, draft_content")
      .eq("id", data.summaryId)
      .eq("organization_id", data.organizationId)
      .maybeSingle();
    if (rErr) throw new Error(rErr.message);
    if (!row) throw new Error("Summary not found");
    if (row.summary_kind !== "narrative") {
      throw new Error("Financial-statement rows are not drafted by Nectar.");
    }

    // 2. Client + goals.
    const { data: client, error: cErr } = await supabase
      .from("clients")
      .select("first_name, last_name, pcsp_goals, support_coordinator_name")
      .eq("id", row.client_id)
      .eq("organization_id", data.organizationId)
      .maybeSingle();
    if (cErr) throw new Error(cErr.message);
    if (!client) throw new Error("Client not found");

    const { data: org } = await supabase
      .from("organizations")
      .select("name, legal_name")
      .eq("id", data.organizationId)
      .maybeSingle();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: cst } = await (supabase as any)
      .from("client_specific_trainings")
      .select("goals")
      .eq("organization_id", data.organizationId)
      .eq("client_id", row.client_id)
      .eq("training_type", "person_specific")
      .maybeSingle();

    const services = ((row.service_codes ?? []) as string[]).map((c) => c.toUpperCase());
    const periodCodes = new Set(services);

    let goals: GoalIn[] = [];
    const cstGoals = (cst?.goals ?? null) as Array<{ id?: string; goal?: string; job_codes?: string[] }> | null;
    if (Array.isArray(cstGoals) && cstGoals.length > 0) {
      goals = cstGoals
        .map((g, i) => ({
          id: String(g.id ?? `g-${i}`),
          goal: String(g.goal ?? "").trim(),
          job_codes: (g.job_codes ?? []).map((c) => String(c).toUpperCase()).filter(Boolean),
        }))
        .filter((g) => g.goal.length > 0)
        .filter((g) => g.job_codes.length === 0 || g.job_codes.some((c) => periodCodes.has(c)));
    }
    if (goals.length === 0) {
      goals = ((client.pcsp_goals ?? []) as string[])
        .map((g, i) => ({ id: `flat-${i}`, goal: String(g).trim(), job_codes: [] as string[] }))
        .filter((g) => g.goal.length > 0);
    }

    if (data.goalId) {
      goals = goals.filter((g) => g.id === data.goalId);
      if (goals.length === 0) throw new Error("Goal not found for this summary.");
    }

    // 3. Source docs in period.
    const { data: logs, error: lErr } = await supabase
      .from("daily_logs")
      .select("log_date, narrative, pcsp_goals_addressed")
      .eq("organization_id", data.organizationId)
      .eq("client_id", row.client_id)
      .eq("status", "approved")
      .gte("log_date", row.period_start)
      .lte("log_date", row.period_end)
      .order("log_date", { ascending: true })
      .limit(400);
    if (lErr) throw new Error(lErr.message);

    const { data: reports } = await supabase
      .from("shift_reports")
      .select("created_at, narrative, scheduled_shift_id")
      .eq("organization_id", data.organizationId)
      .eq("client_id", row.client_id)
      .gte("created_at", `${row.period_start}T00:00:00`)
      .lte("created_at", `${row.period_end}T23:59:59`)
      .not("submitted_at", "is", null)
      .order("created_at", { ascending: true })
      .limit(200);

    const shiftIds = [...new Set((reports ?? []).map((r) => r.scheduled_shift_id).filter(Boolean))] as string[];
    const shiftCodeById = new Map<string, string>();
    if (shiftIds.length > 0) {
      const { data: shifts } = await supabase
        .from("scheduled_shifts")
        .select("id, service_code")
        .in("id", shiftIds);
      for (const sh of (shifts ?? []) as Array<{ id: string; service_code: string | null }>) {
        if (sh.service_code) shiftCodeById.set(sh.id, sh.service_code.toUpperCase());
      }
    }

    const { data: incidents } = await supabase
      .from("incident_reports")
      .select("incident_date, report_number, incident_types, narrative_during")
      .eq("organization_id", data.organizationId)
      .eq("client_id", row.client_id)
      .gte("incident_date", row.period_start)
      .lte("incident_date", row.period_end)
      .order("incident_date", { ascending: true });

    type LogRow = { log_date: string; narrative: string; pcsp_goals_addressed: string[] | null };
    type ReportRow = { created_at: string; narrative: string | null; scheduled_shift_id: string | null; service_code: string | null };
    const approvedLogs = (logs ?? []) as LogRow[];
    const submittedReports: ReportRow[] = ((reports ?? []) as Array<{
      created_at: string;
      narrative: string | null;
      scheduled_shift_id: string | null;
    }>).map((r) => ({
      ...r,
      service_code: r.scheduled_shift_id ? (shiftCodeById.get(r.scheduled_shift_id) ?? null) : null,
    }));
    const incidentList = (incidents ?? []) as Array<{
      incident_date: string;
      report_number: string;
      incident_types: string[];
      narrative_during: string;
    }>;

    const goalTexts = new Set(goals.map((g) => g.goal.toLowerCase()));
    const relevantCodes = new Set(
      goals.flatMap((g) => (g.job_codes.length ? g.job_codes : services)),
    );

    const taggedLogs = approvedLogs.filter((l) => {
      const addressed = (l.pcsp_goals_addressed ?? []).map((g) => String(g).toLowerCase());
      return addressed.some((g) => goalTexts.has(g));
    });
    const untaggedLogs = approvedLogs.filter((l) => {
      const addressed = (l.pcsp_goals_addressed ?? []).map((g) => String(g).toLowerCase());
      return addressed.length === 0 || !addressed.some((g) => goalTexts.has(g));
    });

    const taggedReports = submittedReports.filter((r) =>
      r.service_code && relevantCodes.has(r.service_code),
    );
    const untaggedReports = submittedReports.filter((r) =>
      !r.service_code || !relevantCodes.has(r.service_code),
    );

    const noSource =
      taggedLogs.length === 0 &&
      taggedReports.length === 0 &&
      untaggedLogs.length === 0 &&
      untaggedReports.length === 0 &&
      incidentList.length === 0;

    if (noSource) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("client_progress_summaries")
        .update({
          status: "no_source",
          draft_content: null,
          draft_source: {
            no_source: true,
            checked_at: new Date().toISOString(),
            sources_checked: ["daily_logs(approved)", "shift_reports(submitted)", "incident_reports"],
          },
          drafted_at: new Date().toISOString(),
          drafted_by: userId,
        })
        .eq("id", row.id);
      if (error) throw new Error(error.message);
      return { status: "no_source" as const, draft: null };
    }

    const clientName = `${client.first_name} ${client.last_name}`;
    const includeGoals: boolean = row.include_goal_progress && goals.length > 0;
    const providerName = (org?.legal_name || org?.name || "").trim() || "Provider";
    const singleGoalMode = !!data.goalId;

    const extraFieldGuidance = services
      .flatMap((code) => MONTHLY_SUMMARY_REQUIRED_FIELDS[code.toUpperCase()] ?? [])
      .filter((v, i, arr) => arr.indexOf(v) === i);

    const system = singleGoalMode
      ? `You are NECTAR, a Utah DSPD progress-summary drafter.

ABSOLUTE RULES:
- Write ONLY sentences supported by the source notes provided. NEVER invent progress, events, dates, or quotes.
- If notes do not support progress on this goal, write EXACTLY: "No documentation in this period supports progress on this goal."
- Past tense, third person, professional. Use the person's first name naturally.
- Output STRICT JSON only: {"draft":"<1–3 sentences of goal progress prose, no heading>"}`
      : `You are NECTAR, a Utah DSPD periodic progress-summary drafter for a clinical record sent to the state Support Coordinator.

ABSOLUTE RULES (a Support Coordinator will reject the document otherwise):
- Write ONLY sentences supported by the source notes / incidents provided below. NEVER invent progress, events, dates, medications, staff actions, conversations, milestones, regressions, or quotes.
- Do NOT invent or guess service/job codes. Prefer CODE-TAGGED sources. Treat UNTAGGED sources as optional corroboration only — if you use them, do not assign them a service code.
- If the source notes do not contain enough material to describe progress on a goal, write the EXACT sentence: "No documentation in this period supports progress on this goal." Do NOT pad it. Do NOT speculate.
- Past tense, third person, professional, objective. No "had a good day" fluff. Use the person's first name naturally.
- Do NOT add a "Prepared by" line — the admin types their name on finalization.
- Output is plain prose with section headings exactly as listed below. No markdown bullets, no asterisks, no code fences.

REQUIRED SECTIONS (in this order, each as its own heading on its own line, all caps as shown):
1) PERSON: <full name>
2) SERVICES PROVIDED THIS PERIOD: <comma-separated service codes from the input>
3) DATE RANGE: <period_start to period_end>
4) PROVIDER: <provider name from input>
5) SUPPORT COORDINATOR: <name or "Not on file">
6) GENERAL SUMMARY
   2–5 short paragraphs covering: the services delivered, the person's status and response to those services, and notable events/activities — drawn ONLY from the source notes. Reference incidents by report number when relevant.
${includeGoals ? `7) GOAL PROGRESS
   For EACH PCSP goal listed, write a sub-heading "Goal: <verbatim goal text>" followed by 1–3 sentences describing what the notes show about progress on THAT goal during this period. If the notes do not support progress on a goal, use the exact sentence specified above.` : `7) GOAL PROGRESS: Not required for this client's services.`}
${extraFieldGuidance.length > 0 ? `
ADDITIONAL REQUIRED CONTENT for this client's service code(s) — cover each of these, drawing ONLY from the source notes; use the same "No documentation in this period supports..." sentence for any that the notes do not support:
${extraFieldGuidance.map((f) => `- ${f}`).join("\n")}` : ""}

OUTPUT FORMAT — STRICT JSON only, no markdown, no code fences:
{"draft":"<the full prose with the section headings above>"}`;

    const formatLogs = (rows: LogRow[], empty: string) =>
      rows.length === 0
        ? empty
        : rows.map((l) => {
            const goalsStr = (l.pcsp_goals_addressed ?? []).join(" | ") || "(no goals tagged)";
            return `- [${l.log_date}] goals_addressed: ${goalsStr}\n  ${truncate(l.narrative.replace(/\s+/g, " ").trim(), 600)}`;
          }).join("\n");

    const formatReports = (rows: ReportRow[], empty: string) => {
      const body = rows
        .filter((r) => r.narrative && r.narrative.trim())
        .map((r) => {
          const code = r.service_code ? ` code=${r.service_code}` : " code=UNTAGGED";
          return `- [${r.created_at.slice(0, 10)}]${code} ${truncate((r.narrative ?? "").replace(/\s+/g, " ").trim(), 500)}`;
        })
        .join("\n");
      return body || empty;
    };

    const incidentsBlock = incidentList.length === 0
      ? "(none)"
      : incidentList.map((i) => {
          const types = (i.incident_types ?? []).join(", ") || "incident";
          return `- [${i.incident_date}] #${i.report_number} (${types}): ${truncate((i.narrative_during ?? "").replace(/\s+/g, " ").trim(), 400)}`;
        }).join("\n");

    const goalsBlock = goals.length === 0
      ? "(no PCSP goals on record)"
      : goals.map((g, idx) => {
          const codes = g.job_codes.length ? g.job_codes.join(", ") : "(no job codes tagged — treat as applicable to period services)";
          return `${idx + 1}. [${g.id}] ${g.goal}\n   job_codes: ${codes}`;
        }).join("\n");

    const user = singleGoalMode
      ? `PERSON: ${clientName}
DATE RANGE: ${row.period_start} to ${row.period_end}
PERIOD SERVICES: ${services.join(", ") || "(none)"}
GOAL TO DRAFT:
${goalsBlock}

CODE-TAGGED DAILY LOGS:
${formatLogs(taggedLogs, "(none)")}

CODE-TAGGED SHIFT REPORTS:
${formatReports(taggedReports, "(none)")}

UNTAGGED — REVIEW ONLY (do not invent a code; use only if clearly about this goal):
${formatLogs(untaggedLogs, "(none)")}
${formatReports(untaggedReports, "(none)")}

INCIDENTS:
${incidentsBlock}`
      : `PERSON: ${clientName}
SERVICES PROVIDED THIS PERIOD: ${services.join(", ") || "(none)"}
DATE RANGE: ${row.period_start} to ${row.period_end}
PROVIDER: ${providerName}
SUPPORT COORDINATOR: ${client.support_coordinator_name?.trim() || "Not on file"}
INCLUDE GOAL PROGRESS SECTION: ${includeGoals ? "YES" : "NO (excluded by service type)"}

PCSP GOALS (with job_codes):
${goalsBlock}

CODE-TAGGED APPROVED DAILY LOGS (${taggedLogs.length}):
${formatLogs(taggedLogs, "(none)")}

CODE-TAGGED SUBMITTED SHIFT REPORTS (${taggedReports.length}):
${formatReports(taggedReports, "(none)")}

UNTAGGED SOURCES — REVIEW BUCKET (${untaggedLogs.length + untaggedReports.length}):
Daily logs:
${formatLogs(untaggedLogs, "(none)")}
Shift reports:
${formatReports(untaggedReports, "(none)")}

INCIDENTS IN PERIOD (${incidentList.length}):
${incidentsBlock}`;

    const raw = await callAI(system, user);
    let parsed: { draft?: unknown } = {};
    try { parsed = JSON.parse(raw); } catch {
      const m = raw.match(/\{[\s\S]*\}/);
      if (m) { try { parsed = JSON.parse(m[0]); } catch { /* ignore */ } }
    }
    const draft = typeof parsed.draft === "string" ? parsed.draft.trim() : "";
    if (!draft) throw new Error("Nectar could not draft this summary — please write it manually.");

    // Single-goal mode: merge into existing draft under Goal: heading.
    let nextContent = draft;
    if (singleGoalMode && goals[0]) {
      const existing = (row.draft_content as string | null) ?? "";
      const heading = `Goal: ${goals[0].goal}`;
      const block = `${heading}\n${draft}`;
      if (existing.includes(heading)) {
        nextContent = existing.replace(
          new RegExp(`${heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s\\S]*?(?=\\nGoal:|$)`),
          `${block}\n`,
        );
      } else if (/GOAL PROGRESS/i.test(existing)) {
        nextContent = existing.replace(/(GOAL PROGRESS[^\n]*\n)/i, `$1\n${block}\n`);
      } else if (existing.trim()) {
        nextContent = `${existing.trim()}\n\nGOAL PROGRESS\n${block}\n`;
      } else {
        nextContent = `GOAL PROGRESS\n${block}\n`;
      }
    }

    const draftSource = {
      generated_at: new Date().toISOString(),
      daily_log_ids: taggedLogs.length,
      untagged_daily_logs: untaggedLogs.length,
      shift_report_count: taggedReports.length,
      untagged_shift_reports: untaggedReports.length,
      incident_ids: incidentList.map((i) => i.report_number),
      pcsp_goals_used: goals.map((g) => ({ id: g.id, goal: g.goal, job_codes: g.job_codes })),
      services,
      include_goal_progress: includeGoals,
      single_goal_id: data.goalId ?? null,
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("client_progress_summaries")
      .update({
        draft_content: nextContent,
        draft_source: draftSource,
        drafted_at: new Date().toISOString(),
        drafted_by: userId,
        status: "draft",
      })
      .eq("id", row.id);
    if (error) throw new Error(error.message);

    return { status: "draft" as const, draft: nextContent };
  });
