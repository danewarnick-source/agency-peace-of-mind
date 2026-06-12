import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-org";
import { useAllClientBillingCodes } from "@/hooks/use-client-billing-codes";
import { fmtHours, fmtUSD, fmtUnits, unitsToHours, computeEntryUnits, UNITS_PER_HOUR } from "@/lib/billing-units";
import { isDailyServiceCode } from "@/lib/service-billing";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, ChevronDown, Users2, GraduationCap, Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export const Route = createFileRoute("/dashboard/billing/monthly-grid")({
  head: () => ({ meta: [{ title: "Monthly Grid — HIVE" }] }),
  component: MonthlyGridPage,
});

// Host-home / host-family residential codes group separately; everything else
// = Direct Support. Matches the spec's two-section grouping.
const HOST_HOME_CODES = new Set(["HHS", "PPS"]);

type ClientRow = { id: string; first_name: string; last_name: string };

type GridRow = {
  client: ClientRow;
  code: ReturnType<typeof useAllClientBillingCodes>["data"] extends Array<infer T> | undefined ? T : never;
  isDaily: boolean;
  rate: number;
  rateSource: string | null;
  annual: number;
  used_units: number;
  remaining_units: number;
  monthly_max: number | null;
};

function MonthlyGridPage() {
  const { data: org } = useCurrentOrg();
  const today = new Date();
  const [month, setMonth] = useState({ y: today.getFullYear(), m: today.getMonth() });

  const monthStart = useMemo(() => new Date(month.y, month.m, 1), [month]);
  const monthEnd = useMemo(() => new Date(month.y, month.m + 1, 0), [month]);
  const asOf = monthStart.toISOString().slice(0, 10);
  const monthLabel = monthStart.toLocaleString(undefined, { month: "long", year: "numeric" });

  const { data: codes } = useAllClientBillingCodes();

  const clientsQ = useQuery({
    enabled: !!org?.organization_id,
    queryKey: ["mg-clients", org?.organization_id],
    queryFn: async (): Promise<ClientRow[]> => {
      const { data, error } = await supabase
        .from("clients")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .select("id, first_name, last_name" as any)
        .eq("organization_id", org!.organization_id)
        .order("last_name");
      if (error) throw error;
      return (data ?? []) as unknown as ClientRow[];
    },
  });

  // YTD usage for "Remaining Units" — same shape the overview uses.
  const usageQ = useQuery({
    enabled: !!org?.organization_id,
    queryKey: ["mg-usage", org?.organization_id, month.y],
    queryFn: async () => {
      const yearStart = new Date(month.y, 0, 1).toISOString();
      const [tsRes, dlRes] = await Promise.all([
        supabase.from("evv_timesheets")
          .select("client_id, service_type_code, clock_in_timestamp, clock_out_timestamp")
          .eq("organization_id", org!.organization_id)
          .gte("clock_in_timestamp", yearStart),
        supabase.from("hhs_daily_records_v")
          .select("client_id, record_date, service_code, billable")
          .eq("organization_id", org!.organization_id)
          .eq("billable", true)
          .gte("record_date", yearStart.slice(0, 10)),
      ]);
      if (tsRes.error) throw tsRes.error;
      if (dlRes.error) throw dlRes.error;
      return { ts: tsRes.data ?? [], dl: dlRes.data ?? [] };
    },
  });

  // Bulk rate lookup for the selected month: for each (client, code) that has
  // any history, call get_rate_as_of. Cheaper alternative for the DEMO grid:
  // read all rate_history rows in one query and resolve client-side, matching
  // the SQL function's logic (current row's window first, then most-recent
  // superseded history row whose window contains the date).
  const historyQ = useQuery({
    enabled: !!org?.organization_id,
    queryKey: ["mg-rate-history", org?.organization_id],
    queryFn: async () => {
      const { data, error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from("client_billing_code_rate_history" as any)
        .select("client_id, service_code, rate_per_unit, effective_start, effective_end, rate_source, superseded_at")
        .eq("organization_id", org!.organization_id)
        .order("superseded_at", { ascending: false });
      if (error) throw error;
      return ((data ?? []) as unknown) as Array<{
        client_id: string; service_code: string; rate_per_unit: number;
        effective_start: string | null; effective_end: string | null;
        rate_source: string | null; superseded_at: string;
      }>;
    },
  });

  // Manual units this step (replaced by EVV auto-fill in step 3).
  const [manualUnits, setManualUnits] = useState<Record<string, number>>({});
  const keyOf = (clientId: string, code: string) => `${clientId}::${code}`;

  const allRows: GridRow[] = useMemo(() => {
    if (!codes || !clientsQ.data) return [];
    const ts = (usageQ.data?.ts ?? []) as Array<{
      client_id: string; service_type_code: string | null;
      clock_in_timestamp: string; clock_out_timestamp: string | null;
    }>;
    const dl = (usageQ.data?.dl ?? []) as Array<{
      client_id: string; record_date: string; service_code: string | null;
    }>;
    const history = historyQ.data ?? [];

    return clientsQ.data.flatMap((c) =>
      codes.filter((b) => b.client_id === c.id).map((code): GridRow => {
        const isDaily = isDailyServiceCode(code.service_code);
        const yearStart = new Date(month.y, 0, 1);

        // YTD used.
        let used = 0;
        if (isDaily) {
          const set = new Set<string>();
          for (const r of dl) {
            if (r.client_id !== c.id) continue;
            if (r.service_code && r.service_code !== code.service_code) continue;
            const d = new Date(r.record_date + "T00:00:00");
            if (d < yearStart) continue;
            set.add(r.record_date);
          }
          used = set.size;
        } else {
          for (const r of ts) {
            if (r.client_id !== c.id || !r.clock_out_timestamp) continue;
            if (r.service_type_code !== code.service_code) continue;
            const inT = new Date(r.clock_in_timestamp);
            if (inT < yearStart) continue;
            used += computeEntryUnits(r.clock_in_timestamp, r.clock_out_timestamp);
          }
        }

        // Rate as of selected month: current row if its window contains asOf,
        // else most-recent superseded history row whose window contains asOf.
        const inWindow = (s: string | null, e: string | null) =>
          (!s || s <= asOf) && (!e || e >= asOf);
        let rate = Number(code.rate_per_unit ?? 0);
        let rateSource: string | null = (code as unknown as { rate_source?: string | null }).rate_source ?? null;
        const curWindowOK = inWindow(code.service_start_date, code.service_end_date);
        if (!curWindowOK) {
          const h = history.find((h) =>
            h.client_id === c.id && h.service_code === code.service_code &&
            inWindow(h.effective_start, h.effective_end),
          );
          if (h) { rate = Number(h.rate_per_unit); rateSource = h.rate_source ?? "history"; }
        }

        const annual = code.annual_unit_authorization ?? 0;
        return {
          client: c,
          code,
          isDaily,
          rate,
          rateSource,
          annual,
          used_units: used,
          remaining_units: Math.max(0, annual - used),
          monthly_max: code.monthly_max_units ?? null,
        };
      }),
    );
  }, [codes, clientsQ.data, usageQ.data, historyQ.data, month.y, asOf]);

  const directRows = allRows.filter((r) => !HOST_HOME_CODES.has(r.code.service_code));
  const hostRows = allRows.filter((r) => HOST_HOME_CODES.has(r.code.service_code));

  // Side rollup: total hours by code (manual units → hours for now).
  const rollup = useMemo(() => {
    const map = new Map<string, { units: number; hours: number; toBill: number }>();
    for (const r of allRows) {
      const u = manualUnits[keyOf(r.client.id, r.code.service_code)] ?? 0;
      const hours = r.isDaily ? u * 24 : u / UNITS_PER_HOUR; // daily units = days; hours decorative
      const prev = map.get(r.code.service_code) ?? { units: 0, hours: 0, toBill: 0 };
      map.set(r.code.service_code, {
        units: prev.units + u,
        hours: prev.hours + (r.isDaily ? 0 : hours),
        toBill: prev.toBill + u * r.rate,
      });
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [allRows, manualUnits]);

  const stepMonth = (delta: number) => {
    const d = new Date(month.y, month.m + delta, 1);
    setMonth({ y: d.getFullYear(), m: d.getMonth() });
  };

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
        <div>
          <h2 className="font-display text-lg font-bold">Monthly Billables Grid</h2>
          <p className="text-xs text-muted-foreground">
            Tab A · Client × billing code for the month · units × rate = To Bill.
            EVV auto-fill ships in the next step — for now, units are manual.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="icon" variant="outline" onClick={() => stepMonth(-1)} aria-label="Previous month">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-[10rem] rounded-md border border-border bg-background px-3 py-1.5 text-center text-sm font-semibold">
            {monthLabel}
          </div>
          <Button size="icon" variant="outline" onClick={() => stepMonth(1)} aria-label="Next month">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setMonth({ y: today.getFullYear(), m: today.getMonth() })}>
            Today
          </Button>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[1fr_18rem]">
        <div className="space-y-4">
          <GridSection
            title="Direct Support"
            subtitle="Hourly + per-visit codes (SLN, SLH, DSI, SEI, RHS, CHA, COM, etc.)"
            rows={directRows}
            manualUnits={manualUnits}
            setManualUnits={setManualUnits}
            keyOf={keyOf}
            asOf={asOf}
          />
          <GridSection
            title="Host Home"
            subtitle="Daily-rate residential codes (HHS, PPS)"
            rows={hostRows}
            manualUnits={manualUnits}
            setManualUnits={setManualUnits}
            keyOf={keyOf}
            asOf={asOf}
          />

          <section className="rounded-2xl border border-dashed border-border bg-card p-4 shadow-sm">
            <header className="mb-2 flex items-center gap-2">
              <GraduationCap className="h-4 w-4 text-muted-foreground" />
              <h3 className="font-display text-base font-semibold">Admin / Training hours</h3>
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">Placeholder</span>
            </header>
            <p className="text-xs text-muted-foreground">
              Non-billable hours from <code>general_shifts</code> (admin + training + meetings) will roll up here for payroll
              reconciliation. Wired in a later step — not part of "To Bill" totals.
            </p>
          </section>
        </div>

        {/* Side panel */}
        <aside className="space-y-3">
          <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <h3 className="font-display text-sm font-semibold">Total by code · {monthLabel}</h3>
            <p className="mb-3 text-xs text-muted-foreground">Derived from units entered above.</p>
            {rollup.length === 0 ? (
              <p className="text-xs text-muted-foreground">No authorized codes yet.</p>
            ) : (
              <ul className="space-y-1.5 text-xs">
                {rollup.map(([code, v]) => (
                  <li key={code} className="flex items-center justify-between gap-2 border-b border-dashed border-border/60 pb-1.5 last:border-0">
                    <span className="font-mono font-semibold">{code}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {fmtUnits(v.units)} u
                      {v.hours > 0 && ` · ${fmtHours(v.hours)} h`}
                    </span>
                    <span className="tabular-nums font-semibold">{fmtUSD(v.toBill)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="rounded-2xl border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
            <div className="mb-1 flex items-center gap-1 font-semibold text-foreground">
              <Info className="h-3.5 w-3.5" /> About this grid
            </div>
            Rates use <code>get_rate_as_of</code>: current rate if the month falls in its effective window,
            otherwise the most recent superseded version from rate history. Units are manual this step;
            EVV-derived units arrive in the next increment.
          </div>
        </aside>
      </div>
    </div>
  );
}

function GridSection({
  title, subtitle, rows, manualUnits, setManualUnits, keyOf, asOf,
}: {
  title: string;
  subtitle: string;
  rows: GridRow[];
  manualUnits: Record<string, number>;
  setManualUnits: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  keyOf: (clientId: string, code: string) => string;
  asOf: string;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card shadow-sm">
      <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div>
          <h3 className="font-display text-base font-semibold">{title}</h3>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
        <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
          {rows.length} row{rows.length === 1 ? "" : "s"}
        </span>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1000px] text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Client</th>
              <th className="px-3 py-2">Code</th>
              <th className="px-3 py-2 text-right">Rate</th>
              <th className="px-3 py-2 text-right">Units</th>
              <th className="px-3 py-2 text-right">To Bill</th>
              <th className="px-3 py-2 text-right">Monthly Max</th>
              <th className="px-3 py-2 text-right">Remaining (YTD)</th>
              <th className="px-3 py-2">Staff · hours</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-6 text-center text-muted-foreground">No authorized codes in this section.</td></tr>
            ) : rows.map((r) => {
              const k = keyOf(r.client.id, r.code.service_code);
              const u = manualUnits[k] ?? 0;
              const toBill = u * r.rate;
              return (
                <tr key={k} className="border-t border-border hover:bg-muted/30">
                  <td className="px-3 py-2 font-medium">{r.client.last_name}, {r.client.first_name}</td>
                  <td className="px-3 py-2 font-mono font-semibold">
                    {r.code.service_code}
                    <span className={`ml-1 rounded px-1 py-0.5 text-[10px] font-bold ${r.isDaily ? "bg-[#fde9c8] text-[#7a4308]" : "bg-[#e1efff] text-[#11498e]"}`}>
                      {r.isDaily ? "DAILY" : "Q"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="cursor-help">{fmtUSD(r.rate)}</span>
                        </TooltipTrigger>
                        <TooltipContent className="text-xs">
                          As of {asOf} · {r.rateSource ?? "no source"}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input
                      type="number"
                      min={0}
                      step={r.isDaily ? 1 : 1}
                      value={u || ""}
                      onChange={(e) => setManualUnits((p) => ({ ...p, [k]: Number(e.target.value) || 0 }))}
                      placeholder="0"
                      className="h-8 w-20 rounded-md border border-border bg-background px-2 text-right tabular-nums text-sm"
                    />
                  </td>
                  <td className="px-3 py-2 text-right font-mono font-semibold tabular-nums">
                    {fmtUSD(toBill)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                    {r.monthly_max != null ? fmtUnits(r.monthly_max) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    <span className={r.annual > 0 && r.used_units / r.annual >= 0.9 ? "font-semibold text-[#b45309]" : ""}>
                      {fmtUnits(r.remaining_units)} u
                      {!r.isDaily && <span className="ml-1 text-xs text-muted-foreground">· {fmtHours(unitsToHours(r.remaining_units))} h</span>}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <StaffCell />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function StaffCell() {
  const [open, setOpen] = useState(false);
  // Variable-width contributors model — populated in step 3 from EVV. For now,
  // the row is empty but the collapsible shape is in place.
  const count = 0;
  const hours = 0;
  return (
    <button
      type="button"
      onClick={() => setOpen((o) => !o)}
      className="inline-flex items-center gap-1 rounded-md border border-dashed border-border bg-background px-2 py-1 text-xs text-muted-foreground hover:bg-muted/40"
    >
      <Users2 className="h-3.5 w-3.5" />
      {count} staff · {fmtHours(hours)}h
      <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
    </button>
  );
}
