import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isDailyServiceCode } from "@/lib/service-billing";
import { hoursToUnits } from "@/lib/billing-units";

/**
 * Financial — Revenue (Billed vs Received), View 1.
 *
 * Billed figures are READ from the same data source that powers the
 * existing 520 Billing submission:
 *   • public.client_billing_codes  (rate_per_unit, service_code)
 *   • public.evv_timesheets        (hourly unit accrual)
 *   • public.hhs_daily_records     (daily unit accrual)
 *   • public.clients               (org scoping only)
 *
 * The accrual logic mirrors src/routes/dashboard.billing.form520.tsx exactly:
 *   - hourly codes: sum(clock_out - clock_in) hours -> hoursToUnits()
 *   - daily codes : count distinct record_date per client
 *   - amount      : units × rate_per_unit
 *
 * No new billing table is created. No alternative computation.
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

    // rate lookup: client|code -> rate
    const rateByKey = new Map<string, number>();
    for (const c of codesRes.data ?? []) {
      rateByKey.set(
        `${c.client_id}|${c.service_code}`,
        Number(c.rate_per_unit ?? 0),
      );
    }

    const months: MonthBucket[] = Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      billed: 0,
    }));

    // Hourly accrual: hours per (month, client, code) -> units × rate
    const hourlyAgg = new Map<string, number>(); // monthIdx|client|code -> hours
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

    // Daily accrual: distinct (client, date) per month, then × every daily
    // code priced for that client (mirrors 520: one row per client_billing_code).
    const dailyDaysPerClientMonth = new Map<string, Set<string>>(); // monthIdx|client -> set(date)
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

    // Round to cents
    for (const b of months) b.billed = Math.round(b.billed * 100) / 100;

    return {
      year: data.year,
      months,
      source: {
        tables: ["client_billing_codes", "evv_timesheets", "hhs_daily_records"],
        note: "Same source as the 520 Billing submission.",
      },
      // Received is not yet captured in HIVE. Reserved for a future
      // import/attest source (see Billing → Imports / Authorizations).
      received: { available: false as const },
    };
  });
