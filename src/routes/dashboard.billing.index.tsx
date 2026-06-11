import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-org";
import { useAllClientBillingCodes } from "@/hooks/use-client-billing-codes";
import { ChevronRight, AlertTriangle, CheckCircle2, CalendarX2 } from "lucide-react";
import { fmtHours, fmtUnits, unitsToHours, computeEntryUnits } from "@/lib/billing-units";
import { isDailyServiceCode } from "@/lib/service-billing";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export const Route = createFileRoute("/dashboard/billing/")({
  head: () => ({ meta: [{ title: "Billing Overview — HIVE" }] }),
  component: BillingOverviewPage,
});

type ClientRow = { id: string; first_name: string; last_name: string; medicaid_id: string | null };

function BillingOverviewPage() {
  const { data: org } = useCurrentOrg();
  const { data: codes } = useAllClientBillingCodes();

  const clientsQ = useQuery({
    enabled: !!org?.organization_id,
    queryKey: ["billing-overview-clients", org?.organization_id],
    queryFn: async (): Promise<ClientRow[]> => {
      const { data, error } = await supabase
        .from("clients")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .select("id, first_name, last_name, medicaid_id" as any)
        .eq("organization_id", org!.organization_id)
        .order("last_name");
      if (error) throw error;
      return (data ?? []) as unknown as ClientRow[];
    },
  });

  // Pull all completed punches + daily logs for the org to compute used units
  // across each client's authorized period in one pass.
  const usageQ = useQuery({
    enabled: !!org?.organization_id,
    queryKey: ["billing-overview-usage", org?.organization_id],
    refetchInterval: 60_000,
    queryFn: async () => {
      const yearStart = new Date(new Date().getFullYear() - 1, 0, 1).toISOString();
      const [tsRes, dlRes] = await Promise.all([
        supabase
          .from("evv_timesheets")
          .select("client_id, service_type_code, clock_in_timestamp, clock_out_timestamp")
          .eq("organization_id", org!.organization_id)
          .gte("clock_in_timestamp", yearStart),
        // Daily-rate days come from the hhs_daily_records_v view. Billable
        // rows count toward usage; blocked rows surface in the indicator.
        supabase
          .from("hhs_daily_records_v")
          .select("client_id, record_date, service_code, billable, blocked_reason")
          .eq("organization_id", org!.organization_id)
          .gte("record_date", yearStart.slice(0, 10)),
      ]);
      if (tsRes.error) throw tsRes.error;
      if (dlRes.error) throw dlRes.error;
      const all = (dlRes.data ?? []) as Array<{
        client_id: string | null;
        record_date: string | null;
        service_code: string | null;
        billable: boolean | null;
        blocked_reason: string | null;
      }>;
      return {
        ts: tsRes.data ?? [],
        dl: all.filter((r) => r.billable === true),
        blocked: all.filter((r) => r.billable === false),
      };
    },
  });

  const summary = useMemo(() => {
    if (!codes || !clientsQ.data) return [];
    const tsRows = (usageQ.data?.ts ?? []) as Array<{
      client_id: string;
      service_type_code: string | null;
      clock_in_timestamp: string;
      clock_out_timestamp: string | null;
    }>;
    const dlRows = (usageQ.data?.dl ?? []) as Array<{ client_id: string; record_date: string; service_code: string | null }>;

    return clientsQ.data.map((c) => {
      const clientCodes = codes.filter((b) => b.client_id === c.id);
      let totalAnnual = 0;
      let totalUsed = 0;
      let earliest: Date | null = null;
      let latestEnd: Date | null = null;
      let flagged = 0;

      for (const code of clientCodes) {
        const periodStart = code.service_start_date ? new Date(code.service_start_date) : null;
        const periodEnd = code.service_end_date ? new Date(code.service_end_date) : null;
        if (periodStart && (!earliest || periodStart < earliest)) earliest = periodStart;
        if (periodEnd && (!latestEnd || periodEnd > latestEnd)) latestEnd = periodEnd;
        const annual = code.annual_unit_authorization ?? 0;
        totalAnnual += annual;

        const isDaily = isDailyServiceCode(code.service_code);
        let used = 0;
        if (isDaily) {
          const set = new Set<string>();
          for (const r of dlRows) {
            if (r.client_id !== c.id || !r.record_date) continue;
            // View rows carry the service code — attribute days to the exact code.
            if (r.service_code && r.service_code !== code.service_code) continue;
            const d = new Date(r.record_date + "T00:00:00");
            if (periodStart && d < periodStart) continue;
            if (periodEnd && d > periodEnd) continue;
            set.add(r.record_date);
          }
          used = set.size;
        } else {
          for (const r of tsRows) {
            if (r.client_id !== c.id || !r.clock_out_timestamp) continue;
            if (r.service_type_code !== code.service_code) continue;
            const inT = new Date(r.clock_in_timestamp);
            if (periodStart && inT < periodStart) continue;
            if (periodEnd && inT > periodEnd) continue;
            // Per-entry rounding; the bucket sums entry units, never re-rounds.
            used += computeEntryUnits(r.clock_in_timestamp, r.clock_out_timestamp);
          }
        }
        totalUsed += used;
        if (annual > 0 && used / annual >= 0.9) flagged += 1;
      }

      return {
        client: c,
        code_count: clientCodes.length,
        total_annual_units: totalAnnual,
        total_used_units: totalUsed,
        remaining_units: Math.max(0, totalAnnual - totalUsed),
        pct: totalAnnual > 0 ? (totalUsed / totalAnnual) * 100 : 0,
        renewal: latestEnd,
        flagged_codes: flagged,
      };
    });
  }, [codes, clientsQ.data, usageQ.data]);

  const blocked = (usageQ.data?.blocked ?? []) as Array<{
    client_id: string | null;
    record_date: string | null;
    service_code: string | null;
    blocked_reason: string | null;
  }>;

  return (
    <div className="space-y-4">
      {blocked.length > 0 && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex cursor-default items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2 py-1 text-xs text-muted-foreground">
                <CalendarX2 className="h-3.5 w-3.5" />
                {blocked.length} blocked day{blocked.length === 1 ? "" : "s"} (not billable)
              </span>
            </TooltipTrigger>
            <TooltipContent className="max-w-sm">
              <p className="mb-1 font-medium">Blocked daily-rate days</p>
              <ul className="max-h-48 space-y-0.5 overflow-y-auto text-xs">
                {blocked.slice(0, 30).map((b, i) => (
                  <li key={i}>
                    {b.record_date ?? "—"}{b.service_code ? ` · ${b.service_code}` : ""} — {b.blocked_reason ?? "Not billable"}
                  </li>
                ))}
                {blocked.length > 30 && <li>…and {blocked.length - 30} more</li>}
              </ul>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
      <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
        <table className="w-full min-w-[820px] text-sm max-md:[&_th:first-child]:sticky max-md:[&_th:first-child]:left-0 max-md:[&_th:first-child]:z-10 max-md:[&_th:first-child]:bg-card max-md:[&_td:first-child]:sticky max-md:[&_td:first-child]:left-0 max-md:[&_td:first-child]:bg-card">
          <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Client</th>
              <th className="px-3 py-2">Medicaid ID</th>
              <th className="px-3 py-2">Codes</th>
              <th className="px-3 py-2 text-right">Annual units</th>
              <th className="px-3 py-2 text-right">Used</th>
              <th className="px-3 py-2 text-right">Remaining (units · hrs)</th>
              <th className="px-3 py-2">Renewal</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {summary.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-6 text-center text-muted-foreground">
                  No clients yet — add clients and their authorized billing codes to begin.
                </td>
              </tr>
            ) : summary.map((s) => (
              <tr key={s.client.id} className="border-t border-border hover:bg-muted/30">
                <td className="px-3 py-2 font-medium">
                  {s.client.last_name}, {s.client.first_name}
                </td>
                <td className="px-3 py-2 font-mono text-xs">{s.client.medicaid_id ?? "—"}</td>
                <td className="px-3 py-2 tabular-nums">{s.code_count}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtUnits(s.total_annual_units)}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  <span className={s.pct >= 100 ? "font-semibold text-[#dc2626]" : s.pct >= 90 ? "font-semibold text-[#b45309]" : ""}>
                    {fmtUnits(s.total_used_units)}
                  </span>
                  <span className="ml-1 text-xs text-muted-foreground">({s.pct.toFixed(0)}%)</span>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {fmtUnits(s.remaining_units)} · {fmtHours(unitsToHours(s.remaining_units))} hr
                </td>
                <td className="px-3 py-2">
                  {s.renewal ? (
                    <span className="inline-flex items-center gap-1">
                      {s.renewal.toLocaleDateString()}
                      {s.flagged_codes > 0 ? (
                        <AlertTriangle className="h-3.5 w-3.5 text-[#b45309]" aria-label="Codes near cap" />
                      ) : (
                        <CheckCircle2 className="h-3.5 w-3.5 text-[#15a06a]" />
                      )}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  <Link
                    to="/dashboard/billing/$clientId"
                    params={{ clientId: s.client.id }}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm font-medium text-[#d97a1c] hover:bg-[#fde9c8]"
                  >
                    Open <ChevronRight className="h-4 w-4" />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted-foreground">
        Hours rounded to 1 decimal in detail views · Units shown as whole numbers · 1 unit = 15 min for quarter-hour (Q) codes.
      </p>
    </div>
  );
}
