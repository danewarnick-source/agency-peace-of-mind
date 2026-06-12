/**
 * CRM Phase A3 — Provider Interest Outline server fns.
 *
 * The Interest Outline is the matching target NECTAR will score referrals
 * against in A5. For v1: one outline per org (named "Default"). Structure
 * supports multiple named outlines later (UNIQUE (organization_id, name)).
 *
 * Gating:
 *   - read  → view_referrals OR manage_referrals
 *   - write → manage_referrals
 * Staff blocked. Super-admin bypassed by has_permission().
 *
 * NOT included here: the match weights tuner UI (v2). Defaults are stored
 * in match_weights and surfaced read-only.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  requirePermission,
  requireAnyPermission,
} from "@/lib/require-permission";

const orgOnly = z.object({ organization_id: z.string().uuid() });

const DEFAULT_NAME = "Default";

export const DEFAULT_MATCH_WEIGHTS = {
  location: 0.25,
  code_overlap: 0.25,
  disability_fit: 0.2,
  need_fit: 0.15,
  host_fit: 0.15,
} as const;

export type ProviderInterestOutline = {
  id: string;
  organization_id: string;
  name: string;
  location_mode: "anywhere" | "county" | "city";
  location_values: string[];
  codes_held: string[];
  need_levels_served: string[];
  disability_types_served: string[];
  disability_levels_served: string[];
  match_weights: Record<string, number>;
  updated_at: string;
};

const OUTLINE_COLS =
  "id, organization_id, name, location_mode, location_values, codes_held, need_levels_served, disability_types_served, disability_levels_served, match_weights, updated_at";

export const getProviderInterestOutline = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => orgOnly.parse(d))
  .handler(async ({ data, context }): Promise<ProviderInterestOutline | null> => {
    const { supabase, userId } = context;
    await requireAnyPermission(supabase, userId, data.organization_id, [
      "view_referrals",
      "manage_referrals",
    ]);
    const { data: row, error } = await supabase
      .from("provider_interest_outline")
      .select(OUTLINE_COLS)
      .eq("organization_id", data.organization_id)
      .eq("name", DEFAULT_NAME)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (row ?? null) as ProviderInterestOutline | null;
  });

const saveInput = orgOnly.extend({
  location_mode: z.enum(["anywhere", "county", "city"]),
  location_values: z.array(z.string().trim().min(1).max(120)).max(50).default([]),
  codes_held: z.array(z.string().trim().min(1).max(20)).max(60).default([]),
  need_levels_served: z.array(z.string().trim().min(1).max(60)).max(20).default([]),
  disability_types_served: z
    .array(z.string().trim().min(1).max(80))
    .max(30)
    .default([]),
  disability_levels_served: z
    .array(z.string().trim().min(1).max(60))
    .max(20)
    .default([]),
});

export const saveProviderInterestOutline = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => saveInput.parse(d))
  .handler(async ({ data, context }): Promise<ProviderInterestOutline> => {
    const { supabase, userId } = context;
    await requirePermission(
      supabase,
      userId,
      data.organization_id,
      "manage_referrals",
    );

    const payload = {
      organization_id: data.organization_id,
      name: DEFAULT_NAME,
      location_mode: data.location_mode,
      location_values: data.location_values,
      codes_held: data.codes_held,
      need_levels_served: data.need_levels_served,
      disability_types_served: data.disability_types_served,
      disability_levels_served: data.disability_levels_served,
      updated_by: userId,
    };

    // upsert by (organization_id, name)
    const { data: row, error } = await supabase
      .from("provider_interest_outline")
      .upsert(payload, { onConflict: "organization_id,name" })
      .select(OUTLINE_COLS)
      .single();
    if (error) throw new Error(error.message);
    return row as ProviderInterestOutline;
  });
