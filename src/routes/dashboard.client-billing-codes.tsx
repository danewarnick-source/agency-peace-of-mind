import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-org";
import { useTimePaySettings, type CapBehavior } from "@/hooks/use-time-pay-settings";
import { useAllClientBillingCodes, type ClientBillingCode } from "@/hooks/use-client-billing-codes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { unitsToHours, fmtHours, fmtUnits, UNITS_PER_HOUR } from "@/lib/billing-units";
import { isDailyServiceCode } from "@/lib/service-billing";
import { Trash2, Plus } from "lucide-react";

import { RequireRole } from "@/components/rbac-guard";

export const Route = createFileRoute("/dashboard/client-billing-codes")({
  head: () => ({ meta: [{ title: "Client Billing Codes — HIVE" }] }),
  component: () => (
    <RequireRole roles={["admin", "manager", "super_admin"]}>
      <ClientBillingCodesPage />
    </RequireRole>
  ),
});

type Client = { id: string; first_name: string; last_name: string };
type Draft = Partial<ClientBillingCode> & { service_code: string };

function ClientBillingCodesPage() {
  const { data: org } = useCurrentOrg();
  const { settings, orgId, settingsQuery } = useTimePaySettings();
  const { data: codes, refetch } = useAllClientBillingCodes();

  const clientsQ = useQuery({
    enabled: !!org?.organization_id,
    queryKey: ["org-clients", org?.organization_id],
    queryFn: async (): Promise<Client[]> => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, first_name, last_name")
        .eq("organization_id", org!.organization_id)
        .order("last_name");
      if (error) throw error;
      return (data ?? []) as Client[];
    },
  });

  const [selectedClient, setSelectedClient] = useState<string | null>(null);
  useEffect(() => {
    if (!selectedClient && clientsQ.data?.length) setSelectedClient(clientsQ.data[0].id);
  }, [clientsQ.data, selectedClient]);

  const clientCodes = useMemo(
    () => (codes ?? []).filter((c) => c.client_id === selectedClient),
    [codes, selectedClient],
  );

  const [newRow, setNewRow] = useState<Draft>({
    service_code: "",
    unit_type: "Q",
    rate_per_unit: 0,
    annual_unit_authorization: 0,
  });

  const upsert = async (row: Draft) => {
    if (!orgId || !selectedClient) return;
    if (!row.service_code) return toast.error("Service code is required");
    const payload = {
      organization_id: orgId,
      client_id: selectedClient,
      service_code: row.service_code.toUpperCase(),
      unit_type: row.unit_type ?? "Q",
      rate_per_unit: Number(row.rate_per_unit ?? 0),
      annual_unit_authorization: Number(row.annual_unit_authorization ?? 0),
      monthly_max_units: row.monthly_max_units == null || row.monthly_max_units === ("" as unknown as number) ? null : Number(row.monthly_max_units),
      weekly_cap_units: row.weekly_cap_units == null || row.weekly_cap_units === ("" as unknown as number) ? null : Number(row.weekly_cap_units),
      service_start_date: row.service_start_date || null,
      service_end_date: row.service_end_date || null,
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

  const saveCap = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgId) return;
    const f = e.target as HTMLFormElement;
    const behavior = (new FormData(f).get("cap_behavior") as CapBehavior) || "acknowledge";
    const warn = Number(new FormData(f).get("cap_warn_pct") || 90);
    const { error } = await supabase
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from("time_pay_settings" as any)
      .upsert(
        { organization_id: orgId, cap_behavior: behavior, cap_warn_pct: warn },
        { onConflict: "organization_id" },
      );
    if (error) return toast.error(error.message);
    toast.success("Cap behavior saved");
    settingsQuery.refetch();
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Client Billing Codes</h1>
        <p className="text-sm text-muted-foreground">
          Authorized units & weekly/monthly caps per client × service code. 1 unit = 15 min (4 u/hr).
        </p>
      </header>

      <form onSubmit={saveCap} className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <h2 className="text-base font-semibold">Time & pay — cap behavior</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          What happens when a client's weekly cap is reached during an active shift.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Cap behavior</Label>
            <select
              name="cap_behavior"
              defaultValue={settings.cap_behavior}
              className="mt-1 h-10 w-full rounded-md border border-border bg-background px-3"
            >
              <option value="warn">Warn only</option>
              <option value="acknowledge">Require Acknowledge to continue</option>
              <option value="auto_clock_out">Hard auto clock-out</option>
            </select>
          </div>
          <div>
            <Label>Warning threshold (% of cap)</Label>
            <Input
              type="number"
              name="cap_warn_pct"
              min={50}
              max={100}
              defaultValue={settings.cap_warn_pct}
              className="mt-1"
            />
          </div>
        </div>
        <div className="mt-3"><Button type="submit">Save</Button></div>
      </form>

      <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[240px] flex-1">
            <Label>Client</Label>
            <select
              value={selectedClient ?? ""}
              onChange={(e) => setSelectedClient(e.target.value)}
              className="mt-1 h-10 w-full rounded-md border border-border bg-background px-3"
            >
              {(clientsQ.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>{c.last_name}, {c.first_name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="p-2">Code</th>
                <th className="p-2">Rate / unit</th>
                <th className="p-2">Annual units</th>
                <th className="p-2">Weekly cap (u)</th>
                <th className="p-2">Monthly cap</th>
                <th className="p-2">Annual budget</th>
                <th className="p-2">Per mo / wk</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {clientCodes.map((row) => {
                const annualHours = unitsToHours(row.annual_unit_authorization);
                return (
                  <tr key={row.id} className="border-t border-border">
                    <td className="p-2 font-mono font-semibold">{row.service_code}{isDailyServiceCode(row.service_code) ? " · Daily" : ""}</td>
                    <td className="p-2">
                      <Input
                        type="number" step="0.01" defaultValue={row.rate_per_unit}
                        onBlur={(e) => upsert({ ...row, rate_per_unit: Number(e.target.value) })}
                        className="h-8 w-24"
                      />
                    </td>
                    <td className="p-2">
                      <Input
                        type="number" defaultValue={row.annual_unit_authorization}
                        onBlur={(e) => upsert({ ...row, annual_unit_authorization: Number(e.target.value) })}
                        className="h-8 w-28"
                      />
                    </td>
                    <td className="p-2">
                      <Input
                        type="number" defaultValue={row.weekly_cap_units ?? ""}
                        onBlur={(e) => upsert({ ...row, weekly_cap_units: e.target.value === "" ? null : Number(e.target.value) })}
                        className="h-8 w-24"
                      />
                    </td>
                    <td className="p-2">
                      <Input
                        type="number" defaultValue={row.monthly_max_units ?? ""}
                        onBlur={(e) => upsert({ ...row, monthly_max_units: e.target.value === "" ? null : Number(e.target.value) })}
                        className="h-8 w-24"
                      />
                    </td>
                    <td className="p-2 text-xs text-muted-foreground tabular-nums">
                      {fmtUnits(row.annual_unit_authorization)} u · {fmtHours(annualHours)} hr
                    </td>
                    <td className="p-2 text-xs text-muted-foreground tabular-nums">
                      {fmtHours(annualHours / 12)} / {fmtHours(annualHours / 52)} hrs
                    </td>
                    <td className="p-2">
                      <Button size="icon" variant="ghost" onClick={() => remove(row.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
              {/* New row */}
              <tr className="border-t border-border bg-muted/30">
                <td className="p-2">
                  <Input
                    placeholder="SEI / HHS / …"
                    value={newRow.service_code}
                    onChange={(e) => setNewRow({ ...newRow, service_code: e.target.value })}
                    className="h-8 w-28 uppercase"
                  />
                </td>
                <td className="p-2"><Input type="number" step="0.01" className="h-8 w-24" value={newRow.rate_per_unit ?? 0} onChange={(e) => setNewRow({ ...newRow, rate_per_unit: Number(e.target.value) })} /></td>
                <td className="p-2"><Input type="number" className="h-8 w-28" value={newRow.annual_unit_authorization ?? 0} onChange={(e) => setNewRow({ ...newRow, annual_unit_authorization: Number(e.target.value) })} /></td>
                <td className="p-2"><Input type="number" className="h-8 w-24" value={newRow.weekly_cap_units ?? ""} onChange={(e) => setNewRow({ ...newRow, weekly_cap_units: e.target.value === "" ? null : Number(e.target.value) })} /></td>
                <td className="p-2"><Input type="number" className="h-8 w-24" value={newRow.monthly_max_units ?? ""} onChange={(e) => setNewRow({ ...newRow, monthly_max_units: e.target.value === "" ? null : Number(e.target.value) })} /></td>
                <td colSpan={2} className="p-2 text-xs text-muted-foreground">Unit type Q ({UNITS_PER_HOUR} u/hr)</td>
                <td className="p-2">
                  <Button size="sm" onClick={async () => { await upsert(newRow); setNewRow({ service_code: "", unit_type: "Q", rate_per_unit: 0, annual_unit_authorization: 0 }); }}>
                    <Plus className="h-4 w-4" /> Add
                  </Button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
