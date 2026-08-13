import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireOrgMembership } from "@/integrations/supabase/require-org";

export type HealthcareProvider = {
  id: string;
  client_id: string;
  provider_type: string;
  provider_name: string | null;
  phone: string | null;
  notes: string | null;
  sort_order: number;
};

export const listHealthcareProviders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ organization_id: z.string().uuid(), client_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }): Promise<HealthcareProvider[]> => {
    const { supabase, userId } = context;
    if (!supabase || !userId) return [];
    await requireOrgMembership(supabase, userId, data.organization_id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;
    const { data: rows, error } = await sb
      .from("client_healthcare_providers")
      .select("id, client_id, provider_type, provider_name, phone, notes, sort_order")
      .eq("organization_id", data.organization_id)
      .eq("client_id", data.client_id)
      .order("sort_order", { ascending: true });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const upsertHealthcareProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      organization_id: z.string().uuid(),
      client_id: z.string().uuid(),
      id: z.string().uuid().nullable().optional(),
      provider_type: z.string().min(1).max(120),
      provider_name: z.string().max(200).nullable().optional(),
      phone: z.string().max(40).nullable().optional(),
      notes: z.string().max(2000).nullable().optional(),
      sort_order: z.number().int().default(0),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!supabase || !userId) return { ok: false };
    await requireOrgMembership(supabase, userId, data.organization_id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;
    const row = {
      organization_id: data.organization_id,
      client_id: data.client_id,
      provider_type: data.provider_type.trim(),
      provider_name: data.provider_name?.trim() || null,
      phone: data.phone?.trim() || null,
      notes: data.notes?.trim() || null,
      sort_order: data.sort_order,
    };
    if (data.id) {
      const { error } = await sb.from("client_healthcare_providers").update(row).eq("id", data.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await sb.from("client_healthcare_providers").insert(row);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const deleteHealthcareProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ organization_id: z.string().uuid(), id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!supabase || !userId) return { ok: false };
    await requireOrgMembership(supabase, userId, data.organization_id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;
    const { error } = await sb.from("client_healthcare_providers").delete().eq("id", data.id).eq("organization_id", data.organization_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
