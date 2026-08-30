import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { anchorsForPrompt, findAnchor } from "@/lib/nectar/tour-anchors";

import { assertBedrockConfigured, gatewayFetch } from "@/lib/ai-bedrock.server";

export interface GuideStep {
  /** Anchor id from TOUR_ANCHORS (must exist). */
  anchor: string;
  /** Plain-language instruction shown in the spotlight tooltip. */
  instruction: string;
  /** Optional route override; otherwise the anchor's route is used. */
  route?: string;
}

export interface GuideTask {
  id: string;
  position: number;
  title: string;
  why: string | null;
  status: "pending" | "in_progress" | "done" | "skipped";
  current_step: number;
  steps: GuideStep[];
}

export interface Guide {
  id: string;
  goal: string;
  summary: string | null;
  status: string;
  surface: string;
  created_at: string;
  tasks: GuideTask[];
}

// ---------- helpers ----------

function strField(v: unknown, max = 2000): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function parseGuideJson(raw: string): Record<string, unknown> {
  const cleaned = String(raw ?? "").replace(/```json\s*|```/gi, "").trim();
  try {
    return JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    /* fall through */
  }
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      return JSON.parse(match[0]) as Record<string, unknown>;
    } catch {
      /* fall through */
    }
  }
  return {};
}

async function callAi(messages: Array<{ role: string; content: string }>) {
  assertBedrockConfigured();
  const res = await gatewayFetch({
      model: "bedrock",
      messages,
      response_format: { type: "json_object" },
    });
  if (res.status === 429) throw new Error("NECTAR is busy — please try again in a moment.");
  if (res.status === 402) throw new Error("AI credits exhausted for this workspace.");
  if (!res.ok) throw new Error(`AI error ${res.status}`);
  const j = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
  const txt = j.choices?.[0]?.message?.content ?? "";
  return parseGuideJson(txt);
}

// ---------- plan a guide ----------

export const planNectarGuide = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { goal: string; role?: string; surface?: string; orgId: string }) => ({
    goal: strField(input.goal, 500),
    role: strField(input.role ?? "admin", 40) || "admin",
    surface: strField(input.surface ?? "admin", 40) || "admin",
    orgId: strField(input.orgId, 100),
  }))
  .handler(async ({ data, context }) => {
    if (data.goal.length < 3) throw new Error("Tell NECTAR what you want help with.");
    if (!data.orgId) throw new Error("Missing organization.");
    const { supabase, userId } = context;
    if (!supabase || !userId) return null;
    const { requireOrgMembership } = await import("@/integrations/supabase/require-org");
    await requireOrgMembership(supabase, userId, data.orgId, "employee");

    const isStaff = data.surface === "staff";
    const who = isStaff
      ? "a direct support staff member on the staff view"
      : "an admin";
    const staffHint = isStaff
      ? `
Staff goals map to staff screens only:
- writing / opening a daily note or host-home note → nav.home or nav.daily-logs or staff.daily-note
- caseload, assigned clients, HHS person → nav.home or staff.caseload
- clock in, clock out, punch pad, time clock → nav.schedule or nav.home
- trainings, launchpad → nav.courses or nav.hive-training
- ask a question → nav.ask-nectar
Never use admin anchors (audit, billing, employees, clients roster) for a staff surface.
`
      : "";

    const system = `You are NECTAR, a guide inside HIVE (a DSPD/DHS provider platform).
You generate a short, ordered task list (2–6 tasks) that helps ${who} achieve a goal.
Each task can include up to 4 walkthrough steps. Each step MUST reference one of the
listed anchor IDs verbatim — never invent anchors. If a step has no matching anchor,
omit the step and rely on the task's "why" text instead.
${staffHint}
Available anchors:
${anchorsForPrompt(data.surface)}

Respond as strict JSON:
{
  "summary": "one short sentence summarizing the plan",
  "tasks": [
    {
      "title": "short imperative title",
      "why": "one sentence on why this matters",
      "steps": [{ "anchor": "anchor.id", "instruction": "one concrete instruction" }]
    }
  ]
}`;

    const out = await callAi([
      { role: "system", content: system },
      { role: "user", content: `Role: ${data.role}\nSurface: ${data.surface}\nGoal: ${data.goal}` },
    ]) as { summary?: string; tasks?: Array<{ title?: string; why?: string; steps?: Array<{ anchor?: string; instruction?: string }> }> };

    const allowed = (id: string) => {
      const a = findAnchor(id);
      if (!a) return false;
      if (isStaff) return a.surface === "staff" || a.surface === "both";
      return a.surface === "admin" || a.surface === "both";
    };

    const tasks: Array<{
      position: number;
      title: string;
      why: string | null;
      steps: Array<{ anchor: string; instruction: string }>;
    }> = (out.tasks ?? []).slice(0, 7).map((t, i) => {
      const steps = (t.steps ?? [])
        .filter((s) => s.anchor && allowed(s.anchor))
        .slice(0, 4)
        .map((s) => ({ anchor: s.anchor!, instruction: strField(s.instruction, 240) || findAnchor(s.anchor!)!.description }));
      return {
        position: i,
        title: strField(t.title, 120) || `Step ${i + 1}`,
        why: strField(t.why ?? "", 400) || null,
        steps,
      };
    }).filter((t) => t.title);

    if (tasks.length === 0 && isStaff) {
      const g = data.goal.toLowerCase();
      const pick = (id: string, title: string, why: string, instruction: string) => {
        const a = findAnchor(id);
        return {
          position: 0,
          title,
          why,
          steps: a ? [{ anchor: id, instruction }] : [],
        };
      };
      const fallback =
        /daily note|host home|hhs|progress note/.test(g)
          ? pick("nav.home", "Open the daily note", "Host-home people live on My Caseload and open the daily note, not Punch pad.", "Tap the person's name on My Caseload to open today's daily note.")
          : /clock|punch|time clock|clock out|clock in/.test(g)
            ? pick("nav.schedule", "Open today's shift", "Time-clock shifts start from Schedule or My Caseload Punch pad.", "Open Schedule, then tap the shift to clock in or out.")
            : pick("nav.home", "Start on My Caseload", "Staff work starts from the people assigned to you.", "Open My Caseload, then tap the person you are supporting.");
      tasks.push({ ...fallback, position: 0 });
    }

    if (tasks.length === 0) throw new Error("NECTAR couldn't map your goal to real actions. Try rephrasing it.");

    // Create guide + tasks
    const { data: guide, error: gErr } = await supabase
      .from("nectar_guides")
      .insert({
        organization_id: data.orgId,
        user_id: userId,
        goal: data.goal,
        summary: strField(out.summary ?? "", 400) || null,
        surface: data.surface,
        status: "active",
      })
      .select("id")
      .single();
    if (gErr || !guide) throw new Error(gErr?.message ?? "Could not create guide.");

    const rows = tasks.map((t) => ({
      guide_id: guide.id,
      organization_id: data.orgId,
      user_id: userId,
      position: t.position,
      title: t.title,
      why: t.why,
      status: "pending" as const,
      current_step: 0,
      steps: t.steps,
    }));
    const { error: tErr } = await supabase.from("nectar_guide_tasks").insert(rows);
    if (tErr) throw new Error(tErr.message);

    return { guideId: guide.id };
  });

// ---------- list guides ----------

export const listNectarGuides = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { orgId: string }) => ({ orgId: strField(input.orgId, 100) }))
  .handler(async ({ context, data }): Promise<Guide[]> => {
    const { supabase, userId } = context;
    if (!supabase || !userId) return [];
    const { requireOrgMembership } = await import("@/integrations/supabase/require-org");
    await requireOrgMembership(supabase, userId, data.orgId, "employee");
    const { data: guides, error } = await supabase
      .from("nectar_guides")
      .select("id, goal, summary, status, surface, created_at")
      .eq("user_id", userId)
      .eq("organization_id", data.orgId)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw new Error(error.message);
    if (!guides || guides.length === 0) return [];

    const ids = guides.map((g) => g.id);
    const { data: tasks } = await supabase
      .from("nectar_guide_tasks")
      .select("id, guide_id, position, title, why, status, current_step, steps")
      .in("guide_id", ids)
      .order("position", { ascending: true });

    return guides.map((g) => ({
      ...g,
      tasks: (tasks ?? [])
        .filter((t) => t.guide_id === g.id)
        .map((t) => ({
          id: t.id,
          position: t.position,
          title: t.title,
          why: t.why,
          status: t.status as GuideTask["status"],
          current_step: t.current_step,
          steps: (t.steps as unknown as GuideStep[]) ?? [],
        })),
    }));
  });

// ---------- update task progress ----------

export const updateGuideTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { taskId: string; status?: GuideTask["status"]; currentStep?: number }) => ({
    taskId: strField(input.taskId, 100),
    status: input.status,
    currentStep: typeof input.currentStep === "number" ? input.currentStep : undefined,
  }))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    if (!supabase || !userId) return { ok: false };
    const patch: { updated_at: string; status?: GuideTask["status"]; current_step?: number } = {
      updated_at: new Date().toISOString(),
    };
    if (data.status) patch.status = data.status;
    if (typeof data.currentStep === "number") patch.current_step = Math.max(0, data.currentStep);
    const { error } = await supabase
      .from("nectar_guide_tasks")
      .update(patch)
      .eq("id", data.taskId)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteGuide = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { guideId: string }) => ({ guideId: strField(input.guideId, 100) }))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    if (!supabase || !userId) return { ok: false };
    const { error } = await supabase
      .from("nectar_guides")
      .delete()
      .eq("id", data.guideId)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
