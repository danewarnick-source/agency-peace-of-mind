import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  diffBaseSchemas,
  type BaseTemplateSchema,
  type BaseTemplateVersion,
} from "./state-base-versions";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function ensureExecutive(supabase: any, userId: string): Promise<void> {
  const { data, error } = await supabase.rpc("is_hive_executive", { _user: userId });
  if (error) throw error;
  if (!data) throw new Error("HIVE Executive permission required.");
}

const STATE_CODE_RE = /^[A-Z]{2}$/;

// ─────────────────────────────────────────────────────────────────────────────
// Read
// ─────────────────────────────────────────────────────────────────────────────

export const listBaseTemplateVersions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from("hive_base_template_versions" as any)
      .select("*")
      .order("version", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as BaseTemplateVersion[];
  });

export const getCurrentBaseTemplateVersion = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from("hive_base_template_versions" as any)
      .select("*")
      .eq("is_current", true)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data ?? null) as unknown as BaseTemplateVersion | null;
  });

// ─────────────────────────────────────────────────────────────────────────────
// Publish a new version
// ─────────────────────────────────────────────────────────────────────────────

const SchemaSchema = z.object({
  sections: z.array(
    z.object({
      key: z.string().min(1).max(64),
      fields: z.array(z.string().min(1).max(64)).max(64),
    }),
  ).max(64),
});

export const publishBaseTemplateVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      title: z.string().min(1).max(160),
      summary: z.string().max(2000).default(""),
      schema: SchemaSchema,
      notes: z.string().max(2000).optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await ensureExecutive(supabase, userId);

    // Pull the current version to compute the changelog and determine next number.
    const { data: cur } = await supabase
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from("hive_base_template_versions" as any)
      .select("schema, version")
      .eq("is_current", true)
      .maybeSingle();

    const { data: top } = await supabase
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from("hive_base_template_versions" as any)
      .select("version")
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextVersion = ((top as { version?: number } | null)?.version ?? 0) + 1;

    const diff = diffBaseSchemas(
      (cur as { schema?: BaseTemplateSchema } | null)?.schema ?? null,
      data.schema as BaseTemplateSchema,
    );
    const changelog = [...diff.added, ...diff.removed];
    if (data.notes) changelog.push({ type: "changed", section: "_notes", note: data.notes });

    // Atomically swap "current": clear, then insert new as current.
    if (cur) {
      const { error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from("hive_base_template_versions" as any)
        .update({ is_current: false })
        .eq("is_current", true);
      if (error) throw new Error(error.message);
    }

    const { error: insErr } = await supabase
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from("hive_base_template_versions" as any)
      .insert({
        version: nextVersion,
        title: data.title,
        summary: data.summary,
        changelog,
        schema: data.schema,
        is_current: true,
        released_by: userId,
      });
    if (insErr) throw new Error(insErr.message);

    return { version: nextVersion, changelog };
  });

// ─────────────────────────────────────────────────────────────────────────────
// Upgrade a state to a target base version
// ─────────────────────────────────────────────────────────────────────────────

export const previewStateBaseUpgrade = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ stateCode: z.string().regex(STATE_CODE_RE) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: tpl } = await supabase
      .from("state_templates")
      .select("*")
      .eq("state_code", data.stateCode)
      .maybeSingle();
    if (!tpl) throw new Error("No template for this state yet.");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tplAny = tpl as any;
    const currentStateVersion = tplAny.base_template_version ?? 1;

    const { data: from } = await supabase
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from("hive_base_template_versions" as any)
      .select("version, schema, title")
      .eq("version", currentStateVersion)
      .maybeSingle();
    const { data: to } = await supabase
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from("hive_base_template_versions" as any)
      .select("version, schema, title, summary, changelog")
      .eq("is_current", true)
      .maybeSingle();

    if (!to) throw new Error("No current base template version.");
    if ((to as { version: number }).version === currentStateVersion) {
      return { upToDate: true as const, fromVersion: currentStateVersion, toVersion: currentStateVersion, added: [], removed: [] };
    }

    const diff = diffBaseSchemas(
      ((from as { schema?: BaseTemplateSchema } | null)?.schema) ?? null,
      (to as { schema: BaseTemplateSchema }).schema,
    );

    return {
      upToDate: false as const,
      fromVersion: currentStateVersion,
      toVersion: (to as { version: number }).version,
      toTitle: (to as { title: string }).title,
      toSummary: (to as { summary: string }).summary,
      added: diff.added,
      removed: diff.removed,
    };
  });

export const upgradeStateToBaseVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      stateCode: z.string().regex(STATE_CODE_RE),
      toVersion: z.number().int().positive(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await ensureExecutive(supabase, userId);

    // Verify the target version exists.
    const { data: ver } = await supabase
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from("hive_base_template_versions" as any)
      .select("version")
      .eq("version", data.toVersion)
      .maybeSingle();
    if (!ver) throw new Error(`Base template version ${data.toVersion} not found.`);

    // Bump the state's stamp. State-specific data is untouched — only the
    // version pointer + upgrade timestamp move. New fields appear blank
    // (using FALLBACK_TEMPLATE defaults) for the executive to fill in.
    const { error } = await supabase
      .from("state_templates")
      .update({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        base_template_version: data.toVersion as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        base_template_upgraded_at: new Date().toISOString() as any,
      })
      .eq("state_code", data.stateCode);
    if (error) throw new Error(error.message);

    return { ok: true, version: data.toVersion };
  });
