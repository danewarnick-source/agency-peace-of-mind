import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-org";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronLeft, ChevronRight, Home, Info } from "lucide-react";
import { fmtUSD } from "@/lib/billing-units";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/billing/host-home")({
  head: () => ({ meta: [{ title: "Host Home — HIVE" }] }),
  component: HostHomePage,
});

type ClientLite = { id: string; first_name: string; last_name: string };

type HostSettings = {
  client_id: string;
  hhp_name: string | null;
  host_daily_rate: number;
};

type MonthlyInputs = {
  client_id: string;
  activities_amount: number;
  room_and_board_amount: number;
};

function HostHomePage() {
  const { data: org } = useCurrentOrg();
  const qc = useQueryClient();
  const today = new Date();
  const [month, setMonth] = useState({ y: today.getFullYear(), m: today.getMonth() });

  const monthStart = useMemo(() => new Date(month.y, month.m, 1), [month]);
  const monthEndExclusive = useMemo(() => new Date(month.y, month.m + 1, 1), [month]);
  const monthStartIso = monthStart.toISOString().slice(0, 10);
  const monthEndIso = monthEndExclusive.toISOString().slice(0, 10);
  const monthLabel = monthStart.toLocaleString(undefined, { month: "long", year: "numeric" });

  // HHS client list: any client with an HHS billing code authorization
  const hhsCodesQ = useQuery({
    enabled: !!org?.organization_id,
    queryKey: ["hh-hhs-codes", org?.organization_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_billing_codes")
        .select("client_id, rate_per_unit")
        .eq("organization_id", org!.organization_id)
        .eq("service_code", "HHS");
      if (error) throw error;
      return (data ?? []) as Array<{ client_id: string; rate_per_unit: number }>;
    },
  });

  const clientIds = useMemo(
    () => Array.from(new Set((hhsCodesQ.data ?? []).map((r) => r.client_id))),
    [hhsCodesQ.data],
  );

  const clientsQ = useQuery({
    enabled: !!org?.organization_id && clientIds.length > 0,
    queryKey: ["hh-clients", org?.organization_id, clientIds.join(",")],
    queryFn: async (): Promise<ClientLite[]> => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, first_name, last_name")
        .in("id", clientIds)
        .order("last_name");
      if (error) throw error;
      return (data ?? []) as ClientLite[];
    },
  });

  // Billable days per (client) for this month — READ-ONLY view
  const daysQ = useQuery({
    enabled: !!org?.organization_id && clientIds.length > 0,
    queryKey: ["hh-days", org?.organization_id, month.y, month.m],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hhs_daily_records_v")
        .select("client_id, record_date, billable, service_code")
        .eq("organization_id", org!.organization_id)
        .eq("service_code", "HHS")
        .gte("record_date", monthStartIso)
        .lt("record_date", monthEndIso);
      if (error) throw error;
      const counts: Record<string, number> = {};
      for (const r of (data ?? []) as Array<{ client_id: string; billable: boolean }>) {
        if (r.billable) counts[r.client_id] = (counts[r.client_id] ?? 0) + 1;
      }
      return counts;
    },
  });

  const settingsQ = useQuery({
    enabled: !!org?.organization_id,
    queryKey: ["hh-settings", org?.organization_id],
    queryFn: async (): Promise<HostSettings[]> => {
      const { data, error } = await supabase
        .from("hhs_host_home_settings" as never)
        .select("client_id, hhp_name, host_daily_rate")
        .eq("organization_id", org!.organization_id);
      if (error) throw error;
      return (data ?? []) as unknown as HostSettings[];
    },
  });

  const monthlyQ = useQuery({
    enabled: !!org?.organization_id,
    queryKey: ["hh-monthly", org?.organization_id, month.y, month.m],
    queryFn: async (): Promise<MonthlyInputs[]> => {
      const { data, error } = await supabase
        .from("hhs_host_home_monthly" as never)
        .select("client_id, activities_amount, room_and_board_amount")
        .eq("organization_id", org!.organization_id)
        .eq("year", month.y)
        .eq("month", month.m + 1);
      if (error) throw error;
      return (data ?? []) as unknown as MonthlyInputs[];
    },
  });

  const settingsByClient = useMemo(() => {
    const map: Record<string, HostSettings> = {};
    for (const s of settingsQ.data ?? []) map[s.client_id] = s;
    return map;
  }, [settingsQ.data]);

  const monthlyByClient = useMemo(() => {
    const map: Record<string, MonthlyInputs> = {};
    for (const r of monthlyQ.data ?? []) map[r.client_id] = r;
    return map;
  }, [monthlyQ.data]);

  const dspdRateByClient = useMemo(() => {
    const map: Record<string, number> = {};
    for (const r of hhsCodesQ.data ?? []) map[r.client_id] = Number(r.rate_per_unit) || 0;
    return map;
  }, [hhsCodesQ.data]);

  const saveSettings = useMutation({
    mutationFn: async (vars: { client_id: string; hhp_name: string | null; host_daily_rate: number }) => {
      const { error } = await supabase
        .from("hhs_host_home_settings" as never)
        .upsert(
          {
            organization_id: org!.organization_id,
            client_id: vars.client_id,
            hhp_name: vars.hhp_name,
            host_daily_rate: vars.host_daily_rate,
          } as never,
          { onConflict: "organization_id,client_id" },
        );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hh-settings", org?.organization_id] });
      toast.success("Host settings saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveMonthly = useMutation({
    mutationFn: async (vars: { client_id: string; activities_amount: number; room_and_board_amount: number }) => {
      const { error } = await supabase
        .from("hhs_host_home_monthly" as never)
        .upsert(
          {
            organization_id: org!.organization_id,
            client_id: vars.client_id,
            year: month.y,
            month: month.m + 1,
            activities_amount: vars.activities_amount,
            room_and_board_amount: vars.room_and_board_amount,
          } as never,
          { onConflict: "organization_id,client_id,year,month" },
        );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hh-monthly", org?.organization_id, month.y, month.m] });
      toast.success("Saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = useMemo(() => {
    return (clientsQ.data ?? []).map((c) => {
      const days = daysQ.data?.[c.id] ?? 0;
      const dspdRate = dspdRateByClient[c.id] ?? 0;
      const hostRate = settingsByClient[c.id]?.host_daily_rate ?? 0;
      const activities = monthlyByClient[c.id]?.activities_amount ?? 0;
      const rb = monthlyByClient[c.id]?.room_and_board_amount ?? 0;
      const dspdDollars = days * dspdRate;
      const hostDollars = days * hostRate;
      const tnsMargin = dspdDollars - hostDollars - activities;
      return { client: c, days, dspdRate, hostRate, activities, rb, dspdDollars, hostDollars, tnsMargin };
    });
  }, [clientsQ.data, daysQ.data, dspdRateByClient, settingsByClient, monthlyByClient]);

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, r) => ({
        days: acc.days + r.days,
        dspd: acc.dspd + r.dspdDollars,
        host: acc.host + r.hostDollars,
        activities: acc.activities + r.activities,
        rb: acc.rb + r.rb,
        margin: acc.margin + r.tnsMargin,
      }),
      { days: 0, dspd: 0, host: 0, activities: 0, rb: 0, margin: 0 },
    );
  }, [rows]);

  const prevMonth = () => setMonth((p) => (p.m === 0 ? { y: p.y - 1, m: 11 } : { y: p.y, m: p.m - 1 }));
  const nextMonth = () => setMonth((p) => (p.m === 11 ? { y: p.y + 1, m: 0 } : { y: p.y, m: p.m + 1 }));

  return (
    <TooltipProvider>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center gap-2">
            <Home className="h-5 w-5 text-primary" />
            <div>
              <h2 className="text-lg font-semibold">Host Home — Monthly Economics</h2>
              <p className="text-xs text-muted-foreground">
                Days × rates from EVV/daily logs and rate store. Activities & Room/Board are provider-entered. TNS margin = DSPD − Host − Activities (owner split is in Tab F).
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
          <table className="w-full min-w-[1100px] text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Host (HHP)</th>
                <th className="px-3 py-2 text-left">Client</th>
                <th className="px-3 py-2 text-right">Days / Mo</th>
                <th className="px-3 py-2 text-right">DSPD rate</th>
                <th className="px-3 py-2 text-right">Host rate</th>
                <th className="px-3 py-2 text-right">DSPD $</th>
                <th className="px-3 py-2 text-right">Host $</th>
                <th className="px-3 py-2 text-right">Activities</th>
                <th className="px-3 py-2 text-right">Room & Board</th>
                <th className="px-3 py-2 text-right">TNS margin</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.length === 0 && (
                <tr><td colSpan={10} className="px-3 py-6 text-center text-muted-foreground">No HHS clients found.</td></tr>
              )}
              {rows.map((r) => (
                <HostRow
                  key={r.client.id}
                  row={r}
                  initialHhpName={settingsByClient[r.client.id]?.hhp_name ?? ""}
                  onSaveSettings={(hhp_name, host_daily_rate) =>
                    saveSettings.mutate({ client_id: r.client.id, hhp_name: hhp_name || null, host_daily_rate })
                  }
                  onSaveMonthly={(activities_amount, room_and_board_amount) =>
                    saveMonthly.mutate({ client_id: r.client.id, activities_amount, room_and_board_amount })
                  }
                />
              ))}
            </tbody>
            {rows.length > 0 && (
              <tfoot className="bg-muted/30 font-medium">
                <tr>
                  <td className="px-3 py-2" colSpan={2}>Totals</td>
                  <td className="px-3 py-2 text-right">{totals.days}</td>
                  <td className="px-3 py-2 text-right text-muted-foreground">—</td>
                  <td className="px-3 py-2 text-right text-muted-foreground">—</td>
                  <td className="px-3 py-2 text-right">{fmtUSD(totals.dspd)}</td>
                  <td className="px-3 py-2 text-right">{fmtUSD(totals.host)}</td>
                  <td className="px-3 py-2 text-right">{fmtUSD(totals.activities)}</td>
                  <td className="px-3 py-2 text-right">{fmtUSD(totals.rb)}</td>
                  <td className="px-3 py-2 text-right">{fmtUSD(totals.margin)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <div>
            <strong>Days / Mo</strong> = billable HHS records (attendance Present + daily note present) from <code>hhs_daily_records_v</code> — read-only. <strong>DSPD rate</strong> from <code>client_billing_codes.rate_per_unit</code> (HHS). <strong>Host rate</strong>, <strong>Activities</strong>, <strong>Room & Board</strong> are provider-entered and persist per client (and per month for the inputs). Owner / partner distribution is computed in Tab F, not here.
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}

type Row = {
  client: ClientLite;
  days: number;
  dspdRate: number;
  hostRate: number;
  activities: number;
  rb: number;
  dspdDollars: number;
  hostDollars: number;
  tnsMargin: number;
};

function HostRow({
  row,
  initialHhpName,
  onSaveSettings,
  onSaveMonthly,
}: {
  row: Row;
  initialHhpName: string;
  onSaveSettings: (hhp_name: string, host_daily_rate: number) => void;
  onSaveMonthly: (activities: number, rb: number) => void;
}) {
  const [hhpName, setHhpName] = useState(initialHhpName);
  const [hostRate, setHostRate] = useState(String(row.hostRate || ""));
  const [activities, setActivities] = useState(String(row.activities || ""));
  const [rb, setRb] = useState(String(row.rb || ""));

  // Sync when underlying data changes (month switch, etc.)
  useEffect(() => { setHhpName(initialHhpName); }, [initialHhpName]);
  useEffect(() => { setHostRate(String(row.hostRate || "")); }, [row.hostRate]);
  useEffect(() => { setActivities(String(row.activities || "")); }, [row.activities]);
  useEffect(() => { setRb(String(row.rb || "")); }, [row.rb]);

  const settingsDirty = hhpName !== initialHhpName || Number(hostRate || 0) !== row.hostRate;
  const monthlyDirty = Number(activities || 0) !== row.activities || Number(rb || 0) !== row.rb;

  return (
    <tr className="hover:bg-muted/30">
      <td className="px-3 py-2">
        <Input
          value={hhpName}
          onChange={(e) => setHhpName(e.target.value)}
          onBlur={() => settingsDirty && onSaveSettings(hhpName, Number(hostRate || 0))}
          placeholder="HHP name"
          className="h-8 w-40"
        />
      </td>
      <td className="px-3 py-2 font-medium">
        {row.client.first_name} {row.client.last_name}
      </td>
      <td className="px-3 py-2 text-right tabular-nums">{row.days}</td>
      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{fmtUSD(row.dspdRate)}</td>
      <td className="px-3 py-2 text-right">
        <Input
          type="number"
          step="0.01"
          value={hostRate}
          onChange={(e) => setHostRate(e.target.value)}
          onBlur={() => settingsDirty && onSaveSettings(hhpName, Number(hostRate || 0))}
          className="h-8 w-24 text-right tabular-nums"
        />
      </td>
      <td className="px-3 py-2 text-right tabular-nums">{fmtUSD(row.dspdDollars)}</td>
      <td className="px-3 py-2 text-right tabular-nums">{fmtUSD(row.hostDollars)}</td>
      <td className="px-3 py-2 text-right">
        <Input
          type="number"
          step="0.01"
          value={activities}
          onChange={(e) => setActivities(e.target.value)}
          onBlur={() => monthlyDirty && onSaveMonthly(Number(activities || 0), Number(rb || 0))}
          className="h-8 w-24 text-right tabular-nums"
        />
      </td>
      <td className="px-3 py-2 text-right">
        <Input
          type="number"
          step="0.01"
          value={rb}
          onChange={(e) => setRb(e.target.value)}
          onBlur={() => monthlyDirty && onSaveMonthly(Number(activities || 0), Number(rb || 0))}
          className="h-8 w-24 text-right tabular-nums"
        />
      </td>
      <td className={`px-3 py-2 text-right tabular-nums font-medium ${row.tnsMargin >= 0 ? "text-emerald-600" : "text-destructive"}`}>
        {fmtUSD(row.tnsMargin)}
      </td>
    </tr>
  );
}
