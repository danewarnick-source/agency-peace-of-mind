import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { StateTemplate, TemplateSectionKey } from "./state-templates";

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
  "forms",
  "citations",
  "caps",
  "regulator",
];



// ─────────────────────────────────────────────────────────────────────────────
// Catalog
// ─────────────────────────────────────────────────────────────────────────────

export const listPlatformStates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data: states, error } = await supabase
      .from("platform_states")
      .select("code, name, status, is_reference, regulator_label, notes, updated_at")
      .order("name");
    if (error) throw new Error(error.message);

    const { data: tpls } = await supabase
      .from("state_templates")
      .select("state_code, updated_at, published_at");
    const tplByCode = new Map((tpls ?? []).map((t) => [t.state_code, t]));

    const { data: orgs } = await supabase
      .from("organizations")
      .select("state_code");
    const counts = new Map<string, number>();
    for (const o of orgs ?? []) {
      const code = (o as { state_code: string | null }).state_code;
      if (!code) continue;
      counts.set(code, (counts.get(code) ?? 0) + 1);
    }

    return (states ?? []).map((s) => ({
      code: s.code,
      name: s.name,
      status: s.status,
      is_reference: s.is_reference,
      regulator_label: s.regulator_label,
      notes: s.notes,
      updated_at: s.updated_at,
      provider_count: counts.get(s.code) ?? 0,
      template_updated_at: tplByCode.get(s.code)?.updated_at ?? null,
      template_published_at: tplByCode.get(s.code)?.published_at ?? null,
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

export const updatePlatformStateBasics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        code: z.string().regex(STATE_CODE_RE),
        status: z.enum(["draft", "active", "coming_soon"]).optional(),
        regulator_label: z.string().max(120).nullable().optional(),
        notes: z.string().max(2000).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await ensureExecutive(supabase, userId);
    const patch: { status?: string; regulator_label?: string | null; notes?: string | null } = {};
    if (data.status !== undefined) patch.status = data.status;
    if (data.regulator_label !== undefined) patch.regulator_label = data.regulator_label;
    if (data.notes !== undefined) patch.notes = data.notes;
    if (Object.keys(patch).length === 0) return { ok: true };
    const { error } = await supabase.from("platform_states").update(patch).eq("code", data.code);

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
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: row, error } = await supabase
      .from("state_templates")
      .select("*")
      .eq("state_code", data.stateCode)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row ?? null;
  });

// Returns the published template for the caller's current org's state.
export const getMyStateTemplate = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: m } = await supabase
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", userId)
      .eq("active", true)
      .limit(1)
      .maybeSingle();
    if (!m) return { state_code: null as string | null, template: null };
    const { data: org } = await supabase
      .from("organizations")
      .select("state_code")
      .eq("id", m.organization_id)
      .maybeSingle();
    const code = (org as { state_code: string | null } | null)?.state_code ?? null;
    if (!code) return { state_code: null as string | null, template: null };
    const { data: tpl } = await supabase
      .from("state_templates")
      .select("*")
      .eq("state_code", code)
      .not("published_at", "is", null)
      .maybeSingle();
    return { state_code: code, template: tpl ?? null };
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
    "forms",
  ]),
  value: z.unknown(),
});


export const updateStateTemplateSection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SectionPatchSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await ensureExecutive(supabase, userId);

    const { data: existing } = await supabase
      .from("state_templates")
      .select("id, version")
      .eq("state_code", data.stateCode)
      .maybeSingle();

    if (existing) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const patch: any = {
        [data.section]: data.value,
        version: (existing.version ?? 1) + 1,
      };
      const { error } = await supabase
        .from("state_templates")
        .update(patch)
        .eq("id", existing.id);
      if (error) throw new Error(error.message);
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const insertRow: any = {
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

export { SECTION_KEYS };
export type { StateTemplate, TemplateSectionKey };
