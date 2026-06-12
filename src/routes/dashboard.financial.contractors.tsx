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
import { toast } from "sonner";
import {
  getCtrEvv,
  getCtrHhp,
  getCtrHostSettings,
  getCtrHhsDays,
  getCtrClients,
  getCtrStaff,
  getCtrInputs,
} from "@/lib/financial-contractors.functions";

export const Route = createFileRoute("/dashboard/financial/contractors")({
  head: () => ({ meta: [{ title: "Contractors — HIVE" }] }),
  component: ContractorsPage,
});

type ProfileLite = { id: string; first_name: string | null; last_name: string | null; full_name: string | null; hourly_rate: number | null };
type Inputs = {
  staff_id: string;
  additional_pay: number;
  net_pay: number;
  tax_federal: number;
  tax_state: number;
  tax_fica: number;
};

function ContractorsPage() {
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

  const fnEvv = useServerFn(getCtrEvv);
  const fnHhp = useServerFn(getCtrHhp);
  const fnHostSettings = useServerFn(getCtrHostSettings);
  const fnHhsDays = useServerFn(getCtrHhsDays);
  const fnClients = useServerFn(getCtrClients);
  const fnStaff = useServerFn(getCtrStaff);
  const fnInputs = useServerFn(getCtrInputs);

  const evvQ = useQuery({
    enabled: !!org?.organization_id,
    queryKey: ["ctr-evv", org?.organization_id, month.y, month.m],
    queryFn: async () => fnEvv({ data: { organizationId: org!.organization_id, monthStartIso, monthEndIso } }),
  });

  const hhpQ = useQuery({
    enabled: !!org?.organization_id,
    queryKey: ["ctr-hhp", org?.organization_id],
    queryFn: async () => fnHhp({ data: { organizationId: org!.organization_id } }),
  });

  const hostSettingsQ = useQuery({
    enabled: !!org?.organization_id,
    queryKey: ["ctr-host-settings", org?.organization_id],
    queryFn: async () => fnHostSettings({ data: { organizationId: org!.organization_id } }),
  });

  const hhsDaysQ = useQuery({
    enabled: !!org?.organization_id,
    queryKey: ["ctr-hhs-days", org?.organization_id, month.y, month.m],
    queryFn: async () => fnHhsDays({ data: { organizationId: org!.organization_id, monthStartDateIso, monthEndDateIso } }),
  });

  const clientsQ = useQuery({
    enabled: !!org?.organization_id,
    queryKey: ["ctr-clients", org?.organization_id],
    queryFn: async () => fnClients({ data: { organizationId: org!.organization_id } }),
  });

  const staffQ = useQuery({
    enabled: !!org?.organization_id,
    queryKey: ["ctr-staff", org?.organization_id],
    queryFn: async () => fnStaff({ data: { organizationId: org!.organization_id } }),
  });

  const inputsQ = useQuery({
    enabled: !!org?.organization_id,
    queryKey: ["ctr-inputs", org?.organization_id, month.y, month.m],
    queryFn: async () => fnInputs({ data: { organizationId: org!.organization_id, year: month.y, month: month.m + 1 } }),
  });

  const inputsByStaff = useMemo(() => {
    const map: Record<string, Inputs> = {};
    for (const r of inputsQ.data ?? []) map[r.staff_id] = r;
    return map;
  }, [inputsQ.data]);

  const saveInputs = useMutation({
    mutationFn: async (vars: Inputs) => {
      const { error } = await supabase
        .from("contractor_monthly_pay" as never)
        .upsert(
          {
            organization_id: org!.organization_id,
            staff_id: vars.staff_id,
            year: month.y,
            month: month.m + 1,
            additional_pay: vars.additional_pay,
            net_pay: vars.net_pay,
            tax_federal: vars.tax_federal,
            tax_state: vars.tax_state,
            tax_fica: vars.tax_fica,
          } as never,
          { onConflict: "organization_id,staff_id,year,month" },
        );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ctr-inputs", org?.organization_id, month.y, month.m] });
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

    return staff
      .map((s) => {
        const units = evv[s.id] ?? 0;
        const hours = unitsToHours(units);
        const rate = Number(s.hourly_rate ?? 0);
        const dspGross = hours * rate;
        const hhpClientIds = hhp[s.id] ?? [];
        const hhsPay = hhpClientIds.reduce((acc, cid) => acc + (days[cid] ?? 0) * (hostRate[cid] ?? 0), 0);
        const inp = inputsByStaff[s.id];
        const additional = Number(inp?.additional_pay ?? 0);
        const net = Number(inp?.net_pay ?? 0);
        const taxFed = Number(inp?.tax_federal ?? 0);
        const taxSt = Number(inp?.tax_state ?? 0);
        const taxFica = Number(inp?.tax_fica ?? 0);
        const total = dspGross + hhsPay + additional;
        const name = (s.full_name && s.full_name.trim()) || `${s.first_name ?? ""} ${s.last_name ?? ""}`.trim() || "—";
        const hhpClientNames = hhpClientIds.map((id) => clients[id]).filter(Boolean) as string[];
        return { staff: s, name, hours, rate, dspGross, hhsPay, additional, net, taxFed, taxSt, taxFica, total, hhpClientNames };
      })
      .filter((r) => r.hours > 0 || r.dspGross > 0 || r.hhsPay > 0 || r.additional > 0 || r.net > 0 || r.hhpClientNames.length > 0)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [staffQ.data, evvQ.data, hhpQ.data, hhsDaysQ.data, hostSettingsQ.data, clientsQ.data, inputsByStaff]);

  const totals = useMemo(
    () =>
      rows.reduce(
        (a, r) => ({
          hours: a.hours + r.hours,
          dsp: a.dsp + r.dspGross,
          hhs: a.hhs + r.hhsPay,
          add: a.add + r.additional,
          net: a.net + r.net,
          taxFed: a.taxFed + r.taxFed,
          taxSt: a.taxSt + r.taxSt,
          taxFica: a.taxFica + r.taxFica,
          total: a.total + r.total,
        }),
        { hours: 0, dsp: 0, hhs: 0, add: 0, net: 0, taxFed: 0, taxSt: 0, taxFica: 0, total: 0 },
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
              <h2 className="text-lg font-semibold">Contractors — Monthly Pay</h2>
              <p className="text-xs text-muted-foreground">
                Gross = EVV hours × rate (auto). HHS pay pulls from Host Home. Net & taxes come from external payroll (input). HIVE knows gross, never net.
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
          <table className="w-full min-w-[1300px] text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Staff</th>
                <th className="px-3 py-2 text-right">DSP hrs</th>
                <th className="px-3 py-2 text-right">Rate</th>
                <th className="px-3 py-2 text-right">DSP gross</th>
                <th className="px-3 py-2 text-right">HHS pay</th>
                <th className="px-3 py-2 text-right">Additional</th>
                <th className="px-3 py-2 text-right">Net pay</th>
                <th className="px-3 py-2 text-right">Fed tax</th>
                <th className="px-3 py-2 text-right">State tax</th>
                <th className="px-3 py-2 text-right">FICA</th>
                <th className="px-3 py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.length === 0 && (
                <tr><td colSpan={11} className="px-3 py-6 text-center text-muted-foreground">No staff with hours or pay this month.</td></tr>
              )}
              {rows.map((r) => (
                <StaffRow
                  key={r.staff.id}
                  r={r}
                  onSave={(patch) =>
                    saveInputs.mutate({
                      staff_id: r.staff.id,
                      additional_pay: patch.additional_pay ?? r.additional,
                      net_pay: patch.net_pay ?? r.net,
                      tax_federal: patch.tax_federal ?? r.taxFed,
                      tax_state: patch.tax_state ?? r.taxSt,
                      tax_fica: patch.tax_fica ?? r.taxFica,
                    })
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
                  <td className="px-3 py-2 text-right tabular-nums">{fmtUSD(totals.net)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtUSD(totals.taxFed)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtUSD(totals.taxSt)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtUSD(totals.taxFica)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtUSD(totals.total)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <div>
            <strong>DSP hrs</strong> = same EVV sum used in Tab A (per-entry quarter-hour rounding). <strong>Rate</strong> from <code>profiles.hourly_rate</code>. <strong>HHS pay</strong> = Σ billable HHS days × Host daily rate for clients where this staff is HHP (detected via <code>staff_assignments.service_codes</code> containing CMP/CMS — not a profile flag). <strong>Additional / Net / Taxes</strong> are provider-entered from external payroll. <strong>Total</strong> = DSP gross + HHS pay + Additional (net/taxes are informational). Owner / partner distribution is in Tab F.
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}

type RowT = ReturnType<typeof useRowsType>;
// Helper type extraction (never called)
function useRowsType() { return null as unknown as {
  staff: ProfileLite; name: string; hours: number; rate: number; dspGross: number; hhsPay: number;
  additional: number; net: number; taxFed: number; taxSt: number; taxFica: number; total: number; hhpClientNames: string[];
}; }

function StaffRow({
  r,
  onSave,
}: {
  r: NonNullable<RowT>;
  onSave: (patch: Partial<{ additional_pay: number; net_pay: number; tax_federal: number; tax_state: number; tax_fica: number }>) => void;
}) {
  const [additional, setAdditional] = useState(String(r.additional || ""));
  const [net, setNet] = useState(String(r.net || ""));
  const [taxFed, setTaxFed] = useState(String(r.taxFed || ""));
  const [taxSt, setTaxSt] = useState(String(r.taxSt || ""));
  const [taxFica, setTaxFica] = useState(String(r.taxFica || ""));

  useEffect(() => { setAdditional(String(r.additional || "")); }, [r.additional]);
  useEffect(() => { setNet(String(r.net || "")); }, [r.net]);
  useEffect(() => { setTaxFed(String(r.taxFed || "")); }, [r.taxFed]);
  useEffect(() => { setTaxSt(String(r.taxSt || "")); }, [r.taxSt]);
  useEffect(() => { setTaxFica(String(r.taxFica || "")); }, [r.taxFica]);

  const cell = (val: string, setter: (v: string) => void, current: number, key: keyof Parameters<typeof onSave>[0]) => (
    <td className="px-3 py-2 text-right">
      <Input
        type="number"
        step="0.01"
        value={val}
        onChange={(e) => setter(e.target.value)}
        onBlur={() => {
          const n = Number(val || 0);
          if (n !== current) onSave({ [key]: n } as Parameters<typeof onSave>[0]);
        }}
        className="h-8 w-24 text-right tabular-nums"
      />
    </td>
  );

  return (
    <tr className="hover:bg-muted/30">
      <td className="px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{r.name}</span>
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
      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{fmtUSD(r.rate)}</td>
      <td className="px-3 py-2 text-right tabular-nums">{fmtUSD(r.dspGross)}</td>
      <td className="px-3 py-2 text-right tabular-nums">{fmtUSD(r.hhsPay)}</td>
      {cell(additional, setAdditional, r.additional, "additional_pay")}
      {cell(net, setNet, r.net, "net_pay")}
      {cell(taxFed, setTaxFed, r.taxFed, "tax_federal")}
      {cell(taxSt, setTaxSt, r.taxSt, "tax_state")}
      {cell(taxFica, setTaxFica, r.taxFica, "tax_fica")}
      <td className="px-3 py-2 text-right tabular-nums font-semibold">{fmtUSD(r.total)}</td>
    </tr>
  );
}
