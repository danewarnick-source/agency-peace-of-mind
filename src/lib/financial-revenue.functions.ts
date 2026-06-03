import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isDailyServiceCode } from "@/lib/service-billing";
import { hoursToUnits } from "@/lib/billing-units";
import { assertAddonForOrg } from "@/lib/entitlements.server";
import { requireOrgMembership } from "@/integrations/supabase/require-org";

/**
 * Financial — Revenue (Billed vs Received), View 1.
 *
 * TIERING (NECTAR Infusion gate, server-enforced):
 *   • Entitled (NECTAR Infusion add-on present on the PASSED org) → auto-fill
 *     billed revenue LIVE from the same data the existing 520 Billing
 *     submission reads:
 *       - public.client_billing_codes
 *       - public.evv_timesheets
 *       - public.hhs_daily_records
 *   • NOT entitled (base tier) → return MANUALLY entered billed figures
 *     from provider_ledger_entries WHERE category='billed_manual'.
 *
 * Tier 3 Stage 3: every fn now ACCEPTS `organizationId` (the active org from
 * the client) and verifies admin membership against THAT org — single-org
 * semantics, not the legacy multi-org `.in(adminOrgIds)` aggregate, and not
 * the FIRST_MEMBERSHIP "primary org" pick.
 */

const Input = z.object({
  year: z.number().int().min(2000).max(2100),
  organizationId: z.string().uuid(),
});

type MonthBucket = { month: number; billed: number };

export const getBilledRevenueByYear = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => Input.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const organizationId = data.organizationId;

    // ─── Server-side admin gate (Company Admin only) on the PASSED org ───
    await requireOrgMembership(supabase, userId, organizationId, "admin");

    // ─── NECTAR Infusion entitlement gate (on the PASSED org) ─────────────
    let nectarEntitled = true;
    try {
      await assertAddonForOrg(supabase, userId, "nectar_infusion", organizationId);
    } catch {
      nectarEntitled = false;
    }

    const months: MonthBucket[] = Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      billed: 0,
    }));

    if (!nectarEntitled) {
      const { data: manual, error: manErr } = await supabase
        .from("provider_ledger_entries")
        .select("period_month, amount")
        .eq("organization_id", organizationId)
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

    const yearStart = `${data.year}-01-01`;
    const yearEndExclusive = `${data.year + 1}-01-01`;
    const yearEndInclusive = `${data.year}-12-31`;

    const [codesRes, tsRes, dailyRes] = await Promise.all([
      supabase
        .from("client_billing_codes")
        .select("organization_id, client_id, service_code, rate_per_unit")
        .eq("organization_id", organizationId),
      supabase
        .from("evv_timesheets")
        .select("organization_id, client_id, service_type_code, clock_in_timestamp, clock_out_timestamp")
        .eq("organization_id", organizationId)
        .gte("clock_in_timestamp", `${yearStart}T00:00:00Z`)
        .lt("clock_in_timestamp", `${yearEndExclusive}T00:00:00Z`)
        .not("clock_out_timestamp", "is", null),
      supabase
        .from("hhs_daily_records")
        .select("organization_id, client_id, record_date")
        .eq("organization_id", organizationId)
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
  organizationId: z.string().uuid(),
});

export const listBilledManualEntries = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => BilledManualListInput.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireOrgMembership(supabase, userId, data.organizationId, "admin");
    const { data: rows, error } = await supabase
      .from("provider_ledger_entries")
      .select("id, period_month, amount, label, note, is_estimate, updated_at")
      .eq("organization_id", data.organizationId)
      .eq("period_year", data.year)
      .eq("category", "billed_manual")
      .order("period_month", { ascending: true });
    if (error) throw new Error(error.message);
    return { entries: rows ?? [] };
  });

const UpsertInput = z.object({
  organizationId: z.string().uuid(),
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
    const organization_id = data.organizationId;
    await requireOrgMembership(supabase, userId, organization_id, "admin");

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
        .eq("organization_id", organization_id)
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

const DeleteBilledInput = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
});

export const deleteBilledManualEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => DeleteBilledInput.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireOrgMembership(supabase, userId, data.organizationId, "admin");
    const { error } = await supabase
      .from("provider_ledger_entries")
      .delete()
      .eq("id", data.id)
      .eq("category", "billed_manual")
      .eq("organization_id", data.organizationId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
