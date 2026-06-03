import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { projectAnswersToTemplate, templateToAnswers } from "./state-onboarding";

const STATE_CODE_RE = /^[A-Z]{2}$/;

async function ensureExecutive(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
): Promise<void> {
  const { data, error } = await supabase.rpc("is_hive_executive", { _user: userId });
  if (error) throw error;
  if (!data) throw new Error("HIVE Executive permission required.");
}

export interface BuildFlag {
  id: string;
  section: string;
  field: string;
  note: string;
  severity?: "low" | "medium" | "high";
}

// ── Get-or-create the open onboarding session for a state ───────────────────
export const getOrCreateOnboardingSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ stateCode: z.string().regex(STATE_CODE_RE) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await ensureExecutive(supabase, userId);

    const { data: existing } = await supabase
      .from("state_onboarding_sessions")
      .select("*")
      .eq("state_code", data.stateCode)
      .eq("status", "in_progress")
      .maybeSingle();
    if (existing) return existing;

    const { data: inserted, error } = await supabase
      .from("state_onboarding_sessions")
      .insert({ state_code: data.stateCode, created_by: userId })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return inserted;
  });

export const listOnboardingSessions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ stateCode: z.string().regex(STATE_CODE_RE) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await ensureExecutive(supabase, userId);
    const { data: rows } = await supabase
      .from("state_onboarding_sessions")
      .select("*")
      .eq("state_code", data.stateCode)
      .order("created_at", { ascending: false });
    return rows ?? [];
  });

const SaveSchema = z.object({
  sessionId: z.string().uuid(),
  answers: z.record(z.string(), z.record(z.string(), z.string())),
  buildFlags: z.array(
    z.object({
      id: z.string(),
      section: z.string(),
      field: z.string(),
      note: z.string().max(2000),
      severity: z.enum(["low", "medium", "high"]).optional(),
    }),
  ),
});

export const saveOnboardingProgress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SaveSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await ensureExecutive(supabase, userId);
    const { error } = await supabase
      .from("state_onboarding_sessions")
      .update({ answers: data.answers, build_flags: data.buildFlags })
      .eq("id", data.sessionId)
      .eq("status", "in_progress");
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ── Complete: project answers into state_templates, open HIVE tickets ───────
export const completeOnboardingSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    SaveSchema.extend({ stateCode: z.string().regex(STATE_CODE_RE) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await ensureExecutive(supabase, userId);

    // 1) persist final answers
    const { error: upErr } = await supabase
      .from("state_onboarding_sessions")
      .update({
        answers: data.answers,
        build_flags: data.buildFlags,
        status: "completed",
        completed_at: new Date().toISOString(),
        completed_by: userId,
      })
      .eq("id", data.sessionId);
    if (upErr) throw new Error(upErr.message);

    // 2) project answers into state template sections
    const projected = projectAnswersToTemplate(data.answers);
    const { data: existing } = await supabase
      .from("state_templates")
      .select("id, version")
      .eq("state_code", data.stateCode)
      .maybeSingle();

    const baseUpdate = {
      terminology: projected.terminology as never,
      billing_codes: projected.billing_codes as never,
      training: projected.training as never,
      evv: projected.evv as never,
      required_documents: projected.required_documents as never,
      department_structure: projected.department_structure as never,
    };

    if (existing) {
      await supabase
        .from("state_templates")
        .update({ ...baseUpdate, version: (existing.version ?? 1) + 1 })
        .eq("id", existing.id);
    } else {
      await supabase
        .from("state_templates")
        .insert({ state_code: data.stateCode, ...baseUpdate });
    }

    // 3) open HIVE NECTAR tickets for each flagged build need
    let ticketsCreated = 0;
    if (data.buildFlags.length > 0) {
      const rows = data.buildFlags.map((f) => ({
        title: `[${data.stateCode}] ${f.section} · ${f.field} — build needed`,
        detail: f.note,
        category: "structural_gap" as const,
        severity:
          (f.severity === "high" ? "high" : f.severity === "low" ? "low" : "medium") as
            | "high"
            | "medium"
            | "low",
        status: "new" as const,
        source: "manual" as const,
        event_kind: "state_onboarding_flag",
        event_ref: {
          state_code: data.stateCode,
          session_id: data.sessionId,
          section: f.section,
          field: f.field,
          flag_id: f.id,
        },
        dedupe_key: `state-onboarding:${data.stateCode}:${f.id}`,
        created_by: userId,
      }));
      const { error: tErr, count } = await supabase
        .from("hive_platform_tickets")
        .insert(rows, { count: "exact" });
      if (!tErr) ticketsCreated = count ?? rows.length;
    }

    return { ok: true, tickets_created: ticketsCreated };
  });
