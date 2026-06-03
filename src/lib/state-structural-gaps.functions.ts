import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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

export const listStructuralGaps = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ stateCode: z.string().regex(STATE_CODE_RE) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await ensureExecutive(supabase, userId);
    const { data: rows, error } = await supabase
      .from("state_structural_gaps")
      .select("id, state_code, area, summary, detail, status, ticket_id, created_at, updated_at")
      .eq("state_code", data.stateCode)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const fileStructuralGap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        stateCode: z.string().regex(STATE_CODE_RE),
        area: z.string().min(1).max(64),
        summary: z.string().min(3).max(280),
        detail: z.string().max(4000).optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await ensureExecutive(supabase, userId);
    const { error } = await supabase.from("state_structural_gaps").insert({
      state_code: data.stateCode,
      area: data.area,
      summary: data.summary,
      detail: data.detail ?? null,
      created_by: userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateStructuralGap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["open", "in_progress", "resolved", "wont_fix"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await ensureExecutive(supabase, userId);
    const { error } = await supabase
      .from("state_structural_gaps")
      .update({ status: data.status })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
