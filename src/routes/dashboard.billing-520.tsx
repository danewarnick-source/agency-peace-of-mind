import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-org";
import { useAllClientBillingCodes } from "@/hooks/use-client-billing-codes";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Copy, Download } from "lucide-react";
import { hoursToUnits, unitsToHours, fmtHours } from "@/lib/billing-units";
import { isDailyServiceCode } from "@/lib/service-billing";

export const Route = createFileRoute("/dashboard/billing-520")({
  head: () => ({ meta: [{ title: "520 Billing — HIVE" }] }),
  component: Billing520Page,
});

type Row = {
  line_number: number;
  provider_approver_email: string;
  consumer_name: string;
  consumer_pid: string;
  service_code: string;
  rate: number;
  unit_type: string;
  service_start_date: string;
  service_end_date: string;
  units: number;
  remaining_units: number;
  sce: string;
  monthly_max_units: number | "";
};

function startOfMonth(d = new Date()) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function endOfMonth(d = new Date()) { return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999); }

function Billing520Page() {
  const { data: org } = useCurrentOrg();
  const { data: codes } = useAllClientBillingCodes();

  const periodStart = startOfMonth();
  const periodEnd = endOfMonth();

  const tsQ = useQuery({
    enabled: !!org?.organization_id,
    queryKey: ["520-evv", org?.organization_id, periodStart.toISOString()],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("evv_timesheets")
        .select("client_id, service_type_code, clock_in_timestamp, clock_out_timestamp")
        .eq("organization_id", org!.organization_id)
        .gte("clock_in_timestamp", periodStart.toISOString())
        .lte("clock_in_timestamp", periodEnd.toISOString());
      if (error) throw error;
      return data ?? [];
    },
  });

  const dailyQ = useQuery({
    enabled: !!org?.organization_id,
    queryKey: ["520-daily", org?.organization_id, periodStart.toISOString()],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hhs_daily_records")
        .select("client_id, record_date")
        .eq("organization_id", org!.organization_id)
        .gte("record_date", periodStart.toISOString().slice(0, 10))
        .lte("record_date", periodEnd.toISOString().slice(0, 10));
      if (error) throw error;
      return data ?? [];
    },
  });

  const clientsQ = useQuery({
    enabled: !!org?.organization_id,
    queryKey: ["520-clients", org?.organization_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .select("id, first_name, last_name, medicaid_id" as any)
        .eq("organization_id", org!.organization_id);
      if (error) throw error;
      return data ?? [];
    },
  });

  const rows = useMemo<Row[]>(() => {
    if (!codes || !clientsQ.data) return [];
    const clientMap = new Map(
      (clientsQ.data as Array<{ id: string; first_name: string; last_name: string; medicaid_id: string | null }>)
        .map((c) => [c.id, c]),
    );

    // Aggregate hours per (client × code) from evv_timesheets
    const hoursByKey = new Map<string, number>();
    for (const r of (tsQ.data ?? []) as Array<{ client_id: string; service_type_code: string | null; clock_in_timestamp: string; clock_out_timestamp: string | null }>) {
      if (!r.service_type_code || !r.clock_out_timestamp) continue;
      if (isDailyServiceCode(r.service_type_code)) continue;
      const hrs = (new Date(r.clock_out_timestamp).getTime() - new Date(r.clock_in_timestamp).getTime()) / 3_600_000;
      if (!isFinite(hrs) || hrs <= 0) continue;
      const k = `${r.client_id}|${r.service_type_code}`;
      hoursByKey.set(k, (hoursByKey.get(k) ?? 0) + hrs);
    }

    // Distinct daily days per client
    const daysByClient = new Map<string, Set<string>>();
    for (const r of (dailyQ.data ?? []) as Array<{ client_id: string; record_date: string }>) {
      if (!r.record_date) continue;
      if (!daysByClient.has(r.client_id)) daysByClient.set(r.client_id, new Set());
      daysByClient.get(r.client_id)!.add(r.record_date);
    }

    const out: Row[] = [];
    let line = 1;
    const startStr = periodStart.toISOString().slice(0, 10);
    const endStr = periodEnd.toISOString().slice(0, 10);
    for (const b of codes) {
      const client = clientMap.get(b.client_id);
      if (!client) continue;
      let units = 0;
      if (isDailyServiceCode(b.service_code)) {
        units = daysByClient.get(b.client_id)?.size ?? 0;
      } else {
        const hrs = hoursByKey.get(`${b.client_id}|${b.service_code}`) ?? 0;
        units = hoursToUnits(hrs);
      }
      const remaining = Math.max(0, (b.annual_unit_authorization ?? 0) - units);
      out.push({
        line_number: line++,
        provider_approver_email: b.provider_approver_email ?? "",
        consumer_name: `${client.last_name}, ${client.first_name}`,
        consumer_pid: client.medicaid_id ?? "",
        service_code: b.service_code,
        rate: Number(b.rate_per_unit ?? 0),
        unit_type: b.unit_type || "Q",
        service_start_date: b.service_start_date || startStr,
        service_end_date: b.service_end_date || endStr,
        units,
        remaining_units: remaining,
        sce: b.sce ?? "",
        monthly_max_units: b.monthly_max_units ?? "",
      });
    }
    return out;
  }, [codes, clientsQ.data, tsQ.data, dailyQ.data, periodStart, periodEnd]);

  const HEADERS = [
    "line_number","provider_approver_email","consumer_name","consumer_pid","service_code",
    "rate","unit_type","service_start_date","service_end_date","units","remaining_units","sce","monthly_max_units",
  ] as const;

  const copyTSV = async () => {
    const lines = [HEADERS.join("\t"), ...rows.map((r) => HEADERS.map((h) => String((r as unknown as Record<string, unknown>)[h] ?? "")).join("\t"))];
    await navigator.clipboard.writeText(lines.join("\n"));
    toast.success("Copied 520 rows to clipboard");
  };

  const exportXlsx = () => {
    const ws = XLSX.utils.json_to_sheet(rows, { header: HEADERS as unknown as string[] });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "520");
    XLSX.writeFile(wb, `520-${periodStart.toISOString().slice(0, 7)}.xlsx`);
  };

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">520 Billing — {periodStart.toLocaleString("en-US", { month: "long", year: "numeric" })}</h1>
          <p className="text-sm text-muted-foreground">
            Auto-populated from EVV time punches + daily logs. Hourly hours → units at {fmtHours(1)} hr = 4 units.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={copyTSV}><Copy className="mr-2 h-4 w-4" />Copy</Button>
          <Button onClick={exportXlsx}><Download className="mr-2 h-4 w-4" />Export Excel</Button>
        </div>
      </header>

      <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
        <table className="w-full min-w-[1100px] text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr>{HEADERS.map((h) => <th key={h} className="px-3 py-2 whitespace-nowrap">{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={HEADERS.length} className="p-6 text-center text-muted-foreground">No billing rows for this period — add client billing codes and time data.</td></tr>
            ) : rows.map((r) => (
              <tr key={`${r.consumer_pid}-${r.service_code}-${r.line_number}`} className="border-t border-border">
                <td className="px-3 py-2 tabular-nums">{r.line_number}</td>
                <td className="px-3 py-2">{r.provider_approver_email}</td>
                <td className="px-3 py-2">{r.consumer_name}</td>
                <td className="px-3 py-2 font-mono">{r.consumer_pid}</td>
                <td className="px-3 py-2 font-mono font-semibold">{r.service_code}</td>
                <td className="px-3 py-2 tabular-nums">{r.rate.toFixed(2)}</td>
                <td className="px-3 py-2">{r.unit_type}</td>
                <td className="px-3 py-2">{r.service_start_date}</td>
                <td className="px-3 py-2">{r.service_end_date}</td>
                <td className="px-3 py-2 tabular-nums font-semibold">{r.units}</td>
                <td className="px-3 py-2 tabular-nums">{r.remaining_units}</td>
                <td className="px-3 py-2">{r.sce}</td>
                <td className="px-3 py-2 tabular-nums">{r.monthly_max_units}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted-foreground">
        Units shown are whole numbers (1 unit = 15 min for hourly codes; 1 unit = 1 day for daily codes). Hours rounded to 2 decimals where shown.
      </p>
    </div>
  );
}
