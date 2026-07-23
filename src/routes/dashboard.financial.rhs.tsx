import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useCurrentOrg } from "@/hooks/use-org";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Home, Info } from "lucide-react";
import { fmtUSD } from "@/lib/billing-units";
import { TooltipProvider } from "@/components/ui/tooltip";
import { RequirePermission } from "@/components/rbac-guard";
import { getRhsCodes, getRhsClients, getRhsDays } from "@/lib/financial-rhs.functions";

/**
 * Financial → RHS tab. Mirrors the Host Home tab structure but lean:
 * RHS is a TNS-staffed residential daily-rate code with no host/HHP layer,
 * so only Days × Rate = $ — no Activities / Room & Board / margin column.
 * Data source mirrors HHS exactly: hhs_daily_records_v filtered to RHS,
 * rate from client_billing_codes.rate_per_unit (service_code='RHS').
 */
export const Route = createFileRoute("/dashboard/financial/rhs")({
  head: () => ({ meta: [{ title: "RHS — HIVE" }] }),
  component: () => (
    <RequirePermission perm="view_financial_rhs">
      <RhsPage />
    </RequirePermission>
  ),
});

type ClientLite = { id: string; first_name: string; last_name: string };

function RhsPage() {
  const { data: org } = useCurrentOrg();
  const today = new Date();
  const [month, setMonth] = useState({ y: today.getFullYear(), m: today.getMonth() });

  const monthStart = useMemo(() => new Date(month.y, month.m, 1), [month]);
  const monthEndExclusive = useMemo(() => new Date(month.y, month.m + 1, 1), [month]);
  const monthStartIso = monthStart.toISOString().slice(0, 10);
  const monthEndIso = monthEndExclusive.toISOString().slice(0, 10);
  const monthLabel = monthStart.toLocaleString(undefined, { month: "long", year: "numeric" });

  const fnCodes = useServerFn(getRhsCodes);
  const fnClients = useServerFn(getRhsClients);
  const fnDays = useServerFn(getRhsDays);

  // RHS authorizations (one row per client × RHS code) — drives client list + rate.
  // Scoped to the viewed month so codes that haven't started yet, or that
  // already ended, don't linger on the page or win the rate lookup below.
  const rhsCodesQ = useQuery({
    enabled: !!org?.organization_id,
    queryKey: ["rhs-codes", org?.organization_id, monthStartIso, monthEndIso],
    queryFn: async () => fnCodes({ data: { organizationId: org!.organization_id, monthStartIso, monthEndIso } }),
  });

  const clientIds = useMemo(
    () => Array.from(new Set((rhsCodesQ.data ?? []).map((r) => r.client_id))),
    [rhsCodesQ.data],
  );

  const clientsQ = useQuery({
    enabled: !!org?.organization_id && clientIds.length > 0,
    queryKey: ["rhs-clients", org?.organization_id, clientIds.join(",")],
    queryFn: async (): Promise<ClientLite[]> => fnClients({ data: { organizationId: org!.organization_id, clientIds } }),
  });

  // Billable RHS days per client for this month — same view + billable logic as HHS
  const daysQ = useQuery({
    enabled: !!org?.organization_id && clientIds.length > 0,
    queryKey: ["rhs-days", org?.organization_id, month.y, month.m],
    queryFn: async () => fnDays({ data: { organizationId: org!.organization_id, monthStartIso, monthEndIso } }),
  });

  const rateByClient = useMemo(() => {
    const map: Record<string, number> = {};
    for (const r of rhsCodesQ.data ?? []) map[r.client_id] = Number(r.rate_per_unit) || 0;
    return map;
  }, [rhsCodesQ.data]);

  const rows = useMemo(() => {
    return (clientsQ.data ?? []).map((c) => {
      const days = daysQ.data?.[c.id] ?? 0;
      const rate = rateByClient[c.id] ?? 0;
      const dollars = days * rate;
      return { client: c, days, rate, dollars };
    });
  }, [clientsQ.data, daysQ.data, rateByClient]);

  const totals = useMemo(
    () => rows.reduce(
      (a, r) => ({ days: a.days + r.days, dollars: a.dollars + r.dollars }),
      { days: 0, dollars: 0 },
    ),
    [rows],
  );

  const prevMonth = () => setMonth((p) => (p.m === 0 ? { y: p.y - 1, m: 11 } : { y: p.y, m: p.m - 1 }));
  const nextMonth = () => setMonth((p) => (p.m === 11 ? { y: p.y + 1, m: 0 } : { y: p.y, m: p.m + 1 }));

  return (
    <TooltipProvider>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center gap-2">
            <Home className="h-5 w-5 text-primary" />
            <div>
              <h2 className="text-lg font-semibold">RHS — Monthly Economics</h2>
              <p className="text-xs text-muted-foreground">
                Residential daily-rate. Billable RHS days × per-client rate from the rate store.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={prevMonth}><ChevronLeft className="h-4 w-4" /></Button>
            <div className="min-w-[140px] text-center font-medium">{monthLabel}</div>
            <Button variant="outline" size="sm" onClick={nextMonth}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Client</th>
                <th className="px-3 py-2 text-right">Days / Mo</th>
                <th className="px-3 py-2 text-right">RHS daily rate</th>
                <th className="px-3 py-2 text-right">RHS $</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.length === 0 && (
                <tr><td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">No RHS clients found.</td></tr>
              )}
              {rows.map((r) => (
                <tr key={r.client.id} className="hover:bg-muted/30">
                  <td className="px-3 py-2 font-medium">{r.client.first_name} {r.client.last_name}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.days}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{fmtUSD(r.rate)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtUSD(r.dollars)}</td>
                </tr>
              ))}
            </tbody>
            {rows.length > 0 && (
              <tfoot className="bg-muted/30 font-medium">
                <tr>
                  <td className="px-3 py-2">Totals</td>
                  <td className="px-3 py-2 text-right">{totals.days}</td>
                  <td className="px-3 py-2 text-right text-muted-foreground">—</td>
                  <td className="px-3 py-2 text-right">{fmtUSD(totals.dollars)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <div>
            <strong>Days / Mo</strong> = billable RHS records from <code>hhs_daily_records_v</code> (same billable rule as HHS: attendance Present + daily note) — read-only. <strong>RHS daily rate</strong> from <code>client_billing_codes.rate_per_unit</code> (RHS) — edit in the per-client billing codes editor, not here.
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
