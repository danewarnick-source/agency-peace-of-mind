import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-org";
import { computeEntryUnits } from "@/lib/billing-units";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  AlertTriangle, CheckCircle2, Clock, DollarSign, Download,
  FileWarning, Users, Home as HomeIcon, Loader2,
} from "lucide-react";

/** Pay-period helpers — Mon→Sun week. */
function weekStart(d: Date) {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7; // 0=Mon
  x.setDate(x.getDate() - day);
  x.setHours(0, 0, 0, 0);
  return x;
}
function isoDate(d: Date) { return d.toISOString().slice(0, 10); }
function fmt(d: Date) {
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
function fmtT(iso: string) {
  return new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
function hoursBetween(a: string, b: string) {
  return (new Date(b).getTime() - new Date(a).getTime()) / 3_600_000;
}

type Punch = {
  id: string;
  staff_id: string;
  client_id: string;
  service_type_code: string;
  clock_in_timestamp: string;
  clock_out_timestamp: string | null;
};
type Client = { id: string; first_name: string; last_name: string; team_id: string | null };
type Team = { id: string; team_name: string };
type Staff = { id: string; full_name: string | null; email: string | null };
type AuthCode = { code: string; carve_out: boolean; kind: string; unit: string };
type ClientBilling = {
  client_id: string; service_code: string;
  annual_unit_authorization: number; unit_type: string; rate_per_unit: number;
};

const OT_THRESHOLD = 40;

function unitsForHours(unit: string, hours: number) {
  if (unit === "Q") return hours * 4;
  if (unit === "day") return hours / 24;
  if (unit === "hour") return hours;
  return hours;
}

export function TimesheetsReconcile() {
  const { data: org } = useCurrentOrg();
  const qc = useQueryClient();
  const [periodStart, setPeriodStart] = useState<Date>(() => weekStart(new Date()));
  const periodEnd = useMemo(() => {
    const d = new Date(periodStart); d.setDate(d.getDate() + 7); return d;
  }, [periodStart]);

  const [homeFilter, setHomeFilter] = useState<string>("all");
  const [editPunch, setEditPunch] = useState<Punch | null>(null);

  const { data: ytdPunches } = useQuery({
    enabled: !!org?.organization_id,
    queryKey: ["evv-ytd", org?.organization_id],
    queryFn: async () => {
      const yearStart = new Date(new Date().getFullYear(), 0, 1).toISOString();
      const { data: rows } = await supabase
        .from("evv_timesheets")
        .select("id, staff_id, client_id, service_type_code, clock_in_timestamp, clock_out_timestamp")
        .eq("organization_id", org!.organization_id)
        .gte("clock_in_timestamp", yearStart)
        .not("clock_out_timestamp", "is", null);
      return (rows ?? []) as Punch[];
    },
  });

  const { data, isLoading } = useQuery({
    enabled: !!org?.organization_id,
    queryKey: ["ts-reconcile", org?.organization_id, periodStart.toISOString()],
    queryFn: async () => {
      const orgId = org!.organization_id;
      const [punches, clients, teams, authCodes, billing] = await Promise.all([
        supabase.from("evv_timesheets")
          .select("id, staff_id, client_id, service_type_code, clock_in_timestamp, clock_out_timestamp")
          .eq("organization_id", orgId)
          .gte("clock_in_timestamp", periodStart.toISOString())
          .lt("clock_in_timestamp", periodEnd.toISOString())
          .order("clock_in_timestamp"),
        supabase.from("clients").select("id, first_name, last_name, team_id").eq("organization_id", orgId),
        supabase.from("teams").select("id, team_name").eq("organization_id", orgId),
        (supabase as any).from("provider_authorized_codes")
          .select("code, carve_out, kind, unit").eq("organization_id", orgId),
        (supabase as any).from("client_billing_codes")
          .select("client_id, service_code, annual_unit_authorization, unit_type, rate_per_unit")
          .eq("organization_id", orgId),
      ]);
      if (punches.error) throw punches.error;
      return {
        punches: (punches.data ?? []) as Punch[],
        clients: (clients.data ?? []) as Client[],
        teams: (teams.data ?? []) as Team[],
        authCodes: (authCodes.data ?? []) as AuthCode[],
        billing: (billing.data ?? []) as ClientBilling[],
      };
    },
  });

  // Fetch profiles only for staff IDs that appear in the period punches.
  // Avoids a full-table scan — profiles has no FK to organization_members.
  const staffIds = useMemo(
    () => [...new Set((data?.punches ?? []).map((p) => p.staff_id))],
    [data?.punches],
  );
  const { data: staffProfiles } = useQuery({
    enabled: staffIds.length > 0,
    queryKey: ["timesheet-profiles", staffIds],
    queryFn: async () => {
      const { data: rows } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", staffIds);
      return (rows ?? []) as Staff[];
    },
  });

  const updatePunch = useMutation({
    mutationFn: async (input: { id: string; clock_in_timestamp: string; clock_out_timestamp: string }) => {
      const { error } = await supabase.from("evv_timesheets")
        .update({
          clock_out_timestamp: input.clock_out_timestamp,
          is_edited_by_admin: true,
          // Per-entry quarter-hour units (round-to-NEAREST); raw timestamps untouched.
          billed_units: computeEntryUnits(input.clock_in_timestamp, input.clock_out_timestamp),
        })
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Punch updated. Ledgers recalculated.");
      qc.invalidateQueries({ queryKey: ["ts-reconcile"] });
      setEditPunch(null);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const computed = useMemo(() => {
    if (!data) return null;
    const { punches, clients, authCodes, billing } = data;
    const clientById = new Map(clients.map((c) => [c.id, c]));
    const staffById = new Map((staffProfiles ?? []).map((s) => [s.id, s]));
    const authByCode = new Map(authCodes.map((a) => [a.code, a]));
    const billingByKey = new Map(billing.map((b) => [`${b.client_id}|${b.service_code}`, b]));

    // Group by home (team)
    const homes = new Map<string, { name: string; clients: Client[]; punches: Punch[] }>();
    homes.set("__unassigned__", { name: "Unassigned clients", clients: [], punches: [] });
    for (const t of data.teams) homes.set(t.id, { name: t.team_name, clients: [], punches: [] });
    for (const c of clients) {
      const key = c.team_id ?? "__unassigned__";
      const h = homes.get(key) ?? homes.get("__unassigned__")!;
      h.clients.push(c);
    }
    for (const p of punches) {
      const c = clientById.get(p.client_id);
      const key = c?.team_id ?? "__unassigned__";
      const h = homes.get(key);
      if (h) h.punches.push(p);
    }

    // Coverage proof: per home, per day, build merged intervals from all
    // non-discrete (carve_out=false) punches. Gaps inside a day flagged.
    const coverage: Array<{
      home_id: string; name: string;
      days: Array<{ day: string; segments: Array<[number, number]>; gapMinutes: number }>;
    }> = [];
    const dayList: string[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(periodStart); d.setDate(d.getDate() + i);
      dayList.push(isoDate(d));
    }
    for (const [home_id, h] of homes) {
      if (h.clients.length === 0 && h.punches.length === 0) continue;
      const days = dayList.map((day) => {
        const dayStart = new Date(`${day}T00:00:00`).getTime();
        const dayEnd = dayStart + 86_400_000;
        const segs: Array<[number, number]> = [];
        for (const p of h.punches) {
          const ac = authByCode.get(p.service_type_code);
          // Skip discrete carve-outs for the "continuous coverage" line.
          if (ac?.carve_out) continue;
          const ci = new Date(p.clock_in_timestamp).getTime();
          const punchDayEnd = (() => {
            const d = new Date(p.clock_in_timestamp);
            d.setHours(23, 59, 59, 999);
            return d.getTime();
          })();
          const co = p.clock_out_timestamp
            ? new Date(p.clock_out_timestamp).getTime()
            : Math.min(Date.now(), punchDayEnd);
          const s = Math.max(ci, dayStart);
          const e = Math.min(co, dayEnd);
          if (e > s) segs.push([s, e]);
        }
        segs.sort((a, b) => a[0] - b[0]);
        const merged: Array<[number, number]> = [];
        for (const seg of segs) {
          const last = merged[merged.length - 1];
          if (last && seg[0] <= last[1]) last[1] = Math.max(last[1], seg[1]);
          else merged.push([seg[0], seg[1]]);
        }
        // Gap = day minutes covered - 24h, only if there is at least one segment.
        let covered = 0;
        for (const [s, e] of merged) covered += (e - s) / 60000;
        const gapMinutes = merged.length === 0 ? 0 : Math.max(0, 1440 - covered);
        return { day, segments: merged.map(([s, e]) => [(s - dayStart) / 60000, (e - dayStart) / 60000] as [number, number]), gapMinutes };
      });
      coverage.push({ home_id, name: h.name, days });
    }

    // Billing burn-down per client × code
    const billingRows: Array<{
      client_id: string; client_name: string;
      service_code: string; hours: number; units: number;
      authorized: number; used: number; remaining: number;
      onPacePct: number; pacePct: number; rate: number;
    }> = [];

    // Week hours — used only for the "Hours" and "Units" display columns.
    const totalsByKey = new Map<string, number>();
    for (const p of punches) {
      if (!p.clock_out_timestamp) continue;
      const h = hoursBetween(p.clock_in_timestamp, p.clock_out_timestamp);
      if (h <= 0) continue;
      const key = `${p.client_id}|${p.service_type_code}`;
      totalsByKey.set(key, (totalsByKey.get(key) ?? 0) + h);
    }

    // YTD hours — used for the burn-down (remaining / pace) calculation.
    const ytdByKey = new Map<string, number>();
    for (const p of (ytdPunches ?? [])) {
      if (!p.clock_out_timestamp) continue;
      const h = hoursBetween(p.clock_in_timestamp, p.clock_out_timestamp);
      if (h <= 0) continue;
      const key = `${p.client_id}|${p.service_type_code}`;
      ytdByKey.set(key, (ytdByKey.get(key) ?? 0) + h);
    }

    for (const [key, hours] of totalsByKey) {
      const [client_id, service_code] = key.split("|");
      const c = clientById.get(client_id);
      const b = billingByKey.get(key);
      const authorized = b?.annual_unit_authorization ?? 0;
      const units = unitsForHours(b?.unit_type ?? "hour", hours); // this week — display only
      const ytdHours = ytdByKey.get(key) ?? hours;
      const used = unitsForHours(b?.unit_type ?? "hour", ytdHours); // YTD — burn-down
      const remaining = Math.max(0, authorized - used);
      // Pace: weeks elapsed of 52
      const elapsedWeeks = Math.max(1, Math.ceil(((periodStart.getTime() - new Date(periodStart.getFullYear(), 0, 1).getTime()) / 86_400_000) / 7));
      const onPacePct = (elapsedWeeks / 52) * 100;
      const pacePct = authorized > 0 ? (used / authorized) * 100 : 0;
      billingRows.push({
        client_id, client_name: c ? `${c.first_name} ${c.last_name}` : "Unknown",
        service_code, hours, units, authorized, used, remaining,
        onPacePct, pacePct, rate: b?.rate_per_unit ?? 0,
      });
    }
    billingRows.sort((a, b) => a.client_name.localeCompare(b.client_name) || a.service_code.localeCompare(b.service_code));

    // Payroll per staff
    const payByStaff = new Map<string, { hours: number; punches: number; openPunches: number }>();
    for (const p of punches) {
      const e = payByStaff.get(p.staff_id) ?? { hours: 0, punches: 0, openPunches: 0 };
      e.punches += 1;
      if (!p.clock_out_timestamp) e.openPunches += 1;
      else e.hours += Math.max(0, hoursBetween(p.clock_in_timestamp, p.clock_out_timestamp));
      payByStaff.set(p.staff_id, e);
    }
    const payrollRows = Array.from(payByStaff.entries()).map(([staff_id, v]) => {
      const s = staffById.get(staff_id);
      return {
        staff_id,
        name: s?.full_name ?? s?.email ?? staff_id.slice(0, 8),
        hours: v.hours,
        regHours: Math.min(OT_THRESHOLD, v.hours),
        otHours: Math.max(0, v.hours - OT_THRESHOLD),
        openPunches: v.openPunches,
      };
    }).sort((a, b) => a.name.localeCompare(b.name));

    // Exceptions
    const openPunches = punches.filter((p) => !p.clock_out_timestamp);
    const gaps = coverage.flatMap((h) =>
      h.days.filter((d) => d.gapMinutes > 0).map((d) => ({ home: h.name, day: d.day, minutes: d.gapMinutes }))
    );
    const overlaps: Array<{ staff: string; a: Punch; b: Punch }> = [];
    const byStaff = new Map<string, Punch[]>();
    for (const p of punches) {
      const arr = byStaff.get(p.staff_id) ?? [];
      arr.push(p); byStaff.set(p.staff_id, arr);
    }
    for (const [staff_id, arr] of byStaff) {
      const closed = arr.filter((p) => p.clock_out_timestamp).sort((a, b) =>
        a.clock_in_timestamp.localeCompare(b.clock_in_timestamp));
      for (let i = 1; i < closed.length; i++) {
        const prev = closed[i - 1], cur = closed[i];
        // overlap on different clients with neither carve_out → suspect double-bill
        const acA = authByCode.get(prev.service_type_code);
        const acB = authByCode.get(cur.service_type_code);
        if (acA?.carve_out || acB?.carve_out) continue;
        if (new Date(cur.clock_in_timestamp) < new Date(prev.clock_out_timestamp!)) {
          if (prev.client_id !== cur.client_id) {
            overlaps.push({
              staff: staffById.get(staff_id)?.full_name ?? staff_id.slice(0, 8),
              a: prev, b: cur,
            });
          }
        }
      }
    }
    const paceWarnings = billingRows.filter((r) => r.authorized > 0 && (r.pacePct > r.onPacePct + 10 || r.pacePct < r.onPacePct - 25));

    return { coverage, billingRows, payrollRows, openPunches, gaps, overlaps, paceWarnings, homes: Array.from(homes.entries()) };
  }, [data, staffProfiles, periodStart, ytdPunches]);

  const visibleCoverage = useMemo(() => {
    if (!computed) return [];
    return homeFilter === "all" ? computed.coverage : computed.coverage.filter((c) => c.home_id === homeFilter);
  }, [computed, homeFilter]);

  function exportCSV(kind: "billing" | "payroll") {
    if (!computed) return;
    const exceptionsCount = computed.openPunches.length + computed.gaps.length + computed.overlaps.length + computed.paceWarnings.length;
    if (exceptionsCount > 0) {
      toast.warning(`Exporting with ${exceptionsCount} unresolved exception(s). Review before submitting.`);
    }
    let csv = "";
    if (kind === "billing") {
      csv = "Client,Code,Hours,Units,Rate,Amount,Authorized,Remaining\n";
      for (const r of computed.billingRows) {
        const amt = (r.units * r.rate).toFixed(2);
        csv += `"${r.client_name}",${r.service_code},${r.hours.toFixed(2)},${r.units.toFixed(2)},${r.rate},${amt},${r.authorized},${r.remaining.toFixed(2)}\n`;
      }
    } else {
      csv = "Staff,Total Hours,Regular,Overtime,Open Punches\n";
      for (const r of computed.payrollRows) {
        csv += `"${r.name}",${r.hours.toFixed(2)},${r.regHours.toFixed(2)},${r.otHours.toFixed(2)},${r.openPunches}\n`;
      }
    }
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${kind}-${isoDate(periodStart)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (isLoading || !computed) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Reconciling clock events…
      </div>
    );
  }

  const exceptionCount = computed.openPunches.length + computed.gaps.length + computed.overlaps.length + computed.paceWarnings.length;

  return (
    <div className="space-y-4">
      {/* Period + filters */}
      <Card className="p-4 flex flex-wrap items-end gap-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => {
            const d = new Date(periodStart); d.setDate(d.getDate() - 7); setPeriodStart(d);
          }}>← Prev</Button>
          <div className="text-sm font-medium">
            {fmt(periodStart)} – {fmt(new Date(periodEnd.getTime() - 1))}
          </div>
          <Button variant="outline" size="sm" onClick={() => {
            const d = new Date(periodStart); d.setDate(d.getDate() + 7); setPeriodStart(d);
          }}>Next →</Button>
          <Button variant="ghost" size="sm" onClick={() => setPeriodStart(weekStart(new Date()))}>This week</Button>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => exportCSV("billing")}>
            <Download className="h-4 w-4 mr-1.5" /> Export billing
          </Button>
          <Button variant="outline" size="sm" onClick={() => exportCSV("payroll")}>
            <Download className="h-4 w-4 mr-1.5" /> Export payroll
          </Button>
        </div>
      </Card>

      {/* Summary tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Tile icon={<Clock className="h-4 w-4" />} label="Total hours" value={computed.payrollRows.reduce((s, r) => s + r.hours, 0).toFixed(1)} />
        <Tile icon={<DollarSign className="h-4 w-4" />} label="Billable units" value={computed.billingRows.reduce((s, r) => s + r.units, 0).toFixed(0)} />
        <Tile icon={<Users className="h-4 w-4" />} label="Staff with punches" value={String(computed.payrollRows.length)} />
        <Tile
          icon={<AlertTriangle className="h-4 w-4" />}
          label="Exceptions"
          value={String(exceptionCount)}
          tone={exceptionCount > 0 ? "warn" : "ok"}
        />
      </div>

      <Tabs defaultValue="coverage" className="w-full">
        <TabsList>
          <TabsTrigger value="coverage">Coverage proof</TabsTrigger>
          <TabsTrigger value="billing">Billing burn-down</TabsTrigger>
          <TabsTrigger value="payroll">Payroll</TabsTrigger>
          <TabsTrigger value="exceptions">
            Exceptions {exceptionCount > 0 && <Badge variant="destructive" className="ml-2">{exceptionCount}</Badge>}
          </TabsTrigger>
        </TabsList>

        {/* Coverage */}
        <TabsContent value="coverage" className="space-y-3">
          <div className="flex items-center gap-2">
            <Label className="text-xs">Home</Label>
            <Select value={homeFilter} onValueChange={setHomeFilter}>
              <SelectTrigger className="w-64 h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All homes</SelectItem>
                {computed.coverage.map((h) => (
                  <SelectItem key={h.home_id} value={h.home_id}>{h.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {visibleCoverage.length === 0 ? (
            <Card className="p-8 text-center text-sm text-muted-foreground">No coverage activity in this period.</Card>
          ) : visibleCoverage.map((h) => (
            <Card key={h.home_id} className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <HomeIcon className="h-4 w-4 text-muted-foreground" />
                <div className="font-medium text-sm">{h.name}</div>
              </div>
              <div className="space-y-1.5">
                {h.days.map((d) => (
                  <div key={d.day} className="flex items-center gap-2">
                    <div className="w-24 text-xs text-muted-foreground">{fmt(new Date(d.day))}</div>
                    <div className="relative flex-1 h-6 rounded bg-muted overflow-hidden">
                      {d.segments.map(([s, e], i) => (
                        <div
                          key={i}
                          className="absolute top-0 bottom-0 bg-emerald-500/70"
                          style={{ left: `${(s / 1440) * 100}%`, width: `${((e - s) / 1440) * 100}%` }}
                        />
                      ))}
                    </div>
                    <div className="w-20 text-right text-xs">
                      {d.gapMinutes > 0 ? (
                        <span className="text-rose-600 font-medium">{Math.round(d.gapMinutes)}m gap</span>
                      ) : d.segments.length === 0 ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <span className="text-emerald-600 inline-flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3" /> Full
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </TabsContent>

        {/* Billing */}
        <TabsContent value="billing">
          <Card className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="text-left p-3">Client</th>
                  <th className="text-left p-3">Code</th>
                  <th className="text-right p-3">Hours</th>
                  <th className="text-right p-3">Units</th>
                  <th className="text-right p-3">Authorized</th>
                  <th className="text-right p-3">Remaining</th>
                  <th className="text-left p-3">Pace</th>
                  <th className="text-right p-3">Amount</th>
                </tr>
              </thead>
              <tbody>
                {computed.billingRows.length === 0 ? (
                  <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">No billable punches in this period.</td></tr>
                ) : computed.billingRows.map((r) => {
                  const tone = r.pacePct > r.onPacePct + 10 ? "rose" : r.pacePct < r.onPacePct - 25 ? "amber" : "emerald";
                  return (
                    <tr key={`${r.client_id}-${r.service_code}`} className="border-t">
                      <td className="p-3">{r.client_name}</td>
                      <td className="p-3 font-mono text-xs">{r.service_code}</td>
                      <td className="p-3 text-right">{r.hours.toFixed(2)}</td>
                      <td className="p-3 text-right">{r.units.toFixed(1)}</td>
                      <td className="p-3 text-right">{r.authorized || "—"}</td>
                      <td className="p-3 text-right">{r.authorized > 0 ? r.remaining.toFixed(1) : "—"}</td>
                      <td className="p-3">
                        <div className="relative h-2 w-32 rounded bg-muted overflow-hidden">
                          <div className={`absolute top-0 bottom-0 bg-${tone}-500`} style={{ width: `${Math.min(100, r.pacePct)}%` }} />
                          <div className="absolute top-0 bottom-0 w-px bg-foreground/60" style={{ left: `${Math.min(100, r.onPacePct)}%` }} />
                        </div>
                        <div className="text-[10px] text-muted-foreground mt-0.5">
                          {r.pacePct.toFixed(0)}% used · on-pace {r.onPacePct.toFixed(0)}%
                        </div>
                      </td>
                      <td className="p-3 text-right">${(r.units * r.rate).toFixed(2)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        </TabsContent>

        {/* Payroll */}
        <TabsContent value="payroll">
          <Card className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="text-left p-3">Staff</th>
                  <th className="text-right p-3">Total hrs</th>
                  <th className="text-right p-3">Regular</th>
                  <th className="text-right p-3">Overtime</th>
                  <th className="text-right p-3">Open punches</th>
                </tr>
              </thead>
              <tbody>
                {computed.payrollRows.length === 0 ? (
                  <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">No punches in this period.</td></tr>
                ) : computed.payrollRows.map((r) => (
                  <tr key={r.staff_id} className="border-t">
                    <td className="p-3">{r.name}</td>
                    <td className="p-3 text-right">{r.hours.toFixed(2)}</td>
                    <td className="p-3 text-right">{r.regHours.toFixed(2)}</td>
                    <td className="p-3 text-right">
                      {r.otHours > 0 ? <Badge variant="destructive">{r.otHours.toFixed(2)}</Badge> : <span className="text-muted-foreground">0</span>}
                    </td>
                    <td className="p-3 text-right">
                      {r.openPunches > 0 ? <Badge variant="outline" className="border-amber-500 text-amber-700">{r.openPunches}</Badge> : <span className="text-muted-foreground">0</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </TabsContent>

        {/* Exceptions */}
        <TabsContent value="exceptions" className="space-y-3">
          {exceptionCount === 0 ? (
            <Card className="p-8 text-center text-sm text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="h-6 w-6 mx-auto mb-2" />
              All clear — no exceptions for this period.
            </Card>
          ) : (
            <>
              {computed.openPunches.length > 0 && (
                <Card className="p-4">
                  <div className="text-sm font-medium mb-2 flex items-center gap-2">
                    <Clock className="h-4 w-4 text-amber-600" /> Open punches ({computed.openPunches.length})
                  </div>
                  <ul className="divide-y text-sm">
                    {computed.openPunches.map((p) => {
                      const s = (staffProfiles ?? []).find((x) => x.id === p.staff_id);
                      const c = data!.clients.find((x) => x.id === p.client_id);
                      return (
                        <li key={p.id} className="py-2 flex items-center justify-between gap-2">
                          <div>
                            <div>{s?.full_name ?? "Staff"} → {c?.first_name} {c?.last_name}</div>
                            <div className="text-xs text-muted-foreground">
                              Clocked in {fmtT(p.clock_in_timestamp)} · {p.service_type_code}
                            </div>
                          </div>
                          <Button size="sm" variant="outline" onClick={() => setEditPunch(p)}>Resolve</Button>
                        </li>
                      );
                    })}
                  </ul>
                </Card>
              )}
              {computed.gaps.length > 0 && (
                <Card className="p-4">
                  <div className="text-sm font-medium mb-2 flex items-center gap-2">
                    <FileWarning className="h-4 w-4 text-rose-600" /> Coverage gaps ({computed.gaps.length})
                  </div>
                  <ul className="text-sm space-y-1">
                    {computed.gaps.map((g, i) => (
                      <li key={i} className="flex justify-between">
                        <span>{g.home} · {fmt(new Date(g.day))}</span>
                        <span className="text-rose-600 font-medium">{Math.round(g.minutes)} min uncovered</span>
                      </li>
                    ))}
                  </ul>
                </Card>
              )}
              {computed.overlaps.length > 0 && (
                <Card className="p-4">
                  <div className="text-sm font-medium mb-2 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-rose-600" /> Possible double-billed overlaps ({computed.overlaps.length})
                  </div>
                  <ul className="divide-y text-sm">
                    {computed.overlaps.map((o, i) => (
                      <li key={i} className="py-2">
                        <div>{o.staff}</div>
                        <div className="text-xs text-muted-foreground">
                          {o.a.service_type_code} ends {fmtT(o.a.clock_out_timestamp!)} overlaps
                          {" "}{o.b.service_type_code} starts {fmtT(o.b.clock_in_timestamp)}
                        </div>
                      </li>
                    ))}
                  </ul>
                </Card>
              )}
              {computed.paceWarnings.length > 0 && (
                <Card className="p-4">
                  <div className="text-sm font-medium mb-2 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-600" /> Authorization pace warnings ({computed.paceWarnings.length})
                  </div>
                  <ul className="text-sm space-y-1">
                    {computed.paceWarnings.map((r, i) => (
                      <li key={i} className="flex justify-between">
                        <span>{r.client_name} · <span className="font-mono">{r.service_code}</span></span>
                        <span className={r.pacePct > r.onPacePct ? "text-rose-600" : "text-amber-600"}>
                          {r.pacePct.toFixed(0)}% used vs {r.onPacePct.toFixed(0)}% on-pace
                        </span>
                      </li>
                    ))}
                  </ul>
                </Card>
              )}
            </>
          )}
        </TabsContent>
      </Tabs>

      <ResolvePunchDialog
        punch={editPunch}
        onClose={() => setEditPunch(null)}
        onSave={(iso) => editPunch && updatePunch.mutate({
          id: editPunch.id,
          clock_in_timestamp: editPunch.clock_in_timestamp,
          clock_out_timestamp: iso,
        })}
        busy={updatePunch.isPending}
      />
    </div>
  );
}

function Tile({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone?: "warn" | "ok" }) {
  return (
    <Card className="p-3 flex items-center gap-3">
      <div className={`h-8 w-8 rounded-full grid place-items-center ${tone === "warn" ? "bg-amber-100 text-amber-700" : "bg-muted text-foreground"}`}>{icon}</div>
      <div>
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-lg font-semibold">{value}</div>
      </div>
    </Card>
  );
}

function ResolvePunchDialog({ punch, onClose, onSave, busy }: {
  punch: Punch | null; onClose: () => void; onSave: (iso: string) => void; busy: boolean;
}) {
  const [val, setVal] = useState("");
  return (
    <Dialog open={!!punch} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Resolve open punch</DialogTitle>
        </DialogHeader>
        {punch && (
          <div className="space-y-3 py-2">
            <div className="text-xs text-muted-foreground">Clocked in {fmtT(punch.clock_in_timestamp)}</div>
            <div className="grid gap-1.5">
              <Label className="text-xs">Set clock-out time</Label>
              <Input type="datetime-local" value={val} onChange={(e) => setVal(e.target.value)} />
            </div>
            <p className="text-xs text-muted-foreground">
              Advisory only — saving updates billing and payroll ledgers; an admin-edit flag is recorded.
            </p>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={!val || busy} onClick={() => onSave(new Date(val).toISOString())}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save clock-out"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
