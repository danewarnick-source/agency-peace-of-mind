import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  listIncidents,
  markUpiInitiated,
  markGuardianNotified,
  markUpiCompleted,
  getIncidentActors,
} from "@/lib/incidents.functions";
import { INCIDENT_CATEGORIES, GUARDIAN_METHODS, type GuardianMethod } from "./incident-categories";
import { useCaseload } from "@/hooks/use-caseload";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { AlertTriangle, CheckCircle2, Skull, Clock, Phone, FileCheck2, MessageSquare } from "lucide-react";
import { LogScRequestDialog, RespondScRequestDialog } from "./sc-request-dialogs";
import { IncidentTrendsStrip, type TrendFilter } from "./incident-trends-strip";

type Incident = {
  id: string;
  report_number: string;
  client_id: string;
  reported_by: string;
  discovered_at: string | null;
  occurred_at: string | null;
  category: string | null;
  description: string | null;
  location: string | null;
  status: string;
  is_abuse_neglect: boolean;
  is_fatality: boolean;
  prevention_strategies: string | null;
  guardian_notified_at: string | null;
  guardian_notified_method: string | null;
  guardian_notified_by: string | null;
  upi_initiated_at: string | null;
  upi_initiated_by: string | null;
  upi_completed_at: string | null;
  upi_completed_by: string | null;
  followup_notes: string | null;
  created_at: string;
  clients: { first_name: string; last_name: string } | null;
};

type ScRequest = {
  id: string;
  incident_id: string;
  requested_at: string;
  request_summary: string;
  responded_at: string | null;
  response_summary: string | null;
  responded_by: string | null;
};

// 5 business days from a discovery timestamp (skip Sat/Sun).
function addBusinessDays(start: Date, days: number): Date {
  const d = new Date(start);
  let added = 0;
  while (added < days) {
    d.setDate(d.getDate() + 1);
    const day = d.getDay();
    if (day !== 0 && day !== 6) added += 1;
  }
  return d;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function CountdownPill({
  deadline,
  done,
  totalHours,
  label,
}: {
  deadline: Date;
  done: boolean;
  totalHours: number;
  label: string;
}) {
  const now = Date.now();
  const msLeft = deadline.getTime() - now;
  const hrsLeft = msLeft / 3_600_000;
  if (done) {
    return (
      <Badge className="gap-1 bg-emerald-600 text-white hover:bg-emerald-600">
        <CheckCircle2 className="h-3 w-3" /> {label} ✓
      </Badge>
    );
  }
  const overdue = hrsLeft < 0;
  let tone = "bg-emerald-600 text-white";
  if (totalHours <= 24) {
    if (hrsLeft < 6) tone = "bg-rose-600 text-white animate-pulse";
    else if (hrsLeft < 12) tone = "bg-amber-500 text-white";
  } else {
    // 5-business-day clock: amber within 24h, red within 8h
    if (hrsLeft < 8) tone = "bg-rose-600 text-white animate-pulse";
    else if (hrsLeft < 24) tone = "bg-amber-500 text-white";
  }
  const text = overdue
    ? `${label} · OVERDUE ${Math.abs(Math.floor(hrsLeft))}h`
    : hrsLeft >= 24
      ? `${label} · ${Math.floor(hrsLeft / 24)}d ${Math.floor(hrsLeft % 24)}h left`
      : `${label} · ${Math.max(0, Math.floor(hrsLeft))}h ${Math.max(0, Math.floor((msLeft % 3_600_000) / 60_000))}m left`;
  return <Badge className={`gap-1 ${overdue ? "bg-rose-700 text-white" : tone}`}><Clock className="h-3 w-3" />{text}</Badge>;
}

function ActorNames({ ids, actors }: { ids: Array<string | null>; actors: Map<string, string> }) {
  const names = ids.filter(Boolean).map((id) => actors.get(id!) ?? id!.slice(0, 8));
  if (!names.length) return null;
  return <span className="text-[10px] text-muted-foreground"> by {names.join(", ")}</span>;
}

function GuardianDialog({ incidentId, onClose }: { incidentId: string | null; onClose: () => void }) {
  const qc = useQueryClient();
  const fn = useServerFn(markGuardianNotified);
  const [method, setMethod] = useState<GuardianMethod>("phone");
  const [when, setWhen] = useState(() => {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  });
  const m = useMutation({
    mutationFn: async () => {
      if (!incidentId) return;
      return fn({ data: { id: incidentId, method, notified_at: new Date(when).toISOString() } });
    },
    onSuccess: () => {
      toast.success("Guardian notification logged.");
      qc.invalidateQueries({ queryKey: ["incidents"] });
      onClose();
    },
    onError: (e) => toast.error((e as Error).message),
  });
  return (
    <Dialog open={!!incidentId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Log guardian notification</DialogTitle></DialogHeader>
        <div className="space-y-3 text-sm">
          <div>
            <Label className="text-xs">Method</Label>
            <Select value={method} onValueChange={(v) => setMethod(v as GuardianMethod)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {GUARDIAN_METHODS.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Notified at</Label>
            <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => m.mutate()} disabled={m.isPending}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CompleteDialog({ incidentId, onClose }: { incidentId: string | null; onClose: () => void }) {
  const qc = useQueryClient();
  const fn = useServerFn(markUpiCompleted);
  const [notes, setNotes] = useState("");
  const m = useMutation({
    mutationFn: async () => {
      if (!incidentId) return;
      return fn({ data: { id: incidentId, followup_notes: notes.trim() || null } });
    },
    onSuccess: () => {
      toast.success("Marked detailed UPI report completed.");
      qc.invalidateQueries({ queryKey: ["incidents"] });
      setNotes("");
      onClose();
    },
    onError: (e) => toast.error((e as Error).message),
  });
  return (
    <Dialog open={!!incidentId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Mark detailed UPI report completed</DialogTitle></DialogHeader>
        <div className="space-y-3 text-sm">
          <p className="text-xs text-muted-foreground">
            Attest that the detailed report has been entered into UPI. Add any follow-up
            or mitigating actions for the record.
          </p>
          <div>
            <Label className="text-xs">Follow-up / mitigating actions</Label>
            <Textarea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => m.mutate()} disabled={m.isPending}>Save & attest</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function IncidentCard({
  ir,
  scRequests,
  actors,
  onInitiate,
  onNotify,
  onComplete,
  onLogSc,
  onRespondSc,
  initPending,
}: {
  ir: Incident;
  scRequests: ScRequest[];
  actors: Map<string, string>;
  onInitiate: (id: string) => void;
  onNotify: (id: string) => void;
  onComplete: (id: string) => void;
  onLogSc: (incidentId: string) => void;
  onRespondSc: (scRequestId: string) => void;
  initPending: boolean;
}) {
  const discovered = ir.discovered_at ? new Date(ir.discovered_at) : new Date(ir.created_at);
  const upiDeadline = new Date(discovered.getTime() + 24 * 3_600_000);
  const guardianDeadline = new Date(discovered.getTime() + 24 * 3_600_000);
  const completionDeadline = addBusinessDays(discovered, 5);
  const clientName = ir.clients ? `${ir.clients.first_name} ${ir.clients.last_name}` : "Client";
  const closed = ir.status === "closed";
  const openSc = scRequests.filter((s) => !s.responded_at);
  const respondedSc = scRequests.filter((s) => !!s.responded_at);

  return (
    <Card className={`overflow-hidden ${ir.is_fatality ? "border-rose-500 border-2" : ""}`}>
      {ir.is_fatality && (
        <div className="flex items-center gap-2 bg-rose-600 px-3 py-2 text-xs font-semibold text-white">
          <Skull className="h-3.5 w-3.5" />
          Fatality — immediate DHHS / §1.26 notifications required
        </div>
      )}
      <CardHeader className="space-y-1 pb-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-sm">
              {ir.report_number} · {clientName}
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              {ir.category ?? "Uncategorized"}
              {ir.location ? ` · ${ir.location}` : ""}
            </p>
          </div>
          <div className="text-right text-[10px] text-muted-foreground">
            Discovered {fmtDate(ir.discovered_at)}
            <ActorNames ids={[ir.reported_by]} actors={actors} />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 pt-1">
        {ir.description && (
          <p className="whitespace-pre-wrap rounded-md bg-muted/40 px-3 py-2 text-xs">{ir.description}</p>
        )}
        {ir.is_abuse_neglect && ir.prevention_strategies && (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs dark:bg-amber-950/30">
            <p className="font-semibold text-amber-800 dark:text-amber-100">Prevention strategies (§1.27(3))</p>
            <p className="whitespace-pre-wrap text-amber-900 dark:text-amber-100">{ir.prevention_strategies}</p>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <CountdownPill deadline={upiDeadline} done={!!ir.upi_initiated_at} totalHours={24} label="UPI initiation 24h" />
          <CountdownPill deadline={guardianDeadline} done={!!ir.guardian_notified_at} totalHours={24} label="Guardian 24h" />
          <CountdownPill deadline={completionDeadline} done={!!ir.upi_completed_at} totalHours={5 * 24} label="UPI completion 5 bus.d" />
          {openSc.map((s) => (
            <CountdownPill
              key={s.id}
              deadline={addBusinessDays(new Date(s.requested_at), 5)}
              done={false}
              totalHours={5 * 24}
              label="SC response 5 bus.d"
            />
          ))}
          {closed && openSc.length === 0 && <Badge className="bg-slate-600 text-white">Closed</Badge>}
          {closed && openSc.length > 0 && (
            <Badge className="bg-amber-600 text-white">Re-surfaced · open SC request</Badge>
          )}
        </div>

        {(ir.upi_initiated_at || ir.guardian_notified_at || ir.upi_completed_at) && (
          <div className="space-y-0.5 rounded-md border border-border bg-card/60 p-2 text-[11px] text-muted-foreground">
            {ir.upi_initiated_at && (
              <div>UPI initiated {fmtDate(ir.upi_initiated_at)}<ActorNames ids={[ir.upi_initiated_by]} actors={actors} /></div>
            )}
            {ir.guardian_notified_at && (
              <div>Guardian notified ({ir.guardian_notified_method ?? "—"}) {fmtDate(ir.guardian_notified_at)}<ActorNames ids={[ir.guardian_notified_by]} actors={actors} /></div>
            )}
            {ir.upi_completed_at && (
              <div>UPI detailed report completed {fmtDate(ir.upi_completed_at)}<ActorNames ids={[ir.upi_completed_by]} actors={actors} /></div>
            )}
            {ir.followup_notes && (
              <div className="mt-1 whitespace-pre-wrap text-foreground">Follow-up: {ir.followup_notes}</div>
            )}
          </div>
        )}

        {/* SC request trail */}
        {scRequests.length > 0 && (
          <div className="space-y-2 rounded-md border border-border bg-card/60 p-2 text-[11px]">
            <p className="font-semibold text-foreground">Support Coordinator follow-up (§1.27(5))</p>
            {scRequests.map((s) => (
              <div key={s.id} className="rounded border border-border/60 bg-background/60 p-2">
                <div className="text-[10px] text-muted-foreground">
                  Requested {fmtDate(s.requested_at)}
                </div>
                <div className="whitespace-pre-wrap text-foreground">{s.request_summary}</div>
                {s.responded_at ? (
                  <div className="mt-1 text-[10px] text-emerald-700 dark:text-emerald-300">
                    Responded {fmtDate(s.responded_at)}
                    <ActorNames ids={[s.responded_by]} actors={actors} />
                    {s.response_summary && (
                      <div className="mt-0.5 whitespace-pre-wrap text-foreground">↳ {s.response_summary}</div>
                    )}
                  </div>
                ) : (
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <span className="text-amber-700 dark:text-amber-300">Awaiting SC response.</span>
                    <Button size="sm" variant="outline" onClick={() => onRespondSc(s.id)}>
                      Mark responded
                    </Button>
                  </div>
                )}
              </div>
            ))}
            {respondedSc.length > 0 && respondedSc.length === scRequests.length && (
              <p className="text-[10px] text-muted-foreground">All SC requests responded.</p>
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {!closed && !ir.upi_initiated_at && (
            <Button size="sm" disabled={initPending} onClick={() => onInitiate(ir.id)}>
              <FileCheck2 className="mr-1 h-3.5 w-3.5" />Mark initiated in UPI
            </Button>
          )}
          {!closed && !ir.guardian_notified_at && (
            <Button size="sm" variant="outline" onClick={() => onNotify(ir.id)}>
              <Phone className="mr-1 h-3.5 w-3.5" />Log guardian notification
            </Button>
          )}
          {!closed && !ir.upi_completed_at && (
            <Button size="sm" variant="outline" onClick={() => onComplete(ir.id)}>
              <CheckCircle2 className="mr-1 h-3.5 w-3.5" />Mark detailed report completed
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => onLogSc(ir.id)}>
            <MessageSquare className="mr-1 h-3.5 w-3.5" />Log SC information request
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}


export function AdminIncidentsSection({
  initialClientId,
  initialView,
}: {
  initialClientId?: string | null;
  initialView?: "queue" | "log";
} = {}) {
  const qc = useQueryClient();
  const listFn = useServerFn(listIncidents);
  const initFn = useServerFn(markUpiInitiated);
  const actorsFn = useServerFn(getIncidentActors);

  const [view, setView] = useState<"queue" | "log">(initialView ?? "queue");
  const [status, setStatus] = useState<"open" | "closed" | "all">("all");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterClient, setFilterClient] = useState<string>(initialClientId ?? "all");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");

  // Re-sync when caller hands us a new prefilter (e.g. Residential tab deep-link).
  useEffect(() => {
    if (initialClientId) {
      setFilterClient(initialClientId);
      setView(initialView ?? "log");
      setStatus("all");
    }
  }, [initialClientId, initialView]);

  const { data: caseload = [] } = useCaseload();
  const { data, isLoading } = useQuery({
    queryKey: ["incidents", view, status, filterCategory, filterClient, from, to],
    queryFn: () =>
      listFn({
        data: {
          // Always pull all; queue re-surface rule is applied client-side so
          // a closed incident with an open SC request still shows in the queue.
          status: view === "queue" ? "all" : status,
          category: filterCategory === "all" ? null : filterCategory,
          client_id: filterClient === "all" ? null : filterClient,
          from: from ? new Date(from).toISOString() : null,
          to: to ? new Date(to).toISOString() : null,
          limit: 200,
        },
      }),
  });
  const incidents = (data?.incidents ?? []) as Incident[];
  const scRequests = (data?.sc_requests ?? []) as ScRequest[];
  const scByIncident = useMemo(() => {
    const m = new Map<string, ScRequest[]>();
    for (const s of scRequests) {
      const arr = m.get(s.incident_id) ?? [];
      arr.push(s);
      m.set(s.incident_id, arr);
    }
    return m;
  }, [scRequests]);

  // Queue view: open incidents OR any incident with an unresponded SC request.
  const visible = useMemo(() => {
    if (view === "log") return incidents;
    return incidents.filter((ir) => {
      if (ir.status !== "closed") return true;
      return (scByIncident.get(ir.id) ?? []).some((s) => !s.responded_at);
    });
  }, [view, incidents, scByIncident]);

  const sorted = useMemo(() => {
    return [...visible].sort((a, b) => {
      if (a.is_fatality !== b.is_fatality) return a.is_fatality ? -1 : 1;
      return (b.discovered_at ?? b.created_at).localeCompare(a.discovered_at ?? a.created_at);
    });
  }, [visible]);

  const actorIds = useMemo(() => {
    const s = new Set<string>();
    for (const ir of incidents) {
      if (ir.reported_by) s.add(ir.reported_by);
      if (ir.upi_initiated_by) s.add(ir.upi_initiated_by);
      if (ir.guardian_notified_by) s.add(ir.guardian_notified_by);
      if (ir.upi_completed_by) s.add(ir.upi_completed_by);
    }
    return [...s];
  }, [incidents]);
  const { data: actorsData } = useQuery({
    enabled: actorIds.length > 0,
    queryKey: ["incident-actors", actorIds.join(",")],
    queryFn: () => actorsFn({ data: { user_ids: actorIds } }),
  });
  const actorMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of (actorsData?.profiles ?? []) as Array<{ id: string; first_name: string | null; last_name: string | null }>) {
      m.set(p.id, `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || p.id.slice(0, 8));
    }
    return m;
  }, [actorsData]);

  const [guardianId, setGuardianId] = useState<string | null>(null);
  const [completeId, setCompleteId] = useState<string | null>(null);
  const initiate = useMutation({
    mutationFn: (id: string) => initFn({ data: { id } }),
    onSuccess: () => {
      toast.success("UPI initiation attested.");
      qc.invalidateQueries({ queryKey: ["incidents"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold tracking-tight flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          Incidents
        </h3>
        <nav className="ml-auto inline-flex rounded-lg border border-border bg-card p-1">
          {([
            { id: "queue" as const, label: "Open queue" },
            { id: "log" as const, label: "Log / filter" },
          ]).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setView(t.id)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium ${view === t.id ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {view === "log" && (
        <Card>
          <CardContent className="flex flex-wrap items-end gap-3 py-3 text-xs">
            <div>
              <Label className="text-[10px]">Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
                <SelectTrigger className="h-8 w-[120px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                  <SelectItem value="all">All</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[10px]">Client</Label>
              <Select value={filterClient} onValueChange={setFilterClient}>
                <SelectTrigger className="h-8 w-[200px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All clients</SelectItem>
                  {caseload.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.first_name} {c.last_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[10px]">Category</Label>
              <Select value={filterCategory} onValueChange={setFilterCategory}>
                <SelectTrigger className="h-8 w-[220px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  {INCIDENT_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[10px]">From</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-8 w-[140px]" />
            </div>
            <div>
              <Label className="text-[10px]">To</Label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-8 w-[140px]" />
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading incidents…</p>
      ) : !sorted.length ? (
        <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">No incidents in this view.</CardContent></Card>
      ) : (
        <div className="grid gap-3">
          {sorted.map((ir) => (
            <IncidentCard
              key={ir.id}
              ir={ir}
              actors={actorMap}
              onInitiate={(id) => initiate.mutate(id)}
              onNotify={setGuardianId}
              onComplete={setCompleteId}
              initPending={initiate.isPending}
            />
          ))}
        </div>
      )}

      <GuardianDialog incidentId={guardianId} onClose={() => setGuardianId(null)} />
      <CompleteDialog incidentId={completeId} onClose={() => setCompleteId(null)} />
    </div>
  );
}
