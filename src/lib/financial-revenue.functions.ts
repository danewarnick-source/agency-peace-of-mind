import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isDailyServiceCode } from "@/lib/service-billing";
import { aggregateHourlyUnits, aggregateDailyDays, type DailyRecordRow } from "@/lib/accrual";
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
 *       - public.hhs_daily_records_v (billable daily-rate days; billable=true only)
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
      // Daily-rate days come from the hhs_daily_records_v view; only
      // billable rows (attendance Present + daily note) count as revenue.
      supabase
        .from("hhs_daily_records_v")
        .select("organization_id, client_id, service_code, record_date, billable")
        .eq("organization_id", organizationId)
        .eq("billable", true)
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

    // ─── Hourly units per (month|client|code) via shared aggregator ────────
    const hourlyUnits = aggregateHourlyUnits(
      (tsRes.data ?? []) as Parameters<typeof aggregateHourlyUnits>[0],
      (t, _hrs, start) =>
        `${start.getUTCMonth()}|${t.client_id}|${t.service_type_code}`,
    );
    for (const [k, units] of hourlyUnits) {
      const [mStr, clientId, code] = k.split("|");
      const m = Number(mStr);
      const rate = rateByKey.get(`${clientId}|${code}`);
      if (!rate) continue;
      months[m].billed += units * rate;
    }

    // ─── Daily days per (month|client|code) via shared aggregator ──────────
    // The view carries the service_code, so days are attributed to the exact
    // daily code instead of being multiplied across every daily code a client
    // holds.
    type DailyViewRow = { client_id: string; record_date: string; service_code: string | null };
    const dailyDaysPerClientMonth = aggregateDailyDays(
      (dailyRes.data ?? []) as unknown as DailyRecordRow[],
      (r) => {
        const code = (r as DailyViewRow).service_code;
        if (!code) return null;
        return `${new Date(`${r.record_date}T00:00:00Z`).getUTCMonth()}|${r.client_id}|${code}`;
      },
    );
    for (const c of codesRes.data ?? []) {
      if (!isDailyServiceCode(c.service_code)) continue;
      const rate = Number(c.rate_per_unit ?? 0);
      if (!rate) continue;
      for (let m = 0; m < 12; m++) {
        const days = dailyDaysPerClientMonth.get(`${m}|${c.client_id}|${c.service_code}`)?.size ?? 0;
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
        tables: ["client_billing_codes", "evv_timesheets", "hhs_daily_records_v"],
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
