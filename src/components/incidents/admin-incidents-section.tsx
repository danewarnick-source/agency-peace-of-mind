import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  listIncidents,
  submitToUpi,
  updateIncidentFollowupNotes,
  getIncidentActors,
} from "@/lib/incidents.functions";
import { INCIDENT_CATEGORIES, GUARDIAN_METHODS, type GuardianMethod } from "./incident-categories";
import { useCaseload } from "@/hooks/use-caseload";
import { useCurrentOrg } from "@/hooks/use-org";
import { usePermissions } from "@/hooks/use-permissions";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle2, Skull, Clock, FileCheck2, ChevronDown, ChevronUp } from "lucide-react";
import { IncidentTrendsStrip, type TrendFilter } from "./incident-trends-strip";
import { AttestationDialog, type AttestationSignature } from "./attestation-dialog";
import { renderUpiSubmittedAttestation } from "@/lib/incident-attestations";

type ClientLite = {
  first_name: string;
  last_name: string;
};

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
  guardian_notified_details?: string | null;
  upi_submitted_at: string | null;
  upi_submitted_by: string | null;
  upi_submitted_signed_name?: string | null;
  upi_submitted_signed_title?: string | null;
  followup_notes: string | null;
  created_at: string;
  clients: ClientLite | null;
  restraint_used?: boolean | null;
  aps_notified_at?: string | null;
  ai_review_status?: string | null;
  ai_review_issues?: Array<{ field?: string | null; severity: string; question: string; answer?: string | null; not_applicable_reason?: string | null }> | null;
  ai_review_at?: string | null;
};

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

function ActorNames({ ids, actors }: { ids: Array<string | null | undefined>; actors: Map<string, string> }) {
  const names = ids.filter(Boolean).map((id) => actors.get(id!) ?? id!.slice(0, 8));
  if (!names.length) return null;
  return <span className="text-[10px] text-muted-foreground"> by {names.join(", ")}</span>;
}

// ── Combined "Submit to UPI" dialog — UPI entry + guardian notification ────

function SubmitUpiDialog({ incidentId, onClose }: { incidentId: string | null; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: org } = useCurrentOrg();
  const fn = useServerFn(submitToUpi);
  const [guardianContacted, setGuardianContacted] = useState(true);
  const [method, setMethod] = useState<GuardianMethod>("phone");
  const [details, setDetails] = useState("");

  const attestationText = renderUpiSubmittedAttestation({
    when: new Date().toLocaleString(),
    guardianContacted,
    method,
  });

  const m = useMutation({
    mutationFn: async (sig: AttestationSignature) => {
      if (!incidentId || !org?.id) return;
      return fn({
        data: {
          organization_id: org.id,
          id: incidentId,
          guardian_contacted: guardianContacted,
          guardian_method: guardianContacted ? method : null,
          guardian_details: guardianContacted ? (details.trim() || null) : null,
          ...sig,
        },
      });
    },

    onSuccess: () => {
      toast.success("Submitted to UPI — incident closed.");
      qc.invalidateQueries({ queryKey: ["incidents"] });
      setDetails("");
      setGuardianContacted(true);
      setMethod("phone");
      onClose();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <AttestationDialog
      open={!!incidentId}
      onClose={onClose}
      title="Submit to UPI"
      attestationText={attestationText}
      submitLabel="Sign & submit to UPI"
      onSubmit={(sig) => m.mutate(sig)}
      pending={m.isPending}
      intro={
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Confirms UPI entry was initiated and the detailed report completed. UPI
            automatically notifies the Support Coordinator — no separate action needed.
          </p>
          <div>
            <Label className="text-xs font-semibold">Guardian notification *</Label>
            <div className="mt-1 flex gap-2">
              <Button
                type="button"
                size="sm"
                variant={guardianContacted ? "default" : "outline"}
                onClick={() => setGuardianContacted(true)}
              >
                Contacted guardian
              </Button>
              <Button
                type="button"
                size="sm"
                variant={!guardianContacted ? "default" : "outline"}
                onClick={() => setGuardianContacted(false)}
              >
                Self-guardian / not applicable
              </Button>
            </div>
          </div>
          {guardianContacted && (
            <div className="grid grid-cols-2 gap-3">
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
                <Label className="text-xs">Details (optional)</Label>
                <Input value={details} onChange={(e) => setDetails(e.target.value)} placeholder="e.g. spoke with mother" />
              </div>
            </div>
          )}
        </div>
      }
    />
  );
}

function FollowupNotesField({
  incidentId,
  initialNotes,
  canEdit,
}: {
  incidentId: string;
  initialNotes: string | null;
  canEdit: boolean;
}) {
  const qc = useQueryClient();
  const fn = useServerFn(updateIncidentFollowupNotes);
  const [notes, setNotes] = useState(initialNotes ?? "");
  const [dirty, setDirty] = useState(false);
  const m = useMutation({
    mutationFn: () => fn({ data: { id: incidentId, followup_notes: notes.trim() || null } }),
    onSuccess: () => {
      toast.success("Follow-up notes saved.");
      setDirty(false);
      qc.invalidateQueries({ queryKey: ["incidents"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });
  return (
    <div>
      <Label className="text-xs font-semibold">Incident follow-up notes</Label>
      <Textarea
        rows={2}
        value={notes}
        disabled={!canEdit}
        onChange={(e) => { setNotes(e.target.value); setDirty(true); }}
        placeholder="Optional — any follow-up context. Never blocks closing."
      />
      {canEdit && dirty && (
        <Button size="sm" variant="outline" className="mt-1" onClick={() => m.mutate()} disabled={m.isPending}>
          {m.isPending ? "Saving…" : "Save notes"}
        </Button>
      )}
    </div>
  );
}

function IncidentCard({
  ir,
  actors,
  onSubmitUpi,
}: {
  ir: Incident;
  actors: Map<string, string>;
  onSubmitUpi: (id: string) => void;
}) {
  const { can } = usePermissions();
  const canManageIncidents = can("manage_incidents");
  const [expanded, setExpanded] = useState(false);
  const discovered = ir.discovered_at ? new Date(ir.discovered_at) : new Date(ir.created_at);
  const upiDeadline = new Date(discovered.getTime() + 24 * 3_600_000);
  const clientName = ir.clients ? `${ir.clients.first_name} ${ir.clients.last_name}` : "Client";
  const closed = ir.status === "State_Confirmed";

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
          <div className="flex items-start gap-2">
            <div className="text-right text-[10px] text-muted-foreground">
              Discovered {fmtDate(ir.discovered_at)}
              <ActorNames ids={[ir.reported_by]} actors={actors} />
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2"
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? (
                <>Hide <ChevronUp className="ml-1 h-3.5 w-3.5" /></>
              ) : (
                <>Expand <ChevronDown className="ml-1 h-3.5 w-3.5" /></>
              )}
            </Button>
          </div>
        </div>
      </CardHeader>
      {!expanded && (
        <CardContent className="pt-0 pb-3">
          <div className="flex flex-wrap items-center gap-2">
            {ir.is_abuse_neglect && !ir.aps_notified_at && (
              <Badge className="bg-rose-600 text-white">APS-PENDING</Badge>
            )}
            {!ir.upi_submitted_at && <Badge variant="outline">UPI not submitted</Badge>}
            {closed && <Badge className="bg-emerald-600 text-white">Completed</Badge>}
          </div>
        </CardContent>
      )}
      {expanded && (
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
          <CountdownPill deadline={upiDeadline} done={!!ir.upi_submitted_at} totalHours={24} label="UPI submission + guardian notice · 24h" />
          {ir.is_abuse_neglect && !ir.aps_notified_at && (
            <Badge className="bg-rose-600 text-white">APS-PENDING</Badge>
          )}
          {ir.restraint_used && (
            <Badge className="bg-amber-600 text-white">RESTRAINT</Badge>
          )}
          {closed && <Badge className="bg-emerald-600 text-white">Completed</Badge>}
        </div>

        {(ir.upi_submitted_at || ir.guardian_notified_at) && (
          <div className="space-y-0.5 rounded-md border border-border bg-card/60 p-2 text-[11px] text-muted-foreground">
            {ir.upi_submitted_at && (
              <div>
                Submitted to UPI {fmtDate(ir.upi_submitted_at)}
                <ActorNames ids={[ir.upi_submitted_by]} actors={actors} />
                {ir.upi_submitted_signed_name && (
                  <span> · signed by {ir.upi_submitted_signed_name}{ir.upi_submitted_signed_title ? `, ${ir.upi_submitted_signed_title}` : ""}</span>
                )}
              </div>
            )}
            {ir.guardian_notified_at && (
              <div>
                {ir.guardian_notified_method === "self_guardian_na"
                  ? "Self-guardian / guardian notification not applicable"
                  : `Guardian notified (${ir.guardian_notified_method ?? "—"})`}
                {" "}{fmtDate(ir.guardian_notified_at)}
                <ActorNames ids={[ir.guardian_notified_by]} actors={actors} />
                {ir.guardian_notified_details && (
                  <div className="mt-0.5 whitespace-pre-wrap text-foreground">↳ {ir.guardian_notified_details}</div>
                )}
              </div>
            )}
          </div>
        )}

        <FollowupNotesField incidentId={ir.id} initialNotes={ir.followup_notes} canEdit={canManageIncidents} />

        {canManageIncidents ? (
          <div className="flex flex-wrap gap-2">
            {!closed && (
              <Button size="sm" onClick={() => onSubmitUpi(ir.id)}>
                <FileCheck2 className="mr-1 h-3.5 w-3.5" />Submit to UPI
              </Button>
            )}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">View only — you don't have permission to edit incidents.</p>
        )}
      </CardContent>
      )}
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
  const listFn = useServerFn(listIncidents);
  const actorsFn = useServerFn(getIncidentActors);

  const [view, setView] = useState<"queue" | "log">(initialView ?? "queue");
  const [status, setStatus] = useState<"open" | "closed" | "all">("all");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterClient, setFilterClient] = useState<string>(initialClientId ?? "all");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");

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
          status: view === "queue" ? "open" : status,
          category: filterCategory === "all" ? null : filterCategory,
          client_id: filterClient === "all" ? null : filterClient,
          from: from ? new Date(from).toISOString() : null,
          to: to ? new Date(to).toISOString() : null,
          limit: 200,
        },
      }),
  });
  const incidents = (data?.incidents ?? []) as Incident[];

  const sorted = useMemo(() => {
    return [...incidents].sort((a, b) => {
      if (a.is_fatality !== b.is_fatality) return a.is_fatality ? -1 : 1;
      const aAps = a.is_abuse_neglect && !a.aps_notified_at;
      const bAps = b.is_abuse_neglect && !b.aps_notified_at;
      if (aAps !== bAps) return aAps ? -1 : 1;
      return (b.discovered_at ?? b.created_at).localeCompare(a.discovered_at ?? a.created_at);
    });
  }, [incidents]);

  const actorIds = useMemo(() => {
    const s = new Set<string>();
    for (const ir of incidents) {
      if (ir.reported_by) s.add(ir.reported_by);
      if (ir.upi_submitted_by) s.add(ir.upi_submitted_by);
      if (ir.guardian_notified_by) s.add(ir.guardian_notified_by);
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

  const [submitUpiFor, setSubmitUpiFor] = useState<string | null>(null);

  const onTrendPick = (f: TrendFilter) => {
    if (f.kind === "month") {
      const [y, m] = f.monthKey.split("-").map(Number);
      setFrom(new Date(Date.UTC(y, m - 1, 1)).toISOString().slice(0, 10));
      setTo(new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10));
      setStatus("all");
    } else if (f.kind === "category") {
      setFilterCategory(f.category);
      const [y, m] = f.monthKey.split("-").map(Number);
      setFrom(new Date(Date.UTC(y, m - 1, 1)).toISOString().slice(0, 10));
      setTo(new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10));
      setStatus("all");
    } else if (f.kind === "client") {
      setFilterClient(f.clientId);
      setStatus("all");
    }
  };

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

      {view === "log" && <IncidentTrendsStrip rangeFrom={from} rangeTo={to} onPick={onTrendPick} />}

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
              onSubmitUpi={setSubmitUpiFor}
            />
          ))}
        </div>
      )}

      <SubmitUpiDialog incidentId={submitUpiFor} onClose={() => setSubmitUpiFor(null)} />
    </div>
  );
}
