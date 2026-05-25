import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useCurrentOrg } from "@/hooks/use-org";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  AlertOctagon,
  CheckCircle2,
  Clock,
  Eraser,
  Loader2,
  Moon,
  Sun,
  Sunset,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

type Medication = {
  id: string;
  medication_name: string;
  dosage: string | null;
  route: string | null;
  scheduled_times: string[];
  instructions: string | null;
};

type EmarLog = {
  id: string;
  medication_id: string;
  scheduled_for: string;
  status: string;
};

type Block = "Morning" | "Noon" | "Night";

function blockFor(time: string): Block {
  // time is "HH:MM"
  const h = parseInt(time.split(":")[0] ?? "0", 10);
  if (h < 11) return "Morning";
  if (h < 17) return "Noon";
  return "Night";
}

function isoForToday(timeHHMM: string): string {
  const [h, m] = timeHHMM.split(":").map((n) => parseInt(n, 10));
  const d = new Date();
  d.setHours(h ?? 0, m ?? 0, 0, 0);
  return d.toISOString();
}

const BLOCK_META: Record<
  Block,
  { icon: typeof Sun; tone: string; label: string }
> = {
  Morning: {
    icon: Sun,
    tone: "text-amber-600 dark:text-amber-400",
    label: "Morning",
  },
  Noon: {
    icon: Sunset,
    tone: "text-orange-600 dark:text-orange-400",
    label: "Noon",
  },
  Night: {
    icon: Moon,
    tone: "text-indigo-600 dark:text-indigo-400",
    label: "Night",
  },
};

export function EmarTab({
  clientId,
  clientName,
}: {
  clientId: string;
  clientName: string;
}) {
  const { data: org } = useCurrentOrg();
  const { user } = useAuth();
  const qc = useQueryClient();
  const orgId = org?.organization_id;

  const { data: meds, isLoading } = useQuery({
    enabled: !!orgId,
    queryKey: ["client-meds", clientId, orgId],
    queryFn: async (): Promise<Medication[]> => {
      const { data, error } = await supabase
        .from("client_medications")
        .select(
          "id, medication_name, dosage, route, scheduled_times, instructions",
        )
        .eq("client_id", clientId)
        .eq("is_active", true)
        .order("medication_name");
      if (error) throw error;
      return (data ?? []) as unknown as Medication[];
    },
  });

  const todayStart = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }, []);
  const tomorrowStart = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 1);
    return d.toISOString();
  }, []);

  const { data: logs } = useQuery({
    enabled: !!orgId,
    queryKey: ["emar-logs-today", clientId, orgId],
    queryFn: async (): Promise<EmarLog[]> => {
      const { data, error } = await supabase
        .from("emar_logs")
        .select("id, medication_id, scheduled_for, status")
        .eq("client_id", clientId)
        .gte("scheduled_for", todayStart)
        .lt("scheduled_for", tomorrowStart);
      if (error) throw error;
      return (data ?? []) as unknown as EmarLog[];
    },
  });

  const passes = useMemo(() => {
    const rows: {
      med: Medication;
      time: string;
      iso: string;
      block: Block;
      log: EmarLog | undefined;
    }[] = [];
    (meds ?? []).forEach((med) => {
      med.scheduled_times.forEach((t) => {
        const iso = isoForToday(t);
        const log = (logs ?? []).find(
          (l) =>
            l.medication_id === med.id &&
            Math.abs(new Date(l.scheduled_for).getTime() - new Date(iso).getTime()) < 60_000,
        );
        rows.push({ med, time: t, iso, block: blockFor(t), log });
      });
    });
    return rows;
  }, [meds, logs]);

  const grouped = useMemo(() => {
    const m: Record<Block, typeof passes> = {
      Morning: [],
      Noon: [],
      Night: [],
    };
    passes.forEach((p) => m[p.block].push(p));
    (Object.keys(m) as Block[]).forEach((k) =>
      m[k].sort((a, b) => a.time.localeCompare(b.time)),
    );
    return m;
  }, [passes]);

  const [activePass, setActivePass] = useState<typeof passes[number] | null>(
    null,
  );
  const [refuseMed, setRefuseMed] = useState<typeof passes[number] | null>(
    null,
  );
  const [incidentMed, setIncidentMed] = useState<typeof passes[number] | null>(
    null,
  );

  async function recordLog(opts: {
    med: Medication;
    iso: string;
    status: "administered" | "refused" | "omitted";
    signature?: string;
    reason?: string;
  }) {
    if (!orgId || !user) return;
    const { error } = await supabase
      .from("emar_logs")
      .insert({
        organization_id: orgId,
        client_id: clientId,
        medication_id: opts.med.id,
        scheduled_for: opts.iso,
        scheduled_time_label: new Date(opts.iso).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
        administered_at:
          opts.status === "administered" ? new Date().toISOString() : null,
        status: opts.status,
        exception_reason: opts.reason ?? null,
        signature_attestation: opts.signature ?? null,
        staff_id: user.id,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
    if (error) throw error;
    qc.invalidateQueries({ queryKey: ["emar-logs-today", clientId, orgId] });
  }

  async function fileMissedIncident(p: (typeof passes)[number]) {
    if (!orgId || !user) return;
    try {
      const { error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from("submitted_forms" as any)
        .insert({
          organization_id: orgId,
          user_id: user.id,
          client_id: clientId,
          form_type: "incident_report",
          title: `Missed dose: ${p.med.medication_name}`,
          narrative: `Scheduled dose of ${p.med.medication_name} (${p.med.dosage ?? ""}) at ${p.time} was missed for ${clientName}.`,
          payload: {
            severity: "high",
            kind: "missed_medication",
            medication_id: p.med.id,
            scheduled_for: p.iso,
          },
          occurred_at: p.iso,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any);
      if (error) throw error;
      await recordLog({ med: p.med, iso: p.iso, status: "omitted", reason: "Missed window — incident filed" });
      toast.warning("Missed-dose incident report filed");
      setIncidentMed(null);
    } catch (e) {
      toast.error((e as Error).message || "Could not file incident");
    }
  }

  if (isLoading) {
    return (
      <p className="p-6 text-sm text-muted-foreground">Loading medications…</p>
    );
  }

  if (!meds?.length) {
    return (
      <Card className="p-8 text-center text-sm text-muted-foreground">
        No active medications on this individual's eMAR.
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      {(Object.keys(grouped) as Block[]).map((b) => {
        const items = grouped[b];
        if (!items.length) return null;
        const Meta = BLOCK_META[b];
        const Icon = Meta.icon;
        return (
          <Card key={b} className="overflow-hidden">
            <div className="flex items-center gap-2 border-b border-border bg-muted/30 px-5 py-3">
              <Icon className={`h-4 w-4 ${Meta.tone}`} />
              <h3 className="text-sm font-semibold">{Meta.label}</h3>
              <Badge variant="outline" className="ml-auto font-mono text-[10px]">
                {items.length} pass{items.length === 1 ? "" : "es"}
              </Badge>
            </div>
            <ul className="divide-y divide-border">
              {items.map((p) => {
                const done = p.log?.status === "administered";
                const refused =
                  p.log?.status === "refused" || p.log?.status === "omitted";
                const overdue =
                  !p.log && new Date(p.iso).getTime() < Date.now() - 60 * 60 * 1000;
                return (
                  <li
                    key={`${p.med.id}-${p.time}`}
                    className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-2">
                        <span className="font-mono text-xs text-muted-foreground">
                          <Clock className="mr-1 inline h-3 w-3" />
                          {p.time}
                        </span>
                        <p className="truncate text-sm font-semibold">
                          {p.med.medication_name}
                        </p>
                        {p.med.dosage && (
                          <span className="text-xs text-muted-foreground">
                            {p.med.dosage}
                          </span>
                        )}
                      </div>
                      {p.med.instructions && (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {p.med.instructions}
                        </p>
                      )}
                      {done && (
                        <Badge className="mt-1 bg-emerald-100 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300">
                          ✓ Passed
                        </Badge>
                      )}
                      {refused && (
                        <Badge variant="secondary" className="mt-1">
                          {p.log?.status === "refused" ? "Refused" : "Omitted"}
                        </Badge>
                      )}
                      {overdue && !p.log && (
                        <Badge className="mt-1 animate-pulse bg-rose-500 hover:bg-rose-500">
                          Window missed
                        </Badge>
                      )}
                    </div>

                    {/* Action triggers — mirrored on desktop + mobile */}
                    <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
                      <Button
                        size="sm"
                        variant={done ? "secondary" : "default"}
                        disabled={!!p.log}
                        onClick={() => setActivePass(p)}
                        className="h-11 min-w-[44px] gap-1.5"
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        Pass Med
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!!p.log}
                        onClick={() => setRefuseMed(p)}
                        className="h-11 min-w-[44px] gap-1.5"
                      >
                        <XCircle className="h-4 w-4" />
                        Refused
                      </Button>
                      {overdue && !p.log && (
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => setIncidentMed(p)}
                          className="h-11 min-w-[44px] gap-1.5"
                        >
                          <AlertOctagon className="h-4 w-4" />
                          File incident
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>
        );
      })}

      {activePass && (
        <SignatureDialog
          title={`Pass Med — ${activePass.med.medication_name}`}
          description={`${activePass.med.dosage ?? ""} scheduled at ${activePass.time}`}
          onCancel={() => setActivePass(null)}
          onConfirm={async (sig) => {
            try {
              await recordLog({
                med: activePass.med,
                iso: activePass.iso,
                status: "administered",
                signature: sig,
              });
              toast.success("Medication pass recorded");
              setActivePass(null);
            } catch (e) {
              toast.error((e as Error).message || "Could not record");
            }
          }}
        />
      )}

      {refuseMed && (
        <ReasonDialog
          title={`Refused / Omitted — ${refuseMed.med.medication_name}`}
          description="Document why this dose was not taken."
          onCancel={() => setRefuseMed(null)}
          onConfirm={async (reason) => {
            try {
              await recordLog({
                med: refuseMed.med,
                iso: refuseMed.iso,
                status: "refused",
                reason,
              });
              toast.success("Refusal recorded");
              setRefuseMed(null);
            } catch (e) {
              toast.error((e as Error).message || "Could not record");
            }
          }}
        />
      )}

      {incidentMed && (
        <Dialog open onOpenChange={(o) => !o && setIncidentMed(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertOctagon className="h-5 w-5 text-rose-500" />
                File missed-dose incident
              </DialogTitle>
              <DialogDescription>
                A high-severity incident report will be drafted for{" "}
                {clientName}'s missed{" "}
                {incidentMed.med.medication_name} dose at {incidentMed.time}.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setIncidentMed(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => fileMissedIncident(incidentMed)}
              >
                File incident
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function SignatureDialog({
  title,
  description,
  onCancel,
  onConfirm,
}: {
  title: string;
  description: string;
  onCancel: () => void;
  onConfirm: (signature: string) => Promise<void> | void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const hasSigRef = useRef(false);
  const [busy, setBusy] = useState(false);

  function clear() {
    const c = canvasRef.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    hasSigRef.current = false;
  }
  function pos(e: React.PointerEvent<HTMLCanvasElement>) {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * c.width,
      y: ((e.clientY - r.top) / r.height) * c.height,
    };
  }
  function down(e: React.PointerEvent<HTMLCanvasElement>) {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    drawingRef.current = true;
    const { x, y } = pos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
  }
  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = pos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    hasSigRef.current = true;
  }
  function up() {
    drawingRef.current = false;
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div>
          <div className="mb-2 flex items-center justify-between">
            <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Electronic signature
            </Label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={clear}
              className="h-7 text-xs"
            >
              <Eraser className="mr-1 h-3 w-3" /> Clear
            </Button>
          </div>
          <canvas
            ref={(el) => {
              canvasRef.current = el;
              if (el) setTimeout(clear, 0);
            }}
            width={600}
            height={140}
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerLeave={up}
            className="w-full touch-none rounded-lg border-2 border-dashed border-border bg-white"
            aria-label="Signature pad"
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button
            disabled={busy}
            onClick={async () => {
              if (!hasSigRef.current) {
                toast.error("Sign the pad to confirm.");
                return;
              }
              setBusy(true);
              await onConfirm(
                canvasRef.current?.toDataURL("image/png") ?? "",
              );
              setBusy(false);
            }}
          >
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Confirm pass
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReasonDialog({
  title,
  description,
  onCancel,
  onConfirm,
}: {
  title: string;
  description: string;
  onCancel: () => void;
  onConfirm: (reason: string) => Promise<void> | void;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <Textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={4}
          maxLength={1000}
          placeholder="Reason (e.g., individual refused, sleeping, vomited dose)…"
        />
        <DialogFooter>
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button
            disabled={busy || reason.trim().length < 5}
            onClick={async () => {
              setBusy(true);
              await onConfirm(reason.trim());
              setBusy(false);
            }}
          >
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
