import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg, useOrgDisplayName } from "@/hooks/use-org";
import { useAllClientBillingCodes } from "@/hooks/use-client-billing-codes";
import { fmtHours, fmtUSD, fmtUnits, unitsToHours, computeEntryUnits, UNITS_PER_HOUR } from "@/lib/billing-units";
import { isDailyServiceCode } from "@/lib/service-billing";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, ChevronDown, Users2, GraduationCap, Info, Briefcase } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { BillingDetailDialog } from "@/components/financial/billing-detail-dialog";

export const Route = createFileRoute("/dashboard/financial/monthly-grid")({
  head: () => ({ meta: [{ title: "Monthly Grid — HIVE" }] }),
  component: MonthlyGridPage,
});

const HOST_HOME_CODES = new Set(["HHS", "PPS"]);
const RHS_CODES = new Set(["RHS"]);

type ClientRow = { id: string; first_name: string; last_name: string };
type StaffBreakdown = { staff_id: string; name: string; units: number; hours: number };

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
  month_units: number;
  staff: StaffBreakdown[];
};

function MonthlyGridPage() {
  const { data: org } = useCurrentOrg();
  const providerName = useOrgDisplayName().displayName;
  const today = new Date();
  const [month, setMonth] = useState({ y: today.getFullYear(), m: today.getMonth() });

  const monthStart = useMemo(() => new Date(month.y, month.m, 1), [month]);
  const monthEnd = useMemo(() => new Date(month.y, month.m + 1, 0), [month]);
  const asOf = monthStart.toISOString().slice(0, 10);
  const monthEndIso = new Date(month.y, month.m + 1, 1).toISOString();
  const monthStartIso = monthStart.toISOString();
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
  // READ-ONLY against evv_timesheets / hhs_daily_records_v.
  const usageQ = useQuery({
    enabled: !!org?.organization_id,
    queryKey: ["mg-usage", org?.organization_id, month.y],
    queryFn: async () => {
      const yearStart = new Date(month.y, 0, 1).toISOString();
      const [tsRes, dlRes] = await Promise.all([
        supabase.from("evv_timesheets")
          .select("client_id, service_type_code, clock_in_timestamp, clock_out_timestamp, staff_id")
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

  // Profiles for staff name lookup (staff_id → display name).
  const staffIds = useMemo(() => {
    const set = new Set<string>();
    const ts = (usageQ.data?.ts ?? []) as Array<{ staff_id: string | null }>;
    for (const r of ts) if (r.staff_id) set.add(r.staff_id);
    return [...set];
  }, [usageQ.data]);

  const profilesQ = useQuery({
    enabled: staffIds.length > 0,
    queryKey: ["mg-profiles", staffIds.sort().join(",")],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .select("id, first_name, last_name, full_name" as any)
        .in("id", staffIds);
      if (error) throw error;
      return (data ?? []) as unknown as Array<{
        id: string; first_name: string | null; last_name: string | null; full_name: string | null;
      }>;
    },
  });

  const staffNameOf = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of profilesQ.data ?? []) {
      const n =
        (p.first_name || p.last_name)
          ? `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim()
          : (p.full_name ?? p.id.slice(0, 8));
      map.set(p.id, n);
    }
    return map;
  }, [profilesQ.data]);

  // ── General shifts (non-billable admin / training / etc.) ──
  const generalShiftsQ = useQuery({
    enabled: !!org?.organization_id,
    queryKey: ["mg-general-shifts", org?.organization_id, month.y, month.m],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("general_shifts")
        .select("user_id, category, clock_in_timestamp, clock_out_timestamp")
        .eq("organization_id", org!.organization_id)
        .not("clock_out_timestamp", "is", null)
        .gte("clock_in_timestamp", monthStartIso)
        .lt("clock_in_timestamp", monthEndIso);
      if (error) throw error;
      return (data ?? []) as Array<{
        user_id: string; category: string;
        clock_in_timestamp: string; clock_out_timestamp: string;
      }>;
    },
  });

  const genShiftUserIds = useMemo(() => {
    const s = new Set<string>();
    for (const r of generalShiftsQ.data ?? []) s.add(r.user_id);
    return [...s];
  }, [generalShiftsQ.data]);

  const genShiftProfilesQ = useQuery({
    enabled: genShiftUserIds.length > 0,
    queryKey: ["mg-gen-profiles", genShiftUserIds.sort().join(",")],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .select("id, first_name, last_name, full_name" as any)
        .in("id", genShiftUserIds);
      if (error) throw error;
      return (data ?? []) as unknown as Array<{
        id: string; first_name: string | null; last_name: string | null; full_name: string | null;
      }>;
    },
  });

  const generalShiftHours = useMemo(() => {
    const profMap = new Map<string, string>();
    for (const p of genShiftProfilesQ.data ?? []) {
      const n =
        (p.first_name || p.last_name)
          ? `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim()
          : (p.full_name ?? p.id.slice(0, 8));
      profMap.set(p.id, n);
    }
    const byStaff = new Map<string, { name: string; byCat: Map<string, number>; total: number }>();
    for (const r of generalShiftsQ.data ?? []) {
      const h = Math.max(
        0,
        (new Date(r.clock_out_timestamp).getTime() - new Date(r.clock_in_timestamp).getTime()) / 3_600_000,
      );
      const s = byStaff.get(r.user_id) ?? {
        name: profMap.get(r.user_id) ?? r.user_id.slice(0, 8),
        byCat: new Map(),
        total: 0,
      };
      s.byCat.set(r.category, (s.byCat.get(r.category) ?? 0) + h);
      s.total += h;
      byStaff.set(r.user_id, s);
    }
    return [...byStaff.entries()]
      .map(([userId, s]) => ({
        userId,
        name: s.name,
        categories: [...s.byCat.entries()].sort((a, b) => b[1] - a[1]),
        total: s.total,
      }))
      .sort((a, b) => b.total - a.total);
  }, [generalShiftsQ.data, genShiftProfilesQ.data]);

  // Rate history for as-of resolution.
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

  const allRows: GridRow[] = useMemo(() => {
    if (!codes || !clientsQ.data) return [];
    const ts = (usageQ.data?.ts ?? []) as Array<{
      client_id: string; service_type_code: string | null;
      clock_in_timestamp: string; clock_out_timestamp: string | null; staff_id: string | null;
    }>;
    const dl = (usageQ.data?.dl ?? []) as Array<{
      client_id: string; record_date: string; service_code: string | null;
    }>;
    const history = historyQ.data ?? [];
    const monthStartMs = monthStart.getTime();
    const monthEndMs = new Date(monthEndIso).getTime();

    // Only authorizations whose window overlaps the viewed month — a code
    // that hasn't started yet, or already ended, shouldn't show a row (and
    // stale superseded codes shouldn't double up against the current one).
    const activeInMonth = (b: (typeof codes)[number]) => {
      const startOk = !b.service_start_date || b.service_start_date < monthEndIso;
      const endOk = !b.service_end_date || b.service_end_date >= asOf;
      return startOk && endOk;
    };

    return clientsQ.data.flatMap((c) =>
      codes.filter((b) => b.client_id === c.id && activeInMonth(b)).map((code): GridRow => {
        const isDaily = isDailyServiceCode(code.service_code);
        const yearStart = new Date(month.y, 0, 1);

        // YTD used (unchanged: drives Remaining-YTD).
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

        // MONTH auto-fill: units for the selected month + staff breakdown.
        let monthUnits = 0;
        const staffMap = new Map<string, number>(); // staff_id -> units
        if (isDaily) {
          // Daily codes: billable days in month from hhs_daily_records_v.
          // No staff breakdown (host parents don't clock).
          const set = new Set<string>();
          for (const r of dl) {
            if (r.client_id !== c.id) continue;
            if (r.service_code && r.service_code !== code.service_code) continue;
            const d = r.record_date;
            if (d < asOf || d > monthEnd.toISOString().slice(0, 10)) continue;
            set.add(d);
          }
          monthUnits = set.size;
        } else {
          for (const r of ts) {
            if (r.client_id !== c.id || !r.clock_out_timestamp) continue;
            if (r.service_type_code !== code.service_code) continue;
            const inMs = new Date(r.clock_in_timestamp).getTime();
            if (inMs < monthStartMs || inMs >= monthEndMs) continue;
            const u = computeEntryUnits(r.clock_in_timestamp, r.clock_out_timestamp);
            monthUnits += u;
            if (r.staff_id) staffMap.set(r.staff_id, (staffMap.get(r.staff_id) ?? 0) + u);
          }
        }
        const staff: StaffBreakdown[] = [...staffMap.entries()]
          .map(([staff_id, units]) => ({
            staff_id,
            name: staffNameOf.get(staff_id) ?? staff_id.slice(0, 8),
            units,
            hours: units / UNITS_PER_HOUR,
          }))
          .sort((a, b) => b.units - a.units);

        // Rate resolution (unchanged).
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
          month_units: monthUnits,
          staff,
        };
      }),
    );
  }, [codes, clientsQ.data, usageQ.data, historyQ.data, staffNameOf, month.y, asOf, monthEnd, monthStart, monthEndIso]);

  const directRows = allRows.filter((r) => !HOST_HOME_CODES.has(r.code.service_code) && !RHS_CODES.has(r.code.service_code));
  const rhsRows = allRows.filter((r) => RHS_CODES.has(r.code.service_code));
  const hostRows = allRows.filter((r) => HOST_HOME_CODES.has(r.code.service_code));

  // Side rollup: derived from auto month_units.
  const rollup = useMemo(() => {
    const map = new Map<string, { units: number; hours: number; toBill: number }>();
    for (const r of allRows) {
      const u = r.month_units;
      const hours = r.isDaily ? 0 : u / UNITS_PER_HOUR;
      const prev = map.get(r.code.service_code) ?? { units: 0, hours: 0, toBill: 0 };
      map.set(r.code.service_code, {
        units: prev.units + u,
        hours: prev.hours + hours,
        toBill: prev.toBill + u * r.rate,
      });
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [allRows]);

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
            Units + staff hours auto-filled from EVV (read-only).
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

      {/* Horizontal totals pill */}
      <div className="rounded-2xl border border-border bg-card p-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="text-xs font-semibold text-muted-foreground shrink-0">Total by code · {monthLabel}</span>
          {rollup.length === 0 ? (
            <span className="text-xs text-muted-foreground">No EVV activity this month.</span>
          ) : (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              {rollup.map(([code, v]) => (
                <span key={code} className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/30 px-2 py-1 text-xs">
                  <span className="font-mono font-semibold">{code}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {fmtUnits(v.units)} u
                    {v.hours > 0 && ` · ${fmtHours(v.hours)} h`}
                  </span>
                  <span className="tabular-nums font-semibold">{fmtUSD(v.toBill)}</span>
                </span>
              ))}
            </div>
          )}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted/40">
                  <Info className="h-3 w-3" /> About this grid
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-sm text-xs">
                Units = computeEntryUnits summed per EVV entry (quarter-hour codes) or billable days from hhs_daily_records_v (daily codes). Rates resolve via get_rate_as_of. EVV tables are read-only here.
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      <div className="space-y-4">
        <GridSection
          title="Direct Support"
          subtitle="Hourly + per-visit codes (SLN, SLH, DSI, SEI, CHA, COM, etc.)"
          rows={directRows}
          asOf={asOf}
          organizationId={org?.organization_id}
          year={month.y}
          month={month.m + 1}
          providerName={providerName}
        />
        <GridSection
          title="RHS"
          subtitle="Residential daily-rate code (RHS)"
          rows={rhsRows}
          asOf={asOf}
          organizationId={org?.organization_id}
          year={month.y}
          month={month.m + 1}
          providerName={providerName}
        />
        <GridSection
          title="Host Home"
          subtitle="Daily-rate host-home codes (HHS, PPS)"
          rows={hostRows}
          asOf={asOf}
          organizationId={org?.organization_id}
          year={month.y}
          month={month.m + 1}
          providerName={providerName}
        />

        <section className="rounded-2xl border border-dashed border-border bg-card p-4 shadow-sm">
          <header className="mb-3 flex items-center gap-2">
            <Briefcase className="h-4 w-4 text-muted-foreground" />
            <h3 className="font-display text-base font-semibold">Admin / Training hours</h3>
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-800">
              Non-billable
            </span>
          </header>
          <p className="mb-3 text-xs text-muted-foreground">
            Employer time from <code>general_shifts</code> (admin, training, meetings, travel). These hours are <strong>never</strong> added to billing totals.
          </p>
          {generalShiftHours.length === 0 ? (
            <p className="text-xs text-muted-foreground">No admin / training time logged this month.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/40 text-left uppercase text-muted-foreground">
                  <tr>
                    <th className="px-2 py-1.5">Staff</th>
                    <th className="px-2 py-1.5 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {generalShiftHours.map((s) => (
                    <tr key={s.userId} className="border-t border-border">
                      <td className="px-2 py-1.5 font-medium">
                        {s.name}
                        <div className="mt-0.5 flex flex-wrap gap-1">
                          {s.categories.map(([cat, h]) => (
                            <span key={cat} className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                              {cat} · {fmtHours(h)}h
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums font-semibold">{fmtHours(s.total)}h</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-muted/40">
                  <tr>
                    <td className="px-2 py-1.5 font-semibold uppercase text-muted-foreground">Section total</td>
                    <td className="px-2 py-1.5 text-right tabular-nums font-bold">
                      {fmtHours(generalShiftHours.reduce((sum, s) => sum + s.total, 0))}h
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function GridSection({
  title, subtitle, rows, asOf, organizationId, year, month, providerName,
}: {
  title: string;
  subtitle: string;
  rows: GridRow[];
  asOf: string;
  organizationId: string | undefined;
  year: number;
  month: number;
  providerName: string;
}) {
  const cellBase = "px-3 py-2 border-r border-border/30 last:border-r-0";
  const [active, setActive] = useState<{ clientId: string; clientName: string; code: string } | null>(null);
  return (
    <>
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
              <th className={`${cellBase}`}>Client</th>
              <th className={`${cellBase}`}>Code</th>
              <th className={`${cellBase} text-right`}>Rate</th>
              <th className={`${cellBase} text-right`}>Units (AUTO)</th>
              <th className={`${cellBase} text-right`}>To Bill</th>
              <th className={`${cellBase} text-right`}>Monthly Max</th>
              <th className={`${cellBase} text-right`}>Remaining (YTD)</th>
              <th className={`${cellBase}`}>Staff · hours</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-6 text-center text-muted-foreground">No authorized codes in this section.</td></tr>
            ) : rows.map((r) => {
              const u = r.month_units;
              const toBill = u * r.rate;
              const overMax = r.monthly_max != null && u > r.monthly_max;
              return (
                <tr
                  key={`${r.client.id}::${r.code.service_code}`}
                  className="cursor-pointer border-t border-border hover:bg-muted/30"
                  onClick={() => setActive({
                    clientId: r.client.id,
                    clientName: `${r.client.last_name}, ${r.client.first_name}`,
                    code: r.code.service_code,
                  })}
                  title="View shift detail"
                >
                  <td className={`${cellBase} font-medium`}>{r.client.last_name}, {r.client.first_name}</td>
                  <td className={`${cellBase} font-mono font-semibold`}>
                    {r.code.service_code}
                    <span className={`ml-1 rounded px-1 py-0.5 text-[10px] font-bold ${r.isDaily ? "bg-[#fde9c8] text-[#7a4308]" : "bg-[#e1efff] text-[#11498e]"}`}>
                      {r.isDaily ? "DAILY" : "Q"}
                    </span>
                  </td>
                  <td className={`${cellBase} text-right tabular-nums`}>
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
                  <td className={`${cellBase} text-right`}>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className={`inline-flex items-center gap-1 rounded-md border border-dashed border-border bg-muted/30 px-2 py-1 font-mono tabular-nums text-sm ${overMax ? "text-[#b45309] font-bold" : ""}`}>
                            {fmtUnits(u)}
                            {!r.isDaily && u > 0 && (
                              <span className="text-[10px] text-muted-foreground">· {fmtHours(u / UNITS_PER_HOUR)}h</span>
                            )}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent className="text-xs">
                          {r.isDaily ? "Billable days (hhs_daily_records_v)" : "Sum of per-entry computeEntryUnits"}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </td>
                  <td className={`${cellBase} text-right font-mono font-semibold tabular-nums`}>
                    {fmtUSD(toBill)}
                  </td>
                  <td className={`${cellBase} text-right tabular-nums text-muted-foreground`}>
                    {r.monthly_max != null ? fmtUnits(r.monthly_max) : "—"}
                  </td>
                  <td className={`${cellBase} text-right tabular-nums`}>
                    <span className={r.annual > 0 && r.used_units / r.annual >= 0.9 ? "font-semibold text-[#b45309]" : ""}>
                      {fmtUnits(r.remaining_units)} u
                      {!r.isDaily && <span className="ml-1 text-xs text-muted-foreground">· {fmtHours(unitsToHours(r.remaining_units))} h</span>}
                    </span>
                  </td>
                  <td className={`${cellBase}`}>
                    <StaffCell staff={r.staff} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
    {active && organizationId && (
      <BillingDetailDialog
        variant="grid-row"
        open={!!active}
        onOpenChange={(o) => !o && setActive(null)}
        organizationId={organizationId}
        year={year}
        month={month}
        providerName={providerName}
        clientId={active.clientId}
        clientName={active.clientName}
        serviceCode={active.code}
      />
    )}
    </>
  );
}

function StaffCell({ staff }: { staff: StaffBreakdown[] }) {
  const [open, setOpen] = useState(false);
  const totalHours = staff.reduce((s, x) => s + x.hours, 0);
  if (staff.length === 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-dashed border-border bg-background px-2 py-1 text-xs text-muted-foreground">
        <Users2 className="h-3.5 w-3.5" /> 0 staff
      </span>
    );
  }
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs hover:bg-muted/40"
      >
        <Users2 className="h-3.5 w-3.5" />
        {staff.length} staff · {fmtHours(totalHours)}h
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <ul className="absolute right-0 z-10 mt-1 min-w-[14rem] rounded-md border border-border bg-popover p-2 text-xs shadow-md">
          {staff.map((s) => (
            <li key={s.staff_id} className="flex items-center justify-between gap-3 px-1 py-0.5">
              <span className="truncate">{s.name}</span>
              <span className="tabular-nums text-muted-foreground">{fmtHours(s.hours)}h</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
