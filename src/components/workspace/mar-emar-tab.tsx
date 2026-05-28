import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useCurrentOrg } from "@/hooks/use-org";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertOctagon, CheckCircle2, Clock, Eraser, Loader2,
  Moon, Sun, Sunset, XCircle, CalendarDays, ChevronLeft,
  ChevronRight, AlertTriangle, ShieldCheck, Pill,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────

type Medication = {
  id: string;
  medication_name: string;
  dosage: string | null;
  frequency: string | null;
  route: string | null;
  scheduled_times: string[];
  instructions: string | null;
  prescriber: string | null;
  is_active: boolean;
  is_controlled: boolean;
  is_prn: boolean;
  prn_instructions: string | null;
  pharmacy: string | null;
  rx_number: string | null;
  pill_count_current: number | null;
};

type EmarLog = {
  id: string;
  medication_id: string;
  scheduled_for: string;
  administered_at: string | null;
  status: "administered" | "refused" | "omitted" | "missed";
  exception_reason: string | null;
  notes: string | null;
  staff_name: string | null;
  signature_data_url: string | null;
  signature_attestation: string | null;
  is_medication_error: boolean;
  is_controlled: boolean;
  pill_count_verified: boolean | null;
  pill_count_value: number | null;
  is_prn: boolean;
  prn_reason: string | null;
  admin_reviewed: boolean;
};

type Block = "Morning" | "Noon" | "Evening" | "Night";

// ─── Constants ────────────────────────────────────────────────────────────────

const FIVE_RIGHTS_ATTESTATION =
  "I attest under penalty of administrative non-compliance that I have verified " +
  "the Five Rights of Medication Administration: (1) Right Resident, (2) Right Medication, " +
  "(3) Right Dose, (4) Right Route, (5) Right Time — and that this record is true and accurate.";

const EXCEPTION_REASONS = [
  "Individual refused",
  "Individual unavailable / sleeping",
  "Held per physician order",
  "NPO — medical hold",
  "Medication unavailable / out of stock",
  "Adverse reaction — withheld",
  "Self-administered (witnessed by staff)",
  "Appointment — administered by provider",
  "Other (see notes below)",
];

const BLOCK_META: Record<Block, { icon: typeof Sun; tone: string; bg: string }> = {
  Morning: { icon: Sun,    tone: "text-amber-600 dark:text-amber-400",  bg: "bg-amber-50 dark:bg-amber-950/20" },
  Noon:    { icon: Sunset, tone: "text-orange-600 dark:text-orange-400", bg: "bg-orange-50 dark:bg-orange-950/20" },
  Evening: { icon: Sunset, tone: "text-rose-500 dark:text-rose-400",    bg: "bg-rose-50 dark:bg-rose-950/20" },
  Night:   { icon: Moon,   tone: "text-indigo-600 dark:text-indigo-400", bg: "bg-indigo-50 dark:bg-indigo-950/20" },
};

const STATUS_STYLES: Record<EmarLog["status"], string> = {
  administered: "bg-emerald-500 text-white",
  refused:      "bg-rose-600 text-white",
  omitted:      "bg-rose-500 text-white",
  missed:       "bg-amber-400 text-amber-950",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function blockFor(time: string): Block {
  const h = parseInt(time.split(":")[0] ?? "0", 10);
  if (h < 11) return "Morning";
  if (h < 14) return "Noon";
  if (h < 18) return "Evening";
  return "Night";
}

function isoForToday(timeHHMM: string): string {
  const [h, m] = timeHHMM.split(":").map((n) => parseInt(n, 10));
  const d = new Date();
  d.setHours(h ?? 0, m ?? 0, 0, 0);
  return d.toISOString();
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function today(): string {
  return new Date().toISOString().split("T")[0];
}

// ─── Signature pad ────────────────────────────────────────────────────────────

function SigPad({
  onSigned,
  onClear,
  label = "Electronic Signature",
}: {
  onSigned: (dataUrl: string | null) => void;
  onClear?: () => void;
  label?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const hasSigRef = useRef(false);

  function clear() {
    const c = canvasRef.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    hasSigRef.current = false;
    onSigned(null);
    onClear?.();
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
    onSigned(canvasRef.current?.toDataURL("image/png") ?? null);
  }

  function up() {
    drawingRef.current = false;
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </Label>
        <button
          type="button"
          onClick={clear}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline"
        >
          <Eraser className="h-3 w-3" /> Clear
        </button>
      </div>
      <canvas
        ref={(el) => {
          canvasRef.current = el;
          if (el) setTimeout(clear, 0);
        }}
        width={600}
        height={120}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerLeave={up}
        className="w-full touch-none rounded-xl border-2 border-dashed border-border bg-white"
        aria-label="Signature pad"
      />
      <p className="text-[11px] text-muted-foreground">
        Sign with your finger or mouse to confirm administration.
      </p>
    </div>
  );
}

// ─── Pass Dialog ──────────────────────────────────────────────────────────────

function PassDialog({
  pass,
  clientName,
  onClose,
  onSubmit,
}: {
  pass: { med: Medication; time: string; iso: string } | null;
  clientName: string;
  onClose: () => void;
  onSubmit: (payload: {
    status: EmarLog["status"];
    exceptionReason: string | null;
    notes: string | null;
    signatureDataUrl: string | null;
    pillCountVerified: boolean | null;
    pillCountValue: number | null;
    prnReason: string | null;
    isMedicationError: boolean;
    attested: boolean;
  }) => Promise<void>;
}) {
  const [status, setStatus] = useState<EmarLog["status"]>("administered");
  const [exceptionReason, setExceptionReason] = useState("");
  const [notes, setNotes] = useState("");
  const [sigDataUrl, setSigDataUrl] = useState<string | null>(null);
  const [pillVerified, setPillVerified] = useState(false);
  const [pillCount, setPillCount] = useState("");
  const [prnReason, setPrnReason] = useState("");
  const [isMedError, setIsMedError] = useState(false);
  const [attested, setAttested] = useState(false);
  const [busy, setBusy] = useState(false);

  const med = pass?.med;
  const isException = status !== "administered";
  const needsExceptionReason = isException;

  const canSubmit =
    !busy &&
    attested &&
    !!sigDataUrl &&
    (!needsExceptionReason || exceptionReason.trim().length >= 3) &&
    (!med?.is_prn || prnReason.trim().length >= 3) &&
    (!med?.is_controlled || status !== "administered" || (pillVerified && !!pillCount));

  async function handleSubmit() {
    if (!canSubmit) return;
    setBusy(true);
    try {
      await onSubmit({
        status,
        exceptionReason: isException ? exceptionReason.trim() : null,
        notes: notes.trim() || null,
        signatureDataUrl: sigDataUrl,
        pillCountVerified: med?.is_controlled ? pillVerified : null,
        pillCountValue: med?.is_controlled && pillCount ? parseInt(pillCount, 10) : null,
        prnReason: med?.is_prn ? prnReason.trim() : null,
        isMedicationError: isMedError,
        attested,
      });
    } finally {
      setBusy(false);
    }
  }

  if (!pass) return null;

  return (
    <Dialog open={!!pass} onOpenChange={(o) => { if (!o && !busy) onClose(); }}>
      <DialogContent
        className="max-h-[90vh] max-w-lg overflow-y-auto"
        onPointerDownOutside={(e) => { if (busy) e.preventDefault(); }}
        onEscapeKeyDown={(e) => { if (busy) e.preventDefault(); }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pill className="h-5 w-5 text-primary" />
            MAR — {med?.medication_name}
          </DialogTitle>
          <DialogDescription>
            {clientName} · {med?.dosage ?? ""} {med?.route ? `· ${med.route}` : ""} · Scheduled {pass.time}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* PRN reason */}
          {med?.is_prn && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-50 p-3 dark:bg-amber-950/20">
              <p className="mb-1.5 text-xs font-semibold text-amber-800 dark:text-amber-200">
                ⚠️ PRN Medication — Reason Required
              </p>
              {med.prn_instructions && (
                <p className="mb-2 text-xs text-amber-700 dark:text-amber-300">{med.prn_instructions}</p>
              )}
              <Textarea
                rows={2}
                value={prnReason}
                onChange={(e) => setPrnReason(e.target.value)}
                placeholder="Why is this PRN medication being administered now?"
                className="text-xs"
              />
            </div>
          )}

          {/* Controlled substance */}
          {med?.is_controlled && (
            <div className="rounded-lg border border-purple-500/30 bg-purple-50 p-3 dark:bg-purple-950/20">
              <p className="mb-2 text-xs font-semibold text-purple-800 dark:text-purple-200">
                🔐 Controlled Substance — Pill Count Required
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label className="text-xs">Current pill count (before)</Label>
                  <Input
                    type="number"
                    min="0"
                    value={pillCount}
                    onChange={(e) => setPillCount(e.target.value)}
                    placeholder="e.g., 28"
                    className="h-9"
                  />
                </div>
                <div className="flex items-end pb-2">
                  <label className="flex cursor-pointer items-center gap-2 text-xs">
                    <Checkbox
                      checked={pillVerified}
                      onCheckedChange={(c) => setPillVerified(!!c)}
                    />
                    <span>Count verified by second witness</span>
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* Administration status */}
          <div className="grid gap-2">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Administration Status
            </Label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(["administered", "refused", "omitted", "missed"] as EmarLog["status"][]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => { setStatus(s); if (s === "administered") setIsMedError(false); }}
                  className={`rounded-lg border px-3 py-2 text-xs font-semibold capitalize transition ${
                    status === s
                      ? s === "administered"
                        ? "border-emerald-500 bg-emerald-600 text-white shadow-sm"
                        : "border-rose-500 bg-rose-600 text-white shadow-sm"
                      : "border-border bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Exception reason */}
          {isException && (
            <div className="grid gap-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Reason for Exception *
              </Label>
              <select
                value={exceptionReason}
                onChange={(e) => setExceptionReason(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">Select a reason…</option>
                {EXCEPTION_REASONS.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
          )}

          {/* Notes */}
          <div className="grid gap-2">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Notes / Observations
            </Label>
            <Textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any observations, reactions, or relevant clinical notes…"
              className="text-sm"
              maxLength={2000}
            />
          </div>

          {/* Medication error flag */}
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-rose-500/30 bg-rose-50 p-3 dark:bg-rose-950/20">
            <Checkbox
              checked={isMedError}
              onCheckedChange={(c) => setIsMedError(!!c)}
              className="mt-0.5"
            />
            <div>
              <p className="text-xs font-semibold text-rose-800 dark:text-rose-200">
                🚨 This is a medication error requiring immediate reporting
              </p>
              <p className="mt-0.5 text-[11px] text-rose-700 dark:text-rose-300">
                Checking this will immediately notify your administrator and require an incident report.
              </p>
            </div>
          </label>

          {/* Signature */}
          <SigPad
            onSigned={setSigDataUrl}
            onClear={() => setSigDataUrl(null)}
          />

          {/* Five Rights attestation */}
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 p-3">
            <Checkbox
              checked={attested}
              onCheckedChange={(c) => setAttested(!!c)}
              className="mt-0.5"
            />
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              {FIVE_RIGHTS_ATTESTATION}
            </p>
          </label>

          {/* Submit guard hints */}
          {!canSubmit && (
            <ul className="space-y-0.5 text-[11px] text-muted-foreground">
              {!sigDataUrl && <li>· Sign the signature pad above</li>}
              {!attested && <li>· Check the Five Rights attestation</li>}
              {needsExceptionReason && exceptionReason.trim().length < 3 && <li>· Select an exception reason</li>}
              {med?.is_prn && prnReason.trim().length < 3 && <li>· Enter PRN reason</li>}
              {med?.is_controlled && status === "administered" && !pillVerified && <li>· Verify pill count</li>}
            </ul>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className={
              isMedError
                ? "bg-rose-600 hover:bg-rose-700 text-white"
                : status === "administered"
                ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                : "bg-amber-600 hover:bg-amber-700 text-white"
            }
          >
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isMedError ? "🚨 Submit & Report Error" : status === "administered" ? "✅ Confirm Administration" : "📋 Record Exception"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── MAR Calendar view ────────────────────────────────────────────────────────

function MarCalendarView({ clientId }: { clientId: string }) {
  const [cursor, setCursor] = useState(() => {
    const d = new Date(); d.setDate(1); return d;
  });
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const { data: meds } = useQuery({
    queryKey: ["mar-meds", clientId],
    queryFn: async (): Promise<Medication[]> => {
      const { data, error } = await supabase
        .from("client_medications")
        .select("id, medication_name, dosage, scheduled_times, is_active, is_controlled, is_prn")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .eq("client_id", clientId) as any;

      if (error) throw error;
      return (data as unknown as Medication[]) ?? [];
    },
  });

  const { data: logs } = useQuery({
    queryKey: ["mar-logs", clientId, year, month],
    queryFn: async (): Promise<EmarLog[]> => {
      const start = new Date(year, month, 1).toISOString();
      const end = new Date(year, month + 1, 1).toISOString();
      const { data, error } = await supabase
        .from("emar_logs")
        .select("id, medication_id, scheduled_for, administered_at, status, exception_reason, notes, staff_name, signature_attestation, is_medication_error, admin_reviewed")
        .eq("client_id", clientId)
        .gte("scheduled_for", start)
        .lt("scheduled_for", end)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        as any;
      if (error) throw error;
      return (data as unknown as EmarLog[]) ?? [];
    },
  });

  const logsByCell = useMemo(() => {
    const map = new Map<string, EmarLog>();
    (logs ?? []).forEach((l) => {
      const d = new Date(l.scheduled_for).getDate();
      const timeLabel =
        new Date(l.scheduled_for).toTimeString().slice(0, 5);
      map.set(`${l.medication_id}|${d}|${timeLabel}`, l);
    });
    return map;
  }, [logs]);

  const monthLabel = cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const todayDate = new Date();

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Monthly MAR Sheet</h3>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" size="icon"
            onClick={() => setCursor(new Date(year, month - 1, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-[140px] text-center text-sm font-medium">{monthLabel}</span>
          <Button type="button" variant="ghost" size="icon"
            onClick={() => setCursor(new Date(year, month + 1, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 text-[10px]">
        <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded bg-emerald-500" /> Administered</span>
        <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded bg-rose-600" /> Refused</span>
        <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded bg-amber-400" /> Missed</span>
        <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded border border-border bg-muted" /> Scheduled</span>
      </div>

      {!meds?.length ? (
        <p className="py-6 text-center text-xs text-muted-foreground">No medications scheduled.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-card border border-border p-1.5 text-left min-w-[160px] font-semibold">
                  Medication
                </th>
                {days.map((d) => (
                  <th key={d}
                    className={`border border-border p-1 text-center w-7 font-medium ${
                      d === todayDate.getDate() && month === todayDate.getMonth() && year === todayDate.getFullYear()
                        ? "bg-primary/10 text-primary"
                        : ""
                    }`}>
                    {d}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(meds ?? []).flatMap((m) =>
                (m.scheduled_times.length ? m.scheduled_times : ["—"]).map((time) => (
                  <tr key={`${m.id}-${time}`}>
                    <td className="sticky left-0 z-10 bg-card border border-border p-1.5 align-top">
                      <div className="font-medium">{m.medication_name}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {m.dosage}
                        {time !== "—" && <span className="font-mono ml-1">· {time}</span>}
                        {m.is_controlled && <span className="ml-1 text-purple-600 font-semibold">C</span>}
                        {m.is_prn && <span className="ml-1 text-amber-600 font-semibold">PRN</span>}
                        {!m.is_active && (
                          <Badge variant="outline" className="ml-1 text-[9px]">D/C</Badge>
                        )}
                      </div>
                    </td>
                    {days.map((d) => {
                      const log = logsByCell.get(`${m.id}|${d}|${time}`);
                      const isPastDay = new Date(year, month, d) < new Date(todayDate.getFullYear(), todayDate.getMonth(), todayDate.getDate());
                      const cellClass = log
                        ? STATUS_STYLES[log.status]
                        : isPastDay && m.is_active
                        ? "bg-amber-100 text-amber-900 dark:bg-amber-950/40"
                        : "bg-background";
                      return (
                        <td key={d} className="border border-border p-0">
                          {log ? (
                            <Popover>
                              <PopoverTrigger asChild>
                                <button className={`flex h-7 w-7 items-center justify-center text-[10px] font-bold ${cellClass} hover:opacity-80 transition`}>
                                  {log.status === "administered" ? "✓"
                                    : log.status === "refused" ? "R"
                                    : log.status === "omitted" ? "O"
                                    : "M"}
                                  {log.is_medication_error && <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-rose-500" />}
                                </button>
                              </PopoverTrigger>
                              <PopoverContent className="w-80 text-xs space-y-1.5" align="center">
                                <p className="font-semibold">{m.medication_name} · {time}</p>
                                <div className="flex items-center gap-2">
                                  <Badge className={`${STATUS_STYLES[log.status]} text-[10px]`}>
                                    {log.status.toUpperCase()}
                                  </Badge>
                                  {log.is_medication_error && (
                                    <Badge className="bg-rose-500 text-white text-[10px]">MED ERROR</Badge>
                                  )}
                                </div>
                                {log.administered_at && (
                                  <p>Administered: {fmtTime(log.administered_at)}</p>
                                )}
                                {log.exception_reason && <p>Reason: {log.exception_reason}</p>}
                                {log.notes && <p className="text-muted-foreground">Notes: {log.notes}</p>}
                                {log.staff_name && <p>Staff: {log.staff_name}</p>}
                                {log.signature_attestation && (
                                  <div className="mt-1 flex items-center gap-1 text-emerald-700 dark:text-emerald-300">
                                    <ShieldCheck className="h-3 w-3" />
                                    <span>Five Rights attested</span>
                                  </div>
                                )}
                              </PopoverContent>
                            </Popover>
                          ) : (
                            <div className={`h-7 w-7 ${cellClass}`} />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Main MAR Tab component ───────────────────────────────────────────────────

export function MarEmarTab({
  clientId,
  clientName,
}: {
  clientId: string;
  clientName: string;
}) {
  const { user } = useAuth();
  const { data: org } = useCurrentOrg();
  const qc = useQueryClient();
  const orgId = org?.organization_id;

  const [activePass, setActivePass] = useState<{
    med: Medication; time: string; iso: string;
  } | null>(null);

  const todayStart = useMemo(() => {
    const d = new Date(); d.setHours(0, 0, 0, 0); return d.toISOString();
  }, []);
  const tomorrowStart = useMemo(() => {
    const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + 1); return d.toISOString();
  }, []);

  const { data: meds, isLoading } = useQuery({
    enabled: !!orgId,
    queryKey: ["mar-meds-today", clientId, orgId],
    queryFn: async (): Promise<Medication[]> => {
      const { data, error } = await supabase
        .from("client_medications")
        .select("id, medication_name, dosage, frequency, route, scheduled_times, instructions, prescriber, is_active, is_controlled, is_prn, prn_instructions, pharmacy, rx_number, pill_count_current")
        .eq("client_id", clientId)
        .eq("is_active", true)
        .order("medication_name")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        as any;
      if (error) throw error;
      return (data ?? []) as unknown as Medication[];
    },
  });

  const { data: logs } = useQuery({
    enabled: !!orgId,
    queryKey: ["mar-logs-today", clientId, orgId],
    queryFn: async (): Promise<EmarLog[]> => {
      const { data, error } = await supabase
        .from("emar_logs")
        .select("id, medication_id, scheduled_for, administered_at, status, exception_reason, notes, staff_name, signature_attestation, is_medication_error, is_controlled, pill_count_verified, pill_count_value, is_prn, prn_reason, admin_reviewed, signature_data_url")
        .eq("client_id", clientId)
        .gte("scheduled_for", todayStart)
        .lt("scheduled_for", tomorrowStart)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        as any;
      if (error) throw error;
      return (data ?? []) as unknown as EmarLog[];
    },
  });

  const passes = useMemo(() => {
    const rows: { med: Medication; time: string; iso: string; block: Block; log: EmarLog | undefined }[] = [];
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
    const m: Record<Block, typeof passes> = { Morning: [], Noon: [], Evening: [], Night: [] };
    passes.forEach((p) => m[p.block].push(p));
    (Object.keys(m) as Block[]).forEach((k) =>
      m[k].sort((a, b) => a.time.localeCompare(b.time))
    );
    return m;
  }, [passes]);

  const pendingCount = passes.filter((p) => !p.log).length;
  const errorCount   = passes.filter((p) => p.log?.is_medication_error).length;

  const submitPass = useMutation({
    mutationFn: async (payload: {
      med: Medication;
      iso: string;
      status: EmarLog["status"];
      exceptionReason: string | null;
      notes: string | null;
      signatureDataUrl: string | null;
      pillCountVerified: boolean | null;
      pillCountValue: number | null;
      prnReason: string | null;
      isMedicationError: boolean;
      attested: boolean;
    }) => {
      if (!orgId || !user) throw new Error("Not authenticated");
      const staffName = user.user_metadata?.full_name ?? user.email ?? "Staff";

      const { data: inserted, error } = await supabase
        .from("emar_logs")
        .insert({
          organization_id:       orgId,
          client_id:             clientId,
          medication_id:         payload.med.id,
          scheduled_for:         payload.iso,
          scheduled_time_label:  new Date(payload.iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          administered_at:       payload.status === "administered" ? new Date().toISOString() : null,
          status:                payload.status,
          exception_reason:      payload.exceptionReason,
          notes:                 payload.notes,
          staff_id:              user.id,
          staff_name:            staffName,
          signature_attestation: payload.attested ? FIVE_RIGHTS_ATTESTATION : null,
          signature_data_url:    payload.signatureDataUrl,
          is_prn:                payload.med.is_prn,
          prn_reason:            payload.prnReason,
          is_controlled:         payload.med.is_controlled,
          pill_count_verified:   payload.pillCountVerified,
          pill_count_value:      payload.pillCountValue,
          is_medication_error:   payload.isMedicationError,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any)
        .select("id")
        .single();

      if (error) throw error;

      // Fire notification to admin bell if medication error
      if (payload.isMedicationError && inserted) {
        await supabase.rpc("notify_medication_error", {
          p_organization_id: orgId,
          p_emar_log_id:     inserted.id,
          p_client_name:     clientName,
          p_med_name:        payload.med.medication_name,
          p_reporter_name:   staffName,
          p_description:     payload.exceptionReason ?? payload.notes ?? "Error reported",
        });
      }
    },
    onSuccess: (_data, payload) => {
      toast.success(
        payload.isMedicationError
          ? "🚨 Medication error recorded — administrator notified immediately."
          : payload.status === "administered"
          ? "✅ Medication administration confirmed and signed."
          : "📋 Exception documented and recorded.",
      );
      qc.invalidateQueries({ queryKey: ["mar-logs-today", clientId, orgId] });
      setActivePass(null);
    },
    onError: (e: Error) => toast.error(e.message || "Could not record pass."),
  });

  if (isLoading) {
    return <p className="p-6 text-sm text-muted-foreground">Loading medications…</p>;
  }

  return (
    <div className="space-y-5">

      {/* Medication error alert banner */}
      {errorCount > 0 && (
        <div className="rounded-xl border-2 border-rose-500 bg-rose-50 p-4 dark:bg-rose-950/30">
          <div className="flex items-start gap-3">
            <AlertOctagon className="h-5 w-5 shrink-0 text-rose-600 mt-0.5" />
            <div>
              <p className="font-semibold text-rose-800 dark:text-rose-200">
                🚨 Medication Error on File Today — Action Required
              </p>
              <p className="mt-0.5 text-sm text-rose-700 dark:text-rose-300">
                {errorCount} medication error{errorCount > 1 ? "s have" : " has"} been flagged today for {clientName}.
                Your administrator has been notified. A Critical Event Report is required in the PRN Forms tab.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Day summary header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">
            Today's Medication Pass
          </h3>
          <p className="text-xs text-muted-foreground">
            {new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
          </p>
        </div>
        <div className="flex gap-2">
          {pendingCount > 0 && (
            <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
              {pendingCount} pending
            </Badge>
          )}
          {passes.filter((p) => p.log?.status === "administered").length > 0 && (
            <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
              {passes.filter((p) => p.log?.status === "administered").length} administered
            </Badge>
          )}
        </div>
      </div>

      {/* No medications */}
      {!meds?.length && (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          <Pill className="mx-auto mb-2 h-8 w-8 opacity-30" />
          <p>No active medications on this individual's MAR.</p>
          <p className="mt-1 text-xs">Contact your administrator to add medications.</p>
        </Card>
      )}

      {/* Medication blocks by time of day */}
      {(Object.keys(grouped) as Block[]).map((block) => {
        const items = grouped[block];
        if (!items.length) return null;
        const Meta = BLOCK_META[block];
        const Icon = Meta.icon;
        return (
          <Card key={block} className={`overflow-hidden`}>
            <div className={`flex items-center gap-2 border-b border-border px-5 py-3 ${Meta.bg}`}>
              <Icon className={`h-4 w-4 ${Meta.tone}`} />
              <h3 className={`text-sm font-semibold ${Meta.tone}`}>{block}</h3>
              <span className="ml-auto text-[11px] text-muted-foreground">
                {items.filter((i) => i.log).length}/{items.length} documented
              </span>
            </div>
            <ul className="divide-y divide-border">
              {items.map((p) => {
                const done    = !!p.log;
                const passed  = p.log?.status === "administered";
                const errored = p.log?.is_medication_error;
                const overdue = !p.log && new Date(p.iso).getTime() < Date.now() - 60 * 60 * 1000;

                return (
                  <li key={`${p.med.id}-${p.time}`}
                    className={`flex flex-col gap-3 p-4 sm:flex-row sm:items-center ${errored ? "bg-rose-50/50 dark:bg-rose-950/10" : ""}`}>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs text-muted-foreground">
                          <Clock className="mr-0.5 inline h-3 w-3" />{p.time}
                        </span>
                        <p className="font-semibold text-sm">{p.med.medication_name}</p>
                        {p.med.dosage && <span className="text-xs text-muted-foreground">{p.med.dosage}</span>}
                        {p.med.route && <span className="text-xs text-muted-foreground">· {p.med.route}</span>}
                        {p.med.is_controlled && (
                          <Badge className="bg-purple-100 text-purple-800 text-[10px] dark:bg-purple-950/40 dark:text-purple-200">Controlled</Badge>
                        )}
                        {p.med.is_prn && (
                          <Badge className="bg-amber-100 text-amber-800 text-[10px] dark:bg-amber-950/40 dark:text-amber-200">PRN</Badge>
                        )}
                      </div>
                      {p.med.instructions && (
                        <p className="mt-0.5 text-xs text-muted-foreground">{p.med.instructions}</p>
                      )}

                      {/* Status badges */}
                      {passed && !errored && (
                        <div className="mt-1.5 flex items-center gap-1.5">
                          <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
                            <CheckCircle2 className="mr-1 h-3 w-3" /> Administered {p.log?.administered_at ? fmtTime(p.log.administered_at) : ""}
                          </Badge>
                          {p.log?.signature_attestation && (
                            <Badge variant="outline" className="text-[10px] gap-1">
                              <ShieldCheck className="h-3 w-3 text-emerald-500" /> Five Rights Signed
                            </Badge>
                          )}
                        </div>
                      )}
                      {done && !passed && (
                        <Badge variant="secondary" className="mt-1.5">
                          {p.log?.status === "refused" ? "Refused" : p.log?.status === "omitted" ? "Omitted" : "Missed"}
                          {p.log?.exception_reason ? ` — ${p.log.exception_reason}` : ""}
                        </Badge>
                      )}
                      {errored && (
                        <Badge className="mt-1.5 bg-rose-500 text-white animate-pulse">
                          <AlertOctagon className="mr-1 h-3 w-3" /> Medication Error Filed
                        </Badge>
                      )}
                      {overdue && !done && (
                        <Badge className="mt-1.5 bg-amber-500 text-white animate-pulse">
                          ⚠️ Window Passed — Documentation Required
                        </Badge>
                      )}
                    </div>

                    {/* Action button */}
                    {!done && (
                      <Button
                        size="sm"
                        onClick={() => setActivePass({ med: p.med, time: p.time, iso: p.iso })}
                        className={`h-11 min-w-[44px] shrink-0 gap-1.5 ${
                          overdue
                            ? "bg-amber-600 hover:bg-amber-700 text-white"
                            : "bg-primary hover:bg-primary/90 text-primary-foreground"
                        }`}
                      >
                        <Pill className="h-4 w-4" />
                        {overdue ? "Document Now" : "Record Pass"}
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          </Card>
        );
      })}

      {/* Monthly MAR sheet */}
      <MarCalendarView clientId={clientId} />

      {/* Pass dialog */}
      <PassDialog
        pass={activePass}
        clientName={clientName}
        onClose={() => setActivePass(null)}
        onSubmit={async (payload) => {
          if (!activePass) return;
          await submitPass.mutateAsync({
            med: activePass.med,
            iso: activePass.iso,
            ...payload,
          });
        }}
      />
    </div>
  );
}
