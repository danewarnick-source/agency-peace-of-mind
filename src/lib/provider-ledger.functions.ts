import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireOrgMembership } from "@/integrations/supabase/require-org";

/**
 * Provider-entered ledger entries — Layer 2 of the Financial Revenue view.
 *
 * Tier 3 Stage 3: every handler ACCEPTS `organizationId` (the active org)
 * and verifies admin membership against THAT org. Replaces the legacy
 * "first admin org" pick that silently wrote into the wrong workspace for
 * multi-org users.
 */

export const LEDGER_CATEGORIES = [
  "expense",
  "payroll_tax",
  "estimated_payroll",
  "received",
  "custom",
] as const;
export type LedgerCategory = (typeof LEDGER_CATEGORIES)[number];

export const CATEGORY_SIGN: Record<LedgerCategory, 1 | -1> = {
  received: 1,
  custom: 1,
  expense: -1,
  payroll_tax: -1,
  estimated_payroll: -1,
};

const CategoryEnum = z.enum(LEDGER_CATEGORIES);

// ─── LIST ────────────────────────────────────────────────────────────────
const ListInput = z.object({
  organizationId: z.string().uuid(),
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
});

export const listLedgerEntries = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => ListInput.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireOrgMembership(supabase, userId, data.organizationId, "admin");
    const { data: rows, error } = await supabase
      .from("provider_ledger_entries")
      .select("*")
      .eq("organization_id", data.organizationId)
      .eq("period_year", data.year)
      .eq("period_month", data.month)
      .neq("category", "billed_manual")
      .order("category", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return { entries: rows ?? [] };
  });

// ─── CREATE ──────────────────────────────────────────────────────────────
const CreateInput = z.object({
  organizationId: z.string().uuid(),
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
  category: CategoryEnum,
  label: z.string().min(1).max(200),
  amount: z.number().finite(),
  is_estimate: z.boolean().default(false),
  note: z.string().max(2000).nullable().optional(),
});

export const createLedgerEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => CreateInput.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireOrgMembership(supabase, userId, data.organizationId, "admin");
    const { data: row, error } = await supabase
      .from("provider_ledger_entries")
      .insert({
        organization_id: data.organizationId,
        period_year: data.year,
        period_month: data.month,
        category: data.category,
        label: data.label,
        amount: data.amount,
        is_estimate: data.is_estimate,
        note: data.note ?? null,
        created_by: userId,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return { entry: row };
  });

// ─── UPDATE ──────────────────────────────────────────────────────────────
const UpdateInput = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  category: CategoryEnum.optional(),
  label: z.string().min(1).max(200).optional(),
  amount: z.number().finite().optional(),
  is_estimate: z.boolean().optional(),
  note: z.string().max(2000).nullable().optional(),
});

export const updateLedgerEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => UpdateInput.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireOrgMembership(supabase, userId, data.organizationId, "admin");
    const { id, organizationId, ...patch } = data;
    const { data: row, error } = await supabase
      .from("provider_ledger_entries")
      .update(patch)
      .eq("id", id)
      .eq("organization_id", organizationId)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return { entry: row };
  });

// ─── DELETE ──────────────────────────────────────────────────────────────
const DeleteInput = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
});

export const deleteLedgerEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => DeleteInput.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireOrgMembership(supabase, userId, data.organizationId, "admin");
    const { error } = await supabase
      .from("provider_ledger_entries")
      .delete()
      .eq("id", data.id)
      .eq("organization_id", data.organizationId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
