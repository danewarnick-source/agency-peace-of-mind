// Server-fn wrapper for the Financial → Distributions tab.
//
// Distributions is HARD-LOCKED to admin / super_admin — it is NEVER a
// manager-toggleable permission. Every read and write here therefore gates
// on requireRoleAtLeast("admin") (admin OR super_admin) using the
// USER-SCOPED context.supabase from requireSupabaseAuth. RLS still applies
// as the user. No supabaseAdmin. No RLS changes.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireRoleAtLeast } from "@/lib/require-permission";

const OrgInput = z.object({ organizationId: z.string().uuid() });
const OrgYearInput = OrgInput.extend({ year: z.number().int().min(2000).max(2100) });
const OrgPlanInput = OrgInput.extend({ planId: z.string().uuid() });

async function gate(
  context: { supabase: unknown; userId: string },
  organizationId: string,
) {
  // admin or super_admin only — managers and below MUST 403.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await requireRoleAtLeast(context.supabase as any, context.userId, organizationId, "admin");
}

// ---------------- Reads ----------------

export type DistPlan = {
  id: string;
  organization_id: string;
  name: string;
  plan_type: "profit_share" | "investor" | "ownership";
  retention_pct: number;
  expense_selection: Record<string, boolean>;
  formula_json: unknown | null;
  nectar_summary: string | null;
  status: "draft" | "approved";
  is_active: boolean;
  approved_by: string | null;
  approved_at: string | null;
};

export type DistParticipant = {
  id: string;
  plan_id: string;
  participant_name: string;
  participant_user_id: string | null;
  allocation_pct: number;
  role_label: string | null;
  notes: string | null;
  sort_order: number;
};

export const getDistPlans = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => OrgInput.parse(i))
  .handler(async ({ data, context }): Promise<DistPlan[]> => {
    await gate(context, data.organizationId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rows, error } = await (context.supabase.from("distribution_plans" as never) as any)
      .select("*")
      .eq("organization_id", data.organizationId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (rows ?? []) as DistPlan[];
  });

export const getDistParticipants = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => OrgPlanInput.parse(i))
  .handler(async ({ data, context }): Promise<DistParticipant[]> => {
    await gate(context, data.organizationId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rows, error } = await (context.supabase.from("distribution_plan_participants" as never) as any)
      .select("*")
      .eq("plan_id", data.planId)
      .order("sort_order", { ascending: true });
    if (error) throw new Error(error.message);
    return (rows ?? []) as DistParticipant[];
  });

export const getDistCbc = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => OrgInput.parse(i))
  .handler(async ({ data, context }) => {
    await gate(context, data.organizationId);
    const { data: rows, error } = await context.supabase
      .from("client_billing_codes")
      .select("client_id, service_code, rate_per_unit")
      .eq("organization_id", data.organizationId);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const getDistEvv = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => OrgYearInput.parse(i))
  .handler(async ({ data, context }) => {
    await gate(context, data.organizationId);
    const yearStartIso = new Date(data.year, 0, 1).toISOString();
    const yearEndIso = new Date(data.year + 1, 0, 1).toISOString();
    const { data: rows, error } = await context.supabase
      .from("evv_timesheets")
      .select("client_id, service_type_code, clock_in_timestamp, clock_out_timestamp")
      .eq("organization_id", data.organizationId)
      .gte("clock_in_timestamp", yearStartIso)
      .lt("clock_in_timestamp", yearEndIso);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const getDistHhs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => OrgYearInput.parse(i))
  .handler(async ({ data, context }) => {
    await gate(context, data.organizationId);
    const yearStartDate = `${data.year}-01-01`;
    const yearEndDate = `${data.year + 1}-01-01`;
    const { data: rows, error } = await context.supabase
      .from("hhs_daily_records_v")
      .select("client_id, record_date, billable, service_code")
      .eq("organization_id", data.organizationId)
      .eq("service_code", "HHS")
      .gte("record_date", yearStartDate)
      .lt("record_date", yearEndDate);
    if (error) throw new Error(error.message);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (rows ?? []).filter((r: any) => r.billable);
  });

export const getDistCtr = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => OrgYearInput.parse(i))
  .handler(async ({ data, context }) => {
    await gate(context, data.organizationId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rows, error } = await (context.supabase.from("contractor_monthly_pay" as never) as any)
      .select("staff_id, year, month, net_pay, additional_pay, tax_federal, tax_state, tax_fica")
      .eq("organization_id", data.organizationId)
      .eq("year", data.year);
    if (error) throw new Error(error.message);
    return (rows ?? []) as unknown[];
  });

export const getDistLedger = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => OrgYearInput.parse(i))
  .handler(async ({ data, context }) => {
    await gate(context, data.organizationId);
    const { data: rows, error } = await context.supabase
      .from("provider_ledger_entries")
      .select("period_year, period_month, category, label, amount")
      .eq("organization_id", data.organizationId)
      .eq("period_year", data.year);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

// ---------------- Writes ----------------

const PlanType = z.enum(["profit_share", "investor", "ownership"]);

export const createDistPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    OrgInput.extend({ name: z.string().min(1), plan_type: PlanType }).parse(i),
  )
  .handler(async ({ data, context }): Promise<DistPlan> => {
    await gate(context, data.organizationId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: row, error } = await (context.supabase.from("distribution_plans" as never) as any)
      .insert({
        organization_id: data.organizationId,
        name: data.name,
        plan_type: data.plan_type,
        retention_pct: 0,
        status: "draft",
        is_active: false,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row as DistPlan;
  });

const UpdatePlanPatch = z.object({
  name: z.string().optional(),
  plan_type: PlanType.optional(),
  retention_pct: z.number().optional(),
  expense_selection: z.record(z.string(), z.boolean()).optional(),
  formula_json: z.unknown().optional(),
  nectar_summary: z.string().nullable().optional(),
  status: z.enum(["draft", "approved"]).optional(),
  is_active: z.boolean().optional(),
  approved_by: z.string().nullable().optional(),
  approved_at: z.string().nullable().optional(),
});

export const updateDistPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    OrgInput.extend({ id: z.string().uuid(), patch: UpdatePlanPatch }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await gate(context, data.organizationId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (context.supabase.from("distribution_plans" as never) as any)
      .update(data.patch)
      .eq("id", data.id)
      .eq("organization_id", data.organizationId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteDistPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => OrgInput.extend({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await gate(context, data.organizationId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (context.supabase.from("distribution_plans" as never) as any)
      .delete()
      .eq("id", data.id)
      .eq("organization_id", data.organizationId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const duplicateDistPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => OrgInput.extend({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }): Promise<DistPlan> => {
    await gate(context, data.organizationId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;

    const { data: plan, error: pErr } = await sb
      .from("distribution_plans" as never)
      .select("*")
      .eq("id", data.id)
      .eq("organization_id", data.organizationId)
      .single();
    if (pErr) throw new Error(pErr.message);
    if (!plan) throw new Error("Plan not found");

    const { data: parts, error: ptErr } = await sb
      .from("distribution_plan_participants" as never)
      .select("*")
      .eq("plan_id", data.id)
      .order("sort_order", { ascending: true });
    if (ptErr) throw new Error(ptErr.message);

    const { data: newPlan, error: nErr } = await sb
      .from("distribution_plans" as never)
      .insert({
        organization_id: plan.organization_id,
        name: `${plan.name} (copy)`,
        plan_type: plan.plan_type,
        retention_pct: plan.retention_pct,
        expense_selection: plan.expense_selection,
        formula_json: plan.formula_json,
        nectar_summary: plan.nectar_summary,
        status: "draft",
        is_active: false,
      })
      .select()
      .single();
    if (nErr) throw new Error(nErr.message);

    if ((parts ?? []).length) {
      const inserts = (parts as DistParticipant[]).map((p) => ({
        plan_id: (newPlan as DistPlan).id,
        participant_name: p.participant_name,
        participant_user_id: p.participant_user_id,
        allocation_pct: p.allocation_pct,
        role_label: p.role_label,
        notes: p.notes,
        sort_order: p.sort_order,
      }));
      const { error: e2 } = await sb
        .from("distribution_plan_participants" as never)
        .insert(inserts);
      if (e2) throw new Error(e2.message);
    }
    return newPlan as DistPlan;
  });

export const addDistParticipant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    OrgInput.extend({ planId: z.string().uuid(), sort_order: z.number().int() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await gate(context, data.organizationId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    // Verify the plan belongs to org (RLS would too, but be explicit).
    const { data: plan, error: pErr } = await sb
      .from("distribution_plans" as never)
      .select("id")
      .eq("id", data.planId)
      .eq("organization_id", data.organizationId)
      .maybeSingle();
    if (pErr) throw new Error(pErr.message);
    if (!plan) throw new Error("Plan not found");

    const { error } = await sb
      .from("distribution_plan_participants" as never)
      .insert({
        plan_id: data.planId,
        participant_name: "New participant",
        allocation_pct: 0,
        sort_order: data.sort_order,
      });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const UpdateParticipantPatch = z.object({
  participant_name: z.string().optional(),
  participant_user_id: z.string().nullable().optional(),
  allocation_pct: z.number().optional(),
  role_label: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  sort_order: z.number().int().optional(),
});

export const updateDistParticipant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    OrgInput.extend({ id: z.string().uuid(), patch: UpdateParticipantPatch }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await gate(context, data.organizationId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (context.supabase.from("distribution_plan_participants" as never) as any)
      .update(data.patch)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteDistParticipant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => OrgInput.extend({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await gate(context, data.organizationId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (context.supabase.from("distribution_plan_participants" as never) as any)
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
