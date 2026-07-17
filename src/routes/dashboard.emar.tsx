import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-org";
import { useAuth } from "@/hooks/use-auth";
import { useActiveShift } from "@/hooks/use-active-shift";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Pill, CheckCircle2, AlertTriangle, AlertCircle, Eraser, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { EmarLegalBanner } from "@/components/workspace/emar-chart";
import { usePermissions } from "@/hooks/use-permissions";
import { logMedicationPass } from "@/lib/emar-pass.functions";
import { type EmarStatus, normalizeEmarStatus } from "@/lib/emar-status";

export const Route = createFileRoute("/dashboard/emar")({
  head: () => ({ meta: [{ title: "Today's Pass — HIVE eMAR" }] }),
  component: EmarPage,
});

type DueRow = {
  medication_id: string;
  medication_name: string;
  dosage: string | null;
  route: string | null;
  client_id: string;
  client_name: string;
  scheduled_for: string;
  time_label: string;
  is_rescue: boolean;
  controlled_schedule: string | null;
};

type ClientHeader = {
  id: string;
  name: string;
  allergies: string[];
  dysphagia: boolean;
  swallowing_alerts: string[];
};

const EXCEPTION_REASONS = [
  "Person declined",
  "Person unavailable / sleeping",
  "Held per physician order",
  "NPO (medical hold)",
  "Medication unavailable",
  "Adverse reaction / withheld",
  "Other (see notes)",
];

const ATTESTATION =
  "I attest that I observed the Person self-administer this medication, or assisted as documented above. The information logged here is true and accurate.";

function EmarPage() {
  const { data: org } = useCurrentOrg();
  const { user } = useAuth();
  const { data: activeShift } = useActiveShift();
  const { role } = usePermissions();
  const isAdminLike = role === "admin" || role === "manager" || role === "super_admin";
  const qc = useQueryClient();
  const [selected, setSelected] = useState<DueRow | null>(null);

  const serviceContext = activeShift?.service_type_code || "general";

  const { data: pageData, isLoading } = useQuery({
    enabled: !!org && !!user,
    queryKey: ["emar-due", org?.organization_id, user?.id, isAdminLike],
    queryFn: async (): Promise<{ rows: DueRow[]; headers: Record<string, ClientHeader> }> => {
      const todayStartLocal = new Date(); todayStartLocal.setHours(0, 0, 0, 0);
      const todayEndLocal = new Date(todayStartLocal); todayEndLocal.setDate(todayEndLocal.getDate() + 1);

      let scopedClientIds: string[] | null = null;
      if (!isAdminLike) {
        const { data: shifts, error: sErr } = await (supabase as any)
          .from("scheduled_shifts")
          .select("client_id, starts_at, ends_at")
          .eq("organization_id", org!.organization_id)
          .eq("staff_id", user!.id)
          .lt("starts_at", todayEndLocal.toISOString())
          .gte("ends_at", todayStartLocal.toISOString());
        if (sErr) throw sErr;
        scopedClientIds = Array.from(new Set((shifts ?? []).map((s: { client_id: string }) => s.client_id)));
        if (scopedClientIds.length === 0) return { rows: [], headers: {} };
      }

      let clientsQ = (supabase as any)
        .from("clients")
        .select("id, first_name, last_name, allergies, dysphagia, swallowing_alerts, self_admin_med_support")
        .eq("organization_id", org!.organization_id)
        .eq("self_admin_med_support", true);
      if (scopedClientIds) clientsQ = clientsQ.in("id", scopedClientIds);
      const { data: clients, error: cErr } = await clientsQ;
      if (cErr) throw cErr;
      const eligibleIds = (clients ?? []).map((c: { id: string }) => c.id);
      if (eligibleIds.length === 0) return { rows: [], headers: {} };

      const headers: Record<string, ClientHeader> = {};
      (clients as Array<{ id: string; first_name: string; last_name: string; allergies: string[] | null; dysphagia: boolean; swallowing_alerts: string[] | null }>).forEach((c) => {
        headers[c.id] = {
          id: c.id,
          name: `${c.first_name} ${c.last_name}`,
          allergies: c.allergies ?? [],
          dysphagia: c.dysphagia,
          swallowing_alerts: c.swallowing_alerts ?? [],
        };
      });

      const { data: meds, error } = await (supabase as any)
        .from("client_medications")
        .select("id, client_id, medication_name, dosage, route, scheduled_times, is_active, is_rescue, controlled_schedule")
        .eq("organization_id", org!.organization_id)
        .eq("is_active", true)
        .in("client_id", eligibleIds);
      if (error) throw error;

      const today = new Date(); today.setHours(0, 0, 0, 0);
      const out: DueRow[] = [];
      (meds as unknown as Array<{ id: string; client_id: string; medication_name: string; dosage: string | null; route: string | null; scheduled_times: string[]; is_rescue: boolean | null; controlled_schedule: string | null }>).forEach((m) => {
        const name = headers[m.client_id]?.name || "Unknown";
        (m.scheduled_times ?? []).forEach((t) => {
          const [hh, mm] = t.split(":").map(Number);
          if (isNaN(hh)) return;
          const sched = new Date(today); sched.setHours(hh, mm, 0, 0);
          out.push({
            medication_id: m.id, medication_name: m.medication_name, dosage: m.dosage, route: m.route,
            client_id: m.client_id, client_name: name, scheduled_for: sched.toISOString(), time_label: t,
            is_rescue: !!m.is_rescue, controlled_schedule: m.controlled_schedule,
          });
        });
      });
      out.sort((a, b) => a.scheduled_for.localeCompare(b.scheduled_for));
      return { rows: out, headers };
    },
  });

  const rows = pageData?.rows ?? [];
  const headers = pageData?.headers ?? {};

  const todayStart = useMemo(() => { const d = new Date(); d.setHours(0,0,0,0); return d.toISOString(); }, []);
  const todayEnd = useMemo(() => { const d = new Date(); d.setHours(24,0,0,0); return d.toISOString(); }, []);
  const { data: doneLogs = [] } = useQuery({
    enabled: !!org,
    queryKey: ["emar-done-today", org?.organization_id, todayStart],
    queryFn: async () => {
      const { data } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from("emar_logs" as any)
        .select("medication_id, scheduled_for, status")
        .eq("organization_id", org!.organization_id)
        .gte("scheduled_for", todayStart).lt("scheduled_for", todayEnd);
      return ((data ?? []) as unknown) as Array<{ medication_id: string; scheduled_for: string; status: string }>;
    },
  });
  const doneKey = (r: DueRow) => `${r.medication_id}|${r.scheduled_for}`;
  const doneSet = useMemo(() => new Set(doneLogs.map((l) => `${l.medication_id}|${l.scheduled_for}`)), [doneLogs]);

  const submittingRef = useRef(false);
  const logPass = useServerFn(logMedicationPass);

  const saveMut = useMutation({
    mutationFn: async (payload: {
      row: DueRow;
      status: EmarStatus;
      reason: string;
      notes: string;
      actualTakenAt: string | null;
      signatureDataUrl: string;
    }) => {
      await logPass({
        data: {
          clientId: payload.row.client_id,
          medicationId: payload.row.medication_id,
          scheduledFor: payload.row.scheduled_for,
          scheduledTimeLabel: payload.row.time_label,
          status: payload.status,
          route: payload.row.route || "PO",
          actualTakenAt: payload.actualTakenAt ?? new Date().toISOString(),
          exceptionReason: payload.status === "self_administered" ? null : payload.reason,
          notes: payload.notes || null,
          signatureDataUrl: payload.signatureDataUrl,
          serviceContext,
          isMedicationError: false,
        },
      });
    },
    onSuccess: () => {
      toast.success("Pass logged to the audit trail");
      qc.invalidateQueries({ queryKey: ["emar-done-today"] });
      qc.invalidateQueries({ queryKey: ["mar-logs"] });
      setSelected(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function handleSave(p: Parameters<typeof saveMut.mutate>[0]) {
    if (submittingRef.current) return;
    submittingRef.current = true;
    try {
      await saveMut.mutateAsync(p);
    } finally {
      submittingRef.current = false;
    }
  }

  const grouped = useMemo(() => {
    const m: Record<string, DueRow[]> = {};
    rows.forEach((r) => { (m[r.client_id] ||= []).push(r); });
    return m;
  }, [rows]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <Pill className="h-5 w-5 text-primary" /> Today's Pass
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {isAdminLike
            ? "Every Person on self-administration with doses due today."
            : "Persons on your shift today who self-administer with staff support."}
        </p>
        {activeShift && (
          <p className="mt-1 text-xs text-muted-foreground">
            Logging context: <span className="font-mono">{serviceContext}</span> shift with{" "}
            <span className="font-semibold">{activeShift.client_name}</span>.
          </p>
        )}
      </div>

      <EmarLegalBanner />

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : !rows.length ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          {isAdminLike
            ? "No self-administration doses scheduled today."
            : "No medication passes for your shifts today."}
        </Card>
      ) : (
        <div className="space-y-5">
          {Object.entries(grouped).map(([clientId, items]) => {
            const h = headers[clientId];
            return (
              <section key={clientId} className="space-y-2">
                <Card className="border-l-4 border-l-rose-500 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm font-semibold">{h?.name ?? "Person"}</div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {(h?.allergies ?? []).length === 0 ? (
                        <Badge className="bg-emerald-100 text-emerald-800 text-[10px] hover:bg-emerald-100">No known allergies</Badge>
                      ) : (
                        (h?.allergies ?? []).map((a) => (
                          <span key={a} className="inline-flex items-center gap-1 rounded-md border border-rose-300 bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-900">
                            <AlertCircle className="h-3 w-3" /> {a}
                          </span>
                        ))
                      )}
                    </div>
                  </div>
                  {(h?.dysphagia || (h?.swallowing_alerts ?? []).length > 0) && (
                    <div className="mt-2 flex items-start gap-1.5 rounded-md border border-amber-300 bg-amber-50 p-1.5 text-[11px] text-amber-900">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <div>
                        {h?.dysphagia && <div>Dysphagia on file — confirm upright posture; verify crushed-med policy.</div>}
                        {(h?.swallowing_alerts ?? []).map((a) => <div key={a}>{a}</div>)}
                      </div>
                    </div>
                  )}
                </Card>
                <div className="grid gap-2">
                  {items.map((r) => {
                    const done = doneSet.has(doneKey(r));
                    return (
                      <Card key={`${r.medication_id}-${r.time_label}`}
                        className={`flex flex-col gap-3 p-3 md:flex-row md:items-center md:justify-between ${done ? "opacity-60" : ""}`}>
                        <div className="flex items-center gap-3">
                          <Badge variant="outline" className="font-mono">{r.time_label}</Badge>
                          <div>
                            <div className="text-sm font-medium flex items-center gap-1.5">
                              {r.medication_name}
                              {r.is_rescue && <Badge className="bg-rose-500 text-white text-[9px]">Rescue</Badge>}
                              {r.controlled_schedule && <Badge variant="outline" className="text-[9px]">CII–CV</Badge>}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {r.dosage && `${r.dosage}`} {r.route && `· ${r.route}`}
                            </div>
                          </div>
                        </div>
                        {done ? (
                          <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
                            <CheckCircle2 className="mr-1 h-3 w-3" /> Logged
                          </Badge>
                        ) : (
                          <Button size="sm" className="min-h-11" onClick={() => setSelected(r)}>Observe & Confirm</Button>
                        )}
                      </Card>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <PassDialog
        row={selected}
        onClose={() => setSelected(null)}
        onSave={handleSave}
        pending={saveMut.isPending}
      />
    </div>
  );
}

function PassDialog({
  row, onClose, onSave, pending,
}: {
  row: DueRow | null;
  onClose: () => void;
  onSave: (p: {
    row: DueRow;
    status: EmarStatus;
    reason: string;
    notes: string;
    actualTakenAt: string | null;
    signatureDataUrl: string;
  }) => void;
  pending: boolean;
}) {
  const [status, setStatus] = useState<EmarStatus>("self_administered");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [actualTime, setActualTime] = useState<string>("");
  const [attested, setAttested] = useState(false);

  const sigRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const hasSig = useRef(false);

  function clearSig() {
    const c = sigRef.current; const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
    ctx.strokeStyle = "#0f172a"; ctx.lineWidth = 2; ctx.lineCap = "round";
    hasSig.current = false;
  }
  function pos(e: React.PointerEvent<HTMLCanvasElement>) {
    const c = sigRef.current!; const r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * c.width, y: ((e.clientY - r.top) / r.height) * c.height };
  }
  function down(e: React.PointerEvent<HTMLCanvasElement>) {
    const ctx = sigRef.current?.getContext("2d"); if (!ctx) return;
    drawing.current = true; const { x, y } = pos(e);
    ctx.beginPath(); ctx.moveTo(x, y);
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
  }
  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const ctx = sigRef.current?.getContext("2d"); if (!ctx) return;
    const { x, y } = pos(e); ctx.lineTo(x, y); ctx.stroke(); hasSig.current = true;
  }
  function up() { drawing.current = false; }

  const isException = status !== "self_administered";
  const notesRequired = isException && notes.trim().length < 10;
  const reasonRequired = isException && !reason;

  // Late-entry gap
  const gapMinutes = useMemo(() => {
    if (!actualTime || !row) return 0;
    const [hh, mm] = actualTime.split(":").map(Number);
    if (isNaN(hh)) return 0;
    const d = new Date(); d.setHours(hh, mm ?? 0, 0, 0);
    return Math.max(0, Math.round((Date.now() - d.getTime()) / 60000));
  }, [actualTime, row]);
  const lateEntry = gapMinutes >= 15;

  if (!row) return null;

  const canSubmit = !!row && attested && !notesRequired && !reasonRequired;

  return (
    <Dialog open={!!row} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Observe & Confirm self-administration</DialogTitle>
          <DialogDescription>
            The Person self-administers; you observe and confirm. Document below.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Card className="p-3 text-sm bg-secondary/40">
            <div className="font-semibold">{row.client_name}</div>
            <div className="text-xs">{row.medication_name} · {row.dosage} · {row.route}</div>
            <div className="text-xs text-muted-foreground">Scheduled {new Date(row.scheduled_for).toLocaleString()}</div>
          </Card>

          <div className="grid gap-2">
            <Label>Outcome</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="self_administered">✅ Observed</SelectItem>
                <SelectItem value="refused">🛑 Refused</SelectItem>
                <SelectItem value="omitted">⚠️ Omitted</SelectItem>
                <SelectItem value="missed">⏰ Missed</SelectItem>
                <SelectItem value="loa">✈️ LOA (away with meds)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {status === "self_administered" && (
            <div className="grid gap-2">
              <Label className="text-xs">Time the Person actually took it (optional)</Label>
              <Input
                type="time"
                value={actualTime}
                onChange={(e) => setActualTime(e.target.value)}
              />
              {lateEntry && (
                <p className="text-[11px] text-amber-700 dark:text-amber-400">
                  ⚠️ Late entry — {gapMinutes} min gap will be flagged on the audit trail.
                </p>
              )}
            </div>
          )}

          {isException && (
            <>
              <div className="grid gap-2">
                <Label>Reason *</Label>
                <Select value={reason} onValueChange={setReason}>
                  <SelectTrigger className={reasonRequired ? "border-rose-400" : ""}>
                    <SelectValue placeholder="Select a reason" />
                  </SelectTrigger>
                  <SelectContent>
                    {EXCEPTION_REASONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Circumstances *</Label>
                <Textarea
                  rows={4} value={notes} onChange={(e) => setNotes(e.target.value)}
                  placeholder="Describe what happened, the Person's affect, attempts made, and any follow-up."
                  className={notesRequired ? "border-rose-400" : ""}
                />
                {notesRequired && <p className="text-xs text-rose-600">Required — min 10 characters.</p>}
              </div>
            </>
          )}

          {!isException && (
            <div className="grid gap-2">
              <Label>Notes (optional)</Label>
              <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional observation" />
            </div>
          )}

          <div>
            <div className="mb-1 flex items-center justify-between">
              <Label className="text-xs">Staff signature</Label>
              <Button type="button" variant="ghost" size="sm" onClick={clearSig} className="h-7 text-[11px]">
                <Eraser className="mr-1 h-3 w-3" /> Clear
              </Button>
            </div>
            <canvas
              ref={(el) => { sigRef.current = el; if (el) setTimeout(clearSig, 0); }}
              width={520} height={120}
              onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up}
              className="w-full touch-none rounded-md border-2 border-dashed border-border bg-white"
            />
          </div>

          <label className="flex items-start gap-2 rounded-md border-2 border-primary/30 bg-primary/5 p-3 text-xs cursor-pointer">
            <Checkbox checked={attested} onCheckedChange={(v) => setAttested(v === true)} className="mt-0.5" />
            <span><span className="font-semibold">Attestation:</span> {ATTESTATION}</span>
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>Cancel</Button>
          <Button
            disabled={!canSubmit || pending}
            onClick={() => {
              if (!hasSig.current) { toast.error("Sign the pad to confirm."); return; }
              const sig = sigRef.current?.toDataURL("image/png") ?? "";
              let actualIso: string | null = null;
              if (status === "self_administered" && actualTime) {
                const [hh, mm] = actualTime.split(":").map(Number);
                const d = new Date(); d.setHours(hh, mm ?? 0, 0, 0);
                actualIso = d.toISOString();
              }
              onSave({ row: row!, status, reason, notes, actualTakenAt: actualIso, signatureDataUrl: sig });
            }}
          >
            {pending ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
            Append to audit trail
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
