import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-org";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronLeft, ChevronRight, TableProperties, Info } from "lucide-react";
import { computeEntryUnits, fmtUSD } from "@/lib/billing-units";
import { computePeriodBounds, type PaySchedule } from "@/lib/pay-periods";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import {
  getTotalsTps,
  getTotalsCbc,
  getTotalsEvv,
  getTotalsHhs,
  getTotalsHostSet,
  getTotalsHhp,
  getTotalsCtr,
  getTotalsProfiles,
  getTotalsLedger,
} from "@/lib/financial-totals.functions";

export const Route = createFileRoute("/dashboard/financial/totals")({
  head: () => ({ meta: [{ title: "Totals — HIVE" }] }),
  component: TotalsPage,
});

const HHS_CODES = new Set(["HHS"]);

type Cbc = { client_id: string; service_code: string; rate_per_unit: number };
type Ts = { client_id: string; service_type_code: string; clock_in_timestamp: string; clock_out_timestamp: string | null; staff_id: string | null };
type HhsDay = { client_id: string; record_date: string; billable: boolean };
type LedgerRow = { id: string; period_year: number; period_month: number; category: string; label: string; amount: number; note: string | null };
type CtrPay = { staff_id: string; year: number; month: number; net_pay: number; additional_pay: number };
type HostSet = { client_id: string; host_daily_rate: number };
type StaffAssn = { staff_id: string; client_id: string };

function TotalsPage() {
  const { data: org } = useCurrentOrg();
  const qc = useQueryClient();
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());

  const yearStartIso = new Date(year, 0, 1).toISOString();
  const yearEndIso = new Date(year + 1, 0, 1).toISOString();
  const yearStartDate = `${year}-01-01`;
  const yearEndDate = `${year + 1}-01-01`;

  // Pay schedule
  const tpsQ = useQuery({
    enabled: !!org?.organization_id,
    queryKey: ["totals-tps", org?.organization_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("time_pay_settings" as never)
        .select("w2_schedule, w2_period_anchor, contractor_schedule, contractor_period_anchor")
        .eq("organization_id", org!.organization_id)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as unknown as {
        w2_schedule: PaySchedule; w2_period_anchor: string;
        contractor_schedule: PaySchedule; contractor_period_anchor: string;
      } | null;
    },
  });

  // All client billing codes (rates)
  const cbcQ = useQuery({
    enabled: !!org?.organization_id,
    queryKey: ["totals-cbc", org?.organization_id],
    queryFn: async (): Promise<Cbc[]> => {
      const { data, error } = await supabase
        .from("client_billing_codes")
        .select("client_id, service_code, rate_per_unit")
        .eq("organization_id", org!.organization_id);
      if (error) throw error;
      return (data ?? []) as Cbc[];
    },
  });

  // EVV for year (same shape as Tab A)
  const evvQ = useQuery({
    enabled: !!org?.organization_id,
    queryKey: ["totals-evv", org?.organization_id, year],
    queryFn: async (): Promise<Ts[]> => {
      const { data, error } = await supabase
        .from("evv_timesheets")
        .select("client_id, service_type_code, clock_in_timestamp, clock_out_timestamp, staff_id")
        .eq("organization_id", org!.organization_id)
        .gte("clock_in_timestamp", yearStartIso)
        .lt("clock_in_timestamp", yearEndIso);
      if (error) throw error;
      return (data ?? []) as Ts[];
    },
  });

  // HHS billable days for year (same view as Tab B)
  const hhsQ = useQuery({
    enabled: !!org?.organization_id,
    queryKey: ["totals-hhs", org?.organization_id, year],
    queryFn: async (): Promise<HhsDay[]> => {
      const { data, error } = await supabase
        .from("hhs_daily_records_v")
        .select("client_id, record_date, billable, service_code")
        .eq("organization_id", org!.organization_id)
        .eq("service_code", "HHS")
        .gte("record_date", yearStartDate)
        .lt("record_date", yearEndDate);
      if (error) throw error;
      return ((data ?? []) as Array<HhsDay & { service_code: string }>).filter((r) => r.billable);
    },
  });

  // Host settings (host_daily_rate per client) for HHP pay
  const hostSetQ = useQuery({
    enabled: !!org?.organization_id,
    queryKey: ["totals-host", org?.organization_id],
    queryFn: async (): Promise<HostSet[]> => {
      const { data, error } = await supabase
        .from("hhs_host_home_settings" as never)
        .select("client_id, host_daily_rate");
      if (error) throw error;
      return (data ?? []) as unknown as HostSet[];
    },
  });

  // Staff assignments → HHP clients per staff
  const hhpQ = useQuery({
    enabled: !!org?.organization_id,
    queryKey: ["totals-hhp", org?.organization_id],
    queryFn: async (): Promise<StaffAssn[]> => {
      const { data, error } = await supabase
        .from("staff_assignments")
        .select("staff_id, client_id, service_codes")
        .eq("organization_id", org!.organization_id)
        .overlaps("service_codes", ["CMP", "CMS"]);
      if (error) throw error;
      return (data ?? []) as StaffAssn[];
    },
  });

  // Contractor pay inputs (Tab C)
  const ctrQ = useQuery({
    enabled: !!org?.organization_id,
    queryKey: ["totals-ctr", org?.organization_id, year],
    queryFn: async (): Promise<CtrPay[]> => {
      const { data, error } = await supabase
        .from("contractor_monthly_pay" as never)
        .select("staff_id, year, month, net_pay, additional_pay")
        .eq("organization_id", org!.organization_id)
        .eq("year", year);
      if (error) throw error;
      return (data ?? []) as unknown as CtrPay[];
    },
  });

  // Staff profiles for hourly_rate (for DSP gross totals)
  const profilesQ = useQuery({
    enabled: !!org?.organization_id,
    queryKey: ["totals-profiles", org?.organization_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, hourly_rate");
      if (error) throw error;
      const map: Record<string, number> = {};
      for (const p of (data ?? []) as Array<{ id: string; hourly_rate: number | null }>) {
        map[p.id] = Number(p.hourly_rate ?? 0);
      }
      return map;
    },
  });

  // Ledger entries for the year — received + payroll_tax
  const ledgerQ = useQuery({
    enabled: !!org?.organization_id,
    queryKey: ["totals-ledger", org?.organization_id, year],
    queryFn: async (): Promise<LedgerRow[]> => {
      const { data, error } = await supabase
        .from("provider_ledger_entries")
        .select("id, period_year, period_month, category, label, amount, note")
        .eq("organization_id", org!.organization_id)
        .eq("period_year", year)
        .in("category", ["received", "payroll_tax"]);
      if (error) throw error;
      return (data ?? []) as LedgerRow[];
    },
  });

  // Lookups
  const rateMap = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of cbcQ.data ?? []) m[`${r.client_id}|${r.service_code}`] = Number(r.rate_per_unit) || 0;
    return m;
  }, [cbcQ.data]);

  const hostRateByClient = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of hostSetQ.data ?? []) m[r.client_id] = Number(r.host_daily_rate) || 0;
    return m;
  }, [hostSetQ.data]);

  const hhpByStaff = useMemo(() => {
    const m: Record<string, string[]> = {};
    for (const r of hhpQ.data ?? []) (m[r.staff_id] ??= []).push(r.client_id);
    return m;
  }, [hhpQ.data]);

  // Per-month roll-up
  const months = useMemo(() => {
    const out = [];
    for (let mi = 0; mi < 12; mi++) {
      // Filter inputs to this month
      const tsMonth = (evvQ.data ?? []).filter((t) => new Date(t.clock_in_timestamp).getMonth() === mi);
      const hhsMonth = (hhsQ.data ?? []).filter((d) => {
        const dt = new Date(d.record_date + "T00:00:00");
        return dt.getMonth() === mi;
      });

      // DSP billed (non-HHS): Σ units × rate
      let billedDSP = 0;
      for (const t of tsMonth) {
        if (HHS_CODES.has(t.service_type_code)) continue;
        const units = computeEntryUnits(t.clock_in_timestamp, t.clock_out_timestamp);
        const rate = rateMap[`${t.client_id}|${t.service_type_code}`] ?? 0;
        billedDSP += units * rate;
      }

      // HHS billed: Σ billable days × HHS rate
      const dayCount: Record<string, number> = {};
      for (const d of hhsMonth) dayCount[d.client_id] = (dayCount[d.client_id] ?? 0) + 1;
      let billedHHS = 0;
      for (const [cid, days] of Object.entries(dayCount)) {
        billedHHS += days * (rateMap[`${cid}|HHS`] ?? 0);
      }

      // Contractor gross (DSP) = Σ staff hours × hourly_rate (same Tab C derivation)
      const hoursByStaff: Record<string, number> = {};
      for (const t of tsMonth) {
        if (!t.staff_id) continue;
        const units = computeEntryUnits(t.clock_in_timestamp, t.clock_out_timestamp);
        hoursByStaff[t.staff_id] = (hoursByStaff[t.staff_id] ?? 0) + units / 4;
      }
      let contractorGross = 0;
      for (const [sid, hrs] of Object.entries(hoursByStaff)) {
        contractorGross += hrs * (profilesQ.data?.[sid] ?? 0);
      }

      // HHP pay = Σ over (staff, hhp client) days × host rate
      let hhpPay = 0;
      for (const [sid, clientIds] of Object.entries(hhpByStaff)) {
        if (!sid) continue;
        for (const cid of clientIds) {
          hhpPay += (dayCount[cid] ?? 0) * (hostRateByClient[cid] ?? 0);
        }
      }

      // Tab C inputs
      const ctrRows = (ctrQ.data ?? []).filter((c) => c.month === mi + 1);
      const netPayroll = ctrRows.reduce((a, c) => a + Number(c.net_pay || 0), 0);
      const additional = ctrRows.reduce((a, c) => a + Number(c.additional_pay || 0), 0);

      // Ledger lookups for month
      const ledgerMonth = (ledgerQ.data ?? []).filter((l) => l.period_month === mi + 1);
      const received = ledgerMonth.filter((l) => l.category === "received").reduce((a, l) => a + Number(l.amount || 0), 0);
      const fedRow = ledgerMonth.find((l) => l.category === "payroll_tax" && l.label === "Federal Tax");
      const stateRow = ledgerMonth.find((l) => l.category === "payroll_tax" && l.label === "State Tax");
      const fedTax = Number(fedRow?.amount ?? 0);
      const stateTax = Number(stateRow?.amount ?? 0);

      // Pay periods touching this month (label list)
      const periodLabels: string[] = [];
      if (tpsQ.data) {
        const probe = new Date(year, mi, 1);
        const probe2 = new Date(year, mi, 15);
        const probe3 = new Date(year, mi, 28);
        const seen = new Set<string>();
        for (const p of [probe, probe2, probe3]) {
          const per = computePeriodBounds(tpsQ.data.w2_schedule, tpsQ.data.w2_period_anchor, p);
          if (!seen.has(per.label) && per.start.getMonth() <= mi && per.end.getMonth() >= mi) {
            seen.add(per.label);
            periodLabels.push(per.label);
          }
        }
      }

      const totalBilled = billedDSP + billedHHS;
      // Net received (bottom line) = Money in − contractor net payroll − fed − state
      const netReceived = received - netPayroll - additional - fedTax - stateTax;

      out.push({
        mi,
        label: new Date(year, mi, 1).toLocaleString(undefined, { month: "short" }),
        billedDSP, billedHHS, totalBilled,
        contractorGross, hhpPay, netPayroll, additional,
        fedTax, stateTax,
        fedDue: fedRow?.note ?? "",
        stateDue: stateRow?.note ?? "",
        received, netReceived,
        periodLabels,
        fedRowId: fedRow?.id, stateRowId: stateRow?.id,
      });
    }
    return out;
  }, [evvQ.data, hhsQ.data, ctrQ.data, ledgerQ.data, tpsQ.data, rateMap, hostRateByClient, hhpByStaff, profilesQ.data, year]);

  const yearTotals = useMemo(
    () =>
      months.reduce(
        (a, m) => ({
          billedDSP: a.billedDSP + m.billedDSP,
          billedHHS: a.billedHHS + m.billedHHS,
          totalBilled: a.totalBilled + m.totalBilled,
          contractorGross: a.contractorGross + m.contractorGross,
          hhpPay: a.hhpPay + m.hhpPay,
          netPayroll: a.netPayroll + m.netPayroll,
          additional: a.additional + m.additional,
          fedTax: a.fedTax + m.fedTax,
          stateTax: a.stateTax + m.stateTax,
          received: a.received + m.received,
          netReceived: a.netReceived + m.netReceived,
        }),
        { billedDSP: 0, billedHHS: 0, totalBilled: 0, contractorGross: 0, hhpPay: 0, netPayroll: 0, additional: 0, fedTax: 0, stateTax: 0, received: 0, netReceived: 0 },
      ),
    [months],
  );

  // Mutations: upsert taxes + received via provider_ledger_entries
  const upsertLedger = useMutation({
    mutationFn: async (vars: { id?: string; period_month: number; category: string; label: string; amount: number; note?: string | null }) => {
      if (vars.id) {
        const { error } = await supabase
          .from("provider_ledger_entries")
          .update({ amount: vars.amount, note: vars.note ?? null, label: vars.label })
          .eq("id", vars.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("provider_ledger_entries")
          .insert({
            organization_id: org!.organization_id,
            period_year: year,
            period_month: vars.period_month,
            category: vars.category,
            label: vars.label,
            amount: vars.amount,
            note: vars.note ?? null,
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["totals-ledger", org?.organization_id, year] });
      toast.success("Saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <TooltipProvider>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center gap-2">
            <TableProperties className="h-5 w-5 text-primary" />
            <div>
              <h2 className="text-lg font-semibold">Totals — {year}</h2>
              <p className="text-xs text-muted-foreground">
                Monthly roll-up: Total Billed (Tab A DSP + Tab B HHS), contractor pay (Tab C), provider tax inputs, money received (ledger). Bottom line = Gross vs Net.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setYear((y) => y - 1)}><ChevronLeft className="h-4 w-4" /></Button>
            <div className="min-w-[80px] text-center font-medium">{year}</div>
            <Button variant="outline" size="sm" onClick={() => setYear((y) => y + 1)}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
          <table className="w-full min-w-[1500px] text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Month</th>
                <th className="px-3 py-2 text-right">DSP billed</th>
                <th className="px-3 py-2 text-right">HHS billed</th>
                <th className="px-3 py-2 text-right">Total billed</th>
                <th className="px-3 py-2 text-right">Contractor gross</th>
                <th className="px-3 py-2 text-right">HHP pay</th>
                <th className="px-3 py-2 text-right">Net payrolls</th>
                <th className="px-3 py-2 text-right">Fed tax</th>
                <th className="px-3 py-2 text-left">Fed due</th>
                <th className="px-3 py-2 text-right">State tax</th>
                <th className="px-3 py-2 text-left">State due</th>
                <th className="px-3 py-2 text-right">Money received</th>
                <th className="px-3 py-2 text-right">Net received</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {months.map((m) => (
                <MonthRow
                  key={m.mi}
                  m={m}
                  onSaveTax={(field, amount, due) =>
                    upsertLedger.mutate({
                      id: field === "fed" ? m.fedRowId : m.stateRowId,
                      period_month: m.mi + 1,
                      category: "payroll_tax",
                      label: field === "fed" ? "Federal Tax" : "State Tax",
                      amount,
                      note: due || null,
                    })
                  }
                  onSaveReceived={(amount) =>
                    upsertLedger.mutate({
                      // For received, ALWAYS insert a new entry (multiple deposits per month allowed)
                      period_month: m.mi + 1,
                      category: "received",
                      label: `Deposit ${new Date().toISOString().slice(0, 10)}`,
                      amount,
                    })
                  }
                />
              ))}
            </tbody>
            <tfoot className="bg-muted/30 font-semibold">
              <tr>
                <td className="px-3 py-2">{year} totals</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtUSD(yearTotals.billedDSP)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtUSD(yearTotals.billedHHS)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtUSD(yearTotals.totalBilled)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtUSD(yearTotals.contractorGross)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtUSD(yearTotals.hhpPay)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtUSD(yearTotals.netPayroll)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtUSD(yearTotals.fedTax)}</td>
                <td className="px-3 py-2"></td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtUSD(yearTotals.stateTax)}</td>
                <td className="px-3 py-2"></td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtUSD(yearTotals.received)}</td>
                <td className={`px-3 py-2 text-right tabular-nums ${yearTotals.netReceived >= 0 ? "text-emerald-600" : "text-destructive"}`}>{fmtUSD(yearTotals.netReceived)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <div>
            <strong>Total billed</strong> = DSP (non-HHS units × rate, same as Tab A) + HHS (billable days × HHS rate, same as Tab B). <strong>Contractor gross / HHP pay / Net payrolls</strong> mirror Tab C (HHP via CMP/CMS assignment). <strong>Fed tax / State tax</strong> and <strong>due dates</strong> persist in <code>provider_ledger_entries</code> as <code>payroll_tax</code> (one row per month per kind). <strong>Money received</strong> reads/writes the same ledger (<code>received</code> — multiple deposits per month). <strong>Net received</strong> = Money received − Net payrolls − Additional − Fed − State. Owner / partner distribution is in Tab F. Pay-period boundaries come from <code>time_pay_settings</code> via <code>computePeriodBounds()</code> — never hardcoded.
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}

function MonthRow({
  m,
  onSaveTax,
  onSaveReceived,
}: {
  m: {
    mi: number; label: string;
    billedDSP: number; billedHHS: number; totalBilled: number;
    contractorGross: number; hhpPay: number; netPayroll: number; additional: number;
    fedTax: number; stateTax: number; fedDue: string; stateDue: string;
    received: number; netReceived: number; periodLabels: string[];
    fedRowId?: string; stateRowId?: string;
  };
  onSaveTax: (field: "fed" | "state", amount: number, due: string) => void;
  onSaveReceived: (amount: number) => void;
}) {
  const [fed, setFed] = useState(String(m.fedTax || ""));
  const [fedDue, setFedDue] = useState(m.fedDue || "");
  const [st, setSt] = useState(String(m.stateTax || ""));
  const [stDue, setStDue] = useState(m.stateDue || "");
  const [newReceived, setNewReceived] = useState("");

  useEffect(() => { setFed(String(m.fedTax || "")); }, [m.fedTax]);
  useEffect(() => { setFedDue(m.fedDue || ""); }, [m.fedDue]);
  useEffect(() => { setSt(String(m.stateTax || "")); }, [m.stateTax]);
  useEffect(() => { setStDue(m.stateDue || ""); }, [m.stateDue]);

  return (
    <tr className="hover:bg-muted/30">
      <td className="px-3 py-2 font-medium">
        <div className="flex flex-col">
          <span>{m.label}</span>
          {m.periodLabels.length > 0 && (
            <span className="text-[10px] text-muted-foreground">{m.periodLabels.join(" · ")}</span>
          )}
        </div>
      </td>
      <td className="px-3 py-2 text-right tabular-nums">{fmtUSD(m.billedDSP)}</td>
      <td className="px-3 py-2 text-right tabular-nums">{fmtUSD(m.billedHHS)}</td>
      <td className="px-3 py-2 text-right tabular-nums font-semibold">{fmtUSD(m.totalBilled)}</td>
      <td className="px-3 py-2 text-right tabular-nums">{fmtUSD(m.contractorGross)}</td>
      <td className="px-3 py-2 text-right tabular-nums">{fmtUSD(m.hhpPay)}</td>
      <td className="px-3 py-2 text-right tabular-nums">{fmtUSD(m.netPayroll + m.additional)}</td>
      <td className="px-3 py-2 text-right">
        <Input
          type="number" step="0.01" value={fed}
          onChange={(e) => setFed(e.target.value)}
          onBlur={() => {
            const n = Number(fed || 0);
            if (n !== m.fedTax || fedDue !== m.fedDue) onSaveTax("fed", n, fedDue);
          }}
          className="h-8 w-24 text-right tabular-nums" />
      </td>
      <td className="px-3 py-2">
        <Input
          type="date" value={fedDue}
          onChange={(e) => setFedDue(e.target.value)}
          onBlur={() => {
            if (fedDue !== m.fedDue) onSaveTax("fed", Number(fed || 0), fedDue);
          }}
          className="h-8 w-36" />
      </td>
      <td className="px-3 py-2 text-right">
        <Input
          type="number" step="0.01" value={st}
          onChange={(e) => setSt(e.target.value)}
          onBlur={() => {
            const n = Number(st || 0);
            if (n !== m.stateTax || stDue !== m.stateDue) onSaveTax("state", n, stDue);
          }}
          className="h-8 w-24 text-right tabular-nums" />
      </td>
      <td className="px-3 py-2">
        <Input
          type="date" value={stDue}
          onChange={(e) => setStDue(e.target.value)}
          onBlur={() => {
            if (stDue !== m.stateDue) onSaveTax("state", Number(st || 0), stDue);
          }}
          className="h-8 w-36" />
      </td>
      <td className="px-3 py-2 text-right">
        <div className="flex flex-col items-end gap-1">
          <span className="tabular-nums font-medium">{fmtUSD(m.received)}</span>
          <div className="flex gap-1">
            <Input
              type="number" step="0.01" placeholder="+ deposit"
              value={newReceived}
              onChange={(e) => setNewReceived(e.target.value)}
              className="h-7 w-24 text-right tabular-nums text-xs" />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm" variant="outline" className="h-7 px-2 text-xs"
                  onClick={() => {
                    const n = Number(newReceived || 0);
                    if (n > 0) { onSaveReceived(n); setNewReceived(""); }
                  }}
                >Add</Button>
              </TooltipTrigger>
              <TooltipContent>Records a deposit in provider_ledger_entries (category=received)</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </td>
      <td className={`px-3 py-2 text-right tabular-nums font-semibold ${m.netReceived >= 0 ? "text-emerald-600" : "text-destructive"}`}>
        {fmtUSD(m.netReceived)}
      </td>
    </tr>
  );
}
