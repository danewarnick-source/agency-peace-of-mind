import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  listIncidents,
  markUpiInitiated,
  markGuardianNotified,
  markUpiCompleted,
  markScUpdated,
  getClientGuardianInfo,
  getIncidentActors,
} from "@/lib/incidents.functions";
import { INCIDENT_CATEGORIES, GUARDIAN_METHODS, type GuardianMethod } from "./incident-categories";
import { useCaseload } from "@/hooks/use-caseload";
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
import { AlertTriangle, CheckCircle2, Skull, Clock, Phone, FileCheck2, MessageSquare, UserCheck } from "lucide-react";
import { LogScRequestDialog, RespondScRequestDialog } from "./sc-request-dialogs";
import { IncidentTrendsStrip, type TrendFilter } from "./incident-trends-strip";
import { AttestationDialog, type AttestationSignature } from "./attestation-dialog";
import {
  renderGuardianAttestation,
  renderUpiInitiatedAttestation,
  renderUpiCompletedAttestation,
  renderScUpdateAttestation,
} from "@/lib/incident-attestations";

type ClientLite = {
  first_name: string;
  last_name: string;
  is_own_guardian?: boolean | null;
  guardian_name?: string | null;
  guardian_phone?: string | null;
  guardian_relationship?: string | null;
  guardian_email?: string | null;
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
  guardian_signed_name?: string | null;
  guardian_signed_title?: string | null;
  upi_initiated_at: string | null;
  upi_initiated_by: string | null;
  upi_initiated_signed_name?: string | null;
  upi_initiated_signed_title?: string | null;
  upi_completed_at: string | null;
  upi_completed_by: string | null;
  upi_completed_signed_name?: string | null;
  upi_completed_signed_title?: string | null;
  sc_update_signed_at?: string | null;
  sc_update_signed_name?: string | null;
  sc_update_signed_title?: string | null;
  sc_update_signed_by?: string | null;
  sc_update_notes?: string | null;
  followup_notes: string | null;
  created_at: string;
  clients: ClientLite | null;
  restraint_used?: boolean | null;
  aps_notified_at?: string | null;
  ai_review_status?: string | null;
  ai_review_issues?: Array<{ field?: string | null; severity: string; question: string; answer?: string | null; not_applicable_reason?: string | null }> | null;
  ai_review_at?: string | null;
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

import { addBusinessDays } from "@/lib/incident-deadlines";

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

// ── Guardian notification dialog (loads guardian contact info) ────────────────

function GuardianNotifyDialog({
  incident, onClose,
}: { incident: Incident | null; onClose: () => void }) {
  const qc = useQueryClient();
  const fn = useServerFn(markGuardianNotified);
  const getGuardian = useServerFn(getClientGuardianInfo);
  const [method, setMethod] = useState<GuardianMethod>("phone");
  const [when, setWhen] = useState(() => {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  });

  const guardianQ = useQuery({
    enabled: !!incident,
    queryKey: ["guardian-info", incident?.client_id],
    queryFn: () => getGuardian({ data: { client_id: incident!.client_id } }),
  });

  const isOwn = guardianQ.data?.is_own_guardian === true;
  const guardianName = guardianQ.data?.guardian_name ?? "—";
  const guardianPhone = guardianQ.data?.guardian_phone ?? "—";
  const guardianRel = guardianQ.data?.guardian_relationship ?? null;

  const attestationText = renderGuardianAttestation({
    guardian_name: guardianName,
    method,
    when: new Date(when).toLocaleString(),
  });

  const m = useMutation({
    mutationFn: async (sig: AttestationSignature) => {
      if (!incident) return;
      return fn({
        data: {
          id: incident.id,
          method,
          notified_at: new Date(when).toISOString(),
          ...sig,
        },
      });
    },
    onSuccess: () => {
      toast.success("Guardian notification signed & logged.");
      qc.invalidateQueries({ queryKey: ["incidents"] });
      onClose();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <AttestationDialog
      open={!!incident}
      onClose={onClose}
      title="Log guardian notification"
      attestationText={attestationText}
      submitLabel="Sign & log notification"
      onSubmit={(sig) => m.mutate(sig)}
      pending={m.isPending}
      disabled={isOwn}
      intro={
        <div className="space-y-2">
          {guardianQ.isLoading ? (
            <p className="text-xs text-muted-foreground">Loading guardian contact…</p>
          ) : isOwn ? (
            <div className="rounded-md border border-rose-300 bg-rose-50 p-2 text-xs text-rose-900 dark:bg-rose-950/30 dark:border-rose-800 dark:text-rose-100">
              This client is their own guardian — no separate notification required.
            </div>
          ) : (
            <div className="rounded-md border border-border bg-muted/40 p-2 text-xs">
              <div><span className="text-muted-foreground">Notifying:</span> <span className="font-semibold">{guardianName}</span>{guardianRel ? ` (${guardianRel})` : ""}</div>
              <div><span className="text-muted-foreground">Phone:</span> <span className="font-mono">{guardianPhone}</span></div>
              {guardianQ.data?.guardian_email && (
                <div><span className="text-muted-foreground">Email:</span> {guardianQ.data.guardian_email}</div>
              )}
            </div>
          )}
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
              <Label className="text-xs">Notified at</Label>
              <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
            </div>
          </div>
        </div>
      }
    />
  );
}

function UpiInitiateDialog({ incidentId, onClose }: { incidentId: string | null; onClose: () => void }) {
  const qc = useQueryClient();
  const fn = useServerFn(markUpiInitiated);
  const text = renderUpiInitiatedAttestation({ when: new Date().toLocaleString() });
  const m = useMutation({
    mutationFn: async (sig: AttestationSignature) => {
      if (!incidentId) return;
      return fn({ data: { id: incidentId, ...sig } });
    },
    onSuccess: () => {
      toast.success("UPI initiation attested.");
      qc.invalidateQueries({ queryKey: ["incidents"] });
      onClose();
    },
    onError: (e) => toast.error((e as Error).message),
  });
  return (
    <AttestationDialog
      open={!!incidentId}
      onClose={onClose}
      title="Mark UPI report initiated"
      attestationText={text}
      submitLabel="Sign & mark initiated"
      onSubmit={(sig) => m.mutate(sig)}
      pending={m.isPending}
    />
  );
}

function UpiCompleteDialog({ incidentId, onClose }: { incidentId: string | null; onClose: () => void }) {
  const qc = useQueryClient();
  const fn = useServerFn(markUpiCompleted);
  const [notes, setNotes] = useState("");
  const text = renderUpiCompletedAttestation({ when: new Date().toLocaleString() });
  const m = useMutation({
    mutationFn: async (sig: AttestationSignature) => {
      if (!incidentId) return;
      return fn({ data: { id: incidentId, followup_notes: notes.trim() || null, ...sig } });
    },
    onSuccess: () => {
      toast.success("UPI completion attested.");
      qc.invalidateQueries({ queryKey: ["incidents"] });
      setNotes("");
      onClose();
    },
    onError: (e) => toast.error((e as Error).message),
  });
  return (
    <AttestationDialog
      open={!!incidentId}
      onClose={onClose}
      title="Mark detailed UPI report completed"
      attestationText={text}
      submitLabel="Sign & mark completed"
      onSubmit={(sig) => m.mutate(sig)}
      pending={m.isPending}
      intro={
        <div>
          <Label className="text-xs">Follow-up / mitigating actions</Label>
          <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      }
    />
  );
}

function ScUpdateDialog({ incidentId, onClose }: { incidentId: string | null; onClose: () => void }) {
  const qc = useQueryClient();
  const fn = useServerFn(markScUpdated);
  const [notes, setNotes] = useState("");
  const text = renderScUpdateAttestation({ when: new Date().toLocaleString() });
  const m = useMutation({
    mutationFn: async (sig: AttestationSignature) => {
      if (!incidentId) return;
      return fn({ data: { id: incidentId, notes: notes.trim() || null, ...sig } });
    },
    onSuccess: () => {
      toast.success("Support Coordinator update signed.");
      qc.invalidateQueries({ queryKey: ["incidents"] });
      setNotes("");
      onClose();
    },
    onError: (e) => toast.error((e as Error).message),
  });
  return (
    <AttestationDialog
      open={!!incidentId}
      onClose={onClose}
      title="Log Support Coordinator update"
      attestationText={text}
      submitLabel="Sign & log SC update"
      onSubmit={(sig) => m.mutate(sig)}
      pending={m.isPending}
      intro={
        <div>
          <Label className="text-xs">Notes (optional)</Label>
          <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)}
            placeholder="Brief context of what was communicated to the SC." />
        </div>
      }
    />
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
  onScUpdate,
}: {
  ir: Incident;
  scRequests: ScRequest[];
  actors: Map<string, string>;
  onInitiate: (id: string) => void;
  onNotify: (ir: Incident) => void;
  onComplete: (id: string) => void;
  onLogSc: (incidentId: string) => void;
  onRespondSc: (scRequestId: string) => void;
  onScUpdate: (id: string) => void;
}) {
  const { can } = usePermissions();
  const canManageIncidents = can("manage_incidents");
  const discovered = ir.discovered_at ? new Date(ir.discovered_at) : new Date(ir.created_at);
  const upiDeadline = new Date(discovered.getTime() + 24 * 3_600_000);
  const guardianDeadline = new Date(discovered.getTime() + 24 * 3_600_000);
  const completionDeadline = addBusinessDays(discovered, 5);
  const clientName = ir.clients ? `${ir.clients.first_name} ${ir.clients.last_name}` : "Client";
  const isOwnGuardian = !!ir.clients?.is_own_guardian;
  const closed = ir.status === "State_Confirmed";
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
          {!isOwnGuardian && (
            <CountdownPill deadline={guardianDeadline} done={!!ir.guardian_notified_at} totalHours={24} label="Guardian 24h" />
          )}
          {isOwnGuardian && (
            <Badge variant="outline" className="gap-1 border-slate-300 text-slate-700">
              <UserCheck className="h-3 w-3" /> Self-guardian — no notification required
            </Badge>
          )}
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
          {ir.is_abuse_neglect && !ir.aps_notified_at && (
            <Badge className="bg-rose-600 text-white">APS-PENDING</Badge>
          )}
          {ir.restraint_used && (
            <Badge className="bg-amber-600 text-white">RESTRAINT</Badge>
          )}
          {closed && openSc.length === 0 && <Badge className="bg-slate-600 text-white">Closed</Badge>}
        </div>

        {(ir.upi_initiated_at || ir.guardian_notified_at || ir.upi_completed_at || ir.sc_update_signed_at) && (
          <div className="space-y-0.5 rounded-md border border-border bg-card/60 p-2 text-[11px] text-muted-foreground">
            {ir.upi_initiated_at && (
              <div>
                UPI initiated {fmtDate(ir.upi_initiated_at)}
                <ActorNames ids={[ir.upi_initiated_by]} actors={actors} />
                {ir.upi_initiated_signed_name && (
                  <span> · signed by {ir.upi_initiated_signed_name}{ir.upi_initiated_signed_title ? `, ${ir.upi_initiated_signed_title}` : ""}</span>
                )}
              </div>
            )}
            {ir.guardian_notified_at && (
              <div>
                Guardian notified ({ir.guardian_notified_method ?? "—"}) {fmtDate(ir.guardian_notified_at)}
                <ActorNames ids={[ir.guardian_notified_by]} actors={actors} />
                {ir.guardian_signed_name && (
                  <span> · signed by {ir.guardian_signed_name}{ir.guardian_signed_title ? `, ${ir.guardian_signed_title}` : ""}</span>
                )}
              </div>
            )}
            {ir.upi_completed_at && (
              <div>
                UPI detailed report completed {fmtDate(ir.upi_completed_at)}
                <ActorNames ids={[ir.upi_completed_by]} actors={actors} />
                {ir.upi_completed_signed_name && (
                  <span> · signed by {ir.upi_completed_signed_name}{ir.upi_completed_signed_title ? `, ${ir.upi_completed_signed_title}` : ""}</span>
                )}
              </div>
            )}
            {ir.sc_update_signed_at && (
              <div>
                SC update logged {fmtDate(ir.sc_update_signed_at)}
                {ir.sc_update_signed_name && (
                  <span> · signed by {ir.sc_update_signed_name}{ir.sc_update_signed_title ? `, ${ir.sc_update_signed_title}` : ""}</span>
                )}
              </div>
            )}
            {ir.followup_notes && (
              <div className="mt-1 whitespace-pre-wrap text-foreground">Follow-up: {ir.followup_notes}</div>
            )}
          </div>
        )}

        {scRequests.length > 0 && (
          <div className="space-y-2 rounded-md border border-border bg-card/60 p-2 text-[11px]">
            <p className="font-semibold text-foreground">Support Coordinator follow-up (§1.27(5))</p>
            {scRequests.map((s) => (
              <div key={s.id} className="rounded border border-border/60 bg-background/60 p-2">
                <div className="text-[10px] text-muted-foreground">Requested {fmtDate(s.requested_at)}</div>
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
            <Button size="sm" onClick={() => onInitiate(ir.id)}>
              <FileCheck2 className="mr-1 h-3.5 w-3.5" />Mark initiated in UPI
            </Button>
          )}
          {!closed && !isOwnGuardian && !ir.guardian_notified_at && (
            <Button size="sm" variant="outline" onClick={() => onNotify(ir)}>
              <Phone className="mr-1 h-3.5 w-3.5" />Log guardian notification
            </Button>
          )}
          {!closed && !ir.upi_completed_at && (
            <Button size="sm" variant="outline" onClick={() => onComplete(ir.id)}>
              <CheckCircle2 className="mr-1 h-3.5 w-3.5" />Mark detailed report completed
            </Button>
          )}
          {!ir.sc_update_signed_at && (
            <Button size="sm" variant="outline" onClick={() => onScUpdate(ir.id)}>
              <UserCheck className="mr-1 h-3.5 w-3.5" />Log SC update
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

  const visible = useMemo(() => {
    if (view === "log") return incidents;
    return incidents.filter((ir) => {
      if (ir.status !== "State_Confirmed") return true;
      return (scByIncident.get(ir.id) ?? []).some((s) => !s.responded_at);
    });
  }, [view, incidents, scByIncident]);

  const sorted = useMemo(() => {
    return [...visible].sort((a, b) => {
      if (a.is_fatality !== b.is_fatality) return a.is_fatality ? -1 : 1;
      const aAps = a.is_abuse_neglect && !a.aps_notified_at;
      const bAps = b.is_abuse_neglect && !b.aps_notified_at;
      if (aAps !== bAps) return aAps ? -1 : 1;
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
      if (ir.sc_update_signed_by) s.add(ir.sc_update_signed_by);
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

  const [guardianFor, setGuardianFor] = useState<Incident | null>(null);
  const [initiateFor, setInitiateFor] = useState<string | null>(null);
  const [completeId, setCompleteId] = useState<string | null>(null);
  const [scUpdateFor, setScUpdateFor] = useState<string | null>(null);
  const [logScFor, setLogScFor] = useState<string | null>(null);
  const [respondScFor, setRespondScFor] = useState<string | null>(null);

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
              scRequests={scByIncident.get(ir.id) ?? []}
              actors={actorMap}
              onInitiate={setInitiateFor}
              onNotify={setGuardianFor}
              onComplete={setCompleteId}
              onLogSc={setLogScFor}
              onRespondSc={setRespondScFor}
              onScUpdate={setScUpdateFor}
            />
          ))}
        </div>
      )}

      <UpiInitiateDialog incidentId={initiateFor} onClose={() => setInitiateFor(null)} />
      <GuardianNotifyDialog incident={guardianFor} onClose={() => setGuardianFor(null)} />
      <UpiCompleteDialog incidentId={completeId} onClose={() => setCompleteId(null)} />
      <ScUpdateDialog incidentId={scUpdateFor} onClose={() => setScUpdateFor(null)} />
      <LogScRequestDialog incidentId={logScFor} onClose={() => setLogScFor(null)} />
      <RespondScRequestDialog scRequestId={respondScFor} onClose={() => setRespondScFor(null)} />
    </div>
  );
}
