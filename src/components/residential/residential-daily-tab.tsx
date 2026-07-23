import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-org";
import { useAuth } from "@/hooks/use-auth";
import { isDailyServiceCode } from "@/lib/service-billing";
import { effectiveBillingTimes, isBillableForReview } from "@/lib/billing-units";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Home as HomeIcon, Users as UsersIcon, Calendar as CalendarIcon } from "lucide-react";

type Program = "HHS";

function monthBounds(yyyymm: string): { start: string; end: string } {
  const [y, m] = yyyymm.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 0));
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { start: fmt(start), end: fmt(end) };
}

function thisMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Residential / Daily admin tab. Single source of truth for HHS host-home
 * billable-day surveillance for a selectable month. Daily-rate revenue is
 * computed from hhs_daily_records_v.billable.
 *
 * HHS only: it's the one service code with no time clock, so its
 * single-entry-per-day daily-note model applies. Every other daily-rate
 * code (RHS, DSG, and the rest) is documented through the normal
 * clocked-shift + shift-note flow instead — see useClientBudget for how
 * those billable days are determined.
 *
 * Scope shipped this pass:
 *  • day ledger (HHS, billable yes/no, reason)
 *  • Direct Support hours bar (HHS) vs clients.hhs_monthly_support_hours
 *  • Host supervision contacts list + "Log supervision contact" dialog
 *  • month filter
 *
 * Deferred to a follow-up (data already exists, UI surface only): eMAR
 * exception rollup, monthly cert / quarterly summary status row, and the
 * "Audit pull" that hands a date-range bundle to the existing audit packet.
 */
export function ResidentialDailyTab({
  onOpenIncidents,
}: {
  /** Optional deep-link: residential incident chip → admin Incidents tab,
   *  prefiltered to this client. Compliance Desk wires this up. */
  onOpenIncidents?: (clientId: string) => void;
} = {}) {
  const { data: org } = useCurrentOrg();
  const orgId = org?.organization_id ?? "";
  const [month, setMonth] = useState<string>(thisMonth());
  const program: Program = "HHS";
  const [logFor, setLogFor] = useState<{ clientId: string; clientName: string } | null>(null);

  const { start, end } = useMemo(() => monthBounds(month), [month]);

  // Org go-live floor: days before this org started documenting in Hive are
  // never real gaps — those records simply weren't captured in Hive.
  // Defaults to created_at when unset (conservative: never assumes
  // pre-adoption documentation exists).
  const orgGoLiveQ = useQuery({
    enabled: !!orgId,
    queryKey: ["res-daily-org-golive", orgId],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("organizations")
        .select("go_live_date, created_at")
        .eq("id", orgId)
        .maybeSingle();
      if (error) throw error;
      return data as { go_live_date: string | null; created_at: string } | null;
    },
  });
  const orgGoLive = (orgGoLiveQ.data?.go_live_date ?? orgGoLiveQ.data?.created_at ?? "").slice(0, 10);

  // Residential clients = anyone with an active HHS billing code.
  const clientsQ = useQuery({
    enabled: !!orgId,
    queryKey: ["res-daily-clients", orgId, program],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: codes, error } = await (supabase as any)
        .from("client_billing_codes")
        .select("client_id, service_code, monthly_max_units, service_start_date")
        .eq("organization_id", orgId);
      if (error) throw error;
      const byClient = new Map<string, { codes: string[]; cap: number | null; serviceStart: string | null }>();
      for (const r of (codes ?? []) as Array<{
        client_id: string; service_code: string; monthly_max_units: number | null; service_start_date: string | null;
      }>) {
        if (r.service_code !== program) continue;
        const prev = byClient.get(r.client_id) ?? { codes: [], cap: null, serviceStart: null };
        prev.codes.push(r.service_code);
        if (r.monthly_max_units != null) prev.cap = (prev.cap ?? 0) + Number(r.monthly_max_units);
        if (r.service_start_date && (!prev.serviceStart || r.service_start_date < prev.serviceStart)) {
          prev.serviceStart = r.service_start_date;
        }
        byClient.set(r.client_id, prev);
      }
      const ids = [...byClient.keys()];
      if (!ids.length) return [];
      const { data: clients } = await supabase
        .from("clients")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .select("id, first_name, last_name, hhs_monthly_support_hours" as any)
        .eq("organization_id", orgId)
        .in("id", ids);
      const rows = (clients ?? []) as unknown as Array<{
        id: string; first_name: string; last_name: string; hhs_monthly_support_hours: number | null;
      }>;
      return rows.map((row) => {
        const cc = byClient.get(row.id)!;
        return {
          id: row.id,
          name: `${row.first_name} ${row.last_name}`.trim(),
          codes: cc.codes,
          monthlyCap: cc.cap,
          serviceStart: cc.serviceStart,
          supportHoursTarget: row.hhs_monthly_support_hours ?? null,
        };
      });
    },
  });
  const clients = clientsQ.data ?? [];
  const clientIds = clients.map((c) => c.id);

  // Daily records for the month (HHS host-home billable day counts).
  const dailyQ = useQuery({
    enabled: clientIds.length > 0,
    queryKey: ["res-daily-records", orgId, start, end, clientIds.join(",")],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("hhs_daily_records_v")
        .select("client_id, record_date, billable, blocked_reason")
        .eq("organization_id", orgId)
        .gte("record_date", start)
        .lte("record_date", end)
        .in("client_id", clientIds);
      if (error) throw error;
      return (data ?? []) as Array<{ client_id: string; record_date: string; billable: boolean; blocked_reason: string | null }>;
    },
  });
  const dailyRows = dailyQ.data ?? [];

  // Hourly punches for the month — used for HHS Direct Support hours.
  const punchQ = useQuery({
    enabled: clientIds.length > 0,
    queryKey: ["res-daily-punches", orgId, start, end, clientIds.join(",")],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("evv_timesheets")
        .select(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          "client_id, service_type_code, clock_in_timestamp, clock_out_timestamp, review_status, corrected_clock_in, corrected_clock_out" as any,
        )
        .eq("organization_id", orgId)
        .gte("clock_in_timestamp", `${start}T00:00:00`)
        .lte("clock_in_timestamp", `${end}T23:59:59`)
        .in("client_id", clientIds);
      if (error) throw error;
      return (data ?? []) as unknown as Array<{
        client_id: string;
        service_type_code: string | null;
        clock_in_timestamp: string;
        clock_out_timestamp: string | null;
        review_status?: string | null;
        corrected_clock_in?: string | null;
        corrected_clock_out?: string | null;
      }>;
    },
  });

  const supervisionQ = useQuery({
    enabled: clientIds.length > 0,
    queryKey: ["res-supervision", orgId, start, end, clientIds.join(",")],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("host_supervision_contacts")
        .select("id, client_id, contact_date, contact_type, summary")
        .eq("organization_id", orgId)
        .gte("contact_date", start)
        .lte("contact_date", end)
        .in("client_id", clientIds)
        .order("contact_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; client_id: string; contact_date: string; contact_type: string; summary: string | null }>;
    },
  });

  // §1.27 incident counts for the month — feeds the per-client "Incidents"
  // chip and matches the admin Incidents queue / log filters exactly.
  const incidentsQ = useQuery({
    enabled: clientIds.length > 0,
    queryKey: ["res-incidents", orgId, start, end, clientIds.join(",")],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("incident_reports")
        .select("id, client_id, discovered_at, status, is_fatality")
        .eq("organization_id", orgId)
        .gte("discovered_at", `${start}T00:00:00Z`)
        .lte("discovered_at", `${end}T23:59:59Z`)
        .in("client_id", clientIds);
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; client_id: string; discovered_at: string; status: string | null; is_fatality: boolean | null }>;
    },
  });

  const summary = useMemo(() => {
    type Row = {
      id: string;
      name: string;
      codes: string[];
      monthlyCap: number | null;
      supportHoursTarget: number | null;
      needsNoteFrom: string;
      billableDays: number;
      missingDays: number;
      supportHoursDelivered: number;
      supervisionContacts: number;
      incidentsOpen: number;
      incidentsClosed: number;
      fatalityThisMonth: boolean;
    };
    const map = new Map<string, Row>();
    for (const c of clients) {
      // "Days that need a note" starts from whichever is later: the
      // client's own HHS service start, or the org's Hive go-live date.
      // Never flag a day before either as missing.
      const needsNoteFrom =
        c.serviceStart && c.serviceStart > orgGoLive ? c.serviceStart : orgGoLive;
      map.set(c.id, {
        id: c.id,
        name: c.name,
        codes: c.codes,
        monthlyCap: c.monthlyCap,
        supportHoursTarget: c.supportHoursTarget,
        needsNoteFrom,
        billableDays: 0,
        missingDays: 0,
        supportHoursDelivered: 0,
        supervisionContacts: 0,
        incidentsOpen: 0,
        incidentsClosed: 0,
        fatalityThisMonth: false,
      });
    }
    for (const r of dailyRows) {
      const row = map.get(r.client_id);
      if (!row) continue;
      // A documented (billable) day always counts, even if it predates the
      // go-live floor — an imported/attested record still shows as done.
      if (r.billable) row.billableDays += 1;
      else if (!row.needsNoteFrom || r.record_date >= row.needsNoteFrom) row.missingDays += 1;
    }
    // Direct Support hours = sum of HOURLY (non-daily-rate) punches passing
    // review. HHS has no clock component, so this only ever sums agency
    // staff visits into the host home — skipped via the isDailyServiceCode
    // guard for any daily-rate code.
    for (const t of punchQ.data ?? []) {
      if (!t.service_type_code || isDailyServiceCode(t.service_type_code)) continue;
      if (!isBillableForReview(t)) continue;
      const eff = effectiveBillingTimes(t);
      if (!eff) continue;
      const hrs = (new Date(eff.out).getTime() - new Date(eff.in).getTime()) / 3_600_000;
      if (!isFinite(hrs) || hrs <= 0) continue;
      const row = map.get(t.client_id);
      if (row) row.supportHoursDelivered += hrs;
    }
    for (const s of supervisionQ.data ?? []) {
      const row = map.get(s.client_id);
      if (row) row.supervisionContacts += 1;
    }
    for (const ir of incidentsQ.data ?? []) {
      const row = map.get(ir.client_id);
      if (!row) continue;
      if (ir.status === "State_Confirmed") row.incidentsClosed += 1;
      else row.incidentsOpen += 1;
      if (ir.is_fatality) row.fatalityThisMonth = true;
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [clients, dailyRows, punchQ.data, supervisionQ.data, incidentsQ.data, orgGoLive]);

  // Amber under 75% with <1 week left; red when month closed under target.
  const now = new Date();
  const monthEnd = new Date(end + "T23:59:59");
  const daysLeft = Math.max(0, Math.ceil((monthEnd.getTime() - now.getTime()) / 86_400_000));
  const monthClosed = now > monthEnd;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <Label className="text-xs">Month</Label>
          <Input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value || thisMonth())}
            className="h-9 w-[160px]"
          />
        </div>
      </div>

      {clientsQ.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading residential clients…</p>
      ) : !summary.length ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No clients with an active {program} billing code.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {summary.map((row) => {
            const isHhs = row.codes.includes("HHS");
            const target = row.supportHoursTarget ?? 0;
            const delivered = row.supportHoursDelivered;
            const pct = target > 0 ? (delivered / target) * 100 : null;
            const supportTone =
              pct == null
                ? "muted"
                : monthClosed && pct < 100
                  ? "red"
                  : pct < 75 && daysLeft < 7
                    ? "amber"
                    : pct >= 100
                      ? "emerald"
                      : "muted";
            return (
              <Card key={row.id} className="overflow-hidden">
                <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pb-2">
                  <div>
                    <CardTitle className="text-sm">{row.name}</CardTitle>
                    <div className="mt-1 flex flex-wrap items-center gap-1">
                      {row.codes.map((c) => (
                        <Badge key={c} variant="outline" className="text-[10px] font-mono">{c}</Badge>
                      ))}
                      {row.fatalityThisMonth && (
                        <button
                          type="button"
                          onClick={() => onOpenIncidents?.(row.id)}
                          className="rounded-md focus:outline-none focus:ring-2 focus:ring-rose-400"
                          aria-label="Open fatality incident in the Incidents log"
                        >
                          <Badge className="bg-rose-600 text-[10px] text-white hover:bg-rose-700">
                            §1.26 Fatality
                          </Badge>
                        </button>
                      )}
                      {row.incidentsOpen + row.incidentsClosed > 0 ? (
                        <button
                          type="button"
                          onClick={() => onOpenIncidents?.(row.id)}
                          className="rounded-md focus:outline-none focus:ring-2 focus:ring-amber-400"
                          aria-label="Open this client's incidents in the log"
                          title="Open in Incidents log"
                        >
                          <Badge
                            variant={row.incidentsOpen > 0 ? "destructive" : "outline"}
                            className="cursor-pointer text-[10px]"
                          >
                            {row.incidentsOpen > 0
                              ? `${row.incidentsOpen} open IR${row.incidentsOpen === 1 ? "" : "s"}`
                              : `${row.incidentsClosed} IR${row.incidentsClosed === 1 ? "" : "s"} closed`}
                          </Badge>
                        </button>
                      ) : (
                        <Badge variant="outline" className="text-[10px] text-muted-foreground">
                          0 incidents
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-muted-foreground">Billable days</div>
                    <div className="font-mono text-lg font-semibold tabular-nums">
                      {row.billableDays}
                      {row.monthlyCap ? <span className="text-xs text-muted-foreground"> / {row.monthlyCap}</span> : null}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 pt-1">
                  {row.missingDays > 0 && (
                    <div className="text-xs text-amber-700 dark:text-amber-300">
                      {row.missingDays} day{row.missingDays === 1 ? "" : "s"} this month did not bill — open the client hub to see what's missing.
                    </div>
                  )}

                  {isHhs && (
                    <div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium">Direct Support hours</span>
                        <span className="font-mono tabular-nums">
                          {delivered.toFixed(1)}h
                          {target > 0 ? <span className="text-muted-foreground"> / {target.toFixed(1)}h</span> : null}
                        </span>
                      </div>
                      {target > 0 ? (
                        <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted">
                          <div
                            className={`h-full transition-all ${
                              supportTone === "red"
                                ? "bg-rose-500"
                                : supportTone === "amber"
                                  ? "bg-amber-500"
                                  : supportTone === "emerald"
                                    ? "bg-emerald-500"
                                    : "bg-slate-400"
                            }`}
                            style={{ width: `${Math.min(100, pct ?? 0)}%` }}
                          />
                        </div>
                      ) : (
                        <p className="text-[11px] text-muted-foreground">
                          Not set — from DSPD Worksheet. Edit the client to add a monthly support-hours target.
                        </p>
                      )}
                    </div>
                  )}

                  {isHhs && (
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-xs">
                        <UsersIcon className="h-3.5 w-3.5 text-muted-foreground" />
                        {row.supervisionContacts > 0 ? (
                          <span className="text-emerald-700 dark:text-emerald-300">
                            Supervised ✓ · {row.supervisionContacts} contact{row.supervisionContacts === 1 ? "" : "s"}
                          </span>
                        ) : (
                          <span className="text-amber-700 dark:text-amber-300">No supervision contact logged this month</span>
                        )}
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setLogFor({ clientId: row.id, clientName: row.name })}
                      >
                        <Plus className="mr-1 h-3.5 w-3.5" />Log supervision contact
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <LogSupervisionDialog
        target={logFor}
        orgId={orgId}
        onClose={() => setLogFor(null)}
      />
    </div>
  );
}

function LogSupervisionDialog({
  target,
  orgId,
  onClose,
}: {
  target: { clientId: string; clientName: string } | null;
  orgId: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [contactDate, setContactDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [contactType, setContactType] = useState<"home_visit" | "phone" | "other">("home_visit");
  const [summary, setSummary] = useState("");

  const save = useMutation({
    mutationFn: async () => {
      if (!target) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("host_supervision_contacts")
        .insert({
          organization_id: orgId,
          client_id: target.clientId,
          contact_date: contactDate,
          contact_type: contactType,
          summary: summary.trim() || null,
          conducted_by: user?.id ?? null,
        });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Supervision contact logged.");
      qc.invalidateQueries({ queryKey: ["res-supervision"] });
      setSummary("");
      onClose();
    },
    onError: (e) => toast.error((e as Error).message ?? "Could not save contact."),
  });

  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HomeIcon className="h-4 w-4" />
            Log host supervision contact
          </DialogTitle>
        </DialogHeader>
        {target && (
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">For <span className="font-medium text-foreground">{target.clientName}</span>.</p>
            <div>
              <Label className="text-xs"><CalendarIcon className="mr-1 inline h-3 w-3" />Contact date</Label>
              <Input type="date" value={contactDate} onChange={(e) => setContactDate(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Type</Label>
              <Select value={contactType} onValueChange={(v) => setContactType(v as typeof contactType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="home_visit">Home visit</SelectItem>
                  <SelectItem value="phone">Phone</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Summary (optional)</Label>
              <Textarea
                rows={3}
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                placeholder="What did you observe / discuss?"
              />
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || !target}>
            {save.isPending ? "Saving…" : "Save contact"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
