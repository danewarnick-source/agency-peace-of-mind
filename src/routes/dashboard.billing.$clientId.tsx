import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-org";
import { useAllClientBillingCodes, type ClientBillingCode } from "@/hooks/use-client-billing-codes";
import { useClientBudget, type CodeBudget } from "@/hooks/use-client-budget";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { fmtHours, fmtUnits, unitsToHours, UNITS_PER_HOUR } from "@/lib/billing-units";
import { isDailyServiceCode } from "@/lib/service-billing";
import { ArrowLeft, Plus, Trash2, AlertTriangle, CheckCircle2, Clock, CalendarDays, History, ChevronDown, ChevronRight } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { listRateHistory, type RateHistoryRow } from "@/lib/billing-rates.functions";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { getAuthStatus, AuthStatusBadge } from "@/lib/billing-auth-status";

export const Route = createFileRoute("/dashboard/billing/$clientId")({
  head: () => ({ meta: [{ title: "Client Billing — HIVE" }] }),
  component: ClientBillingDetail,
});

type ClientRow = { id: string; first_name: string; last_name: string; medicaid_id: string | null };
type Draft = Partial<ClientBillingCode> & { service_code: string };

function ClientBillingDetail() {
  const { clientId } = Route.useParams();
  const { data: org } = useCurrentOrg();
  const router = useRouter();
  const { data: allCodes, refetch } = useAllClientBillingCodes();
  const { data: budgets } = useClientBudget(clientId);

  const clientQ = useQuery({
    enabled: !!org?.organization_id && !!clientId,
    queryKey: ["billing-client", org?.organization_id, clientId],
    queryFn: async (): Promise<ClientRow | null> => {
      const { data, error } = await supabase
        .from("clients")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .select("id, first_name, last_name, medicaid_id" as any)
        .eq("organization_id", org!.organization_id)
        .eq("id", clientId)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as unknown as ClientRow | null;
    },
  });

  const codes = (allCodes ?? []).filter((c) => c.client_id === clientId);

  const [newRow, setNewRow] = useState<Draft>({
    service_code: "",
    unit_type: "Q",
    rate_per_unit: 0,
    annual_unit_authorization: 0,
  });

  const upsert = async (row: Draft) => {
    if (!org?.organization_id || !clientId) return;
    if (!row.service_code) return toast.error("Service code required");
    const start = row.service_start_date || null;
    const end = row.service_end_date || null;
    if (!end) return toast.error("End date is required for every authorization");
    if (start && new Date(end) <= new Date(start)) {
      return toast.error("End date must be after the start date");
    }
    const payload = {
      organization_id: org.organization_id,
      client_id: clientId,
      service_code: row.service_code.toUpperCase(),
      unit_type: row.unit_type ?? "Q",
      rate_per_unit: Number(row.rate_per_unit ?? 0),
      annual_unit_authorization: Number(row.annual_unit_authorization ?? 0),
      monthly_max_units:
        row.monthly_max_units == null || (row.monthly_max_units as unknown) === ""
          ? null
          : Number(row.monthly_max_units),
      weekly_cap_units:
        row.weekly_cap_units == null || (row.weekly_cap_units as unknown) === ""
          ? null
          : Number(row.weekly_cap_units),
      service_start_date: start,
      service_end_date: end,
      sce: row.sce || null,
      provider_approver_email: row.provider_approver_email || null,
    };
    const { error } = await supabase
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from("client_billing_codes" as any)
      .upsert(payload, { onConflict: "organization_id,client_id,service_code" });
    if (error) return toast.error(error.message);
    toast.success("Saved");
    refetch();
  };

  const remove = async (id: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await supabase.from("client_billing_codes" as any).delete().eq("id", id);
    if (error) return toast.error(error.message);
    refetch();
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-2">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link to="/dashboard/billing">Billing</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>
                {clientQ.data ? `${clientQ.data.last_name}, ${clientQ.data.first_name}` : "Client"}
              </BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <div>
          <Button variant="ghost" size="sm" className="h-8 px-2 text-muted-foreground hover:text-foreground" onClick={() => window.history.length > 1 ? router.history.back() : router.navigate({ to: "/dashboard/billing" })}>
            <ArrowLeft className="mr-1 h-4 w-4" /> Back to Billing
          </Button>
        </div>
      </div>


      <header className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <h2 className="font-display text-xl font-bold">
          {clientQ.data ? `${clientQ.data.last_name}, ${clientQ.data.first_name}` : "—"}
        </h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Medicaid ID: <span className="font-mono">{clientQ.data?.medicaid_id ?? "—"}</span>
        </p>
      </header>

      {/* Ongoing budget cards */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-base font-semibold">Ongoing budget — units used vs remaining</h3>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {(budgets ?? []).length === 0 && (
            <div className="md:col-span-2 rounded-xl border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">
              No authorized codes yet. Add one below.
            </div>
          )}
          {(budgets ?? []).map((b) => (
            <BudgetCard key={b.code.id} b={b} />
          ))}
        </div>
      </section>

      {/* Codes ledger */}
      <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-display text-base font-semibold">Authorized billing codes</h3>
            <p className="text-xs text-muted-foreground">
              Quarter-hour codes (1 unit = 15 min) plus daily codes. Period dates set the client's per-code renewal window.
            </p>
          </div>
        </header>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] text-sm">
            <thead className="text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="p-2">Code</th>
                <th className="p-2">Rate / unit</th>
                <th className="p-2">Annual units</th>
                <th className="p-2">Monthly max</th>
                <th className="p-2">Weekly cap (u)</th>
                <th className="p-2">Period start</th>
                <th className="p-2">Renewal date</th>
                <th className="p-2">SCE</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {codes.map((row) => (
                <tr key={row.id} className="border-t border-border">
                  <td className="p-2 font-mono font-semibold">
                    {row.service_code}
                    {isDailyServiceCode(row.service_code) ? (
                      <span className="ml-1 rounded bg-[#fde9c8] px-1 py-0.5 text-[10px] font-bold text-[#7a4308]">DAILY</span>
                    ) : (
                      <span className="ml-1 rounded bg-[#e1efff] px-1 py-0.5 text-[10px] font-bold text-[#11498e]">Q</span>
                    )}
                  </td>
                  <td className="p-2">
                    <Input type="number" step="0.01" defaultValue={row.rate_per_unit}
                      onBlur={(e) => upsert({ ...row, rate_per_unit: Number(e.target.value) })}
                      className="h-8 w-24" />
                  </td>
                  <td className="p-2">
                    <Input type="number" defaultValue={row.annual_unit_authorization}
                      onBlur={(e) => upsert({ ...row, annual_unit_authorization: Number(e.target.value) })}
                      className="h-8 w-28" />
                  </td>
                  <td className="p-2">
                    <Input type="number" defaultValue={row.monthly_max_units ?? ""}
                      onBlur={(e) => upsert({ ...row, monthly_max_units: e.target.value === "" ? null : Number(e.target.value) })}
                      className="h-8 w-24" />
                  </td>
                  <td className="p-2">
                    <Input type="number" defaultValue={row.weekly_cap_units ?? ""}
                      onBlur={(e) => upsert({ ...row, weekly_cap_units: e.target.value === "" ? null : Number(e.target.value) })}
                      className="h-8 w-24" />
                  </td>
                  <td className="p-2">
                    <Input type="date" defaultValue={row.service_start_date ?? ""}
                      onBlur={(e) => upsert({ ...row, service_start_date: e.target.value || null })}
                      className="h-8 w-36" />
                  </td>
                  <td className="p-2">
                    <Input type="date" defaultValue={row.service_end_date ?? ""}
                      onBlur={(e) => upsert({ ...row, service_end_date: e.target.value || null })}
                      className="h-8 w-36" />
                  </td>
                  <td className="p-2">
                    <Input defaultValue={row.sce ?? ""}
                      onBlur={(e) => upsert({ ...row, sce: e.target.value || null })}
                      className="h-8 w-24" />
                  </td>
                  <td className="p-2">
                    <div className="flex items-center gap-1">
                      <RateHistoryButton clientId={row.client_id} serviceCode={row.service_code} />
                      <Button size="icon" variant="ghost" onClick={() => remove(row.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              <tr className="border-t border-border bg-muted/30">
                <td className="p-2">
                  <Input placeholder="DSI / HHS / …" value={newRow.service_code}
                    onChange={(e) => setNewRow({ ...newRow, service_code: e.target.value })}
                    className="h-8 w-28 uppercase" />
                </td>
                <td className="p-2"><Input type="number" step="0.01" className="h-8 w-24"
                  value={newRow.rate_per_unit ?? 0}
                  onChange={(e) => setNewRow({ ...newRow, rate_per_unit: Number(e.target.value) })} /></td>
                <td className="p-2"><Input type="number" className="h-8 w-28"
                  value={newRow.annual_unit_authorization ?? 0}
                  onChange={(e) => setNewRow({ ...newRow, annual_unit_authorization: Number(e.target.value) })} /></td>
                <td className="p-2"><Input type="number" className="h-8 w-24"
                  value={newRow.monthly_max_units ?? ""}
                  onChange={(e) => setNewRow({ ...newRow, monthly_max_units: e.target.value === "" ? null : Number(e.target.value) })} /></td>
                <td className="p-2"><Input type="number" className="h-8 w-24"
                  value={newRow.weekly_cap_units ?? ""}
                  onChange={(e) => setNewRow({ ...newRow, weekly_cap_units: e.target.value === "" ? null : Number(e.target.value) })} /></td>
                <td className="p-2"><Input type="date" className="h-8 w-36"
                  value={newRow.service_start_date ?? ""}
                  onChange={(e) => setNewRow({ ...newRow, service_start_date: e.target.value || null })} /></td>
                <td className="p-2"><Input type="date" className="h-8 w-36"
                  value={newRow.service_end_date ?? ""}
                  onChange={(e) => setNewRow({ ...newRow, service_end_date: e.target.value || null })} /></td>
                <td className="p-2"><Input className="h-8 w-24"
                  value={newRow.sce ?? ""}
                  onChange={(e) => setNewRow({ ...newRow, sce: e.target.value })} /></td>
                <td className="p-2">
                  <Button size="sm" onClick={async () => {
                    await upsert(newRow);
                    setNewRow({ service_code: "", unit_type: "Q", rate_per_unit: 0, annual_unit_authorization: 0 });
                  }}>
                    <Plus className="h-4 w-4" /> Add
                  </Button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Unit type Q = {UNITS_PER_HOUR} units/hr · Period dates define the per-client renewal window used by the calculator.
        </p>
      </section>
    </div>
  );
}

function RateHistoryButton({ clientId, serviceCode }: { clientId: string; serviceCode: string }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<RateHistoryRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const fetchHistory = useServerFn(listRateHistory);

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetchHistory({ data: { clientId, serviceCode } });
      setRows(r);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o && rows === null) load(); }}>
      <PopoverTrigger asChild>
        <Button size="icon" variant="ghost" title="Rate history">
          <History className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="end">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
          {serviceCode} — prior rates
        </div>
        {loading && <p className="text-xs text-muted-foreground">Loading…</p>}
        {!loading && rows !== null && rows.length === 0 && (
          <p className="text-xs text-muted-foreground">No prior versions. The current rate is the original.</p>
        )}
        {!loading && rows && rows.length > 0 && (
          <ul className="space-y-2 max-h-64 overflow-y-auto">
            {rows.map((h) => (
              <li key={h.id} className="rounded border border-border p-2 text-xs">
                <div className="flex items-center justify-between font-mono">
                  <span className="font-bold">${Number(h.rate_per_unit).toFixed(4)} / {h.unit_type}</span>
                  <span className="text-muted-foreground">superseded {new Date(h.superseded_at).toLocaleDateString()}</span>
                </div>
                <div className="mt-1 text-muted-foreground">
                  Effective: {h.effective_start ?? "—"} → {h.effective_end ?? "—"}
                </div>
                {h.rate_source && (
                  <div className="mt-0.5 text-muted-foreground">
                    Source: {h.rate_source}{h.rate_source_plan_number ? ` · plan ${h.rate_source_plan_number}` : ""}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}

function BudgetCard({ b }: { b: CodeBudget }) {
  const Icon = b.is_daily ? CalendarDays : Clock;
  const annual = b.code.annual_unit_authorization ?? 0;
  const annualHours = b.is_daily ? 0 : unitsToHours(annual);
  const usedLabel = b.is_daily
    ? `${fmtUnits(b.used_units)} of ${fmtUnits(annual)} days`
    : `${fmtUnits(b.used_units)} u · ${fmtHours(b.used_hours)} hr of ${fmtUnits(annual)} u · ${fmtHours(annualHours)} hr`;
  const remainLabel = b.is_daily
    ? `${fmtUnits(b.remaining_units)} day${b.remaining_units === 1 ? "" : "s"} left`
    : `${fmtUnits(b.remaining_units)} u · ${fmtHours(b.remaining_hours)} hr left`;

  const toneBar =
    b.status === "exhausted" || b.status === "expired" || b.used_pct >= 100
      ? "bg-[#dc2626]"
      : b.used_pct >= 90
        ? "bg-[#f59324]"
        : "bg-[#15a06a]";
  const toneText =
    b.status === "exhausted" || b.status === "expired" || b.used_pct >= 100
      ? "text-[#991b1b]"
      : b.used_pct >= 90
        ? "text-[#7a4308]"
        : "text-[#0d5c3d]";

  return (
    <article className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <header className="flex items-center justify-between gap-2">
        <div className="inline-flex items-center gap-2">
          <Icon className="h-4 w-4 text-[color:var(--amber-700,#d97a1c)]" />
          <span className="font-mono text-sm font-bold">{b.code.service_code}</span>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
            {b.is_daily ? "Daily" : "Q · 15 min"}
          </span>
        </div>
        <span className={`text-xs font-bold ${toneText}`}>{b.used_pct.toFixed(0)}%</span>
      </header>

      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
        <div className={`h-full ${toneBar}`} style={{ width: `${Math.min(100, b.used_pct)}%` }} />
      </div>
      <div className="mt-2 flex flex-col gap-0.5 text-xs tabular-nums text-muted-foreground">
        <span><span className="font-semibold text-foreground">Used:</span> {usedLabel}</span>
        <span><span className="font-semibold text-foreground">Remaining:</span> {remainLabel}</span>
        <span>
          <span className="font-semibold text-foreground">Renewal:</span>{" "}
          {b.period_end ? b.period_end.toLocaleDateString() : "— (no end date set)"}{" "}
          {b.period_end ? `· ${Math.max(0, b.days_to_renewal)} days / ${b.weeks_to_renewal.toFixed(1)} wks` : ""}
        </span>
      </div>

      {/* Calculator */}
      <div className="mt-3 rounded-lg border border-border bg-background/60 p-3">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Budget calculator</h4>
        {b.status === "no_period" && (
          <p className="mt-1 text-xs text-muted-foreground">Set a renewal date above to compute weekly pace targets.</p>
        )}
        {b.status === "expired" && (
          <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-[#991b1b]">
            <AlertTriangle className="h-3.5 w-3.5" /> Authorization period ended {Math.abs(b.days_to_renewal)} day{Math.abs(b.days_to_renewal) === 1 ? "" : "s"} ago.
          </p>
        )}
        {b.status === "exhausted" && (
          <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-[#991b1b]">
            <AlertTriangle className="h-3.5 w-3.5" /> Budget fully utilized. {b.used_units > annual ? `Over by ${fmtUnits(b.used_units - annual)} u.` : ""}
          </p>
        )}
        {(b.status === "ok" || b.status === "under" || b.status === "over") && (
          <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs tabular-nums">
            <dt className="text-muted-foreground">Hrs/week needed</dt>
            <dd className="text-right font-mono font-bold text-foreground">
              {b.is_daily ? `${b.hours_per_week_target.toFixed(1)} days/wk` : `${b.hours_per_week_target.toFixed(1)} hr/wk`}
            </dd>
            <dt className="text-muted-foreground">Current pace</dt>
            <dd className="text-right font-mono text-foreground">
              {b.is_daily ? `${b.weekly_pace_hours.toFixed(1)} days/wk` : `${b.weekly_pace_hours.toFixed(1)} hr/wk`}
            </dd>
            {b.code.weekly_cap_units != null && !b.is_daily && (
              <>
                <dt className="text-muted-foreground">Weekly cap</dt>
                <dd className="text-right font-mono text-foreground">
                  {fmtHours(unitsToHours(b.code.weekly_cap_units))} hr/wk
                </dd>
              </>
            )}
          </dl>
        )}
        {b.status === "under" && (
          <p className="mt-2 flex items-center gap-1 text-xs font-semibold text-[#7a4308]">
            <AlertTriangle className="h-3.5 w-3.5" /> Under-utilizing — at current pace, budget will not be exhausted by renewal.
          </p>
        )}
        {b.status === "over" && (
          <p className="mt-2 flex items-center gap-1 text-xs font-semibold text-[#991b1b]">
            <AlertTriangle className="h-3.5 w-3.5" /> Over-utilizing — projected to exhaust before renewal.
          </p>
        )}
        {b.status === "ok" && (
          <p className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[#0d5c3d]">
            <CheckCircle2 className="h-3.5 w-3.5" /> On pace.
          </p>
        )}
      </div>
    </article>
  );
}
