import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertTriangle, CheckCircle2, Clock, Eraser, Loader2,
  Moon, Sun, Sunset, CalendarDays, ChevronLeft,
  ChevronRight, ShieldCheck, Pill, BookOpen, History,
  AlertOctagon,
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
  // Contract compliance fields
  purpose: string | null;
  adverse_effects: string | null;
  choking_risk: boolean;
  choking_risk_details: string | null;
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

const ATTESTATION_TEXT =
  "I attest that I have verified the Five Rights of Medication Administration: " +
  "(1) Right Resident, (2) Right Medication, (3) Right Dose, (4) Right Route, (5) Right Time " +
  "— and that this record is accurate and complete.";

const EXCEPTION_REASONS = [
  "Individual refused",
  "Individual unavailable / sleeping",
  "Held per physician order",
  "NPO — medical hold",
  "Medication unavailable / out of stock",
  "Adverse reaction — withheld",
  "Self-administered (witnessed by staff)",
  "Appointment — administered by provider",
  "Other (see notes)",
];

const ROUTES = [
  "Oral (PO)",
  "Topical",
  "Subcutaneous (SubQ)",
  "Intramuscular (IM)",
  "Intravenous (IV)",
  "Sublingual (SL)",
  "Inhalation",
  "Transdermal patch",
  "Rectal (PR)",
  "Ophthalmic (eye)",
  "Otic (ear)",
  "Nasal",
  "Vaginal",
  "Other",
];

const BLOCK_META: Record<Block, { icon: typeof Sun; tone: string; bg: string; label: string }> = {
  Morning: { icon: Sun,    tone: "text-amber-600",   bg: "bg-amber-50 dark:bg-amber-950/20",   label: "Morning" },
  Noon:    { icon: Sunset, tone: "text-orange-600",  bg: "bg-orange-50 dark:bg-orange-950/20", label: "Noon"    },
  Evening: { icon: Sunset, tone: "text-rose-500",    bg: "bg-rose-50 dark:bg-rose-950/20",     label: "Evening" },
  Night:   { icon: Moon,   tone: "text-indigo-600",  bg: "bg-indigo-50 dark:bg-indigo-950/20", label: "Night"   },
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

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString([], {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function today(): string {
  return new Date().toISOString().split("T")[0];
}

function localDatetimeValue(): string {
  const d = new Date();
  return d.toISOString().slice(0, 16);
}

// ─── Signature Pad ────────────────────────────────────────────────────────────

function SigPad({ onSigned, label = "Electronic Signature" }: {
  onSigned: (dataUrl: string | null) => void;
  label?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const hasSigRef = useRef(false);

  function initCanvas() {
    const c = canvasRef.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.strokeStyle = "#1e293b";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
  }

  useEffect(() => {
    initCanvas();
    hasSigRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function clear() {
    initCanvas();
    hasSigRef.current = false;
    onSigned(null);
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
    ctx.beginPath(); ctx.moveTo(x, y);
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
  }

  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = pos(e);
    ctx.lineTo(x, y); ctx.stroke();
    hasSigRef.current = true;
  }

  function up() {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    if (hasSigRef.current) {
      onSigned(canvasRef.current?.toDataURL("image/png") ?? null);
    }
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </Label>
        <button type="button" onClick={clear}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline">
          <Eraser className="h-3 w-3" /> Clear
        </button>
      </div>
      <canvas
        ref={canvasRef}
        width={600} height={120}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up} onPointerCancel={up}
        className="w-full touch-none rounded-lg border-2 border-dashed border-border bg-white cursor-crosshair"
        aria-label="Signature pad"
      />
      <p className="text-[11px] text-muted-foreground">
        Sign with your mouse, finger, or stylus. Your signature confirms this administration record.
      </p>
    </div>
  );
}

// ─── Medication Directives Panel ──────────────────────────────────────────────
// Contract requirement: name/purpose, routes/dosage, adversities, choking risk

function MedicationDirectivesPanel({ med }: { med: Medication }) {
  return (
    <div className="space-y-3">
      {/* Name & Purpose */}
      <div className="rounded-lg border border-border bg-slate-50 p-3 dark:bg-slate-900/40">
        <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          Medication Name & Clinical Purpose
        </p>
        <p className="text-sm font-semibold">{med.medication_name}</p>
        {med.dosage && <p className="text-xs text-muted-foreground">{med.dosage}</p>}
        {med.purpose ? (
          <p className="mt-1 text-xs leading-relaxed">{med.purpose}</p>
        ) : (
          <p className="mt-1 text-xs italic text-muted-foreground">
            Clinical purpose not documented. Contact administrator to complete.
          </p>
        )}
      </div>

      {/* Routes & Dosage */}
      <div className="rounded-lg border border-border bg-slate-50 p-3 dark:bg-slate-900/40">
        <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          Route of Administration & Dosage Instructions
        </p>
        <div className="space-y-0.5 text-xs">
          {med.route && <p><span className="font-medium">Route:</span> {med.route}</p>}
          {med.dosage && <p><span className="font-medium">Dosage:</span> {med.dosage}</p>}
          {med.frequency && <p><span className="font-medium">Frequency:</span> {med.frequency}</p>}
          {med.scheduled_times.length > 0 && (
            <p><span className="font-medium">Scheduled:</span> {med.scheduled_times.join(", ")}</p>
          )}
          {med.instructions && (
            <p className="mt-1 leading-relaxed">{med.instructions}</p>
          )}
          {med.prescriber && (
            <p className="mt-1 text-muted-foreground">Prescriber: {med.prescriber}</p>
          )}
          {med.pharmacy && (
            <p className="text-muted-foreground">Pharmacy: {med.pharmacy}{med.rx_number ? ` · Rx# ${med.rx_number}` : ""}</p>
          )}
        </div>
      </div>

      {/* PRN notice */}
      {med.is_prn && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-50 p-3 dark:bg-amber-950/20">
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300">
            PRN / As-Needed Medication
          </p>
          <p className="text-xs text-amber-800 dark:text-amber-200">
            {med.prn_instructions ?? "Administer only when needed. Reason must be documented at each administration."}
          </p>
        </div>
      )}

      {/* Controlled substance */}
      {med.is_controlled && (
        <div className="rounded-lg border border-purple-500/40 bg-purple-50 p-3 dark:bg-purple-950/20">
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-purple-700 dark:text-purple-300">
            Controlled Substance
          </p>
          <p className="text-xs text-purple-800 dark:text-purple-200">
            Pill count verification required at every administration. Current count must be recorded.
          </p>
          {med.pill_count_current !== null && (
            <p className="mt-1 text-xs font-semibold text-purple-800 dark:text-purple-200">
              Last recorded count: {med.pill_count_current} pills
            </p>
          )}
        </div>
      )}

      {/* Adverse effects & choking risk — Contract requirement section (3) */}
      <div className={`rounded-lg border-2 p-3 ${
        med.choking_risk
          ? "border-rose-500 bg-rose-50 dark:bg-rose-950/20"
          : "border-border bg-slate-50 dark:bg-slate-900/40"
      }`}>
        <p className={`mb-1 text-[10px] font-bold uppercase tracking-wider ${
          med.choking_risk ? "text-rose-700 dark:text-rose-300" : "text-muted-foreground"
        }`}>
          Adverse Effects & Reaction Profile
        </p>
        {med.choking_risk && (
          <div className="mb-2 flex items-start gap-2 rounded border border-rose-500 bg-rose-100 px-2 py-1.5 dark:bg-rose-900/40">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
            <div>
              <p className="text-xs font-bold text-rose-800 dark:text-rose-200">
                CHOKING / SWALLOWING RISK IDENTIFIED
              </p>
              <p className="text-xs text-rose-700 dark:text-rose-300">
                This medication may contribute to swallowing difficulties or enhance the prospects of choking.
                Confirm posture is upright and crushed-med policy per care plan is followed.
              </p>
              {med.choking_risk_details && (
                <p className="mt-1 text-xs text-rose-700 dark:text-rose-300 italic">
                  {med.choking_risk_details}
                </p>
              )}
            </div>
          </div>
        )}
        {med.adverse_effects ? (
          <p className="text-xs leading-relaxed">{med.adverse_effects}</p>
        ) : (
          <p className="text-xs italic text-muted-foreground">
            No adverse effects documented. Contact administrator to complete this required field.
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Administration Log Dialog ────────────────────────────────────────────────

function AdminLogDialog({
  pass,
  clientName,
  onClose,
  onSubmit,
}: {
  pass: { med: Medication; time: string; iso: string; existingLog?: EmarLog } | null;
  clientName: string;
  onClose: () => void;
  onSubmit: (payload: {
    status: EmarLog["status"];
    administeredAt: string;
    route: string;
    staffObserverName: string;
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
  const { user } = useAuth();
  const staffDefaultName = user?.user_metadata?.full_name ?? user?.email ?? "";

  const [status, setStatus] = useState<EmarLog["status"]>("administered");
  const [administeredAt, setAdministeredAt] = useState(localDatetimeValue());
  const [route, setRoute] = useState(pass?.med.route ?? "");
  const [staffObserverName, setStaffObserverName] = useState(staffDefaultName);
  const [exceptionReason, setExceptionReason] = useState("");
  const [notes, setNotes] = useState("");
  const [sigDataUrl, setSigDataUrl] = useState<string | null>(null);
  const [pillVerified, setPillVerified] = useState(false);
  const [pillCount, setPillCount] = useState("");
  const [prnReason, setPrnReason] = useState("");
  const [isMedError, setIsMedError] = useState(false);
  const [attested, setAttested] = useState(false);
  const [busy, setBusy] = useState(false);
  const [activeSection, setActiveSection] = useState<"log" | "directives">("log");

  const med = pass?.med;
  const isException = status !== "administered";

  const canSubmit =
    !busy &&
    attested &&
    !!sigDataUrl &&
    !!staffObserverName.trim() &&
    !!route &&
    (!isException || exceptionReason.trim().length >= 3) &&
    (!med?.is_prn || prnReason.trim().length >= 3) &&
    (!med?.is_controlled || status !== "administered" || (pillVerified && !!pillCount));

  async function handleSubmit() {
    if (!canSubmit) return;
    setBusy(true);
    try {
      await onSubmit({
        status,
        administeredAt: new Date(administeredAt).toISOString(),
        route,
        staffObserverName: staffObserverName.trim(),
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
        className="max-h-[90vh] max-w-2xl overflow-y-auto"
        onPointerDownOutside={(e) => { if (busy) e.preventDefault(); }}
        onEscapeKeyDown={(e) => { if (busy) e.preventDefault(); }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pill className="h-5 w-5 text-primary" />
            Medication Administration Record
          </DialogTitle>
          <DialogDescription>
            {clientName} · {med?.medication_name} · Scheduled {pass.time}
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeSection} onValueChange={(v) => setActiveSection(v as "log" | "directives")}>
          <TabsList className="w-full">
            <TabsTrigger value="log" className="flex-1">Administration Log</TabsTrigger>
            <TabsTrigger value="directives" className="flex-1">Medication Directives</TabsTrigger>
          </TabsList>

          {/* ── Administration Log Tab ── */}
          <TabsContent value="log" className="space-y-4 pt-4">

            {/* Choking alert at top if applicable */}
            {med?.choking_risk && (
              <div className="flex items-start gap-2 rounded-lg border-2 border-rose-500 bg-rose-50 px-3 py-2.5 dark:bg-rose-950/30">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
                <div>
                  <p className="text-xs font-bold text-rose-800 dark:text-rose-200">
                    CHOKING RISK — Confirm upright posture before administering.
                  </p>
                  {med.choking_risk_details && (
                    <p className="text-[11px] text-rose-700 dark:text-rose-300">{med.choking_risk_details}</p>
                  )}
                </div>
              </div>
            )}

            {/* Date & Time — Contract: "time and date the medication was taken" */}
            <div className="grid gap-1.5">
              <Label className="text-xs font-semibold">Date & Time of Administration *</Label>
              <Input
                type="datetime-local"
                value={administeredAt}
                onChange={(e) => setAdministeredAt(e.target.value)}
                className="text-sm"
              />
              <p className="text-[11px] text-muted-foreground">
                Defaults to current session time. Adjust only if documenting retroactively.
              </p>
            </div>

            {/* Medication — pre-filled, shown for confirmation */}
            <div className="rounded-lg border border-border bg-muted/30 px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Medication Confirmed</p>
              <p className="text-sm font-semibold">{med?.medication_name}</p>
              <p className="text-xs text-muted-foreground">{med?.dosage}{med?.frequency ? ` · ${med.frequency}` : ""}</p>
              <div className="mt-1 flex gap-1.5">
                {med?.is_controlled && <Badge className="bg-purple-100 text-purple-800 text-[10px] dark:bg-purple-950/40 dark:text-purple-200">Controlled</Badge>}
                {med?.is_prn && <Badge className="bg-amber-100 text-amber-800 text-[10px] dark:bg-amber-950/40 dark:text-amber-200">PRN</Badge>}
              </div>
            </div>

            {/* PRN Reason — Contract: "reason the medication was taken if PRN" */}
            {med?.is_prn && (
              <div className="rounded-lg border border-amber-500/40 bg-amber-50 p-3 dark:bg-amber-950/20 space-y-2">
                <Label className="text-xs font-semibold text-amber-800 dark:text-amber-200">
                  PRN Reason — Required *
                </Label>
                <p className="text-[11px] text-amber-700 dark:text-amber-300">
                  {med.prn_instructions ?? "Document why this as-needed medication is being administered at this time."}
                </p>
                <Textarea
                  rows={3}
                  value={prnReason}
                  onChange={(e) => setPrnReason(e.target.value)}
                  placeholder="Describe the reason this PRN medication is being administered now..."
                  className="text-sm bg-white dark:bg-slate-900"
                />
              </div>
            )}

            {/* Route — Contract: "the route the medication was administered" */}
            <div className="grid gap-1.5">
              <Label className="text-xs font-semibold">Route of Administration *</Label>
              <Select value={route} onValueChange={setRoute}>
                <SelectTrigger>
                  <SelectValue placeholder="Select route..." />
                </SelectTrigger>
                <SelectContent>
                  {ROUTES.map((r) => (
                    <SelectItem key={r} value={r}>{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Controlled substance pill count */}
            {med?.is_controlled && (
              <div className="rounded-lg border border-purple-500/40 bg-purple-50 p-3 dark:bg-purple-950/20 space-y-3">
                <Label className="text-xs font-semibold text-purple-800 dark:text-purple-200">
                  Controlled Substance — Pill Count *
                </Label>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5">
                    <Label className="text-xs">Count before administration</Label>
                    <Input
                      type="number" min="0"
                      value={pillCount}
                      onChange={(e) => setPillCount(e.target.value)}
                      placeholder="e.g., 28"
                      className="h-9 bg-white dark:bg-slate-900"
                    />
                  </div>
                  <div className="flex items-end pb-2">
                    <label className="flex cursor-pointer items-center gap-2 text-xs">
                      <Checkbox checked={pillVerified} onCheckedChange={(c) => setPillVerified(!!c)} />
                      <span>Count verified by second witness</span>
                    </label>
                  </div>
                </div>
              </div>
            )}

            {/* Administration status */}
            <div className="grid gap-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Administration Status *
              </Label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {(["administered", "refused", "omitted", "missed"] as EmarLog["status"][]).map((s) => (
                  <button
                    key={s} type="button"
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
                  Exception Reason *
                </Label>
                <Select value={exceptionReason} onValueChange={setExceptionReason}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select reason..." />
                  </SelectTrigger>
                  <SelectContent>
                    {EXCEPTION_REASONS.map((r) => (
                      <SelectItem key={r} value={r}>{r}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Staff observer — Contract: "name of Staff that observed/assisted" */}
            <div className="grid gap-1.5">
              <Label className="text-xs font-semibold">
                Staff Name — Observer / Administrator *
              </Label>
              <Input
                value={staffObserverName}
                onChange={(e) => setStaffObserverName(e.target.value)}
                placeholder="Full name of staff who observed or assisted"
                className="text-sm"
              />
              <p className="text-[11px] text-muted-foreground">
                Per contract: name of staff who observed or assisted with medication administration.
              </p>
            </div>

            {/* Clinical notes */}
            <div className="grid gap-1.5">
              <Label className="text-xs font-semibold">Clinical Notes / Observations</Label>
              <Textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Document any observations, reactions, or relevant clinical notes..."
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
                  This is a medication error requiring immediate reporting
                </p>
                <p className="mt-0.5 text-[11px] text-rose-700 dark:text-rose-300">
                  Checking this immediately notifies your administrator and flags this record for review.
                </p>
              </div>
            </label>

            {/* Signature pad */}
            <SigPad
              onSigned={setSigDataUrl}
              label="Staff Signature"
            />

            {/* Five Rights attestation */}
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 p-3">
              <Checkbox
                checked={attested}
                onCheckedChange={(c) => setAttested(!!c)}
                className="mt-0.5"
              />
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                {ATTESTATION_TEXT}
              </p>
            </label>

            {/* Submission guard hints */}
            {!canSubmit && (
              <ul className="space-y-0.5 rounded-lg bg-muted/40 p-3 text-[11px] text-muted-foreground">
                {!sigDataUrl && <li>· Sign the signature field above</li>}
                {!attested && <li>· Check the Five Rights attestation</li>}
                {!staffObserverName.trim() && <li>· Enter the staff observer name</li>}
                {!route && <li>· Select the route of administration</li>}
                {isException && exceptionReason.trim().length < 3 && <li>· Select an exception reason</li>}
                {med?.is_prn && prnReason.trim().length < 3 && <li>· Enter the PRN reason</li>}
                {med?.is_controlled && status === "administered" && !pillVerified && <li>· Verify and record pill count</li>}
              </ul>
            )}
          </TabsContent>

          {/* ── Medication Directives Tab ── */}
          <TabsContent value="directives" className="pt-4">
            {med && <MedicationDirectivesPanel med={med} />}
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit || activeSection !== "log"}
            className={
              isMedError
                ? "bg-rose-600 hover:bg-rose-700 text-white"
                : status === "administered"
                ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                : "bg-amber-600 hover:bg-amber-700 text-white"
            }
          >
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {activeSection !== "log"
              ? "Return to Log tab to submit"
              : isMedError
              ? "Submit & Report Error"
              : status === "administered"
              ? "Confirm Administration"
              : "Record Exception"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Compliance History ───────────────────────────────────────────────────────
// Contract requirement (4): documentation of compliance with medication administration

function ComplianceHistory({ logs, meds }: { logs: EmarLog[]; meds: Medication[] }) {
  const medMap = useMemo(() => {
    const m = new Map<string, string>();
    meds.forEach((med) => m.set(med.id, med.medication_name));
    return m;
  }, [meds]);

  const total = logs.length;
  const administered = logs.filter((l) => l.status === "administered").length;
  const rate = total > 0 ? Math.round((administered / total) * 100) : 0;

  if (logs.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-muted/30 p-6 text-center">
        <History className="mx-auto mb-2 h-8 w-8 text-muted-foreground/30" />
        <p className="text-sm text-muted-foreground">No administration records this month.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Compliance summary */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg border border-border bg-card p-3 text-center">
          <p className="text-2xl font-bold text-foreground">{total}</p>
          <p className="text-[11px] text-muted-foreground">Total Passes</p>
        </div>
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-50 p-3 text-center dark:bg-emerald-950/20">
          <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">{administered}</p>
          <p className="text-[11px] text-emerald-600 dark:text-emerald-400">Administered</p>
        </div>
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-center">
          <p className="text-2xl font-bold text-primary">{rate}%</p>
          <p className="text-[11px] text-muted-foreground">Compliance Rate</p>
        </div>
      </div>

      {/* Log table */}
      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Date & Time</th>
              <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Medication</th>
              <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Route</th>
              <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Status</th>
              <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Staff</th>
              <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Attested</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {logs.slice(0, 30).map((l) => (
              <tr key={l.id} className="hover:bg-muted/30">
                <td className="px-3 py-2 font-mono">
                  {fmtDateTime(l.administered_at ?? l.scheduled_for)}
                </td>
                <td className="px-3 py-2">
                  {medMap.get(l.medication_id) ?? "—"}
                  {l.is_prn && <Badge className="ml-1 bg-amber-100 text-amber-800 text-[9px] dark:bg-amber-950/40 dark:text-amber-200">PRN</Badge>}
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {/* Route stored in notes prefix or exception_reason */}
                  {l.exception_reason?.startsWith("Route:") ? l.exception_reason.replace("Route:", "").trim() : "—"}
                </td>
                <td className="px-3 py-2">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    l.status === "administered"
                      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
                      : l.status === "refused"
                      ? "bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-200"
                      : "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
                  }`}>
                    {l.status}
                  </span>
                  {l.is_medication_error && (
                    <Badge className="ml-1 bg-rose-500 text-white text-[9px]">Error</Badge>
                  )}
                </td>
                <td className="px-3 py-2 text-muted-foreground">{l.staff_name ?? "—"}</td>
                <td className="px-3 py-2">
                  {l.signature_attestation
                    ? <ShieldCheck className="h-4 w-4 text-emerald-500" />
                    : <span className="text-muted-foreground/40">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── MAR Calendar ─────────────────────────────────────────────────────────────

function MarCalendarView({
  clientId,
  meds,
  onCellClick,
}: {
  clientId: string;
  meds: Medication[];
  onCellClick: (med: Medication, day: number, time: string) => void;
}) {
  const [cursor, setCursor] = useState(() => {
    const d = new Date(); d.setDate(1); return d;
  });
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const todayDate = new Date();
  const monthLabel = cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  const { data: logs = [] } = useQuery({
    queryKey: ["mar-logs-cal", clientId, year, month],
    queryFn: async (): Promise<EmarLog[]> => {
      const start = new Date(year, month, 1).toISOString();
      const end = new Date(year, month + 1, 1).toISOString();
      const { data, error } = await (supabase as any)
        .from("emar_logs")
        .select("id, medication_id, scheduled_for, administered_at, status, exception_reason, notes, staff_name, signature_attestation, is_medication_error, admin_reviewed, is_prn, prn_reason")
        .eq("client_id", clientId)
        .gte("scheduled_for", start)
        .lt("scheduled_for", end);
      if (error) throw error;
      return (data ?? []) as EmarLog[];
    },
  });

  const logsByCell = useMemo(() => {
    const map = new Map<string, EmarLog>();
    logs.forEach((l) => {
      const d = new Date(l.scheduled_for).getDate();
      const tLabel = new Date(l.scheduled_for).toTimeString().slice(0, 5);
      map.set(`${l.medication_id}|${d}|${tLabel}`, l);
    });
    return map;
  }, [logs]);

  const statusColor = (l: EmarLog) => {
    if (l.status === "administered") return "bg-emerald-500";
    if (l.status === "refused") return "bg-rose-600";
    if (l.status === "missed") return "bg-amber-400";
    return "bg-rose-400";
  };

  return (
    <div className="rounded-lg border border-border bg-card">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Monthly MAR Sheet</h3>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7"
            onClick={() => setCursor(new Date(year, month - 1, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-[120px] text-center text-sm font-medium">{monthLabel}</span>
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7"
            onClick={() => setCursor(new Date(year, month + 1, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 border-b border-border px-4 py-2 text-[11px]">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Administered</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-rose-600" /> Refused</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-amber-400" /> Missed</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full border border-border bg-muted" /> Scheduled</span>
      </div>

      {/* Grid */}
      {meds.filter((m) => m.is_active).length === 0 ? (
        <div className="p-6 text-center text-sm text-muted-foreground">
          No active medications on this individual's MAR.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[11px]">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 min-w-[160px] border border-border bg-card px-2 py-1.5 text-left font-semibold">
                  Medication
                </th>
                {days.map((d) => (
                  <th key={d} className={`w-7 border border-border px-1 py-1 text-center font-medium ${
                    d === todayDate.getDate() && month === todayDate.getMonth() && year === todayDate.getFullYear()
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground"
                  }`}>
                    {d}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {meds.filter((m) => m.is_active).flatMap((med) =>
                (med.scheduled_times.length > 0 ? med.scheduled_times : ["PRN"]).map((time) => (
                  <tr key={`${med.id}-${time}`} className="hover:bg-muted/20">
                    <td className="sticky left-0 z-10 border border-border bg-card px-2 py-1.5 align-top">
                      <div className="font-medium">{med.medication_name}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {med.dosage && <span>{med.dosage}</span>}
                        {time !== "PRN" && <span className="ml-1 font-mono">{time}</span>}
                        {med.is_controlled && <span className="ml-1 font-bold text-purple-600">C</span>}
                        {med.is_prn && <span className="ml-1 font-bold text-amber-600">PRN</span>}
                        {!med.is_active && <span className="ml-1 text-rose-500">D/C</span>}
                      </div>
                    </td>
                    {days.map((d) => {
                      const timeKey = time === "PRN" ? "00:00" : time;
                      const log = logsByCell.get(`${med.id}|${d}|${timeKey}`);
                      const isPast = new Date(year, month, d) < new Date(todayDate.getFullYear(), todayDate.getMonth(), todayDate.getDate());
                      const isToday = d === todayDate.getDate() && month === todayDate.getMonth() && year === todayDate.getFullYear();
                      const isFuture = new Date(year, month, d) > todayDate;

                      return (
                        <td key={d} className="border border-border p-0">
                          {log ? (
                            <Popover>
                              <PopoverTrigger asChild>
                                <button className={`flex h-7 w-full items-center justify-center hover:opacity-80 transition`}>
                                  <span className={`h-4 w-4 rounded-full ${statusColor(log)}`} />
                                  {log.is_medication_error && (
                                    <span className="absolute h-1.5 w-1.5 rounded-full bg-rose-600 top-0.5 right-0.5" />
                                  )}
                                </button>
                              </PopoverTrigger>
                              <PopoverContent className="w-72 text-xs space-y-1.5" align="center">
                                <p className="font-semibold">{med.medication_name} · {time}</p>
                                <div className="flex gap-1.5">
                                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${
                                    log.status === "administered"
                                      ? "bg-emerald-100 text-emerald-800"
                                      : log.status === "refused"
                                      ? "bg-rose-100 text-rose-800"
                                      : "bg-amber-100 text-amber-800"
                                  }`}>
                                    {log.status}
                                  </span>
                                  {log.is_medication_error && (
                                    <span className="rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-semibold text-white">Error Filed</span>
                                  )}
                                </div>
                                {log.administered_at && <p>Time: {fmtDateTime(log.administered_at)}</p>}
                                {log.exception_reason && <p>Reason: {log.exception_reason}</p>}
                                {log.prn_reason && <p>PRN Reason: {log.prn_reason}</p>}
                                {log.notes && <p className="text-muted-foreground">Notes: {log.notes}</p>}
                                {log.staff_name && <p>Staff: {log.staff_name}</p>}
                                {log.signature_attestation && (
                                  <div className="flex items-center gap-1 text-emerald-700 dark:text-emerald-300">
                                    <ShieldCheck className="h-3 w-3" />
                                    <span>Five Rights attested</span>
                                  </div>
                                )}
                              </PopoverContent>
                            </Popover>
                          ) : (isToday || isPast) && !isFuture ? (
                            <button
                              type="button"
                              onClick={() => onCellClick(med, d, time === "PRN" ? "00:00" : time)}
                              className="flex h-7 w-full items-center justify-center hover:bg-primary/10 transition"
                              title="Click to log administration"
                            >
                              <span className="h-3 w-3 rounded-full border-2 border-dashed border-muted-foreground/30" />
                            </button>
                          ) : (
                            <div className="h-7 w-full" />
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

// ─── Main MarEmarTab Component ────────────────────────────────────────────────

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
    med: Medication;
    time: string;
    iso: string;
  } | null>(null);

  const [activeTab, setActiveTab] = useState("today");

  const todayStart = useMemo(() => {
    const d = new Date(); d.setHours(0, 0, 0, 0); return d.toISOString();
  }, []);
  const tomorrowStart = useMemo(() => {
    const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + 1); return d.toISOString();
  }, []);

  // ── Medications query ────────────────────────────────────────────────────────

  const { data: meds = [], isLoading: medsLoading } = useQuery({
    enabled: !!orgId,
    queryKey: ["mar-meds", clientId, orgId],
    queryFn: async (): Promise<Medication[]> => {
      const { data, error } = await (supabase as any)
        .from("client_medications")
        .select(`id, medication_name, dosage, frequency, route, scheduled_times,
          instructions, prescriber, is_active, is_controlled, is_prn,
          prn_instructions, pharmacy, rx_number, pill_count_current,
          purpose, adverse_effects, choking_risk, choking_risk_details`)
        .eq("client_id", clientId)
        .eq("is_active", true)
        .order("medication_name");
      if (error) throw error;
      return (data ?? []) as Medication[];
    },
  });

  // ── Today's logs query ───────────────────────────────────────────────────────

  const { data: todayLogs = [] } = useQuery({
    enabled: !!orgId,
    queryKey: ["mar-logs-today", clientId, orgId],
    queryFn: async (): Promise<EmarLog[]> => {
      const { data, error } = await (supabase as any)
        .from("emar_logs")
        .select(`id, medication_id, scheduled_for, administered_at, status,
          exception_reason, notes, staff_name, signature_attestation,
          is_medication_error, is_controlled, pill_count_verified, pill_count_value,
          is_prn, prn_reason, admin_reviewed, signature_data_url`)
        .eq("client_id", clientId)
        .gte("scheduled_for", todayStart)
        .lt("scheduled_for", tomorrowStart);
      if (error) throw error;
      return (data ?? []) as EmarLog[];
    },
  });

  // ── Monthly logs query (for compliance history) ──────────────────────────────

  const { data: monthLogs = [] } = useQuery({
    enabled: !!orgId && activeTab === "history",
    queryKey: ["mar-logs-month", clientId, orgId],
    queryFn: async (): Promise<EmarLog[]> => {
      const start = new Date();
      start.setDate(1); start.setHours(0, 0, 0, 0);
      const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
      const { data, error } = await (supabase as any)
        .from("emar_logs")
        .select(`id, medication_id, scheduled_for, administered_at, status,
          exception_reason, notes, staff_name, signature_attestation,
          is_medication_error, is_prn, prn_reason, admin_reviewed`)
        .eq("client_id", clientId)
        .gte("scheduled_for", start.toISOString())
        .lt("scheduled_for", end.toISOString())
        .order("scheduled_for", { ascending: false });
      if (error) throw error;
      return (data ?? []) as EmarLog[];
    },
  });

  // ── Build today's pass schedule ──────────────────────────────────────────────

  const passes = useMemo(() => {
    const rows: {
      med: Medication; time: string; iso: string; block: Block; log: EmarLog | undefined;
    }[] = [];
    meds.forEach((med) => {
      med.scheduled_times.forEach((t) => {
        const iso = isoForToday(t);
        const log = todayLogs.find((l) =>
          l.medication_id === med.id &&
          Math.abs(new Date(l.scheduled_for).getTime() - new Date(iso).getTime()) < 60_000
        );
        rows.push({ med, time: t, iso, block: blockFor(t), log });
      });
      // PRN medications get a "log now" entry even without a scheduled time
      if (med.is_prn && med.scheduled_times.length === 0) {
        rows.push({ med, time: "PRN", iso: new Date().toISOString(), block: "Morning", log: undefined });
      }
    });
    return rows;
  }, [meds, todayLogs]);

  const grouped = useMemo(() => {
    const m: Record<Block, typeof passes> = { Morning: [], Noon: [], Evening: [], Night: [] };
    passes.forEach((p) => m[p.block].push(p));
    (Object.keys(m) as Block[]).forEach((k) =>
      m[k].sort((a, b) => a.time.localeCompare(b.time))
    );
    return m;
  }, [passes]);

  const pendingCount = passes.filter((p) => !p.log).length;
  const errorCount = todayLogs.filter((l) => l.is_medication_error && !l.admin_reviewed).length;

  // ── Submit administration ────────────────────────────────────────────────────

  async function submitAdmin(payload: {
    status: EmarLog["status"];
    administeredAt: string;
    route: string;
    staffObserverName: string;
    exceptionReason: string | null;
    notes: string | null;
    signatureDataUrl: string | null;
    pillCountVerified: boolean | null;
    pillCountValue: number | null;
    prnReason: string | null;
    isMedicationError: boolean;
    attested: boolean;
  }) {
    if (!orgId || !user || !activePass) return;
    const staffName = payload.staffObserverName || user.user_metadata?.full_name || user.email || "Staff";

    const { data: inserted, error } = await (supabase as any)
      .from("emar_logs")
      .insert({
        organization_id:       orgId,
        client_id:             clientId,
        medication_id:         activePass.med.id,
        scheduled_for:         activePass.iso,
        scheduled_time_label:  activePass.time,
        administered_at:       payload.status === "administered" ? payload.administeredAt : null,
        status:                payload.status,
        // Store route in exception_reason with prefix so it's queryable
        exception_reason:      payload.exceptionReason
          ? `Route: ${payload.route} · ${payload.exceptionReason}`
          : null,
        notes:                 payload.notes,
        staff_id:              user.id,
        staff_name:            staffName,
        signature_attestation: payload.attested ? ATTESTATION_TEXT : null,
        signature_data_url:    payload.signatureDataUrl,
        is_prn:                activePass.med.is_prn,
        prn_reason:            payload.prnReason,
        is_controlled:         activePass.med.is_controlled,
        pill_count_verified:   payload.pillCountVerified,
        pill_count_value:      payload.pillCountValue,
        is_medication_error:   payload.isMedicationError,
        admin_reviewed:        false,
      })
      .select("id")
      .single();

    if (error) throw error;

    // Notify admin if medication error
    if (payload.isMedicationError && inserted) {
      await (supabase as any).rpc("notify_medication_error", {
        p_organization_id: orgId,
        p_emar_log_id:     inserted.id,
        p_client_name:     clientName,
        p_med_name:        activePass.med.medication_name,
        p_reporter_name:   staffName,
        p_description:     payload.exceptionReason ?? payload.notes ?? "Error reported",
      });
    }

    toast.success(
      payload.isMedicationError
        ? "Medication error recorded. Administrator has been notified."
        : payload.status === "administered"
        ? "Administration confirmed and signed."
        : "Exception documented."
    );

    qc.invalidateQueries({ queryKey: ["mar-logs-today", clientId, orgId] });
    qc.invalidateQueries({ queryKey: ["mar-logs-cal", clientId] });
    qc.invalidateQueries({ queryKey: ["mar-logs-month", clientId, orgId] });
    setActivePass(null);
  }

  if (medsLoading) {
    return (
      <div className="grid place-items-center py-12 text-sm text-muted-foreground">
        <Loader2 className="mb-2 h-5 w-5 animate-spin" />
        Loading medication records...
      </div>
    );
  }

  return (
    <div className="space-y-4">

      {/* Medication error alert */}
      {errorCount > 0 && (
        <div className="rounded-xl border-2 border-rose-500 bg-rose-50 p-4 dark:bg-rose-950/30">
          <div className="flex items-start gap-3">
            <AlertOctagon className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />
            <div>
              <p className="font-semibold text-rose-800 dark:text-rose-200">
                Medication Error on File — Action Required
              </p>
              <p className="mt-0.5 text-sm text-rose-700 dark:text-rose-300">
                {errorCount} medication error{errorCount > 1 ? "s have" : " has"} been flagged today.
                Your administrator has been notified. A Critical Event Report is required.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Tab navigation */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full">
          <TabsTrigger value="today" className="flex-1">
            <Clock className="mr-1.5 h-3.5 w-3.5" />
            Today's Pass
            {pendingCount > 0 && (
              <Badge className="ml-1.5 bg-amber-500 text-white text-[10px]">{pendingCount}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="calendar" className="flex-1">
            <CalendarDays className="mr-1.5 h-3.5 w-3.5" />
            MAR Sheet
          </TabsTrigger>
          <TabsTrigger value="directives" className="flex-1">
            <BookOpen className="mr-1.5 h-3.5 w-3.5" />
            Directives
          </TabsTrigger>
          <TabsTrigger value="history" className="flex-1">
            <History className="mr-1.5 h-3.5 w-3.5" />
            Compliance
          </TabsTrigger>
        </TabsList>

        {/* ── TODAY'S PASS ── */}
        <TabsContent value="today" className="space-y-4 pt-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-semibold">Today's Medication Pass</h3>
              <p className="text-xs text-muted-foreground">
                {new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
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

          {meds.length === 0 && (
            <Card className="p-8 text-center">
              <Pill className="mx-auto mb-2 h-8 w-8 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">No active medications on this individual's MAR.</p>
              <p className="mt-1 text-xs text-muted-foreground">Contact your administrator to add medications.</p>
            </Card>
          )}

          {(Object.keys(grouped) as Block[]).map((block) => {
            const items = grouped[block];
            if (!items.length) return null;
            const Meta = BLOCK_META[block];
            const Icon = Meta.icon;
            return (
              <Card key={block} className="overflow-hidden">
                <div className={`flex items-center gap-2 border-b border-border px-5 py-3 ${Meta.bg}`}>
                  <Icon className={`h-4 w-4 ${Meta.tone}`} />
                  <h3 className={`text-sm font-semibold ${Meta.tone}`}>{Meta.label}</h3>
                  <span className="ml-auto text-[11px] text-muted-foreground">
                    {items.filter((i) => i.log?.status === "administered").length}/{items.length} documented
                  </span>
                </div>
                <ul className="divide-y divide-border">
                  {items.map((p) => {
                    const done = !!p.log;
                    const passed = p.log?.status === "administered";
                    const errored = p.log?.is_medication_error;
                    const overdue = !done && new Date(p.iso).getTime() < Date.now() - 60 * 60 * 1000 && p.time !== "PRN";

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
                            {p.med.choking_risk && (
                              <Badge className="bg-rose-100 text-rose-800 text-[10px] dark:bg-rose-950/40 dark:text-rose-200">
                                Choking Risk
                              </Badge>
                            )}
                          </div>

                          {p.med.instructions && (
                            <p className="mt-0.5 text-xs text-muted-foreground">{p.med.instructions}</p>
                          )}

                          {/* Status */}
                          {passed && !errored && (
                            <div className="mt-1.5 flex items-center gap-1.5">
                              <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
                                <CheckCircle2 className="mr-1 h-3 w-3" />
                                Administered {p.log?.administered_at ? fmtTime(p.log.administered_at) : ""}
                              </Badge>
                              {p.log?.signature_attestation && (
                                <Badge variant="outline" className="gap-1 text-[10px]">
                                  <ShieldCheck className="h-3 w-3 text-emerald-500" /> Five Rights Signed
                                </Badge>
                              )}
                            </div>
                          )}
                          {done && !passed && (
                            <Badge variant="secondary" className="mt-1.5 capitalize">
                              {p.log?.status}
                              {p.log?.exception_reason ? ` — ${p.log.exception_reason.replace(/^Route:[^·]+·\s*/, "")}` : ""}
                            </Badge>
                          )}
                          {errored && (
                            <Badge className="mt-1.5 animate-pulse bg-rose-500 text-white">
                              <AlertOctagon className="mr-1 h-3 w-3" /> Medication Error Filed
                            </Badge>
                          )}
                          {overdue && !done && (
                            <Badge className="mt-1.5 animate-pulse bg-amber-500 text-white">
                              Window Passed — Documentation Required
                            </Badge>
                          )}
                        </div>

                        {!done && (
                          <Button
                            size="sm"
                            onClick={() => setActivePass({ med: p.med, time: p.time, iso: p.iso })}
                            className={`h-11 shrink-0 gap-1.5 ${
                              overdue
                                ? "bg-amber-600 hover:bg-amber-700 text-white"
                                : "bg-primary hover:bg-primary/90 text-primary-foreground"
                            }`}
                          >
                            <Pill className="h-4 w-4" />
                            {overdue ? "Document Now" : p.time === "PRN" ? "Log PRN" : "Record Pass"}
                          </Button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </Card>
            );
          })}
        </TabsContent>

        {/* ── MAR CALENDAR ── */}
        <TabsContent value="calendar" className="pt-2">
          <MarCalendarView
            clientId={clientId}
            meds={meds}
            onCellClick={(med, day, time) => {
              const d = new Date();
              d.setDate(day);
              const [h, m] = time.split(":").map((n) => parseInt(n, 10));
              d.setHours(h ?? 9, m ?? 0, 0, 0);
              setActivePass({ med, time, iso: d.toISOString() });
            }}
          />
        </TabsContent>

        {/* ── MEDICATION DIRECTIVES ── */}
        <TabsContent value="directives" className="space-y-4 pt-2">
          <div>
            <h3 className="text-base font-semibold">Medication Directives & Adversities Profile</h3>
            <p className="text-xs text-muted-foreground">
              Contract-required documentation per self-directed medication administration guidelines.
            </p>
          </div>
          {meds.length === 0 ? (
            <Card className="p-8 text-center">
              <BookOpen className="mx-auto mb-2 h-8 w-8 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">No medications on file for this individual.</p>
            </Card>
          ) : (
            meds.map((med) => (
              <Card key={med.id} className="overflow-hidden">
                <div className="flex items-center justify-between border-b border-border bg-muted/30 px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <Pill className="h-4 w-4 text-primary" />
                    <span className="font-semibold text-sm">{med.medication_name}</span>
                    {med.is_controlled && <Badge className="bg-purple-100 text-purple-800 text-[10px]">Controlled</Badge>}
                    {med.is_prn && <Badge className="bg-amber-100 text-amber-800 text-[10px]">PRN</Badge>}
                    {!med.is_active && <Badge variant="outline" className="text-[10px]">Discontinued</Badge>}
                  </div>
                  {med.choking_risk && (
                    <Badge className="bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-200 gap-1">
                      <AlertTriangle className="h-3 w-3" /> Choking Risk
                    </Badge>
                  )}
                </div>
                <CardContent className="pt-4">
                  <MedicationDirectivesPanel med={med} />
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        {/* ── COMPLIANCE HISTORY ── */}
        <TabsContent value="history" className="space-y-4 pt-2">
          <div>
            <h3 className="text-base font-semibold">Administration Compliance Log</h3>
            <p className="text-xs text-muted-foreground">
              Historical record for state inspection — contract requirement (4): documentation of compliance.
            </p>
          </div>
          <ComplianceHistory logs={monthLogs} meds={meds} />
        </TabsContent>
      </Tabs>

      {/* Administration log dialog */}
      <AdminLogDialog
        pass={activePass}
        clientName={clientName}
        onClose={() => setActivePass(null)}
        onSubmit={submitAdmin}
      />
    </div>
  );
}
