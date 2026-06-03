import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Provider-entered ledger entries — Layer 2 of the Financial Revenue view.
 *
 * Layer 1 (HIVE-verified billed revenue) is sourced live from the 520
 * data and lives in src/lib/financial-revenue.functions.ts. This file
 * never touches that source.
 *
 * Admin-only writes are enforced SERVER-SIDE in every handler below,
 * in addition to the RLS policies on public.provider_ledger_entries.
 */

export const LEDGER_CATEGORIES = [
  "expense",
  "payroll_tax",
  "estimated_payroll",
  "received",
  "custom",
] as const;
export type LedgerCategory = (typeof LEDGER_CATEGORIES)[number];

/**
 * Sign logic for the Combined band.
 *   received           → ADDS (cash/revenue collected)
 *   expense            → SUBTRACTS
 *   payroll_tax        → SUBTRACTS
 *   estimated_payroll  → SUBTRACTS
 *   custom             → ADDS by default (provider may use negative
 *                        amounts for outflows; we don't second-guess the
 *                        sign of a free-form line)
 */
export const CATEGORY_SIGN: Record<LedgerCategory, 1 | -1> = {
  received: 1,
  custom: 1,
  expense: -1,
  payroll_tax: -1,
  estimated_payroll: -1,
};

const CategoryEnum = z.enum(LEDGER_CATEGORIES);

async function adminOrgIds(
  supabase: import("@supabase/supabase-js").SupabaseClient,
  userId: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("organization_members")
    .select("organization_id, role, active")
    .eq("user_id", userId)
    .eq("active", true);
  if (error) throw new Error(error.message);
  return (data ?? [])
    .filter((m: { role: string }) => m.role === "admin" || m.role === "super_admin")
    .map((m: { organization_id: string }) => m.organization_id);
}

// ─── LIST ────────────────────────────────────────────────────────────────
const ListInput = z.object({
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
});

export const listLedgerEntries = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => ListInput.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const orgIds = await adminOrgIds(supabase, userId);
    if (orgIds.length === 0) {
      throw new Error("Forbidden: Company Admin role required.");
    }
    const { data: rows, error } = await supabase
      .from("provider_ledger_entries")
      .select("*")
      .in("organization_id", orgIds)
      .eq("period_year", data.year)
      .eq("period_month", data.month)
      // `billed_manual` is the base-tier fallback for HIVE-Verified billed
      // revenue (see financial-revenue.functions.ts). It is rendered in the
      // top "Billed Revenue" card, NOT in the Your Inputs ledger.
      .neq("category", "billed_manual")
      .order("category", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return { entries: rows ?? [] };
  });

// ─── CREATE ──────────────────────────────────────────────────────────────
const CreateInput = z.object({
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
    const orgIds = await adminOrgIds(supabase, userId);
    if (orgIds.length === 0) {
      throw new Error("Forbidden: Company Admin role required.");
    }
    // For now, write into the first admin org. Multi-org pickers come later.
    const organization_id = orgIds[0];
    const { data: row, error } = await supabase
      .from("provider_ledger_entries")
      .insert({
        organization_id,
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
    const orgIds = await adminOrgIds(supabase, userId);
    if (orgIds.length === 0) {
      throw new Error("Forbidden: Company Admin role required.");
    }
    const { id, ...patch } = data;
    const { data: row, error } = await supabase
      .from("provider_ledger_entries")
      .update(patch)
      .eq("id", id)
      .in("organization_id", orgIds)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return { entry: row };
  });

// ─── DELETE ──────────────────────────────────────────────────────────────
const DeleteInput = z.object({ id: z.string().uuid() });

export const deleteLedgerEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => DeleteInput.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const orgIds = await adminOrgIds(supabase, userId);
    if (orgIds.length === 0) {
      throw new Error("Forbidden: Company Admin role required.");
    }
    const { error } = await supabase
      .from("provider_ledger_entries")
      .delete()
      .eq("id", data.id)
      .in("organization_id", orgIds);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
