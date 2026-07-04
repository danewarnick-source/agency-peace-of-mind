import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function ensureExecutive(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
): Promise<void> {
  const { data, error } = await supabase
    .from("hive_executives")
    .select("id")
    .eq("user_id", userId)
    .eq("active", true)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Executive access required.");
}

export interface FeatureRegistryRow {
  id: string;
  feature_key: string;
  label: string;
  description: string | null;
  parent_key: string | null;
  category: string;
  default_enabled: boolean;
  sort_order: number;
  required_tier: string | null;
  upgrade_blurb: string | null;
}

export const listFeatureRegistry = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<FeatureRegistryRow[]> => {
    const { supabase, userId } = context;
    await ensureExecutive(supabase, userId);
    const { data, error } = await supabase
      .from("feature_registry")
      .select("id, feature_key, label, description, parent_key, category, default_enabled, sort_order, required_tier, upgrade_blurb")
      .order("category")
      .order("sort_order")
      .order("label");
    if (error) throw error;
    return (data ?? []) as FeatureRegistryRow[];
  });

const upsertSchema = z.object({
  id: z.string().uuid().optional(),
  feature_key: z.string().min(2).max(120).regex(/^[a-z0-9_.]+$/, "lowercase, digits, _, ."),
  label: z.string().min(1).max(200),
  description: z.string().max(2000).nullable().optional(),
  parent_key: z.string().max(120).nullable().optional(),
  category: z.enum(["tab", "subtab", "nectar_feature"]),
  default_enabled: z.boolean().default(false),
  sort_order: z.number().int().default(0),
  required_tier: z.string().max(60).nullable().optional(),
  upgrade_blurb: z.string().max(1000).nullable().optional(),
});

export const upsertFeatureRegistryEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => upsertSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await ensureExecutive(supabase, userId);
    const payload = {
      feature_key: data.feature_key,
      label: data.label,
      description: data.description ?? null,
      parent_key: data.parent_key ?? null,
      category: data.category,
      default_enabled: data.default_enabled,
      sort_order: data.sort_order,
      required_tier: data.required_tier ?? null,
      upgrade_blurb: data.upgrade_blurb ?? null,
    };
    if (data.id) {
      const { error } = await supabase.from("feature_registry").update(payload).eq("id", data.id);
      if (error) throw error;
      return { ok: true, id: data.id };
    }
    const { data: row, error } = await supabase
      .from("feature_registry")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw error;
    return { ok: true, id: (row as { id: string }).id };
  });
