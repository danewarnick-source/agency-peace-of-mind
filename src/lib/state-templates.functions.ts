import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type {
  PlatformState,
  StateTemplate,
  TemplateSectionKey,
} from "./state-templates";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function ensureExecutive(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
): Promise<void> {
  const { data, error } = await supabase.rpc("is_hive_executive", { _user: userId });
  if (error) throw error;
  if (!data) throw new Error("HIVE Executive permission required.");
}

const STATE_CODE_RE = /^[A-Z]{2}$/;
const SECTION_KEYS: TemplateSectionKey[] = [
  "terminology",
  "training",
  "billing_codes",
  "evv",
  "required_documents",
  "department_structure",
];

// ─────────────────────────────────────────────────────────────────────────────
// Catalog
// ─────────────────────────────────────────────────────────────────────────────

export const listPlatformStates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<(PlatformState & { provider_count: number; template_updated_at: string | null })[]> => {
    const { supabase } = context;
    const { data: states, error } = await supabase
      .from("platform_states")
      .select("code, name, status, is_reference, regulator_label, notes, updated_at")
      .order("name");
    if (error) throw new Error(error.message);

    const { data: tpls } = await supabase
      .from("state_templates")
      .select("state_code, updated_at");
    const tplByCode = new Map((tpls ?? []).map((t) => [t.state_code, t.updated_at]));

    const { data: orgs } = await supabase
      .from("organizations")
      .select("state_code");
    const counts = new Map<string, number>();
    for (const o of orgs ?? []) {
      if (!o.state_code) continue;
      counts.set(o.state_code, (counts.get(o.state_code) ?? 0) + 1);
    }

    return (states ?? []).map((s) => ({
      ...s,
      provider_count: counts.get(s.code) ?? 0,
      template_updated_at: tplByCode.get(s.code) ?? null,
    }));
  });

export const setStateStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        code: z.string().regex(STATE_CODE_RE),
        status: z.enum(["draft", "active", "coming_soon"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await ensureExecutive(supabase, userId);
    const { error } = await supabase
      .from("platform_states")
      .update({ status: data.status })
      .eq("code", data.code);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ─────────────────────────────────────────────────────────────────────────────
// Templates
// ─────────────────────────────────────────────────────────────────────────────

export const getStateTemplate = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ stateCode: z.string().regex(STATE_CODE_RE) }).parse(input),
  )
  .handler(async ({ data, context }): Promise<StateTemplate | null> => {
    const { supabase } = context;
    const { data: row, error } = await supabase
      .from("state_templates")
      .select("*")
      .eq("state_code", data.stateCode)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (row as StateTemplate | null) ?? null;
  });

// Returns the published template for the caller's current org's state.
// Used by useStateTemplate() on the client.
export const getMyStateTemplate = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{
    state_code: string | null;
    template: StateTemplate | null;
  }> => {
    const { supabase, userId } = context;
    const { data: m } = await supabase
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", userId)
      .eq("active", true)
      .limit(1)
      .maybeSingle();
    if (!m) return { state_code: null, template: null };
    const { data: org } = await supabase
      .from("organizations")
      .select("state_code")
      .eq("id", m.organization_id)
      .maybeSingle();
    const code = org?.state_code ?? null;
    if (!code) return { state_code: null, template: null };
    const { data: tpl } = await supabase
      .from("state_templates")
      .select("*")
      .eq("state_code", code)
      .not("published_at", "is", null)
      .maybeSingle();
    return { state_code: code, template: (tpl as StateTemplate | null) ?? null };
  });

const SectionPatchSchema = z.object({
  stateCode: z.string().regex(STATE_CODE_RE),
  section: z.enum([
    "terminology",
    "training",
    "billing_codes",
    "evv",
    "required_documents",
    "department_structure",
  ]),
  value: z.unknown(),
});

export const updateStateTemplateSection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SectionPatchSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await ensureExecutive(supabase, userId);

    // Upsert by state_code; preserve other sections.
    const { data: existing } = await supabase
      .from("state_templates")
      .select("id, version")
      .eq("state_code", data.stateCode)
      .maybeSingle();

    if (existing) {
      const patch: Record<string, unknown> = {
        [data.section]: data.value,
        version: (existing.version ?? 1) + 1,
      };
      const { error } = await supabase
        .from("state_templates")
        .update(patch)
        .eq("id", existing.id);
      if (error) throw new Error(error.message);
    } else {
      const insertRow: Record<string, unknown> = {
        state_code: data.stateCode,
        [data.section]: data.value,
      };
      const { error } = await supabase.from("state_templates").insert(insertRow);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const publishStateTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ stateCode: z.string().regex(STATE_CODE_RE) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await ensureExecutive(supabase, userId);
    const { error } = await supabase
      .from("state_templates")
      .update({ published_at: new Date().toISOString(), published_by: userId })
      .eq("state_code", data.stateCode);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Re-export so callers don't have to import multiple modules.
export type { PlatformState, StateTemplate, TemplateSectionKey };
export { SECTION_KEYS };
