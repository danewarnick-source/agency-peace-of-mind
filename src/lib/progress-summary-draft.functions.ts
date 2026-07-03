import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireOrgMembership } from "@/integrations/supabase/require-org";
import { gatewayFetch } from "@/lib/ai-bedrock.server";

/**
 * Nectar drafter for periodic progress summaries.
 *
 * Built on the same Bedrock gateway path used by draftIncidentNarrative,
 * with the same NEVER-FABRICATE contract. If the source bundle is empty
 * (no approved notes, no incidents), the caller is expected to flag the
 * row as `no_source` BEFORE invoking this function — this drafter throws
 * if asked to draft from nothing.
 */

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
  if (res.status === 429) throw new Error("AI rate limit reached. Please retry in a moment.");
  if (res.status === 402) throw new Error("AI workspace credits exhausted. Please add credits.");
  if (!res.ok) throw new Error(`AI error (${res.status}).`);
  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return json.choices?.[0]?.message?.content ?? "";
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + "…" : s;
}

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
  }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireOrgMembership(supabase, userId, data.organizationId, "manager");

    // 1. Load the summary row.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: row, error: rErr } = await (supabase as any)
      .from("client_progress_summaries")
      .select("id, client_id, period_start, period_end, period_kind, period_label, service_codes, summary_kind, include_goal_progress, status")
      .eq("id", data.summaryId)
      .eq("organization_id", data.organizationId)
      .maybeSingle();
    if (rErr) throw new Error(rErr.message);
    if (!row) throw new Error("Summary not found");
    if (row.summary_kind !== "narrative") {
      throw new Error("Financial-statement rows are not drafted by Nectar.");
    }

    // 2. Source bundle.
    const { data: client, error: cErr } = await supabase
      .from("clients")
      .select("first_name, last_name, pcsp_goals")
      .eq("id", row.client_id)
      .eq("organization_id", data.organizationId)
      .maybeSingle();
    if (cErr) throw new Error(cErr.message);
    if (!client) throw new Error("Client not found");

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
      .select("created_at, narrative")
      .eq("organization_id", data.organizationId)
      .eq("client_id", row.client_id)
      .gte("created_at", `${row.period_start}T00:00:00`)
      .lte("created_at", `${row.period_end}T23:59:59`)
      .not("submitted_at", "is", null)
      .order("created_at", { ascending: true })
      .limit(200);

    const { data: incidents } = await supabase
      .from("incident_reports")
      .select("incident_date, report_number, incident_types, narrative_during")
      .eq("organization_id", data.organizationId)
      .eq("client_id", row.client_id)
      .gte("incident_date", row.period_start)
      .lte("incident_date", row.period_end)
      .order("incident_date", { ascending: true });

    const approvedLogs = (logs ?? []) as Array<{ log_date: string; narrative: string; pcsp_goals_addressed: string[] | null }>;
    const submittedReports = (reports ?? []) as Array<{ created_at: string; narrative: string | null }>;
    const incidentList = (incidents ?? []) as Array<{ incident_date: string; report_number: string; incident_types: string[]; narrative_during: string }>;

    const noSource = approvedLogs.length === 0 && submittedReports.length === 0 && incidentList.length === 0;
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
    const goals = ((client.pcsp_goals ?? []) as string[]).slice(0, 20);
    const services = (row.service_codes ?? []) as string[];
    const includeGoals: boolean = row.include_goal_progress && goals.length > 0;

    // 3. Build prompts (mirrors draftIncidentNarrative's honesty contract).
    const system = `You are NECTAR, a Utah DSPD periodic progress-summary drafter for a clinical record sent to the state Support Coordinator.

ABSOLUTE RULES (a Support Coordinator will reject the document otherwise):
- Write ONLY sentences supported by the source notes / incidents provided below. NEVER invent progress, events, dates, medications, staff actions, conversations, milestones, regressions, or quotes.
- If the source notes do not contain enough material to describe progress on a goal, write the EXACT sentence: "No documentation in this period supports progress on this goal." Do NOT pad it. Do NOT speculate.
- Past tense, third person, professional, objective. No "had a good day" fluff. Use the person's first name naturally.
- Do NOT add a "Prepared by" line — the admin types their name on finalization.
- Output is plain prose with section headings exactly as listed below. No markdown bullets, no asterisks, no code fences.

REQUIRED SECTIONS (in this order, each as its own heading on its own line, all caps as shown):
1) PERSON: <full name>
2) SERVICES PROVIDED THIS PERIOD: <comma-separated service codes from the input>
3) DATE RANGE: <period_start to period_end>
4) GENERAL SUMMARY
   2–5 short paragraphs covering: the services delivered, the person's status and response to those services, and notable events/activities — drawn ONLY from the source notes. Reference incidents by report number when relevant.
${includeGoals ? `5) GOAL PROGRESS
   For EACH PCSP goal listed, write a sub-heading "Goal: <verbatim goal text>" followed by 1–3 sentences describing what the notes show about progress on THAT goal during this period. If the notes do not support progress on a goal, use the exact sentence specified above.` : `5) GOAL PROGRESS: Not required for this client's services.`}

OUTPUT FORMAT — STRICT JSON only, no markdown, no code fences:
{"draft":"<the full prose with the section headings above>"}`;

    const logsBlock = approvedLogs.length === 0
      ? "(none)"
      : approvedLogs.map((l) => {
          const goalsStr = (l.pcsp_goals_addressed ?? []).join(" | ") || "(no goals tagged)";
          return `- [${l.log_date}] goals_addressed: ${goalsStr}\n  ${truncate(l.narrative.replace(/\s+/g, " ").trim(), 600)}`;
        }).join("\n");

    const reportsBlock = submittedReports.length === 0
      ? "(none)"
      : submittedReports.filter((r) => r.narrative && r.narrative.trim()).map((r) => {
          return `- [${r.created_at.slice(0, 10)}] ${truncate((r.narrative ?? "").replace(/\s+/g, " ").trim(), 500)}`;
        }).join("\n") || "(none)";

    const incidentsBlock = incidentList.length === 0
      ? "(none)"
      : incidentList.map((i) => {
          const types = (i.incident_types ?? []).join(", ") || "incident";
          return `- [${i.incident_date}] #${i.report_number} (${types}): ${truncate((i.narrative_during ?? "").replace(/\s+/g, " ").trim(), 400)}`;
        }).join("\n");

    const goalsBlock = goals.length === 0 ? "(no PCSP goals on record)" : goals.map((g, idx) => `${idx + 1}. ${g}`).join("\n");

    const user = `PERSON: ${clientName}
SERVICES PROVIDED THIS PERIOD: ${services.join(", ") || "(none)"}
DATE RANGE: ${row.period_start} to ${row.period_end}
INCLUDE GOAL PROGRESS SECTION: ${includeGoals ? "YES" : "NO (excluded by service type)"}

PCSP GOALS ON RECORD:
${goalsBlock}

APPROVED DAILY LOGS (${approvedLogs.length}):
${logsBlock}

SUBMITTED SHIFT REPORTS (${submittedReports.length}):
${reportsBlock}

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

    const draftSource = {
      generated_at: new Date().toISOString(),
      daily_log_ids: approvedLogs.length,
      shift_report_count: submittedReports.length,
      incident_ids: incidentList.map((i) => i.report_number),
      pcsp_goals_used: goals,
      services,
      include_goal_progress: includeGoals,
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("client_progress_summaries")
      .update({
        draft_content: draft,
        draft_source: draftSource,
        drafted_at: new Date().toISOString(),
        drafted_by: userId,
        status: "draft",
      })
      .eq("id", row.id);
    if (error) throw new Error(error.message);

    return { status: "draft" as const, draft };
  });
