import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isDailyServiceCode } from "@/lib/service-billing";
import { hoursToUnits } from "@/lib/billing-units";
import { resolveCallerEntitlements } from "@/lib/entitlements.server";

/**
 * Financial — Revenue (Billed vs Received), View 1.
 *
 * TIERING (NECTAR Infusion gate, server-enforced):
 *   • Entitled (NECTAR Infusion add-on present) → auto-fill billed revenue
 *     LIVE from the same data the existing 520 Billing submission reads:
 *       - public.client_billing_codes (rate_per_unit, service_code)
 *       - public.evv_timesheets       (hourly unit accrual)
 *       - public.hhs_daily_records    (daily unit accrual)
 *       - public.clients              (org scoping only)
 *     Math mirrors src/routes/dashboard.billing.form520.tsx exactly:
 *       - hourly codes: sum(clock_out - clock_in) hrs → hoursToUnits()
 *       - daily codes : count distinct record_date per client × rate
 *       - amount      : units × rate_per_unit
 *   • NOT entitled (base tier) → return MANUALLY entered billed figures
 *     from provider_ledger_entries WHERE category='billed_manual'
 *     (admin-only RLS, same table as the rest of the Financial ledger).
 *     The 520 auto-fill is NEVER run for a non-entitled org.
 *
 * The entitlement check is server-side, using the same mechanism
 * (resolveCallerEntitlements → org tier → addonsForTier) that every other
 * NECTAR Infusion gate in the app already uses.
 */

const Input = z.object({
  year: z.number().int().min(2000).max(2100),
});

type MonthBucket = { month: number; billed: number };

export const getBilledRevenueByYear = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => Input.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // ─── Server-side admin gate (Company Admin only) ────────────────────────
    const { data: memberships, error: mErr } = await supabase
      .from("organization_members")
      .select("organization_id, role, active")
      .eq("user_id", userId)
      .eq("active", true);
    if (mErr) throw new Error(mErr.message);
    const adminOrgs = (memberships ?? []).filter(
      (m) => m.role === "admin" || m.role === "super_admin",
    );
    if (adminOrgs.length === 0) {
      throw new Error("Forbidden: Company Admin role required.");
    }
    const orgIds = adminOrgs.map((m) => m.organization_id);

    // ─── NECTAR Infusion entitlement gate (server-side) ────────────────────
    const ent = await resolveCallerEntitlements(supabase, userId);
    const nectarEntitled = ent.addons.includes("nectar_infusion");

    const months: MonthBucket[] = Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      billed: 0,
    }));

    if (!nectarEntitled) {
      // ─── BASE TIER: manual billed entries only. Never touch the 520 source.
      const { data: manual, error: manErr } = await supabase
        .from("provider_ledger_entries")
        .select("period_month, amount")
        .in("organization_id", orgIds)
        .eq("period_year", data.year)
        .eq("category", "billed_manual");
      if (manErr) throw new Error(manErr.message);
      for (const r of manual ?? []) {
        const m = Number(r.period_month);
        if (m >= 1 && m <= 12) {
          months[m - 1].billed += Number(r.amount ?? 0);
        }
      }
      for (const b of months) b.billed = Math.round(b.billed * 100) / 100;

      return {
        year: data.year,
        months,
        source: {
          mode: "manual" as const,
          entitled: false as const,
          tables: ["provider_ledger_entries"],
          note: "Manually entered billed revenue (NECTAR Infusion not enabled).",
        },
        received: { available: false as const },
      };
    }

    // ─── ENTITLED: live 520-sourced accrual (unchanged math) ───────────────
    const yearStart = `${data.year}-01-01`;
    const yearEndExclusive = `${data.year + 1}-01-01`;
    const yearEndInclusive = `${data.year}-12-31`;

    const [codesRes, tsRes, dailyRes] = await Promise.all([
      supabase
        .from("client_billing_codes")
        .select("organization_id, client_id, service_code, rate_per_unit")
        .in("organization_id", orgIds),
      supabase
        .from("evv_timesheets")
        .select("organization_id, client_id, service_type_code, clock_in_timestamp, clock_out_timestamp")
        .in("organization_id", orgIds)
        .gte("clock_in_timestamp", `${yearStart}T00:00:00Z`)
        .lt("clock_in_timestamp", `${yearEndExclusive}T00:00:00Z`)
        .not("clock_out_timestamp", "is", null),
      supabase
        .from("hhs_daily_records")
        .select("organization_id, client_id, record_date")
        .in("organization_id", orgIds)
        .gte("record_date", yearStart)
        .lte("record_date", yearEndInclusive),
    ]);
    if (codesRes.error) throw new Error(codesRes.error.message);
    if (tsRes.error) throw new Error(tsRes.error.message);
    if (dailyRes.error) throw new Error(dailyRes.error.message);

    const rateByKey = new Map<string, number>();
    for (const c of codesRes.data ?? []) {
      rateByKey.set(
        `${c.client_id}|${c.service_code}`,
        Number(c.rate_per_unit ?? 0),
      );
    }

    const hourlyAgg = new Map<string, number>();
    for (const t of tsRes.data ?? []) {
      if (!t.service_type_code || !t.clock_out_timestamp) continue;
      if (isDailyServiceCode(t.service_type_code)) continue;
      const start = new Date(t.clock_in_timestamp);
      const end = new Date(t.clock_out_timestamp);
      const hrs = (end.getTime() - start.getTime()) / 3_600_000;
      if (!isFinite(hrs) || hrs <= 0) continue;
      const m = start.getUTCMonth();
      const k = `${m}|${t.client_id}|${t.service_type_code}`;
      hourlyAgg.set(k, (hourlyAgg.get(k) ?? 0) + hrs);
    }
    for (const [k, hrs] of hourlyAgg) {
      const [mStr, clientId, code] = k.split("|");
      const m = Number(mStr);
      const rate = rateByKey.get(`${clientId}|${code}`);
      if (!rate) continue;
      months[m].billed += hoursToUnits(hrs) * rate;
    }

    const dailyDaysPerClientMonth = new Map<string, Set<string>>();
    for (const r of dailyRes.data ?? []) {
      if (!r.record_date) continue;
      const m = new Date(`${r.record_date}T00:00:00Z`).getUTCMonth();
      const k = `${m}|${r.client_id}`;
      if (!dailyDaysPerClientMonth.has(k)) dailyDaysPerClientMonth.set(k, new Set());
      dailyDaysPerClientMonth.get(k)!.add(r.record_date);
    }
    for (const c of codesRes.data ?? []) {
      if (!isDailyServiceCode(c.service_code)) continue;
      const rate = Number(c.rate_per_unit ?? 0);
      if (!rate) continue;
      for (let m = 0; m < 12; m++) {
        const days = dailyDaysPerClientMonth.get(`${m}|${c.client_id}`)?.size ?? 0;
        if (days > 0) months[m].billed += days * rate;
      }
    }

    for (const b of months) b.billed = Math.round(b.billed * 100) / 100;

    return {
      year: data.year,
      months,
      source: {
        mode: "auto_520" as const,
        entitled: true as const,
        tables: ["client_billing_codes", "evv_timesheets", "hhs_daily_records"],
        note: "Same source as the 520 Billing submission.",
      },
      received: { available: false as const },
    };
  });

// ─── Manual billed entries (base-tier fallback) ──────────────────────────

const BilledManualListInput = z.object({
  year: z.number().int().min(2000).max(2100),
});

async function adminOrgIds(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
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

export const listBilledManualEntries = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => BilledManualListInput.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const orgIds = await adminOrgIds(supabase, userId);
    if (orgIds.length === 0) {
      throw new Error("Forbidden: Company Admin role required.");
    }
    const { data: rows, error } = await supabase
      .from("provider_ledger_entries")
      .select("id, period_month, amount, label, note, is_estimate, updated_at")
      .in("organization_id", orgIds)
      .eq("period_year", data.year)
      .eq("category", "billed_manual")
      .order("period_month", { ascending: true });
    if (error) throw new Error(error.message);
    return { entries: rows ?? [] };
  });

const UpsertInput = z.object({
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
  amount: z.number().finite(),
  note: z.string().max(2000).nullable().optional(),
  is_estimate: z.boolean().default(false),
});

export const upsertBilledManualEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => UpsertInput.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const orgIds = await adminOrgIds(supabase, userId);
    if (orgIds.length === 0) {
      throw new Error("Forbidden: Company Admin role required.");
    }
    const organization_id = orgIds[0];

    // Try to find the existing row for this month and update it in place,
    // otherwise insert. Keeps the table "one row per month" for billed_manual.
    const { data: existing, error: findErr } = await supabase
      .from("provider_ledger_entries")
      .select("id")
      .eq("organization_id", organization_id)
      .eq("period_year", data.year)
      .eq("period_month", data.month)
      .eq("category", "billed_manual")
      .maybeSingle();
    if (findErr) throw new Error(findErr.message);

    const label = `Billed revenue — manual (${data.year}-${String(data.month).padStart(2, "0")})`;

    if (existing?.id) {
      const { data: row, error } = await supabase
        .from("provider_ledger_entries")
        .update({
          amount: data.amount,
          note: data.note ?? null,
          is_estimate: data.is_estimate,
          label,
        })
        .eq("id", existing.id)
        .in("organization_id", orgIds)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      return { entry: row };
    }

    const { data: row, error } = await supabase
      .from("provider_ledger_entries")
      .insert({
        organization_id,
        period_year: data.year,
        period_month: data.month,
        category: "billed_manual",
        label,
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

const DeleteBilledInput = z.object({ id: z.string().uuid() });

export const deleteBilledManualEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => DeleteBilledInput.parse(i))
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
      .eq("category", "billed_manual")
      .in("organization_id", orgIds);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
