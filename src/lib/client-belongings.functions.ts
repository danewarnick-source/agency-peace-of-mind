import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireOrgMembership } from "@/integrations/supabase/require-org";

export type ClientBelongingRow = {
  id: string;
  organization_id: string;
  client_id: string;
  item_name: string;
  description: string | null;
  estimated_value: number;
  inventoried_on: string;
  inventoried_by: string | null;
  inventoried_by_name: string | null;
  guardian_signature_data_url: string | null;
  signed_at: string | null;
  status: "active" | "discarded" | "replaced";
  discarded_on: string | null;
  discard_reason: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

const SELECT = "id, organization_id, client_id, item_name, description, estimated_value, inventoried_on, inventoried_by, inventoried_by_name, guardian_signature_data_url, signed_at, status, discarded_on, discard_reason, created_by, created_at, updated_at";

export const listClientBelongings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({
    organizationId: z.string().uuid(),
    clientId: z.string().uuid(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!supabase || !userId) return [] as ClientBelongingRow[];
    await requireOrgMembership(supabase, userId, data.organizationId, "employee");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rows, error } = await (supabase as any)
      .from("client_belongings")
      .select(SELECT)
      .eq("organization_id", data.organizationId)
      .eq("client_id", data.clientId)
      .order("inventoried_on", { ascending: false });
    if (error) throw new Error(error.message);
    return (rows ?? []) as ClientBelongingRow[];
  });

export const addClientBelonging = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({
    organizationId: z.string().uuid(),
    clientId: z.string().uuid(),
    itemName: z.string().min(1).max(200),
    description: z.string().max(2000).optional().nullable(),
    estimatedValue: z.number().min(0).max(1_000_000),
    inventoriedOn: z.string().min(1),
    inventoriedByName: z.string().min(1).max(200),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!supabase || !userId) return { ok: true };
    await requireOrgMembership(supabase, userId, data.organizationId, "manager");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("client_belongings")
      .insert({
        organization_id: data.organizationId,
        client_id: data.clientId,
        item_name: data.itemName,
        description: data.description ?? null,
        estimated_value: data.estimatedValue,
        inventoried_on: data.inventoriedOn,
        inventoried_by: userId,
        inventoried_by_name: data.inventoriedByName,
        status: "active",
        created_by: userId,
      });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const discardClientBelonging = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({
    organizationId: z.string().uuid(),
    belongingId: z.string().uuid(),
    discardReason: z.string().min(1).max(2000),
    discardedOn: z.string().min(1),
    guardianSignatureDataUrl: z.string().max(200_000).optional().nullable(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!supabase || !userId) return { ok: true };
    await requireOrgMembership(supabase, userId, data.organizationId, "manager");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("client_belongings")
      .update({
        status: "discarded",
        discard_reason: data.discardReason,
        discarded_on: data.discardedOn,
        guardian_signature_data_url: data.guardianSignatureDataUrl ?? null,
        signed_at: data.guardianSignatureDataUrl ? new Date().toISOString() : null,
      })
      .eq("id", data.belongingId)
      .eq("organization_id", data.organizationId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
