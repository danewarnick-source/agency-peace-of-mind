import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useCurrentOrg } from "@/hooks/use-org";
import { useCaseload } from "@/hooks/use-caseload";
import { useEffectiveView } from "@/hooks/use-effective-view";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ClipboardCheck, User, Eraser, Loader2, CheckCircle2, FileSignature, CalendarDays } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/daily-logs")({
  head: () => ({ meta: [{ title: "Daily Logs — Care Academy" }] }),
  component: DailyLogsPage,
});

const MIN_NARRATIVE = 50;

function DailyLogsPage() {
  const { effective } = useEffectiveView();
  return effective === "admin" ? <AdminAuditQueue /> : <StaffDailyJournal />;
}

/* ------------------------------------------------------------------------- */
/* STAFF VIEW                                                                */
/* ------------------------------------------------------------------------- */

type CaseloadClient = {
  id: string;
  first_name: string;
  last_name: string;
  pcsp_goals: string[];
  job_code?: string[] | null;
};

function StaffDailyJournal() {
  const { data: caseload, isLoading } = useCaseload();
  const [activeClient, setActiveClient] = useState<CaseloadClient | null>(null);

  // Security guard: caseload is already filtered by staff_assignments for the
  // logged-in user via the useCaseload hook. Additionally restrict the Daily
  // Logs journal to Host Home (HHS) authorized clients only.
  const allowedIds = useMemo(
    () => new Set((caseload ?? []).map((c) => c.id)),
    [caseload],
  );
  const clients = useMemo(
    () =>
      (caseload ?? []).filter(
        (c) =>
          allowedIds.has(c.id) &&
          Array.isArray(c.job_code) &&
          c.job_code.includes("HHS"),
      ) as unknown as CaseloadClient[],
    [caseload, allowedIds],
  );

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Daily Logs</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Host Home Daily Compliance Journal. Select an individual on your caseload to submit today's PCSP narrative and signature.
        </p>
      </div>

      {isLoading ? (
        <div className="grid place-items-center py-12 text-sm text-muted-foreground">Loading caseload…</div>
      ) : !clients.length ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          No clients currently assigned to your caseload. Please contact an Administrator.
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {clients.map((c) => {
            // Component-level guard: never render a client outside the caseload.
            if (!allowedIds.has(c.id)) return null;
            return (
              <button
                key={c.id}
                onClick={() => setActiveClient(c as CaseloadClient)}
                className="group flex items-start gap-3 rounded-xl border border-border bg-card p-4 text-left shadow-sm transition hover:border-primary hover:shadow-md"
              >
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <User className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{c.first_name} {c.last_name}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {c.pcsp_goals?.length ?? 0} PCSP goal{(c.pcsp_goals?.length ?? 0) === 1 ? "" : "s"} on file
                  </p>
                  <p className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary opacity-0 transition group-hover:opacity-100">
                    <ClipboardCheck className="h-3 w-3" /> Open daily journal
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      <DailyLogDialog client={activeClient} onClose={() => setActiveClient(null)} />
    </div>
  );
}

function DailyLogDialog({ client, onClose }: { client: CaseloadClient | null; onClose: () => void }) {
  const { user } = useAuth();
  const { data: org } = useCurrentOrg();
  const qc = useQueryClient();
  const [goals, setGoals] = useState<string[]>([]);
  const [narrative, setNarrative] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const hasSignatureRef = useRef(false);

  useEffect(() => {
    if (client) {
      setGoals([]);
      setNarrative("");
      hasSignatureRef.current = false;
      setTimeout(() => clearCanvas(), 0);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client?.id]);

  const remaining = Math.max(0, MIN_NARRATIVE - narrative.trim().length);
  const canSubmit = goals.length > 0 && narrative.trim().length >= MIN_NARRATIVE && hasSignatureRef.current && !submitting;

  function toggleGoal(g: string) {
    setGoals((prev) => (prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]));
  }

  function getCtx() { return canvasRef.current?.getContext("2d") ?? null; }
  function clearCanvas() {
    const c = canvasRef.current; const ctx = getCtx();
    if (!c || !ctx) return;
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, c.width, c.height);
    ctx.strokeStyle = "#0f172a"; ctx.lineWidth = 2; ctx.lineCap = "round";
    hasSignatureRef.current = false;
  }
  function pointerPos(e: React.PointerEvent<HTMLCanvasElement>) {
    const c = canvasRef.current!; const rect = c.getBoundingClientRect();
    return { x: ((e.clientX - rect.left) / rect.width) * c.width, y: ((e.clientY - rect.top) / rect.height) * c.height };
  }
  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    const ctx = getCtx(); if (!ctx) return;
    drawingRef.current = true;
    const { x, y } = pointerPos(e); ctx.beginPath(); ctx.moveTo(x, y);
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    const ctx = getCtx(); if (!ctx) return;
    const { x, y } = pointerPos(e); ctx.lineTo(x, y); ctx.stroke();
    hasSignatureRef.current = true;
  }
  function onPointerUp() { drawingRef.current = false; }

  async function submit() {
    if (!user || !org || !client) return;
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const signature = canvasRef.current?.toDataURL("image/png") ?? null;
      const { error } = await supabase
        .from("daily_logs")
        .insert({
          organization_id: org.organization_id,
          user_id: user.id,
          client_id: client.id,
          pcsp_goals_addressed: goals,
          narrative: narrative.trim(),
          signature_data_url: signature,
          status: "pending_approval",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any);
      if (error) throw error;
      toast.success("Daily Host Home log submitted for approval");
      qc.invalidateQueries({ queryKey: ["daily-log-clients"] });
      qc.invalidateQueries({ queryKey: ["daily-logs-admin"] });
      onClose();
    } catch (e) {
      toast.error((e as Error).message || "Could not submit log");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={!!client} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Host Home Daily Compliance Journal</DialogTitle>
          <DialogDescription>
            {client ? `${client.first_name} ${client.last_name} — ${new Date().toLocaleDateString()}` : ""}
          </DialogDescription>
        </DialogHeader>

        {client && (
          <div className="space-y-6">
            <div>
              <Label className="mb-2 block text-sm font-medium">PCSP goals addressed today</Label>
              {client.pcsp_goals?.length ? (
                <div className="flex flex-wrap gap-2">
                  {client.pcsp_goals.map((g) => {
                    const on = goals.includes(g);
                    return (
                      <button
                        key={g}
                        type="button"
                        onClick={() => toggleGoal(g)}
                        className={`rounded-full border px-4 py-2 text-sm font-medium transition-all active:scale-[0.97] ${
                          on
                            ? "border-teal-600 bg-teal-600 text-white shadow-sm hover:bg-teal-700"
                            : "border-slate-200 bg-white text-slate-700 hover:border-teal-400 hover:bg-teal-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-teal-950/40"
                        }`}
                      >
                        {on ? "✓ " : ""}{g}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
                  No PCSP goals on file. Add them in the Clients tab first.
                </p>
              )}
            </div>

            <div>
              <Label htmlFor="narrative" className="mb-2 block text-sm font-medium">Daily Summary Narrative</Label>
              <Textarea
                id="narrative"
                value={narrative}
                onChange={(e) => setNarrative(e.target.value)}
                placeholder="Describe today's care, activities, mood, meals, incidents, and goal progress…"
                rows={5}
                className="resize-none rounded-xl border-slate-300 dark:border-slate-700"
              />
              <div className="mt-1.5 flex items-center justify-between text-xs">
                <span className={remaining > 0 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"}>
                  {remaining > 0
                    ? `${remaining} more character${remaining === 1 ? "" : "s"} required`
                    : `✓ Minimum met`}
                </span>
                <span className="font-mono text-muted-foreground">
                  {narrative.trim().length} / {MIN_NARRATIVE}
                </span>
              </div>
            </div>

            <div>
              <Label className="mb-2 block text-sm font-medium">Caregiver signature</Label>
              <div className="overflow-hidden rounded-xl border-2 border-slate-300 bg-white p-1 shadow-inner dark:border-slate-700">
                <canvas
                  ref={canvasRef}
                  width={600}
                  height={180}
                  onPointerDown={onPointerDown}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  onPointerLeave={onPointerUp}
                  className="block w-full touch-none rounded-lg bg-white"
                  style={{ height: 180 }}
                />
              </div>
              <div className="mt-1.5 flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Sign with your finger or mouse to attest this entry.</span>
                <button type="button" onClick={clearCanvas} className="inline-flex items-center gap-1 font-medium text-slate-500 hover:text-slate-900 hover:underline dark:hover:text-slate-100">
                  <Eraser className="h-3 w-3" /> 🔄 Clear Signature
                </button>
              </div>
            </div>

            <Button onClick={submit} disabled={!canSubmit} className="h-12 w-full rounded-xl bg-emerald-600 text-base font-semibold hover:bg-emerald-700">
              {submitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Submitting…</>
                : <><CheckCircle2 className="mr-2 h-4 w-4" /> Submit Daily Host Home Log</>}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------------- */
/* ADMIN AUDIT QUEUE                                                         */
/* ------------------------------------------------------------------------- */

type AdminLog = {
  id: string;
  organization_id: string;
  user_id: string;
  client_id: string;
  log_date: string;
  pcsp_goals_addressed: string[];
  narrative: string;
  signature_data_url: string | null;
  submitted_at: string;
  status: string;
  approved_at: string | null;
  approved_by: string | null;
  profiles: { full_name: string | null; email: string | null; agency_name: string | null } | null;
  clients: { first_name: string | null; last_name: string | null; medicaid_id: string | null } | null;
};

function AdminAuditQueue() {
  const { data: org } = useCurrentOrg();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [active, setActive] = useState<AdminLog | null>(null);

  const { data: logs, isLoading } = useQuery({
    enabled: !!org,
    queryKey: ["daily-logs-admin", org?.organization_id],
    queryFn: async (): Promise<AdminLog[]> => {
      const { data, error } = await supabase
        .from("daily_logs")
        .select(`
          id, organization_id, user_id, client_id, log_date, pcsp_goals_addressed,
          narrative, signature_data_url, submitted_at, status, approved_at, approved_by,
          profiles:user_id ( full_name, email, agency_name ),
          clients:client_id ( first_name, last_name, medicaid_id )
        `)
        .eq("organization_id", org!.organization_id)
        .order("log_date", { ascending: false })
        .order("submitted_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as AdminLog[];
    },
  });

  const approveMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("daily_logs")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update({ status: "approved", approved_at: new Date().toISOString(), approved_by: user!.id } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Daily log approved for billing");
      qc.invalidateQueries({ queryKey: ["daily-logs-admin"] });
      setActive(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const pendingIds = useMemo(
    () => (logs ?? []).filter((l) => l.status === "pending_approval").map((l) => l.id),
    [logs],
  );

  const approveAllMut = useMutation({
    mutationFn: async (ids: string[]) => {
      if (!ids.length) return 0;
      const { error } = await supabase
        .from("daily_logs")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update({ status: "approved", approved_at: new Date().toISOString(), approved_by: user!.id } as any)
        .in("id", ids);
      if (error) throw error;
      return ids.length;
    },
    onSuccess: (count) => {
      toast.success(`Approved ${count} daily log${count === 1 ? "" : "s"} for billing`);
      qc.invalidateQueries({ queryKey: ["daily-logs-admin"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const grouped = useMemo(() => {
    const map = new Map<string, AdminLog[]>();
    (logs ?? []).forEach((l) => {
      const key = l.log_date;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(l);
    });
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [logs]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <FileSignature className="h-6 w-6 text-muted-foreground" /> Residential Audit Queue
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Host Home daily journals submitted by caregivers, grouped by date of service. Click any row to review and approve for billing.
        </p>
      </div>

      {isLoading ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">Loading audit queue…</Card>
      ) : !grouped.length ? (
        <Card className="p-12 text-center text-sm text-muted-foreground">
          <CalendarDays className="mx-auto mb-2 h-8 w-8 text-muted-foreground/40" />
          No daily logs submitted yet.
        </Card>
      ) : (
        <div className="space-y-4">
          {grouped.map(([date, rows]) => (
            <Card key={date} className="overflow-hidden">
              <div className="flex items-center justify-between border-b border-border bg-muted/30 px-5 py-2.5">
                <h3 className="text-sm font-semibold">
                  {new Date(date + "T00:00:00").toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
                </h3>
                <span className="text-xs text-muted-foreground">{rows.length} log{rows.length === 1 ? "" : "s"}</span>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Provider / Agency</TableHead>
                    <TableHead>Caregiver</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Goals</TableHead>
                    <TableHead>Submitted</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.id} onClick={() => setActive(r)} className="cursor-pointer">
                      <TableCell className="text-xs text-muted-foreground">{r.profiles?.agency_name ?? "—"}</TableCell>
                      <TableCell className="font-medium">{r.profiles?.full_name ?? r.profiles?.email ?? "—"}</TableCell>
                      <TableCell>{r.clients ? `${r.clients.first_name ?? ""} ${r.clients.last_name ?? ""}`.trim() : "—"}</TableCell>
                      <TableCell><Badge variant="secondary">{r.pcsp_goals_addressed?.length ?? 0}</Badge></TableCell>
                      <TableCell className="text-xs text-muted-foreground">{new Date(r.submitted_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</TableCell>
                      <TableCell>
                        {r.status === "approved" ? (
                          <Badge className="bg-emerald-100 text-emerald-900 hover:bg-emerald-100 dark:bg-emerald-500/15 dark:text-emerald-200">Approved</Badge>
                        ) : (
                          <Badge className="bg-amber-100 text-amber-900 hover:bg-amber-100 dark:bg-amber-500/15 dark:text-amber-200">Pending</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          ))}
        </div>
      )}

      <Sheet open={!!active} onOpenChange={(o) => !o && setActive(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>Daily Host Home Log</SheetTitle>
            <SheetDescription>
              {active && `${active.profiles?.full_name ?? active.profiles?.email ?? "—"} · ${new Date(active.log_date + "T00:00:00").toLocaleDateString()}`}
            </SheetDescription>
          </SheetHeader>
          {active && (
            <div className="mt-5 space-y-5">
              <Card className="p-3">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Client</p>
                <p className="text-sm font-medium">{active.clients ? `${active.clients.first_name ?? ""} ${active.clients.last_name ?? ""}`.trim() : "—"}</p>
                {active.clients?.medicaid_id && (
                  <p className="mt-0.5 font-mono text-xs text-muted-foreground">Medicaid {active.clients.medicaid_id}</p>
                )}
              </Card>

              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">PCSP goals addressed</p>
                <div className="flex flex-wrap gap-1.5">
                  {active.pcsp_goals_addressed?.length
                    ? active.pcsp_goals_addressed.map((g) => <Badge key={g} variant="secondary" className="font-normal">{g}</Badge>)
                    : <span className="text-xs text-muted-foreground">None recorded</span>}
                </div>
              </div>

              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Narrative summary</p>
                <p className="whitespace-pre-wrap rounded-lg border border-border bg-muted/30 p-3 text-sm">{active.narrative}</p>
              </div>

              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Immutable server timestamp</p>
                <p className="font-mono text-xs">{new Date(active.submitted_at).toISOString()}</p>
              </div>

              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Caregiver signature</p>
                {active.signature_data_url ? (
                  <img src={active.signature_data_url} alt="Caregiver signature" className="w-full rounded-lg border border-border bg-white" />
                ) : <p className="text-xs text-muted-foreground">No signature captured.</p>}
              </div>

              {active.status === "approved" ? (
                <div className="rounded-lg border border-emerald-500/40 bg-emerald-50 p-3 text-sm text-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-200">
                  <p className="font-medium">Approved for billing</p>
                  {active.approved_at && <p className="mt-1 text-xs">{new Date(active.approved_at).toLocaleString()}</p>}
                </div>
              ) : (
                <Button className="w-full" onClick={() => approveMut.mutate(active.id)} disabled={approveMut.isPending}>
                  {approveMut.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Approving…</>
                    : <><CheckCircle2 className="mr-2 h-4 w-4" /> Approve Log for Billing</>}
                </Button>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
