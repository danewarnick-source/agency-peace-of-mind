import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const STATE_CODE_RE = /^[A-Z]{2}$/;

export interface StateRequirementSource {
  id: string;
  state_code: string;
  title: string;
  jurisdiction: string | null;
  storage_path: string | null;
  source_type: string;
  parse_status: "pending" | "parsing" | "parsed" | "error";
  parse_error: string | null;
  derived_count: number;
  uploaded_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface StateDerivedRequirement {
  id: string;
  state_code: string;
  source_id: string | null;
  requirement_key: string;
  title: string;
  description: string | null;
  category: string | null;
  source_citation: string | null;
  jurisdiction: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

async function ensureExecutive(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
): Promise<void> {
  const { data, error } = await supabase.rpc("is_hive_executive", { _user: userId });
  if (error) throw error;
  if (!data) throw new Error("HIVE Executive permission required.");
}

export const listStateRequirementSources = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ stateCode: z.string().regex(STATE_CODE_RE) }).parse(input),
  )
  .handler(async ({ data, context }): Promise<StateRequirementSource[]> => {
    const { supabase, userId } = context;
    await ensureExecutive(supabase, userId);
    const { data: rows, error } = await supabase
      .from("state_requirement_sources")
      .select("*")
      .eq("state_code", data.stateCode)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (rows ?? []) as StateRequirementSource[];
  });

export const createStateRequirementSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        stateCode: z.string().regex(STATE_CODE_RE),
        title: z.string().min(2).max(200),
        jurisdiction: z.string().max(120).optional().nullable(),
        storage_path: z.string().max(500).optional().nullable(),
        source_type: z.enum(["authoritative", "reference", "supplemental"]).default("authoritative"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await ensureExecutive(supabase, userId);
    const { data: row, error } = await supabase
      .from("state_requirement_sources")
      .insert({
        state_code: data.stateCode,
        title: data.title,
        jurisdiction: data.jurisdiction ?? null,
        storage_path: data.storage_path ?? null,
        source_type: data.source_type,
        uploaded_by: userId,
        parse_status: "pending",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const deleteStateRequirementSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await ensureExecutive(supabase, userId);
    const { error } = await supabase.from("state_requirement_sources").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Mark a source as parsed and write the NECTAR-derived requirement rows.
// In the live system NECTAR runs this against the document; the call shape is
// the same so it can be wired to the engine without changing this contract.
export const markStateSourceParsed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        sourceId: z.string().uuid(),
        derivedRequirements: z
          .array(
            z.object({
              requirement_key: z.string().min(1).max(160),
              title: z.string().min(1).max(240),
              description: z.string().max(2000).optional().nullable(),
              category: z.string().max(60).optional().nullable(),
              source_citation: z.string().max(500).optional().nullable(),
              jurisdiction: z.string().max(120).optional().nullable(),
            }),
          )
          .max(500),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await ensureExecutive(supabase, userId);

    const { data: src, error: srcErr } = await supabase
      .from("state_requirement_sources")
      .select("state_code")
      .eq("id", data.sourceId)
      .maybeSingle();
    if (srcErr) throw new Error(srcErr.message);
    if (!src) throw new Error("Source not found.");

    if (data.derivedRequirements.length) {
      const rows = data.derivedRequirements.map((r) => ({
        state_code: src.state_code,
        source_id: data.sourceId,
        requirement_key: r.requirement_key,
        title: r.title,
        description: r.description ?? null,
        category: r.category ?? null,
        source_citation: r.source_citation ?? null,
        jurisdiction: r.jurisdiction ?? null,
        metadata: {},
      }));
      const { error: insErr } = await supabase.from("state_derived_requirements").insert(rows);
      if (insErr) throw new Error(insErr.message);
    }

    const { error: updErr } = await supabase
      .from("state_requirement_sources")
      .update({
        parse_status: "parsed",
        derived_count: data.derivedRequirements.length,
        parse_error: null,
      })
      .eq("id", data.sourceId);
    if (updErr) throw new Error(updErr.message);

    return { ok: true, derived: data.derivedRequirements.length };
  });

export const listStateDerivedRequirements = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ stateCode: z.string().regex(STATE_CODE_RE) }).parse(input),
  )
  .handler(async ({ data, context }): Promise<StateDerivedRequirement[]> => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("state_derived_requirements")
      .select("*")
      .eq("state_code", data.stateCode)
      .order("category", { ascending: true })
      .order("title", { ascending: true });
    if (error) throw new Error(error.message);
    return (rows ?? []) as StateDerivedRequirement[];
  });

// Providers in a state — used by the State Detail "Providers" tab.
export const listStateProviders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ stateCode: z.string().regex(STATE_CODE_RE) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await ensureExecutive(supabase, userId);
    const { data: rows, error } = await supabase
      .from("organizations")
      .select("id, name, slug, created_at")
      .eq("state_code", data.stateCode)
      .order("name");
    if (error) throw new Error(error.message);
    return rows ?? [];
  });
