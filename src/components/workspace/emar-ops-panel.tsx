/**
 * eMAR operations panel — admin/staff surfaces for the parts of Prompts 2 & 3
 * that don't live on the daily pass: refill workflow, controlled-substance
 * shift-change counts, and chain-of-custody transfers. All writes flow through
 * the server functions in src/lib/emar-pass.functions.ts so the training gate,
 * org scoping, and append-only history are enforced server-side.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-org";
import { usePermissions } from "@/hooks/use-permissions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertTriangle, Package, ArrowRightLeft, RefreshCcw, ClipboardCheck, Eraser, Loader2,
} from "lucide-react";
import { toast } from "sonner";
import {
  setRefillStatus, logShiftChangeCount, logMedicationTransfer,
} from "@/lib/emar-pass.functions";

type Med = {
  id: string;
  medication_name: string;
  dosage: string | null;
  is_controlled: boolean;
  is_active: boolean;
  pill_count_current: number | null;
  refill_threshold: number | null;
  refill_status: string | null;
};

function SigPad({ value, onChange }: { value: string | null; onChange: (d: string | null) => void }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const dirty = useRef(false);
  function init() {
    const c = ref.current; const ctx = c?.getContext("2d"); if (!c || !ctx) return;
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
    ctx.strokeStyle = "#0f172a"; ctx.lineWidth = 2; ctx.lineCap = "round";
  }
  useEffect(() => { init(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  useEffect(() => { if (!value) { init(); dirty.current = false; } }, [value]);
  function pos(e: React.PointerEvent<HTMLCanvasElement>) {
    const c = ref.current!; const r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * c.width, y: ((e.clientY - r.top) / r.height) * c.height };
  }
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Signature</Label>
        <button type="button" className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:underline"
          onClick={() => { init(); dirty.current = false; onChange(null); }}>
          <Eraser className="h-3 w-3" /> Clear
        </button>
      </div>
      <canvas ref={ref} width={500} height={100}
        onPointerDown={(e) => { const ctx = ref.current?.getContext("2d"); if (!ctx) return; drawing.current = true; const { x, y } = pos(e); ctx.beginPath(); ctx.moveTo(x, y); (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId); }}
        onPointerMove={(e) => { if (!drawing.current) return; const ctx = ref.current?.getContext("2d"); if (!ctx) return; const { x, y } = pos(e); ctx.lineTo(x, y); ctx.stroke(); dirty.current = true; }}
        onPointerUp={() => { if (!drawing.current) return; drawing.current = false; if (dirty.current) onChange(ref.current?.toDataURL("image/png") ?? null); }}
        onPointerLeave={() => { drawing.current = false; }}
        className="w-full touch-none rounded-md border-2 border-dashed bg-white cursor-crosshair"
      />
    </div>
  );
}

// ── Refills ───────────────────────────────────────────────────────────────────
function RefillsCard({ meds, clientId }: { meds: Med[]; clientId: string }) {
  const qc = useQueryClient();
  const setStatus = useServerFn(setRefillStatus);
  const mut = useMutation({
    mutationFn: async (v: { medicationId: string; status: "pending" | "ordered" | "ok" }) =>
      setStatus({ data: v }),
    onSuccess: () => {
      toast.success("Refill status updated.");
      qc.invalidateQueries({ queryKey: ["mar-meds", clientId] });
      qc.invalidateQueries({ queryKey: ["mar-chart", clientId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const low = meds.filter((m) =>
    m.is_active && typeof m.pill_count_current === "number" &&
    m.pill_count_current <= (m.refill_threshold ?? 7),
  );

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <RefreshCcw className="h-4 w-4 text-primary" /> Refill alerts
        <Badge variant="outline" className="ml-auto text-[10px]">{low.length} below threshold</Badge>
      </div>
      {meds.length === 0 ? (
        <p className="text-sm text-muted-foreground">No active medications.</p>
      ) : (
        <ul className="divide-y divide-border">
          {meds.filter((m) => m.is_active).map((m) => {
            const onHand = m.pill_count_current ?? null;
            const threshold = m.refill_threshold ?? 7;
            const isLow = typeof onHand === "number" && onHand <= threshold;
            const status = m.refill_status ?? "ok";
            return (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium">{m.medication_name} {m.dosage && <span className="text-xs text-muted-foreground">· {m.dosage}</span>}</p>
                  <p className="text-[11px] text-muted-foreground">
                    On hand: {onHand ?? "—"} · Threshold: {threshold}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  {isLow && <Badge className="bg-amber-100 text-amber-900 text-[10px] hover:bg-amber-100"><AlertTriangle className="mr-1 h-3 w-3" />Low</Badge>}
                  {status === "pending" && <Badge className="bg-blue-100 text-blue-900 text-[10px] hover:bg-blue-100">Refill pending</Badge>}
                  {status === "ordered" && <Badge className="bg-indigo-100 text-indigo-900 text-[10px] hover:bg-indigo-100">Ordered</Badge>}
                  {status === "ok" && <Badge variant="outline" className="text-[10px]">OK</Badge>}
                  {status === "ok" && (
                    <Button size="sm" variant="outline" className="h-8" disabled={mut.isPending}
                      onClick={() => mut.mutate({ medicationId: m.id, status: "pending" })}>
                      Mark refill needed
                    </Button>
                  )}
                  {status === "pending" && (
                    <Button size="sm" variant="outline" className="h-8" disabled={mut.isPending}
                      onClick={() => mut.mutate({ medicationId: m.id, status: "ordered" })}>
                      Mark ordered
                    </Button>
                  )}
                  {(status === "ordered" || status === "pending") && (
                    <Button size="sm" className="h-8" disabled={mut.isPending}
                      onClick={() => mut.mutate({ medicationId: m.id, status: "ok" })}>
                      Resolve
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

// ── Shift-change controlled counts ────────────────────────────────────────────
function ShiftCountCard({ meds, clientId }: { meds: Med[]; clientId: string }) {
  const controlled = meds.filter((m) => m.is_active && m.is_controlled);
  const [activeMed, setActiveMed] = useState<Med | null>(null);
  const [counted, setCounted] = useState("");
  const [notes, setNotes] = useState("");
  const [sig, setSig] = useState<string | null>(null);
  const qc = useQueryClient();
  const submit = useServerFn(logShiftChangeCount);
  const mut = useMutation({
    mutationFn: async () => submit({
      data: {
        medicationId: activeMed!.id,
        expected: activeMed!.pill_count_current ?? null,
        counted: parseInt(counted, 10),
        signatureDataUrl: sig!,
        notes: notes.trim() || null,
      },
    }),
    onSuccess: (r) => {
      toast.success(r?.flagged ? "Logged — variance flagged for admin." : "Shift count logged.");
      qc.invalidateQueries({ queryKey: ["controlled-counts", clientId] });
      setActiveMed(null); setCounted(""); setNotes(""); setSig(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <ClipboardCheck className="h-4 w-4 text-purple-600" /> Shift-change controlled counts
      </div>
      {controlled.length === 0 ? (
        <p className="text-sm text-muted-foreground">No controlled medications on file.</p>
      ) : (
        <ul className="divide-y divide-border">
          {controlled.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-2 py-2 text-sm">
              <div>
                <p className="font-medium">{m.medication_name}</p>
                <p className="text-[11px] text-muted-foreground">Expected count: {m.pill_count_current ?? "—"}</p>
              </div>
              <Button size="sm" variant="outline" className="h-8" onClick={() => { setActiveMed(m); setCounted(String(m.pill_count_current ?? "")); }}>
                Count at shift change
              </Button>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={!!activeMed} onOpenChange={(o) => !o && setActiveMed(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Shift-change count — {activeMed?.medication_name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">Expected: <span className="font-mono">{activeMed?.pill_count_current ?? "—"}</span></p>
            <div className="grid gap-1.5">
              <Label className="text-xs">Counted</Label>
              <Input type="number" value={counted} onChange={(e) => setCounted(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">Notes (optional)</Label>
              <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Witness present, packaging condition, etc." />
            </div>
            <SigPad value={sig} onChange={setSig} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActiveMed(null)}>Cancel</Button>
            <Button disabled={!sig || !counted || mut.isPending} onClick={() => mut.mutate()}>
              {mut.isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />} Log count
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ── Transfers (chain of custody) ──────────────────────────────────────────────
function TransfersCard({ meds, clientId }: { meds: Med[]; clientId: string }) {
  const { data: org } = useCurrentOrg();
  const qc = useQueryClient();
  const submit = useServerFn(logMedicationTransfer);
  const [open, setOpen] = useState(false);
  const [medId, setMedId] = useState<string>("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [qty, setQty] = useState("");
  const [recipient, setRecipient] = useState("");
  const [notes, setNotes] = useState("");
  const [sigOut, setSigOut] = useState<string | null>(null);
  const [sigIn, setSigIn] = useState<string | null>(null);

  const { data: transfers = [] } = useQuery({
    enabled: !!org && !!clientId,
    queryKey: ["med-transfers", clientId, org?.organization_id],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("medication_transfers")
        .select("id, created_at, from_location, to_location, quantity, released_by_name, received_by_name, medication_id, notes")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false })
        .limit(25);
      return (data ?? []) as Array<{
        id: string; created_at: string; from_location: string; to_location: string;
        quantity: number; released_by_name: string; received_by_name: string;
        medication_id: string; notes: string | null;
      }>;
    },
  });
  const medName = useMemo(() => new Map(meds.map((m) => [m.id, m.medication_name])), [meds]);

  const mut = useMutation({
    mutationFn: async () => submit({
      data: {
        medicationId: medId, fromLocation: from, toLocation: to,
        quantity: parseInt(qty, 10), receivedByName: recipient,
        releasedSignature: sigOut!, receivedSignature: sigIn!,
        notes: notes.trim() || null,
      },
    }),
    onSuccess: () => {
      toast.success("Transfer logged.");
      qc.invalidateQueries({ queryKey: ["med-transfers", clientId] });
      setOpen(false); setMedId(""); setFrom(""); setTo(""); setQty(""); setRecipient(""); setNotes(""); setSigOut(null); setSigIn(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <ArrowRightLeft className="h-4 w-4 text-blue-600" /> Medication transfers
        <Button size="sm" className="ml-auto h-8" onClick={() => setOpen(true)} disabled={meds.length === 0}>
          Log transfer
        </Button>
      </div>
      {transfers.length === 0 ? (
        <p className="text-sm text-muted-foreground">No transfers recorded.</p>
      ) : (
        <ul className="divide-y divide-border">
          {transfers.map((t) => (
            <li key={t.id} className="py-2 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="text-[10px]">{new Date(t.created_at).toLocaleString()}</Badge>
                <span className="font-medium">{medName.get(t.medication_id) ?? "Medication"}</span>
                <span className="text-xs text-muted-foreground">× {t.quantity}</span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                {t.from_location} → {t.to_location} · Released by {t.released_by_name} · Received by {t.received_by_name}
              </p>
              {t.notes && <p className="text-[11px] italic text-muted-foreground">“{t.notes}”</p>}
            </li>
          ))}
        </ul>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Log medication transfer</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid gap-1.5">
              <Label className="text-xs">Medication</Label>
              <select className="h-9 rounded-md border bg-background px-2 text-sm" value={medId} onChange={(e) => setMedId(e.target.value)}>
                <option value="">Select…</option>
                {meds.filter((m) => m.is_active).map((m) => (
                  <option key={m.id} value={m.id}>{m.medication_name}{m.dosage ? ` · ${m.dosage}` : ""}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="grid gap-1.5">
                <Label className="text-xs">From location</Label>
                <Input value={from} onChange={(e) => setFrom(e.target.value)} placeholder="Home / staff name" />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">To location</Label>
                <Input value={to} onChange={(e) => setTo(e.target.value)} placeholder="Day program / host home" />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">Quantity</Label>
                <Input type="number" value={qty} onChange={(e) => setQty(e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">Received by (name)</Label>
                <Input value={recipient} onChange={(e) => setRecipient(e.target.value)} />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">Notes</Label>
              <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
            <div className="grid gap-2 rounded-md border p-2">
              <p className="text-[11px] font-semibold text-muted-foreground">Releasing staff signature</p>
              <SigPad value={sigOut} onChange={setSigOut} />
            </div>
            <div className="grid gap-2 rounded-md border p-2">
              <p className="text-[11px] font-semibold text-muted-foreground">Receiving signature</p>
              <SigPad value={sigIn} onChange={setSigIn} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              disabled={!medId || !from || !to || !qty || !recipient || !sigOut || !sigIn || mut.isPending}
              onClick={() => mut.mutate()}
            >
              {mut.isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />} Log transfer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ── Public entry ──────────────────────────────────────────────────────────────
export function EmarOpsPanel({ clientId }: { clientId: string }) {
  const { data: org } = useCurrentOrg();
  const { role } = usePermissions();
  const isAdmin = role === "admin" || role === "manager" || role === "super_admin";
  const { data: meds = [], isLoading } = useQuery({
    enabled: !!org && !!clientId,
    queryKey: ["mar-meds-ops", clientId, org?.organization_id],
    queryFn: async (): Promise<Med[]> => {
      const { data, error } = await (supabase as any)
        .from("client_medications")
        .select("id, medication_name, dosage, is_controlled, is_active, pill_count_current, refill_threshold, refill_status")
        .eq("client_id", clientId)
        .order("medication_name");
      if (error) throw error;
      return (data ?? []) as Med[];
    },
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <div className="grid gap-3">
      <RefillsCard meds={meds} clientId={clientId} />
      <ShiftCountCard meds={meds} clientId={clientId} />
      <TransfersCard meds={meds} clientId={clientId} />
      {!isAdmin && (
        <p className="text-[11px] text-muted-foreground">
          <Package className="mr-1 inline h-3 w-3" />
          Refill resolution is admin-only on the back end; staff actions here are advisory until admins confirm.
        </p>
      )}
    </div>
  );
}
