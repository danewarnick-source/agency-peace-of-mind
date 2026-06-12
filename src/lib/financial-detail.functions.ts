import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireOrgMembership } from "@/integrations/supabase/require-org";
import { isDailyServiceCode } from "@/lib/service-billing";
import { computeEntryUnits, UNITS_PER_HOUR, effectiveBillingTimes } from "@/lib/billing-units";

/**
 * Financial — Per-client / per-shift billing DETAIL feed.
 *
 * Used by the "click a client pill" popup on the Revenue tab and the
 * "click a row" popup on the Monthly Grid. Same gating posture as the
 * tabs themselves (admin membership on the passed org). Distributions
 * data is never read here. All reads are scoped to the passed
 * organizationId and use the user-scoped supabase client (RLS applies).
 */

const MonthInput = z.object({
  organizationId: z.string().uuid(),
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
});

type ClientRow = { id: string; first_name: string | null; last_name: string | null };
type CodeRow = {
  client_id: string;
  service_code: string;
  rate_per_unit: number | null;
};
type TimesheetRow = {
  id: string;
  client_id: string;
  staff_id: string | null;
  service_type_code: string | null;
  clock_in_timestamp: string;
  clock_out_timestamp: string | null;
  review_status: string | null;
  corrected_clock_in: string | null;
  corrected_clock_out: string | null;
};
type DailyRow = {
  client_id: string;
  record_date: string;
  service_code: string | null;
  billable: boolean | null;
};

function monthBoundsUTC(year: number, month: number) {
  const startIso = `${year}-${String(month).padStart(2, "0")}-01`;
  const next = month === 12 ? { y: year + 1, m: 1 } : { y: year, m: month + 1 };
  const endExclusiveIso = `${next.y}-${String(next.m).padStart(2, "0")}-01`;
  // Last calendar day of the month (inclusive) for date-only daily comparisons.
  const lastDay = new Date(Date.UTC(next.y, next.m - 1, 0)).getUTCDate();
  const endInclusiveIso = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { startIso, endExclusiveIso, endInclusiveIso };
}

async function loadMonthData(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  organizationId: string,
  year: number,
  month: number,
) {
  const { startIso, endExclusiveIso, endInclusiveIso } = monthBoundsUTC(year, month);
  const [clientsRes, codesRes, tsRes, dailyRes] = await Promise.all([
    supabase
      .from("clients")
      .select("id, first_name, last_name")
      .eq("organization_id", organizationId),
    supabase
      .from("client_billing_codes")
      .select("client_id, service_code, rate_per_unit")
      .eq("organization_id", organizationId),
    supabase
      .from("evv_timesheets")
      .select("id, client_id, staff_id, service_type_code, clock_in_timestamp, clock_out_timestamp, review_status, corrected_clock_in, corrected_clock_out")
      .eq("organization_id", organizationId)
      .gte("clock_in_timestamp", `${startIso}T00:00:00Z`)
      .lt("clock_in_timestamp", `${endExclusiveIso}T00:00:00Z`)
      .not("clock_out_timestamp", "is", null),
    supabase
      .from("hhs_daily_records_v")
      .select("client_id, record_date, service_code, billable")
      .eq("organization_id", organizationId)
      .eq("billable", true)
      .gte("record_date", startIso)
      .lte("record_date", endInclusiveIso),
  ]);
  if (clientsRes.error) throw new Error(clientsRes.error.message);
  if (codesRes.error) throw new Error(codesRes.error.message);
  if (tsRes.error) throw new Error(tsRes.error.message);
  if (dailyRes.error) throw new Error(dailyRes.error.message);
  return {
    clients: (clientsRes.data ?? []) as ClientRow[],
    codes: (codesRes.data ?? []) as CodeRow[],
    timesheets: (tsRes.data ?? []) as TimesheetRow[],
    daily: (dailyRes.data ?? []) as DailyRow[],
  };
}

// ─── Per-client pills for Revenue (one bucket per client, one month) ──────

export const getRevenueClientPills = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => MonthInput.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireOrgMembership(supabase, userId, data.organizationId, "admin");

    const { clients, codes, timesheets, daily } = await loadMonthData(
      supabase,
      data.organizationId,
      data.year,
      data.month,
    );
    const rateBy = new Map<string, number>();
    for (const c of codes) {
      rateBy.set(`${c.client_id}|${c.service_code}`, Number(c.rate_per_unit ?? 0));
    }

    const billedByClient = new Map<string, number>();
    const codeCountByClient = new Map<string, Set<string>>();

    for (const t of timesheets) {
      if (!t.clock_out_timestamp || !t.service_type_code) continue;
      const eff = effectiveBillingTimes(t);
      if (!eff) continue;
      const u = computeEntryUnits(eff.in, eff.out);
      const rate = rateBy.get(`${t.client_id}|${t.service_type_code}`) ?? 0;
      if (!rate) continue;
      billedByClient.set(t.client_id, (billedByClient.get(t.client_id) ?? 0) + u * rate);
      if (!codeCountByClient.has(t.client_id)) codeCountByClient.set(t.client_id, new Set());
      codeCountByClient.get(t.client_id)!.add(t.service_type_code);
    }
    // Daily-rate codes: count distinct billable days per (client, code).
    const daySet = new Map<string, Set<string>>(); // client|code -> dates
    for (const d of daily) {
      if (!d.service_code) continue;
      const key = `${d.client_id}|${d.service_code}`;
      if (!daySet.has(key)) daySet.set(key, new Set());
      daySet.get(key)!.add(d.record_date);
    }
    for (const c of codes) {
      if (!isDailyServiceCode(c.service_code)) continue;
      const days = daySet.get(`${c.client_id}|${c.service_code}`)?.size ?? 0;
      const rate = Number(c.rate_per_unit ?? 0);
      if (days <= 0 || !rate) continue;
      billedByClient.set(c.client_id, (billedByClient.get(c.client_id) ?? 0) + days * rate);
      if (!codeCountByClient.has(c.client_id)) codeCountByClient.set(c.client_id, new Set());
      codeCountByClient.get(c.client_id)!.add(c.service_code);
    }

    const clientNameOf = new Map(
      clients.map((c) => [c.id, `${c.last_name ?? ""}, ${c.first_name ?? ""}`.replace(/^,\s*/, "")]),
    );
    const pills = [...billedByClient.entries()]
      .map(([clientId, billed]) => ({
        clientId,
        name: clientNameOf.get(clientId) ?? clientId.slice(0, 8),
        billed: Math.round(billed * 100) / 100,
        codeCount: codeCountByClient.get(clientId)?.size ?? 0,
      }))
      .filter((p) => p.billed > 0)
      .sort((a, b) => b.billed - a.billed);

    return { year: data.year, month: data.month, pills };
  });

// ─── Per-client billing detail (per-code lines + per-shift detail) ────────

const ClientDetailInput = MonthInput.extend({ clientId: z.string().uuid() });

export type ShiftDetailRow = {
  shiftId: string;
  staffId: string | null;
  staffName: string;
  date: string;
  clockIn: string;
  clockOut: string | null;
  hours: number;
  units: number;
  amount: number;
};
export type DailyDetailRow = {
  date: string;
  units: number; // always 1 (a billable day)
  amount: number;
};
export type CodeLine = {
  code: string;
  isDaily: boolean;
  rate: number;
  units: number;
  amount: number;
  shifts: ShiftDetailRow[];
  days: DailyDetailRow[];
};

async function staffNamesFor(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  organizationId: string,
  staffIds: string[],
) {
  if (staffIds.length === 0) return new Map<string, string>();
  const { data } = await supabase
    .from("profiles")
    .select("id, first_name, last_name")
    .eq("organization_id", organizationId)
    .in("id", staffIds);
  const m = new Map<string, string>();
  for (const p of (data ?? []) as Array<{ id: string; first_name: string | null; last_name: string | null }>) {
    m.set(p.id, `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || p.id.slice(0, 8));
  }
  return m;
}

export const getRevenueClientDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => ClientDetailInput.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireOrgMembership(supabase, userId, data.organizationId, "admin");
    const { clients, codes, timesheets, daily } = await loadMonthData(
      supabase,
      data.organizationId,
      data.year,
      data.month,
    );
    const client = clients.find((c) => c.id === data.clientId);
    if (!client) {
      return { client: null, lines: [] as CodeLine[], total: 0 };
    }
    const clientCodes = codes.filter((c) => c.client_id === data.clientId);
    const staffIds = [
      ...new Set(
        timesheets
          .filter((t) => t.client_id === data.clientId && t.staff_id)
          .map((t) => t.staff_id as string),
      ),
    ];
    const staffNames = await staffNamesFor(supabase, data.organizationId, staffIds);

    const lines: CodeLine[] = [];
    for (const cc of clientCodes) {
      const rate = Number(cc.rate_per_unit ?? 0);
      const isDaily = isDailyServiceCode(cc.service_code);
      if (isDaily) {
        const seen = new Set<string>();
        const days: DailyDetailRow[] = [];
        for (const d of daily) {
          if (d.client_id !== data.clientId) continue;
          if (d.service_code !== cc.service_code) continue;
          if (seen.has(d.record_date)) continue;
          seen.add(d.record_date);
          days.push({ date: d.record_date, units: 1, amount: rate });
        }
        if (days.length === 0) continue;
        days.sort((a, b) => a.date.localeCompare(b.date));
        lines.push({
          code: cc.service_code,
          isDaily: true,
          rate,
          units: days.length,
          amount: Math.round(days.length * rate * 100) / 100,
          shifts: [],
          days,
        });
      } else {
        const shifts: ShiftDetailRow[] = [];
        let totalUnits = 0;
        for (const t of timesheets) {
          if (t.client_id !== data.clientId) continue;
          if (t.service_type_code !== cc.service_code) continue;
          if (!t.clock_out_timestamp) continue;
          const u = computeEntryUnits(t.clock_in_timestamp, t.clock_out_timestamp);
          if (u <= 0) continue;
          totalUnits += u;
          shifts.push({
            shiftId: t.id,
            staffId: t.staff_id,
            staffName: t.staff_id ? staffNames.get(t.staff_id) ?? t.staff_id.slice(0, 8) : "—",
            date: t.clock_in_timestamp.slice(0, 10),
            clockIn: t.clock_in_timestamp,
            clockOut: t.clock_out_timestamp,
            hours: Math.round((u / UNITS_PER_HOUR) * 100) / 100,
            units: u,
            amount: Math.round(u * rate * 100) / 100,
          });
        }
        if (shifts.length === 0) continue;
        shifts.sort((a, b) => a.clockIn.localeCompare(b.clockIn));
        lines.push({
          code: cc.service_code,
          isDaily: false,
          rate,
          units: totalUnits,
          amount: Math.round(totalUnits * rate * 100) / 100,
          shifts,
          days: [],
        });
      }
    }
    lines.sort((a, b) => b.amount - a.amount);
    const total = Math.round(lines.reduce((s, l) => s + l.amount, 0) * 100) / 100;
    return {
      client: {
        id: client.id,
        name: `${client.last_name ?? ""}, ${client.first_name ?? ""}`.replace(/^,\s*/, ""),
      },
      lines,
      total,
    };
  });

// ─── Monthly Grid: detail behind a single (client, code, month) row ───────

const GridShiftInput = MonthInput.extend({
  clientId: z.string().uuid(),
  serviceCode: z.string().min(1).max(16),
});

export const getMonthlyGridShiftDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => GridShiftInput.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireOrgMembership(supabase, userId, data.organizationId, "admin");
    const { clients, codes, timesheets, daily } = await loadMonthData(
      supabase,
      data.organizationId,
      data.year,
      data.month,
    );
    const client = clients.find((c) => c.id === data.clientId);
    const cc = codes.find(
      (c) => c.client_id === data.clientId && c.service_code === data.serviceCode,
    );
    const rate = Number(cc?.rate_per_unit ?? 0);
    const isDaily = isDailyServiceCode(data.serviceCode);
    const clientName = client
      ? `${client.last_name ?? ""}, ${client.first_name ?? ""}`.replace(/^,\s*/, "")
      : data.clientId.slice(0, 8);

    if (isDaily) {
      const seen = new Set<string>();
      const days: DailyDetailRow[] = [];
      for (const d of daily) {
        if (d.client_id !== data.clientId) continue;
        if (d.service_code !== data.serviceCode) continue;
        if (seen.has(d.record_date)) continue;
        seen.add(d.record_date);
        days.push({ date: d.record_date, units: 1, amount: rate });
      }
      days.sort((a, b) => a.date.localeCompare(b.date));
      const totalUnits = days.length;
      return {
        client: { id: data.clientId, name: clientName },
        code: data.serviceCode,
        isDaily: true,
        rate,
        units: totalUnits,
        amount: Math.round(totalUnits * rate * 100) / 100,
        shifts: [] as ShiftDetailRow[],
        days,
      };
    }

    const staffIds = [
      ...new Set(
        timesheets
          .filter(
            (t) =>
              t.client_id === data.clientId &&
              t.service_type_code === data.serviceCode &&
              t.staff_id,
          )
          .map((t) => t.staff_id as string),
      ),
    ];
    const staffNames = await staffNamesFor(supabase, data.organizationId, staffIds);

    const shifts: ShiftDetailRow[] = [];
    let totalUnits = 0;
    for (const t of timesheets) {
      if (t.client_id !== data.clientId) continue;
      if (t.service_type_code !== data.serviceCode) continue;
      if (!t.clock_out_timestamp) continue;
      const u = computeEntryUnits(t.clock_in_timestamp, t.clock_out_timestamp);
      if (u <= 0) continue;
      totalUnits += u;
      shifts.push({
        shiftId: t.id,
        staffId: t.staff_id,
        staffName: t.staff_id ? staffNames.get(t.staff_id) ?? t.staff_id.slice(0, 8) : "—",
        date: t.clock_in_timestamp.slice(0, 10),
        clockIn: t.clock_in_timestamp,
        clockOut: t.clock_out_timestamp,
        hours: Math.round((u / UNITS_PER_HOUR) * 100) / 100,
        units: u,
        amount: Math.round(u * rate * 100) / 100,
      });
    }
    shifts.sort((a, b) => a.clockIn.localeCompare(b.clockIn));
    return {
      client: { id: data.clientId, name: clientName },
      code: data.serviceCode,
      isDaily: false,
      rate,
      units: totalUnits,
      amount: Math.round(totalUnits * rate * 100) / 100,
      shifts,
      days: [] as DailyDetailRow[],
    };
  });
