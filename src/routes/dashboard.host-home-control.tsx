import { useState, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useCurrentOrg } from "@/hooks/use-org";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Home, FileText, Pill, Calendar, FolderArchive } from "lucide-react";
import { toast } from "sonner";
import {
  listDailyRecords,
  listEmarLogs,
  listAttendance,
  listIncidents,
  listPrnForms,
  markIncidentFiled,
} from "@/lib/hhs.functions";

export const Route = createFileRoute("/dashboard/host-home-control")({
  head: () => ({ meta: [{ title: "Host Home Control — HIVE" }] }),
  component: HostHomeControl,
});

export { HostHomeControl };

type ClientLite = { id: string; first_name: string; last_name: string };

function useClientMap(orgId?: string) {
  return useQuery({
    enabled: !!orgId,
    queryKey: ["hhs-admin-clients", orgId],
    queryFn: async () => {
      const { data } = await supabase
        .from("clients")
        .select("id, first_name, last_name")
        .eq("organization_id", orgId!);
      const map = new Map<string, ClientLite>();
      (data ?? []).forEach((c) => map.set(c.id, c as ClientLite));
      return map;
    },
  });
}

function HostHomeControl() {
  const { data: org } = useCurrentOrg();
  const orgId = org?.organization_id;
  const { data: clientMap } = useClientMap(orgId);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Home className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-semibold">Host Home Control</h1>
          <p className="text-sm text-muted-foreground">
            Oversight desk for 24-hour residential Host Home Supports (HHS).
          </p>
        </div>
      </div>

      <Tabs defaultValue="notes">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 h-auto gap-1">
          <TabsTrigger value="notes" className="h-11 text-xs sm:text-sm"><FileText className="h-4 w-4 mr-1" />Daily Notes</TabsTrigger>
          <TabsTrigger value="emar" className="h-11 text-xs sm:text-sm"><Pill className="h-4 w-4 mr-1" />eMAR</TabsTrigger>
          <TabsTrigger value="attendance" className="h-11 text-xs sm:text-sm"><Calendar className="h-4 w-4 mr-1" />Attendance</TabsTrigger>
          <TabsTrigger value="audits" className="h-11 text-xs sm:text-sm"><FolderArchive className="h-4 w-4 mr-1" />Audits</TabsTrigger>
        </TabsList>

        <TabsContent value="notes" className="mt-4">
          <DailyNotesTab orgId={orgId} clientMap={clientMap} />
        </TabsContent>
        <TabsContent value="emar" className="mt-4">
          <EmarMatrixTab orgId={orgId} clientMap={clientMap} />
        </TabsContent>
        <TabsContent value="attendance" className="mt-4">
          <AttendanceGridTab orgId={orgId} clientMap={clientMap} />
        </TabsContent>
        <TabsContent value="audits" className="mt-4">
          <ComplianceAuditsTab orgId={orgId} clientMap={clientMap} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function name(map: Map<string, ClientLite> | undefined, id: string) {
  const c = map?.get(id);
  return c ? `${c.first_name} ${c.last_name}` : id.slice(0, 8);
}

function DailyNotesTab({ orgId, clientMap }: { orgId?: string; clientMap?: Map<string, ClientLite> }) {
  const fn = useServerFn(listDailyRecords);
  const [q, setQ] = useState("");
  const { data: rows = [] } = useQuery({
    enabled: !!orgId,
    queryKey: ["hhs-daily", orgId],
    queryFn: () => fn({ data: { organizationId: orgId! } }),
  });
  const filtered = useMemo(() => {
    if (!q) return rows;
    const lq = q.toLowerCase();
    return (rows as Array<Record<string, unknown>>).filter((r) =>
      String(r.narrative ?? "").toLowerCase().includes(lq) ||
      name(clientMap, String(r.client_id)).toLowerCase().includes(lq)
    );
  }, [q, rows, clientMap]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Daily Progress Summaries</CardTitle>
        <Input placeholder="Search by client or narrative…" value={q} onChange={(e) => setQ(e.target.value)} className="mt-2" />
      </CardHeader>
      <CardContent>
        <div className="space-y-2 max-h-[60vh] overflow-y-auto">
          {filtered.length === 0 && <p className="text-sm text-muted-foreground">No daily progress notes recorded.</p>}
          {(filtered as Array<Record<string, unknown>>).map((r) => (
            <div key={String(r.id)} className="rounded-lg border p-3">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="outline">{name(clientMap, String(r.client_id))}</Badge>
                <span>{String(r.record_date)}</span>
                {r.ai_compliance_status === "Verified" && <Badge className="bg-green-600">✓ NECTAR Verified</Badge>}
                {r.ai_compliance_status === "Flagged" && <Badge variant="destructive">⚠ Flagged</Badge>}
              </div>
              <p className="mt-2 text-sm whitespace-pre-wrap">{String(r.narrative)}</p>
              {Array.isArray(r.pcsp_goals_addressed) && r.pcsp_goals_addressed.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {(r.pcsp_goals_addressed as string[]).map((g, i) => (
                    <Badge key={i} variant="secondary" className="text-[10px]">{g}</Badge>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function EmarMatrixTab({ orgId, clientMap }: { orgId?: string; clientMap?: Map<string, ClientLite> }) {
  const fn = useServerFn(listEmarLogs);
  const { data: rows = [] } = useQuery({
    enabled: !!orgId,
    queryKey: ["hhs-emar", orgId],
    queryFn: () => fn({ data: { organizationId: orgId! } }),
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Daily eMAR Sheets</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground border-b">
                <th className="py-2">Client</th><th>Medication</th><th>Status</th><th>Scheduled</th><th>Admin'd</th>
              </tr>
            </thead>
            <tbody>
              {(rows as Array<Record<string, unknown>>).map((r) => (
                <tr key={String(r.id)} className="border-b">
                  <td className="py-2">{name(clientMap, String(r.client_id))}</td>
                  <td>{String(r.medication_name)}</td>
                  <td>
                    <Badge variant={r.status === "Passed" ? "default" : r.status === "Refused" ? "secondary" : "destructive"}>
                      {String(r.status)}
                    </Badge>
                  </td>
                  <td className="text-xs">{new Date(String(r.scheduled_for)).toLocaleString()}</td>
                  <td className="text-xs">{r.administered_at ? new Date(String(r.administered_at)).toLocaleString() : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <p className="text-sm text-muted-foreground py-4">No eMAR events submitted yet.</p>}
        </div>
      </CardContent>
    </Card>
  );
}

function AttendanceGridTab({ orgId, clientMap }: { orgId?: string; clientMap?: Map<string, ClientLite> }) {
  const fn = useServerFn(listAttendance);
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 0);
  const daysInMonth = monthEnd.getDate();
  const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data: rows = [] } = useQuery({
    enabled: !!orgId,
    queryKey: ["hhs-attendance", orgId, fmt(monthStart)],
    queryFn: () => fn({ data: { organizationId: orgId!, monthStart: fmt(monthStart), monthEnd: fmt(monthEnd) } }),
  });

  const grouped = useMemo(() => {
    const g = new Map<string, Map<string, Record<string, unknown>>>();
    (rows as Array<Record<string, unknown>>).forEach((r) => {
      const cid = String(r.client_id);
      if (!g.has(cid)) g.set(cid, new Map());
      g.get(cid)!.set(String(r.record_date), r);
    });
    return g;
  }, [rows]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Executive Billing & Verification — {today.toLocaleString(undefined, { month: "long", year: "numeric" })}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {Array.from(grouped.entries()).length === 0 && <p className="text-sm text-muted-foreground">No attendance recorded this month.</p>}
        {Array.from(grouped.entries()).map(([cid, days]) => {
          let present = 0, away = 0;
          days.forEach((r) => {
            if (r.presence_status === "Present") present++;
            else if (r.presence_status === "Away") away++;
          });
          const isOpen = expanded === cid;
          return (
            <div key={cid} className="rounded-lg border">
              <div className="flex flex-wrap items-center justify-between gap-2 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-sm">{name(clientMap, cid)}</span>
                  <Badge className="bg-green-600">📊 {today.toLocaleString(undefined, { month: "long" })}: {present} Days Present (Billable)</Badge>
                  <Badge className="bg-amber-500">{away} Days Away (Unbillable)</Badge>
                </div>
                <Button size="sm" variant="outline" onClick={() => setExpanded(isOpen ? null : cid)}>
                  🔍 {isOpen ? "Hide" : "View"} Signed Attendance Ledger
                </Button>
              </div>
              {isOpen && (
                <div className="border-t p-3 space-y-3">
                  <div className="grid grid-cols-7 gap-1.5">
                    {["S","M","T","W","T","F","S"].map((d, i) => (
                      <div key={i} className="text-center text-[10px] font-medium text-muted-foreground">{d}</div>
                    ))}
                    {Array.from({ length: monthStart.getDay() }).map((_, i) => <div key={`pad-${i}`} />)}
                    {Array.from({ length: daysInMonth }, (_, i) => {
                      const day = i + 1;
                      const rec = days.get(fmt(new Date(year, month, day)));
                      const status = rec ? String(rec.presence_status) : null;
                      const init = rec ? String(rec.staff_initials_signature ?? "") : "";
                      const cls = status === "Present"
                        ? "bg-green-200 dark:bg-green-900/40 border-green-400"
                        : status === "Away"
                          ? "bg-amber-200 dark:bg-amber-900/40 border-amber-400"
                          : "bg-muted/30";
                      return (
                        <div key={day} className={`relative h-12 rounded border text-xs flex items-start justify-start p-1 ${cls}`}>
                          <span className="font-medium">{day}</span>
                          {init && <span className="absolute bottom-0.5 right-1 text-[9px] font-bold">{init}</span>}
                        </div>
                      );
                    })}
                  </div>
                  <div className="rounded border-2 border-slate-300 bg-slate-50 dark:bg-slate-900/40 p-3 space-y-2">
                    <div className="text-xs font-bold uppercase tracking-wide">⚖️ Legal Audit Panel — Court-Admissible Forensics</div>
                    <p className="text-[11px] italic">
                      Attestation accepted by signer for each green tile:
                      "I hereby certify and formally attest under penalty of Medicaid fraud and perjury that the information recorded for this calendar date is true, accurate, and complete. I verify that the client slept overnight under my direct supervision in a certified Host Home setting, and I understand that falsification of this billing data is subject to state and federal criminal prosecution."
                    </p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-[11px]">
                        <thead className="text-muted-foreground">
                          <tr className="border-b">
                            <th className="text-left py-1">Date</th>
                            <th className="text-left">Status</th>
                            <th className="text-left">Initials</th>
                            <th className="text-left">Signee UUID</th>
                            <th className="text-left">Signature Timestamp</th>
                            <th className="text-left">IP Address</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Array.from(days.values())
                            .sort((a, b) => String(a.record_date).localeCompare(String(b.record_date)))
                            .map((r) => (
                              <tr key={String(r.id)} className="border-b">
                                <td className="py-1">{String(r.record_date)}</td>
                                <td>{String(r.presence_status)}{r.away_category ? ` · ${String(r.away_category)}` : ""}</td>
                                <td className="font-bold">{String(r.staff_initials_signature ?? "—")}</td>
                                <td className="font-mono">{r.signee_user_id ? String(r.signee_user_id) : "—"}</td>
                                <td>{r.electronic_signature_timestamp ? new Date(String(r.electronic_signature_timestamp)).toLocaleString() : "—"}</td>
                                <td className="font-mono">{String(r.signee_ip_address ?? "—")}</td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function ComplianceAuditsTab({ orgId, clientMap }: { orgId?: string; clientMap?: Map<string, ClientLite> }) {
  const inc = useServerFn(listIncidents);
  const prn = useServerFn(listPrnForms);
  const qc = useQueryClient();
  const mark = useServerFn(markIncidentFiled);
  const [filing, setFiling] = useState<{ id: string } | null>(null);
  const [upi, setUpi] = useState("");

  const { data: incidents = [] } = useQuery({
    enabled: !!orgId,
    queryKey: ["hhs-incidents", orgId],
    queryFn: () => inc({ data: { organizationId: orgId! } }),
  });
  const { data: prnForms } = useQuery({
    enabled: !!orgId,
    queryKey: ["hhs-prn", orgId],
    queryFn: () => prn({ data: { organizationId: orgId! } }),
  });

  const fileMut = useMutation({
    mutationFn: async () => mark({ data: { incidentId: filing!.id, upiReferenceNumber: upi } }),
    onSuccess: () => {
      toast.success("Marked as filed in UPI.");
      qc.invalidateQueries({ queryKey: ["hhs-incidents", orgId] });
      setFiling(null);
      setUpi("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const fmtTimer = (createdAt: string, hours: number) => {
    const due = new Date(new Date(createdAt).getTime() + hours * 3600 * 1000);
    const ms = due.getTime() - Date.now();
    if (ms <= 0) return "⏰ Overdue";
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return `${h}h ${m}m left`;
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-base">🚨 Pending Incident Reports (Form C)</CardTitle></CardHeader>
        <CardContent>
          {(incidents as Array<Record<string, unknown>>).length === 0 && <p className="text-sm text-muted-foreground">No incidents on file.</p>}
          {(incidents as Array<Record<string, unknown>>).map((r) => {
            const status = String(r.status);
            return (
              <div key={String(r.id)} className="rounded-lg border p-3 mb-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{name(clientMap, String(r.client_id))}</Badge>
                  {(r.incident_categories as string[]).map((c, i) => <Badge key={i} variant="secondary">{c}</Badge>)}
                  {status === "upi_filed" ? (
                    <Badge className="bg-green-600">✅ Filed · UPI {String(r.upi_reference_number)}</Badge>
                  ) : (
                    <>
                      <Badge variant="destructive">{fmtTimer(String(r.created_at), 24)} (24h initial)</Badge>
                      <Badge variant="outline">{fmtTimer(String(r.created_at), 24 * 5)} (5d final)</Badge>
                    </>
                  )}
                </div>
                <p className="mt-2 text-sm whitespace-pre-wrap">{String(r.description)}</p>
                {r.protective_actions ? <p className="mt-1 text-xs text-muted-foreground">Protective: {String(r.protective_actions)}</p> : null}
                {status !== "upi_filed" && (
                  <Button size="sm" className="mt-2" onClick={() => setFiling({ id: String(r.id) })}>
                    ✅ Mark as Successfully Filed in UPI
                  </Button>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">📁 PRN Documents</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-center">
            <Stat label="Medical Visits" v={prnForms?.medical.length ?? 0} />
            <Stat label="Monthly Summaries" v={prnForms?.summary.length ?? 0} />
            <Stat label="Valuables Items" v={prnForms?.inventory.length ?? 0} />
            <Stat label="Evac Drills" v={prnForms?.drill.length ?? 0} />
            <Stat label="Transfer Logs" v={prnForms?.transfer.length ?? 0} />
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!filing} onOpenChange={(o) => !o && setFiling(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Mark Incident as UPI Filed</DialogTitle></DialogHeader>
          <Label>State-Generated UPI Reference Number</Label>
          <Input value={upi} onChange={(e) => setUpi(e.target.value)} placeholder="UPI-2026-…" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setFiling(null)}>Cancel</Button>
            <Button onClick={() => fileMut.mutate()} disabled={!upi || fileMut.isPending}>Confirm Filing</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Stat({ label, v }: { label: string; v: number }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-2xl font-bold">{v}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
