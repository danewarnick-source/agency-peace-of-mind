import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-org";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, Users2, Info } from "lucide-react";
import { unitsToHours, fmtHours, fmtUSD } from "@/lib/billing-units";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { RequirePermission } from "@/components/rbac-guard";
import { toast } from "sonner";
import {
  getEmpEvv,
  getEmpHhp,
  getEmpHostSettings,
  getEmpHhsDays,
  getEmpClients,
  getEmpStaff,
  getEmpInputs,
} from "@/lib/financial-employees.functions";

/**
 * Financial → Employees tab. Mirrors Contractors but:
 *  - Filters profiles to worker_type = 'w2' (Contractors = '1099').
 *  - STRICTLY gross payroll: hours × rate (+ HHS/RHS if HHP, + Additional).
 *  - NO net pay, NO fed/state/FICA tax columns. HIVE never holds W2 net.
 * Reuses the same EVV sum, HHP detection, and Host Home rate sources as
 * Contractors so there is one source of truth.
 */
export const Route = createFileRoute("/dashboard/financial/employees")({
  head: () => ({ meta: [{ title: "Employees — HIVE" }] }),
  component: () => (
    <RequirePermission perm="view_financial_employees">
      <EmployeesPage />
    </RequirePermission>
  ),
});

type ProfileLite = { id: string; first_name: string | null; last_name: string | null; full_name: string | null; hourly_rate: number | null; worker_type: string | null };

function EmployeesPage() {
  const { data: org } = useCurrentOrg();
  const qc = useQueryClient();
  const today = new Date();
  const [month, setMonth] = useState({ y: today.getFullYear(), m: today.getMonth() });

  const monthStart = useMemo(() => new Date(month.y, month.m, 1), [month]);
  const monthEndExclusive = useMemo(() => new Date(month.y, month.m + 1, 1), [month]);
  const monthStartIso = monthStart.toISOString();
  const monthEndIso = monthEndExclusive.toISOString();
  const monthStartDateIso = monthStart.toISOString().slice(0, 10);
  const monthEndDateIso = monthEndExclusive.toISOString().slice(0, 10);
  const monthLabel = monthStart.toLocaleString(undefined, { month: "long", year: "numeric" });

  const fnEvv = useServerFn(getEmpEvv);
  const fnHhp = useServerFn(getEmpHhp);
  const fnHostSettings = useServerFn(getEmpHostSettings);
  const fnHhsDays = useServerFn(getEmpHhsDays);
  const fnClients = useServerFn(getEmpClients);
  const fnStaff = useServerFn(getEmpStaff);
  const fnInputs = useServerFn(getEmpInputs);

  // EVV hours (same source as Contractors / Tab A)
  const evvQ = useQuery({
    enabled: !!org?.organization_id,
    queryKey: ["emp-evv", org?.organization_id, month.y, month.m],
    queryFn: async () => fnEvv({ data: { organizationId: org!.organization_id, monthStartIso, monthEndIso } }),
  });

  // HHP per (staff, client): same detection as Contractors
  const hhpQ = useQuery({
    enabled: !!org?.organization_id,
    queryKey: ["emp-hhp", org?.organization_id],
    queryFn: async () => fnHhp({ data: { organizationId: org!.organization_id } }),
  });

  const hostSettingsQ = useQuery({
    enabled: !!org?.organization_id,
    queryKey: ["emp-host-settings", org?.organization_id],
    queryFn: async () => fnHostSettings({ data: { organizationId: org!.organization_id } }),
  });

  const hhsDaysQ = useQuery({
    enabled: !!org?.organization_id,
    queryKey: ["emp-hhs-days", org?.organization_id, month.y, month.m],
    queryFn: async () => fnHhsDays({ data: { organizationId: org!.organization_id, monthStartDateIso, monthEndDateIso } }),
  });

  const clientsQ = useQuery({
    enabled: !!org?.organization_id,
    queryKey: ["emp-clients", org?.organization_id],
    queryFn: async () => fnClients({ data: { organizationId: org!.organization_id } }),
  });

  // W2 staff only
  const staffQ = useQuery({
    enabled: !!org?.organization_id,
    queryKey: ["emp-staff-w2", org?.organization_id],
    queryFn: async (): Promise<ProfileLite[]> => fnStaff({ data: { organizationId: org!.organization_id } }),
  });

  // Additional pay only — reuse contractor_monthly_pay.additional_pay column
  // (per-staff/per-month). Tax/net columns are ignored on this tab.
  const inputsQ = useQuery({
    enabled: !!org?.organization_id,
    queryKey: ["emp-inputs", org?.organization_id, month.y, month.m],
    queryFn: async () => fnInputs({ data: { organizationId: org!.organization_id, year: month.y, month: month.m + 1 } }),
  });

  const saveAdditional = useMutation({
    mutationFn: async (vars: { staff_id: string; additional_pay: number }) => {
      const { error } = await supabase
        .from("contractor_monthly_pay" as never)
        .upsert(
          {
            organization_id: org!.organization_id,
            staff_id: vars.staff_id,
            year: month.y,
            month: month.m + 1,
            additional_pay: vars.additional_pay,
          } as never,
          { onConflict: "organization_id,staff_id,year,month" },
        );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["emp-inputs", org?.organization_id, month.y, month.m] });
      toast.success("Saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = useMemo(() => {
    const staff = staffQ.data ?? [];
    const evv = evvQ.data ?? {};
    const hhp = hhpQ.data ?? {};
    const days = hhsDaysQ.data ?? {};
    const hostRate = hostSettingsQ.data ?? {};
    const clients = clientsQ.data ?? {};
    const additional = inputsQ.data ?? {};

    return staff
      .map((s) => {
        const units = evv[s.id] ?? 0;
        const hours = unitsToHours(units);
        const rate = Number(s.hourly_rate ?? 0);
        const dspGross = hours * rate;
        const hhpClientIds = hhp[s.id] ?? [];
        const hhsPay = hhpClientIds.reduce((acc, cid) => acc + (days[cid] ?? 0) * (hostRate[cid] ?? 0), 0);
        const add = Number(additional[s.id] ?? 0);
        const total = dspGross + hhsPay + add;
        const name = (s.full_name && s.full_name.trim()) || `${s.first_name ?? ""} ${s.last_name ?? ""}`.trim() || "—";
        const hhpClientNames = hhpClientIds.map((id) => clients[id]).filter(Boolean) as string[];
        return { staff: s, name, hours, rate, dspGross, hhsPay, additional: add, total, hhpClientNames };
      })
      .filter((r) => r.hours > 0 || r.dspGross > 0 || r.hhsPay > 0 || r.additional > 0 || r.hhpClientNames.length > 0)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [staffQ.data, evvQ.data, hhpQ.data, hhsDaysQ.data, hostSettingsQ.data, clientsQ.data, inputsQ.data]);

  const totals = useMemo(
    () =>
      rows.reduce(
        (a, r) => ({
          hours: a.hours + r.hours,
          dsp: a.dsp + r.dspGross,
          hhs: a.hhs + r.hhsPay,
          add: a.add + r.additional,
          total: a.total + r.total,
        }),
        { hours: 0, dsp: 0, hhs: 0, add: 0, total: 0 },
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
            <Users2 className="h-5 w-5 text-primary" />
            <div>
              <h2 className="text-lg font-semibold">Employees — Monthly Gross Payroll (W2)</h2>
              <p className="text-xs text-muted-foreground">
                Gross = EVV hours × rate (auto). HHS pay pulls from Host Home when HHP. No taxes, no net pay — W2 net lives in your payroll provider.
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
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Employee</th>
                <th className="px-3 py-2 text-right">DSP hrs</th>
                <th className="px-3 py-2 text-right">Rate</th>
                <th className="px-3 py-2 text-right">Gross pay</th>
                <th className="px-3 py-2 text-right">HHS pay</th>
                <th className="px-3 py-2 text-right">Additional</th>
                <th className="px-3 py-2 text-right">Monthly total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.length === 0 && (
                <tr><td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">No W2 employees with hours or pay this month.</td></tr>
              )}
              {rows.map((r) => (
                <EmployeeRow
                  key={r.staff.id}
                  r={r}
                  onSave={(additional_pay) =>
                    saveAdditional.mutate({ staff_id: r.staff.id, additional_pay })
                  }
                />
              ))}
            </tbody>
            {rows.length > 0 && (
              <tfoot className="bg-muted/30 font-medium">
                <tr>
                  <td className="px-3 py-2">Totals</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtHours(totals.hours)}</td>
                  <td className="px-3 py-2 text-right text-muted-foreground">—</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtUSD(totals.dsp)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtUSD(totals.hhs)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtUSD(totals.add)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtUSD(totals.total)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <div>
            <strong>Employees</strong> = profiles where <code>worker_type = 'w2'</code>. <strong>DSP hrs</strong> = same EVV sum used by Contractors / Tab A (per-entry quarter-hour rounding). <strong>Rate</strong> from <code>profiles.hourly_rate</code>. <strong>Gross</strong> = hrs × rate. <strong>HHS pay</strong> applies when the employee is an HHP (CMP/CMS assignment) — Σ billable HHS days × Host daily rate. <strong>Additional</strong> is provider-entered. Strictly gross; W2 net & taxes live in your payroll provider.
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}

type RowT = {
  staff: ProfileLite; name: string; hours: number; rate: number; dspGross: number;
  hhsPay: number; additional: number; total: number; hhpClientNames: string[];
};

function EmployeeRow({ r, onSave }: { r: RowT; onSave: (additional_pay: number) => void }) {
  const [additional, setAdditional] = useState(String(r.additional || ""));
  useEffect(() => { setAdditional(String(r.additional || "")); }, [r.additional]);

  return (
    <tr className="hover:bg-muted/30">
      <td className="px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{r.name}</span>
          <Badge variant="outline" className="text-[10px] uppercase tracking-wide">W2</Badge>
          {r.hhpClientNames.map((cn) => (
            <Tooltip key={cn}>
              <TooltipTrigger asChild>
                <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">HHP · {cn}</Badge>
              </TooltipTrigger>
              <TooltipContent>Host Home Provider for {cn} (CMP/CMS assignment)</TooltipContent>
            </Tooltip>
          ))}
        </div>
      </td>
      <td className="px-3 py-2 text-right tabular-nums">{fmtHours(r.hours)}</td>
      <td className="px-3 py-2 text-right tabular-nums">{r.rate ? fmtUSD(r.rate) : <span className="text-muted-foreground">—</span>}</td>
      <td className="px-3 py-2 text-right tabular-nums">{fmtUSD(r.dspGross)}</td>
      <td className="px-3 py-2 text-right tabular-nums">{fmtUSD(r.hhsPay)}</td>
      <td className="px-3 py-2 text-right">
        <Input
          type="number"
          step="0.01"
          value={additional}
          onChange={(e) => setAdditional(e.target.value)}
          onBlur={() => {
            const n = Number(additional || 0);
            if (n !== r.additional) onSave(n);
          }}
          className="h-8 w-24 text-right tabular-nums"
        />
      </td>
      <td className="px-3 py-2 text-right tabular-nums font-semibold">{fmtUSD(r.total)}</td>
    </tr>
  );
}
