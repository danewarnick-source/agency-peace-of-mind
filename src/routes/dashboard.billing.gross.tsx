import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-org";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, BarChart3, Info } from "lucide-react";
import { computeEntryUnits, fmtUSD } from "@/lib/billing-units";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export const Route = createFileRoute("/dashboard/billing/gross")({
  head: () => ({ meta: [{ title: "TNS Gross — HIVE" }] }),
  component: GrossPage,
});

const HHS_CODES = new Set(["HHS"]);

type Cbc = { client_id: string; service_code: string; rate_per_unit: number };
type Ts = { client_id: string; service_type_code: string; clock_in_timestamp: string; clock_out_timestamp: string | null };
type HhsDay = { client_id: string; record_date: string; billable: boolean };
type LedgerRow = { period_year: number; period_month: number; category: string; label: string; amount: number };
type CtrPay = { year: number; month: number; net_pay: number; additional_pay: number };

function GrossPage() {
  const { data: org } = useCurrentOrg();
  const today = new Date();
  const [startYear, setStartYear] = useState(today.getFullYear() - 2);
  const [endYear, setEndYear] = useState(today.getFullYear() + 1);

  const rangeStartIso = new Date(startYear, 0, 1).toISOString();
  const rangeEndIso = new Date(endYear + 1, 0, 1).toISOString();
  const rangeStartDate = `${startYear}-01-01`;
  const rangeEndDate = `${endYear + 1}-01-01`;

  // Client billing code rates
  const cbcQ = useQuery({
    enabled: !!org?.organization_id,
    queryKey: ["gross-cbc", org?.organization_id],
    queryFn: async (): Promise<Cbc[]> => {
      const { data, error } = await supabase
        .from("client_billing_codes")
        .select("client_id, service_code, rate_per_unit")
        .eq("organization_id", org!.organization_id);
      if (error) throw error;
      return (data ?? []) as Cbc[];
    },
  });

  // EVV for full range
  const evvQ = useQuery({
    enabled: !!org?.organization_id,
    queryKey: ["gross-evv", org?.organization_id, startYear, endYear],
    queryFn: async (): Promise<Ts[]> => {
      const { data, error } = await supabase
        .from("evv_timesheets")
        .select("client_id, service_type_code, clock_in_timestamp, clock_out_timestamp")
        .eq("organization_id", org!.organization_id)
        .gte("clock_in_timestamp", rangeStartIso)
        .lt("clock_in_timestamp", rangeEndIso);
      if (error) throw error;
      return (data ?? []) as Ts[];
    },
  });

  // HHS billable days for full range
  const hhsQ = useQuery({
    enabled: !!org?.organization_id,
    queryKey: ["gross-hhs", org?.organization_id, startYear, endYear],
    queryFn: async (): Promise<HhsDay[]> => {
      const { data, error } = await supabase
        .from("hhs_daily_records_v")
        .select("client_id, record_date, billable, service_code")
        .eq("organization_id", org!.organization_id)
        .eq("service_code", "HHS")
        .gte("record_date", rangeStartDate)
        .lt("record_date", rangeEndDate);
      if (error) throw error;
      return ((data ?? []) as Array<HhsDay & { service_code: string }>).filter((r) => r.billable);
    },
  });

  // Contractor pay inputs for full range
  const ctrQ = useQuery({
    enabled: !!org?.organization_id,
    queryKey: ["gross-ctr", org?.organization_id, startYear, endYear],
    queryFn: async (): Promise<CtrPay[]> => {
      const { data, error } = await supabase
        .from("contractor_monthly_pay" as never)
        .select("year, month, net_pay, additional_pay")
        .eq("organization_id", org!.organization_id)
        .gte("year", startYear)
        .lte("year", endYear);
      if (error) throw error;
      return (data ?? []) as unknown as CtrPay[];
    },
  });

  // Ledger entries for full range
  const ledgerQ = useQuery({
    enabled: !!org?.organization_id,
    queryKey: ["gross-ledger", org?.organization_id, startYear, endYear],
    queryFn: async (): Promise<LedgerRow[]> => {
      const { data, error } = await supabase
        .from("provider_ledger_entries")
        .select("period_year, period_month, category, label, amount")
        .eq("organization_id", org!.organization_id)
        .gte("period_year", startYear)
        .lte("period_year", endYear)
        .in("category", ["received", "payroll_tax"]);
      if (error) throw error;
      return (data ?? []) as LedgerRow[];
    },
  });

  const rateMap = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of cbcQ.data ?? []) m[`${r.client_id}|${r.service_code}`] = Number(r.rate_per_unit) || 0;
    return m;
  }, [cbcQ.data]);

  // Per-year, per-month derived totals (same source-of-truth math as Step-7 totals)
  const yearData = useMemo(() => {
    const result: Record<number, { gross: number[]; net: number[] }> = {};
    for (let y = startYear; y <= endYear; y++) {
      result[y] = { gross: Array(12).fill(0), net: Array(12).fill(0) };
    }

    // Bucket EVV into (year, month)
    const evvByYM: Record<number, Record<number, Ts[]>> = {};
    for (const t of evvQ.data ?? []) {
      const d = new Date(t.clock_in_timestamp);
      const y = d.getFullYear();
      const m = d.getMonth();
      if (y < startYear || y > endYear) continue;
      (evvByYM[y] ??= {})[m] ??= [];
      evvByYM[y][m].push(t);
    }

    // Bucket HHS days into (year, month)
    const hhsByYM: Record<number, Record<number, HhsDay[]>> = {};
    for (const h of hhsQ.data ?? []) {
      const d = new Date(h.record_date + "T00:00:00");
      const y = d.getFullYear();
      const m = d.getMonth();
      if (y < startYear || y > endYear) continue;
      (hhsByYM[y] ??= {})[m] ??= [];
      hhsByYM[y][m].push(h);
    }

    // Bucket contractor pay into (year, month)
    const ctrByYM: Record<number, Record<number, CtrPay[]>> = {};
    for (const c of ctrQ.data ?? []) {
      const y = c.year;
      const m = c.month - 1;
      if (y < startYear || y > endYear) continue;
      (ctrByYM[y] ??= {})[m] ??= [];
      ctrByYM[y][m].push(c);
    }

    // Bucket ledger into (year, month)
    const ledByYM: Record<number, Record<number, LedgerRow[]>> = {};
    for (const l of ledgerQ.data ?? []) {
      const y = l.period_year;
      const m = l.period_month - 1;
      if (y < startYear || y > endYear) continue;
      (ledByYM[y] ??= {})[m] ??= [];
      ledByYM[y][m].push(l);
    }

    for (let y = startYear; y <= endYear; y++) {
      for (let mi = 0; mi < 12; mi++) {
        // DSP billed
        let billedDSP = 0;
        for (const t of evvByYM[y]?.[mi] ?? []) {
          if (HHS_CODES.has(t.service_type_code)) continue;
          const units = computeEntryUnits(t.clock_in_timestamp, t.clock_out_timestamp);
          const rate = rateMap[`${t.client_id}|${t.service_type_code}`] ?? 0;
          billedDSP += units * rate;
        }

        // HHS billed
        const dayCount: Record<string, number> = {};
        for (const d of hhsByYM[y]?.[mi] ?? []) dayCount[d.client_id] = (dayCount[d.client_id] ?? 0) + 1;
        let billedHHS = 0;
        for (const [cid, days] of Object.entries(dayCount)) {
          billedHHS += days * (rateMap[`${cid}|HHS`] ?? 0);
        }

        const totalBilled = billedDSP + billedHHS;

        // Net received
        const ctrRows = ctrByYM[y]?.[mi] ?? [];
        const netPayroll = ctrRows.reduce((a, c) => a + Number(c.net_pay || 0), 0);
        const additional = ctrRows.reduce((a, c) => a + Number(c.additional_pay || 0), 0);

        const ledRows = ledByYM[y]?.[mi] ?? [];
        const received = ledRows.filter((l) => l.category === "received").reduce((a, l) => a + Number(l.amount || 0), 0);
        const fedTax = ledRows.filter((l) => l.category === "payroll_tax" && l.label === "Federal Tax").reduce((a, l) => a + Number(l.amount || 0), 0);
        const stateTax = ledRows.filter((l) => l.category === "payroll_tax" && l.label === "State Tax").reduce((a, l) => a + Number(l.amount || 0), 0);

        const netReceived = received - netPayroll - additional - fedTax - stateTax;

        result[y].gross[mi] = totalBilled;
        result[y].net[mi] = netReceived;
      }
    }

    return result;
  }, [evvQ.data, hhsQ.data, ctrQ.data, ledgerQ.data, rateMap, startYear, endYear]);

  // Quarter roll-ups
  type QuarterRow = {
    year: number;
    q1g: number; q2g: number; q3g: number; q4g: number;
    yearGross: number;
    q1n: number; q2n: number; q3n: number; q4n: number;
    yearNet: number;
  };

  const rows: QuarterRow[] = useMemo(() => {
    const out: QuarterRow[] = [];
    for (let y = startYear; y <= endYear; y++) {
      const g = yearData[y]?.gross ?? Array(12).fill(0);
      const n = yearData[y]?.net ?? Array(12).fill(0);
      const q1g = g[0] + g[1] + g[2];
      const q2g = g[3] + g[4] + g[5];
      const q3g = g[6] + g[7] + g[8];
      const q4g = g[9] + g[10] + g[11];
      const q1n = n[0] + n[1] + n[2];
      const q2n = n[3] + n[4] + n[5];
      const q3n = n[6] + n[7] + n[8];
      const q4n = n[9] + n[10] + n[11];
      out.push({
        year: y,
        q1g, q2g, q3g, q4g, yearGross: q1g + q2g + q3g + q4g,
        q1n, q2n, q3n, q4n, yearNet: q1n + q2n + q3n + q4n,
      });
    }
    return out;
  }, [yearData, startYear, endYear]);

  const totals = useMemo(() => {
    return rows.reduce(
      (a, r) => ({
        q1g: a.q1g + r.q1g, q2g: a.q2g + r.q2g, q3g: a.q3g + r.q3g, q4g: a.q4g + r.q4g, allGross: a.allGross + r.yearGross,
        q1n: a.q1n + r.q1n, q2n: a.q2n + r.q2n, q3n: a.q3n + r.q3n, q4n: a.q4n + r.q4n, allNet: a.allNet + r.yearNet,
      }),
      { q1g: 0, q2g: 0, q3g: 0, q4g: 0, allGross: 0, q1n: 0, q2n: 0, q3n: 0, q4n: 0, allNet: 0 },
    );
  }, [rows]);

  const loading = cbcQ.isLoading || evvQ.isLoading || hhsQ.isLoading || ctrQ.isLoading || ledgerQ.isLoading;

  return (
    <TooltipProvider>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            <div>
              <h2 className="text-lg font-semibold">TNS Gross / Net</h2>
              <p className="text-xs text-muted-foreground">
                Multi-year quarterly rollup. 100% derived from monthly Totals — no inputs, no tables, no broken references.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" onClick={() => { setStartYear((y) => y - 1); setEndYear((y) => y - 1); }}><ChevronLeft className="h-4 w-4" /></Button>
              <span className="min-w-[64px] text-center text-sm font-medium">{startYear}</span>
              <Button variant="outline" size="sm" onClick={() => { setStartYear((y) => y + 1); setEndYear((y) => y + 1); }}><ChevronRight className="h-4 w-4" /></Button>
            </div>
            <span className="text-sm text-muted-foreground">to</span>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" onClick={() => setEndYear((y) => y - 1)}><ChevronLeft className="h-4 w-4" /></Button>
              <span className="min-w-[64px] text-center text-sm font-medium">{endYear}</span>
              <Button variant="outline" size="sm" onClick={() => setEndYear((y) => y + 1)}><ChevronRight className="h-4 w-4" /></Button>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">Loading multi-year data…</div>
        ) : (
          <>
            {/* Gross section */}
            <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
              <table className="w-full min-w-[900px] text-sm">
                <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">Year</th>
                    <th className="px-3 py-2 text-right">Q1</th>
                    <th className="px-3 py-2 text-right">Q2</th>
                    <th className="px-3 py-2 text-right">Q3</th>
                    <th className="px-3 py-2 text-right">Q4</th>
                    <th className="px-3 py-2 text-right">Year Total</th>
                    <th className="px-3 py-2 text-right">YoY %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((r, idx) => {
                    const prev = rows[idx - 1];
                    const yoy = prev && prev.yearGross !== 0 ? ((r.yearGross - prev.yearGross) / prev.yearGross) * 100 : null;
                    return (
                      <tr key={r.year} className="hover:bg-muted/30">
                        <td className="px-3 py-2 font-medium">{r.year}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtUSD(r.q1g)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtUSD(r.q2g)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtUSD(r.q3g)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtUSD(r.q4g)}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-semibold">{fmtUSD(r.yearGross)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-xs">
                          {yoy !== null ? (
                            <span className={yoy >= 0 ? "text-emerald-600" : "text-destructive"}>
                              {yoy >= 0 ? "+" : ""}{yoy.toFixed(1)}%
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-muted/30 font-semibold">
                  <tr>
                    <td className="px-3 py-2">All years</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtUSD(totals.q1g)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtUSD(totals.q2g)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtUSD(totals.q3g)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtUSD(totals.q4g)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtUSD(totals.allGross)}</td>
                    <td className="px-3 py-2"></td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Net section */}
            <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
              <table className="w-full min-w-[900px] text-sm">
                <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">Year</th>
                    <th className="px-3 py-2 text-right">Q1</th>
                    <th className="px-3 py-2 text-right">Q2</th>
                    <th className="px-3 py-2 text-right">Q3</th>
                    <th className="px-3 py-2 text-right">Q4</th>
                    <th className="px-3 py-2 text-right">Year Total</th>
                    <th className="px-3 py-2 text-right">YoY %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((r, idx) => {
                    const prev = rows[idx - 1];
                    const yoy = prev && prev.yearNet !== 0 ? ((r.yearNet - prev.yearNet) / prev.yearNet) * 100 : null;
                    return (
                      <tr key={r.year} className="hover:bg-muted/30">
                        <td className="px-3 py-2 font-medium">{r.year}</td>
                        <td className={`px-3 py-2 text-right tabular-nums ${r.q1n >= 0 ? "text-emerald-600" : "text-destructive"}`}>{fmtUSD(r.q1n)}</td>
                        <td className={`px-3 py-2 text-right tabular-nums ${r.q2n >= 0 ? "text-emerald-600" : "text-destructive"}`}>{fmtUSD(r.q2n)}</td>
                        <td className={`px-3 py-2 text-right tabular-nums ${r.q3n >= 0 ? "text-emerald-600" : "text-destructive"}`}>{fmtUSD(r.q3n)}</td>
                        <td className={`px-3 py-2 text-right tabular-nums ${r.q4n >= 0 ? "text-emerald-600" : "text-destructive"}`}>{fmtUSD(r.q4n)}</td>
                        <td className={`px-3 py-2 text-right tabular-nums font-semibold ${r.yearNet >= 0 ? "text-emerald-600" : "text-destructive"}`}>{fmtUSD(r.yearNet)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-xs">
                          {yoy !== null ? (
                            <span className={yoy >= 0 ? "text-emerald-600" : "text-destructive"}>
                              {yoy >= 0 ? "+" : ""}{yoy.toFixed(1)}%
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-muted/30 font-semibold">
                  <tr>
                    <td className="px-3 py-2">All years</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtUSD(totals.q1n)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtUSD(totals.q2n)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtUSD(totals.q3n)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtUSD(totals.q4n)}</td>
                    <td className={`px-3 py-2 text-right tabular-nums ${totals.allNet >= 0 ? "text-emerald-600" : "text-destructive"}`}>{fmtUSD(totals.allNet)}</td>
                    <td className="px-3 py-2"></td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <div>
                <strong>Gross</strong> = total billed per quarter (DSP units × rate + HHS billable days × rate, same source as Tab A + Tab B). <strong>Net</strong> = money received − net payrolls − additional − federal tax − state tax, same source as Step-7 Totals. Empty periods show $0.00 — never an error. Year-over-year % compares each year to the prior year in the selected range.
              </div>
            </div>
          </>
        )}
      </div>
    </TooltipProvider>
  );
}
