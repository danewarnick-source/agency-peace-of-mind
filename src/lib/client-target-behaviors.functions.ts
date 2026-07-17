import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireOrgMembership } from "@/integrations/supabase/require-org";

const orgClient = z.object({
  organization_id: z.string().uuid(),
  client_id: z.string().uuid(),
});

export type ClientTargetBehavior = {
  id: string;
  client_id: string;
  organization_id: string;
  behavior_name: string;
  description: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export const listClientTargetBehaviors = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => orgClient.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireOrgMembership(supabase, userId, data.organization_id, "employee");
    const { data: rows, error } = await (supabase as any)
      .from("client_target_behaviors")
      .select("*")
      .eq("client_id", data.client_id)
      .eq("organization_id", data.organization_id)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (rows ?? []) as ClientTargetBehavior[];
  });

export const upsertClientTargetBehavior = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      id: z.string().uuid().optional(),
      organization_id: z.string().uuid(),
      client_id: z.string().uuid(),
      behavior_name: z.string().min(1).max(200),
      description: z.string().max(2000).default(""),
      sort_order: z.number().int().default(0),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireOrgMembership(supabase, userId, data.organization_id, "admin");
    const { id, ...payload } = data;
    if (id) {
      const { data: row, error } = await (supabase as any)
        .from("client_target_behaviors")
        .update(payload)
        .eq("id", id)
        .eq("organization_id", data.organization_id)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return row as ClientTargetBehavior;
    }
    const { data: row, error } = await (supabase as any)
      .from("client_target_behaviors")
      .insert(payload)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row as ClientTargetBehavior;
  });

export const deleteClientTargetBehavior = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      organization_id: z.string().uuid(),
      id: z.string().uuid(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireOrgMembership(supabase, userId, data.organization_id, "admin");
    const { error } = await (supabase as any)
      .from("client_target_behaviors")
      .delete()
      .eq("id", data.id)
      .eq("organization_id", data.organization_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
