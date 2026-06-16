import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useCurrentOrg } from "@/hooks/use-org";
import { useActiveShift } from "@/hooks/use-active-shift";
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
  AlertOctagon, Settings2, Sparkles, FilePlus2, Siren, Pencil,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import {
  EmarLegalBanner, ClinicalSafetyHeader, EmarEligibilityGate,
  MedicationChart, useClientSafety,
} from "./emar-chart";
import { EmarOpsPanel } from "./emar-ops-panel";
import { EmarNectarPanel } from "./emar-nectar-panel";
import { logMedicationPass, addEmarAddendum } from "@/lib/emar-pass.functions";



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
  is_rescue: boolean;
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
  actual_taken_at: string | null;
  late_entry_gap_minutes: number | null;
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
  service_context: string | null;
  created_at?: string;
  recorded_in?: string | null;
};

// Parse the `[code:XXX]` prefix we stamp on notes to carry the precise
// service/job code (DSG, RHS, RP3, etc.) without violating the existing
// `recorded_in` CHECK constraint (dsi | hhs | general).
function parseJobCode(log: Pick<EmarLog, "notes" | "recorded_in">): string {
  const m = log.notes?.match(/^\[code:([A-Za-z0-9_-]+)\]/);
  if (m && m[1] && m[1].toLowerCase() !== "none") return m[1].toUpperCase();
  return (log.recorded_in || "general").toUpperCase();
}

function stripJobCodePrefix(notes: string | null): string | null {
  if (!notes) return notes;
  return notes.replace(/^\[code:[A-Za-z0-9_-]+\]\s*/, "") || null;
}

function bucketRecordedIn(code: string | null | undefined): "dsi" | "hhs" | "general" {
  const c = (code || "").toUpperCase();
  if (!c) return "general";
  if (c.startsWith("HH") || c === "RHS") return "hhs";
  if (c.startsWith("DS")) return "dsi";
  return "general";
}

type Block = "Morning" | "Evening" | "PRN";

// ─── Constants ────────────────────────────────────────────────────────────────

const ATTESTATION_TEXT =
  "I confirm I observed or assisted this Person in self-administering their own prescribed medication, " +
  "that I verified it matches the prescription's medication, dose, route, and time, " +
  "and that this record is accurate and complete.";

const EXCEPTION_REASONS = [
  "Person declined / refused",
  "Person unavailable / sleeping",
  "Held per physician order",
  "NPO — medical hold",
  "Medication unavailable / out of stock",
  "Adverse reaction — withheld",
  "Appointment — taken with provider",
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

const BLOCK_META: Record<Block, { label: string; subtitle: (firstTime?: string) => string }> = {
  Morning: { label: "Morning", subtitle: (t) => t ? `${fmtTimeLabel(t)}` : "" },
  Evening: { label: "Evening", subtitle: (t) => t ? `${fmtTimeLabel(t)}` : "" },
  PRN:     { label: "As needed (PRN)", subtitle: () => "" },
};

function fmtTimeLabel(hhmm: string): string {
  const [h, m] = hhmm.split(":").map((n) => parseInt(n, 10));
  const d = new Date();
  d.setHours(h ?? 0, m ?? 0, 0, 0);
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

// ─── Nectar AI Compliance card ────────────────────────────────────────────────

const NECTAR_ACTIONS = [
  "Simulate a 9 AM refusal → 11 AM success",
  "Run Schedule II–IV narcotic audit",
  "Simulate critical low inventory",
  "Flag meds that worsen swallowing",
];

function NectarComplianceCard({ onSelect }: { onSelect: (action: string) => void }) {
  return (
    <div
      className="rounded-lg border p-4"
      style={{
        background: "color-mix(in oklab, var(--accent-2) 12%, var(--card))",
        borderColor: "color-mix(in oklab, var(--accent-2) 35%, transparent)",
      }}
    >
      <div className="mb-3 flex items-center gap-2">
        <Sparkles className="h-4 w-4" style={{ color: "var(--accent-2)" }} />
        <h3 className="text-sm font-semibold">Nectar AI Compliance Assistant</h3>
      </div>
      <div className="flex flex-wrap gap-2">
        {NECTAR_ACTIONS.map((a) => (
          <button
            key={a}
            type="button"
            onClick={() => onSelect(a)}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/60"
          >
            <Sparkles className="h-3 w-3" style={{ color: "var(--accent-2)" }} />
            {a}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function blockFor(time: string): Block {
  const h = parseInt(time.split(":")[0] ?? "0", 10);
  if (h < 14) return "Morning";
  return "Evening";
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

// ─── Observe & Confirm Dialog ─────────────────────────────────────────────────

function AdminLogDialog({
  pass,
  clientName,
  serviceContext,
  onClose,
  onSubmit,
}: {
  pass: { med: Medication; time: string; iso: string; existingLog?: EmarLog } | null;
  clientName: string;
  serviceContext: string;
  onClose: () => void;
  onSubmit: (payload: {
    status: EmarLog["status"];
    actualTakenAt: string;
    route: string;
    exceptionReason: string | null;
    notes: string | null;
    signatureDataUrl: string | null;
    pillCountValue: number | null;
    pillCountExpected: number | null;
    prnReason: string | null;
    isMedicationError: boolean;
    errorDescription: string | null;
    seizureDurationSeconds: number | null;
    seizureOutcome: string | null;
    emergencyServicesCalled: boolean;
    attested: boolean;
  }) => Promise<void>;
}) {
  const { user } = useAuth();
  const staffDisplayName =
    (user?.user_metadata?.full_name as string | undefined) ?? user?.email ?? "Staff";

  const status: EmarLog["status"] = "administered";
  const [actualTakenAt] = useState(localDatetimeValue());
  const [route, setRoute] = useState(pass?.med.route ?? "");
  const [notes, setNotes] = useState("");
  const [sigDataUrl, setSigDataUrl] = useState<string | null>(null);
  const [pillCount, setPillCount] = useState("");
  const [prnReason, setPrnReason] = useState("");
  const [isMedError, setIsMedError] = useState(false);
  const [errorDescription, setErrorDescription] = useState("");
  const [seizureDuration, setSeizureDuration] = useState("");
  const [seizureOutcome, setSeizureOutcome] = useState("");
  const [emergencyCalled, setEmergencyCalled] = useState(false);
  const [attested, setAttested] = useState(false);
  const [busy, setBusy] = useState(false);
  const [directivesOpen, setDirectivesOpen] = useState(false);

  const med = pass?.med;

  const canSubmit =
    !busy &&
    attested &&
    !!sigDataUrl &&
    !!route &&
    (!med?.is_prn || prnReason.trim().length >= 3) &&
    (!med?.is_rescue ||
      (seizureDuration.trim().length > 0 && seizureOutcome.trim().length >= 3)) &&
    (!med?.is_controlled || pillCount.trim().length > 0) &&
    (!isMedError || errorDescription.trim().length >= 3);

  async function handleSubmit() {
    if (!canSubmit) return;
    setBusy(true);
    try {
      await onSubmit({
        status,
        actualTakenAt: new Date(actualTakenAt).toISOString(),
        route,
        exceptionReason: null,
        notes: notes.trim() || null,
        signatureDataUrl: sigDataUrl,
        pillCountValue: med?.is_controlled && pillCount ? parseInt(pillCount, 10) : null,
        pillCountExpected: med?.pill_count_current ?? null,
        prnReason: med?.is_prn ? prnReason.trim() || null : null,
        isMedicationError: isMedError,
        errorDescription: isMedError ? errorDescription.trim() : null,
        seizureDurationSeconds: med?.is_rescue && seizureDuration ? parseInt(seizureDuration, 10) : null,
        seizureOutcome: med?.is_rescue ? seizureOutcome.trim() || null : null,
        emergencyServicesCalled: med?.is_rescue ? emergencyCalled : false,
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

            {/* Time the Person ACTUALLY took the medication — distinct from documentation time */}
            <div className="grid gap-1.5">
              <Label className="text-xs font-semibold">Time the Person actually took this medication *</Label>
              <Input
                type="datetime-local"
                value={actualTakenAt}
                onChange={(e) => setActualTakenAt(e.target.value)}
                className="text-sm"
              />
              <p className="text-[11px] text-muted-foreground">
                Defaults to now. If you're documenting after the fact, set the earlier time the Person actually
                took it — both the actual time and the time you're documenting will be stored.
              </p>
              {showGapWarning && (
                <div className="flex items-start gap-1.5 rounded-md border border-amber-400 bg-amber-50 p-2 text-[11px] text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                  <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    Late entry — you're documenting {gapMinutes} minute{gapMinutes === 1 ? "" : "s"} after the Person
                    took it. Both timestamps will be recorded and the gap flagged on the audit trail.
                  </span>
                </div>
              )}
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
              <div className="rounded-lg border border-purple-500/40 bg-purple-50 p-3 dark:bg-purple-950/20 space-y-2">
                <Label className="text-xs font-semibold text-purple-800 dark:text-purple-200">
                  Controlled Substance — Current count *
                </Label>
                <Input
                  type="number" min="0"
                  value={pillCount}
                  onChange={(e) => setPillCount(e.target.value)}
                  placeholder={med.pill_count_current != null ? `Expected ${med.pill_count_current}` : "e.g., 28"}
                  className="h-9 bg-white dark:bg-slate-900"
                />
                <p className="text-[11px] text-purple-700 dark:text-purple-300">
                  Count remaining after this dose. Variance from the expected count is flagged on the audit trail.
                </p>
              </div>
            )}

            {/* Rescue medication — seizure capture */}
            {med?.is_rescue && status === "administered" && (
              <div className="rounded-lg border-2 border-rose-500/60 bg-rose-50 p-3 dark:bg-rose-950/20 space-y-2">
                <div className="flex items-center gap-1.5">
                  <Siren className="h-4 w-4 text-rose-600" />
                  <Label className="text-xs font-semibold text-rose-800 dark:text-rose-200">
                    Rescue medication — seizure details *
                  </Label>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="grid gap-1">
                    <Label className="text-[11px]">Seizure duration (seconds)</Label>
                    <Input
                      type="number" min="0"
                      value={seizureDuration}
                      onChange={(e) => setSeizureDuration(e.target.value)}
                      placeholder="e.g., 120"
                      className="h-9 bg-white dark:bg-slate-900"
                    />
                  </div>
                  <div className="grid gap-1">
                    <Label className="text-[11px]">Response / outcome</Label>
                    <Input
                      value={seizureOutcome}
                      onChange={(e) => setSeizureOutcome(e.target.value)}
                      placeholder="e.g., resolved, slept, transported"
                      className="h-9 bg-white dark:bg-slate-900"
                    />
                  </div>
                </div>
                <label className="flex cursor-pointer items-center gap-2 text-xs">
                  <Checkbox checked={emergencyCalled} onCheckedChange={(c) => setEmergencyCalled(!!c)} />
                  <span>Emergency services (911) were called</span>
                </label>
              </div>
            )}

            {/* Outcome — Person self-administered, refused, omitted, or missed */}
            <div className="grid gap-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Outcome *
              </Label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {(["administered", "refused", "omitted", "missed"] as EmarLog["status"][]).map((s) => {
                  const label =
                    s === "administered" ? "Self-administered" :
                    s === "refused" ? "Refused" :
                    s === "omitted" ? "Omitted" : "Missed";
                  return (
                    <button
                      key={s} type="button"
                      onClick={() => { setStatus(s); if (s === "administered") setIsMedError(false); }}
                      className={`rounded-lg border px-2 py-2 text-xs font-semibold transition ${
                        status === s
                          ? s === "administered"
                            ? "border-emerald-500 bg-emerald-600 text-white shadow-sm"
                            : "border-rose-500 bg-rose-600 text-white shadow-sm"
                          : "border-border bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground"
                      }`}
                    >{label}</button>
                  );
                })}
              </div>
            </div>

            {/* Exception reason */}
            {isException && (
              <div className="grid gap-2">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Exception Reason *
                </Label>
                <Select value={exceptionReason} onValueChange={setExceptionReason}>
                  <SelectTrigger><SelectValue placeholder="Select reason..." /></SelectTrigger>
                  <SelectContent>
                    {EXCEPTION_REASONS.map((r) => (
                      <SelectItem key={r} value={r}>{r}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Staff identity — pulled from the signed-in account, not typed */}
            <div className="rounded-lg border border-border bg-muted/40 px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Signing as
              </p>
              <p className="text-sm font-semibold">{staffDisplayName}</p>
              <p className="text-[11px] text-muted-foreground">
                Identity captured from your account. Logged via{" "}
                <span className="font-mono">{serviceContext}</span>.
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
              <div className="flex-1">
                <p className="text-xs font-semibold text-rose-800 dark:text-rose-200">
                  This pass was a medication error requiring immediate reporting
                </p>
                <p className="mt-0.5 text-[11px] text-rose-700 dark:text-rose-300">
                  Checking this notifies the administrator, flags this record for review, and drafts a Critical Event / incident report.
                </p>
                {isMedError && (
                  <Textarea
                    rows={2}
                    value={errorDescription}
                    onChange={(e) => setErrorDescription(e.target.value)}
                    placeholder="Briefly describe the medication error (what happened, who was notified)..."
                    className="mt-2 bg-white text-sm dark:bg-slate-900"
                    maxLength={2000}
                  />
                )}
              </div>
            </label>

            <SigPad onSigned={setSigDataUrl} label="Staff Signature" />

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

            {!canSubmit && (
              <ul className="space-y-0.5 rounded-lg bg-muted/40 p-3 text-[11px] text-muted-foreground">
                {!sigDataUrl && <li>· Sign the signature field above</li>}
                {!attested && <li>· Check the self-administration attestation</li>}
                {!route && <li>· Select the route</li>}
                {isException && exceptionReason.trim().length < 3 && <li>· Select an exception reason</li>}
                {med?.is_prn && status === "administered" && prnReason.trim().length < 3 && <li>· Enter the PRN reason</li>}
                {med?.is_rescue && status === "administered" && (!seizureDuration || seizureOutcome.trim().length < 3) && <li>· Enter seizure duration and outcome</li>}
                {med?.is_controlled && status === "administered" && pillCount.trim().length === 0 && <li>· Record current pill count</li>}
                {isMedError && errorDescription.trim().length < 3 && <li>· Describe the medication error</li>}
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
  const qc = useQueryClient();
  const addAddendum = useServerFn(addEmarAddendum);
  const [addendumLog, setAddendumLog] = useState<EmarLog | null>(null);
  const [addendumNote, setAddendumNote] = useState("");
  const sigCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const sigDrawing = useRef(false);
  const sigHas = useRef(false);
  const [submitting, setSubmitting] = useState(false);

  const medMap = useMemo(() => {
    const m = new Map<string, string>();
    meds.forEach((med) => m.set(med.id, med.medication_name));
    return m;
  }, [meds]);

  const total = logs.length;
  const administered = logs.filter((l) => l.status === "administered").length;
  const rate = total > 0 ? Math.round((administered / total) * 100) : 0;

  function clearSig() {
    const c = sigCanvasRef.current; const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
    ctx.strokeStyle = "#0f172a"; ctx.lineWidth = 2; ctx.lineCap = "round";
    sigHas.current = false;
  }
  function sigPos(e: React.PointerEvent<HTMLCanvasElement>) {
    const c = sigCanvasRef.current!; const r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * c.width, y: ((e.clientY - r.top) / r.height) * c.height };
  }
  function sigDown(e: React.PointerEvent<HTMLCanvasElement>) {
    const ctx = sigCanvasRef.current?.getContext("2d"); if (!ctx) return;
    sigDrawing.current = true; const { x, y } = sigPos(e);
    ctx.beginPath(); ctx.moveTo(x, y);
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
  }
  function sigMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!sigDrawing.current) return;
    const ctx = sigCanvasRef.current?.getContext("2d"); if (!ctx) return;
    const { x, y } = sigPos(e); ctx.lineTo(x, y); ctx.stroke(); sigHas.current = true;
  }
  function sigUp() { sigDrawing.current = false; }

  async function submitAddendum() {
    if (!addendumLog) return;
    if (addendumNote.trim().length < 3) { toast.error("Add a note (min 3 characters)."); return; }
    if (!sigHas.current) { toast.error("Sign the pad to confirm."); return; }
    setSubmitting(true);
    try {
      const sig = sigCanvasRef.current?.toDataURL("image/png") ?? "";
      await addAddendum({ data: { logId: addendumLog.id, note: addendumNote.trim(), signatureDataUrl: sig } });
      toast.success("Addendum added to the audit trail");
      qc.invalidateQueries({ queryKey: ["mar-logs"] });
      setAddendumLog(null); setAddendumNote("");
    } catch (e) {
      toast.error((e as Error).message || "Could not add addendum");
    } finally {
      setSubmitting(false);
    }
  }

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
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg border border-border bg-card p-3 text-center">
          <p className="text-2xl font-bold text-foreground">{total}</p>
          <p className="text-[11px] text-muted-foreground">Total Passes</p>
        </div>
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-50 p-3 text-center dark:bg-emerald-950/20">
          <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">{administered}</p>
          <p className="text-[11px] text-emerald-600 dark:text-emerald-400">Self-administered</p>
        </div>
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-center">
          <p className="text-2xl font-bold text-primary">{rate}%</p>
          <p className="text-[11px] text-muted-foreground">Compliance Rate</p>
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground">
        This is an append-only audit trail. Earlier entries cannot be edited — use "Add note" to append a correction or clarification.
      </p>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Date & Time</th>
              <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Medication</th>
              <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Status</th>
              <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Staff</th>
              <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Attested</th>
              <th className="px-3 py-2 text-right font-semibold text-muted-foreground">Addendum</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {logs.slice(0, 60).map((l) => (
              <tr key={l.id} className="hover:bg-muted/30">
                <td className="px-3 py-2 font-mono">
                  {fmtDateTime(l.administered_at ?? l.scheduled_for)}
                </td>
                <td className="px-3 py-2">
                  {medMap.get(l.medication_id) ?? "—"}
                  {l.is_prn && <Badge className="ml-1 bg-amber-100 text-amber-800 text-[9px] dark:bg-amber-950/40 dark:text-amber-200">PRN</Badge>}
                </td>
                <td className="px-3 py-2">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    l.status === "administered"
                      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
                      : l.status === "refused"
                      ? "bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-200"
                      : "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
                  }`}>
                    {l.status === "administered" ? "self-administered" : l.status}
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
                <td className="px-3 py-2 text-right">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-[11px]"
                    onClick={() => { setAddendumLog(l); setAddendumNote(""); }}
                  >
                    <FilePlus2 className="mr-1 h-3 w-3" /> Add note
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={!!addendumLog} onOpenChange={(o) => { if (!o && !submitting) { setAddendumLog(null); setAddendumNote(""); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Append note to audit trail</DialogTitle>
            <DialogDescription>
              The original entry stays unchanged. Your note is appended with timestamp and signature.
            </DialogDescription>
          </DialogHeader>
          {addendumLog && (
            <div className="space-y-3">
              <div className="rounded-md border border-border bg-muted/30 p-2 text-xs">
                <div className="font-mono">{fmtDateTime(addendumLog.administered_at ?? addendumLog.scheduled_for)}</div>
                <div>{medMap.get(addendumLog.medication_id) ?? "—"} — <span className="font-semibold">{addendumLog.status}</span></div>
              </div>
              <div>
                <Label className="text-xs">Note / clarification</Label>
                <Textarea
                  rows={4}
                  value={addendumNote}
                  onChange={(e) => setAddendumNote(e.target.value)}
                  placeholder="e.g., Client took dose 10 minutes after refusal entry. Documenting follow-up."
                  maxLength={2000}
                />
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <Label className="text-xs">Signature</Label>
                  <Button type="button" variant="ghost" size="sm" onClick={clearSig} className="h-6 text-[11px]">
                    <Eraser className="mr-1 h-3 w-3" /> Clear
                  </Button>
                </div>
                <canvas
                  ref={(el) => { sigCanvasRef.current = el; if (el) setTimeout(clearSig, 0); }}
                  width={520} height={120}
                  onPointerDown={sigDown} onPointerMove={sigMove} onPointerUp={sigUp} onPointerLeave={sigUp}
                  className="w-full touch-none rounded-md border-2 border-dashed border-border bg-white"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" disabled={submitting} onClick={() => { setAddendumLog(null); setAddendumNote(""); }}>Cancel</Button>
            <Button disabled={submitting} onClick={submitAddendum}>
              {submitting ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
              Append to record
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Self-administered</span>
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
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 min-w-[200px] border border-border bg-card px-2 py-2 text-left font-semibold">
                  Medication
                </th>
                {days.map((d) => {
                  const isTodayCol = d === todayDate.getDate() && month === todayDate.getMonth() && year === todayDate.getFullYear();
                  return (
                    <th key={d} className={`w-10 border border-border px-1 py-1.5 text-center font-medium ${
                      isTodayCol
                        ? "bg-primary text-primary-foreground font-bold ring-2 ring-primary ring-inset"
                        : "text-muted-foreground"
                    }`}>
                      {d}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {meds.filter((m) => m.is_active).flatMap((med) =>
                (med.scheduled_times.length > 0 ? med.scheduled_times : ["PRN"]).map((time) => (
                  <tr key={`${med.id}-${time}`} className="hover:bg-muted/20">
                    <td className="sticky left-0 z-10 border border-border bg-card px-2 py-2 align-top">
                      <div className="font-medium">{med.medication_name}</div>
                      <div className="text-[11px] text-muted-foreground">
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
                        <td key={d} className={`border border-border p-0 ${isToday ? "bg-primary/5" : ""}`}>
                          {log ? (
                            <Popover>
                              <PopoverTrigger asChild>
                                <button className={`flex h-10 w-full items-center justify-center hover:opacity-80 transition relative`}>
                                  <span className={`h-5 w-5 rounded-full ${statusColor(log)}`} />
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
                                    <span>Self-admin attested</span>
                                  </div>
                                )}
                              </PopoverContent>
                            </Popover>
                          ) : (isToday || isPast) && !isFuture ? (
                            <button
                              type="button"
                              onClick={() => onCellClick(med, d, time === "PRN" ? "00:00" : time)}
                              className="flex h-10 w-full items-center justify-center hover:bg-primary/10 transition"
                              title="Click to log administration"
                            >
                              <span className="h-3.5 w-3.5 rounded-full border-2 border-dashed border-muted-foreground/30" />
                            </button>
                          ) : (
                            <div className="h-10 w-full" />
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
  const { data: activeShift } = useActiveShift();
  const { data: clientSafety, isLoading: safetyLoading } = useClientSafety(clientId);
  const qc = useQueryClient();
  const orgId = org?.organization_id;


  // ── Realtime: any INSERT to emar_logs for this client refetches every
  //    open dashboard so the MAR stays in sync across all staff/job codes.
  useEffect(() => {
    if (!clientId || !orgId) return;
    const channel = supabase
      .channel(`emar_logs:client:${clientId}:${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "emar_logs", filter: `client_id=eq.${clientId}` },
        () => {
          qc.invalidateQueries({ queryKey: ["mar-logs-today", clientId, orgId] });
          qc.invalidateQueries({ queryKey: ["mar-logs-month", clientId, orgId] });
          qc.invalidateQueries({ queryKey: ["mar-logs-cal", clientId] });
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [clientId, orgId, qc]);

  const [activePass, setActivePass] = useState<{
    med: Medication;
    time: string;
    iso: string;
  } | null>(null);

  const [activeTab, setActiveTab] = useState("chart");

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
          instructions, prescriber, is_active, is_controlled, is_prn, is_rescue,
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
          is_prn, prn_reason, admin_reviewed, signature_data_url,
          created_at, recorded_in`)
        .eq("client_id", clientId)
        .gte("scheduled_for", todayStart)
        .lt("scheduled_for", tomorrowStart)
        .order("created_at", { ascending: true });
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
      med: Medication; time: string; iso: string; block: Block;
      history: EmarLog[]; log: EmarLog | undefined; isLocked: boolean;
    }[] = [];
    meds.forEach((med) => {
      med.scheduled_times.forEach((t) => {
        const iso = isoForToday(t);
        const history = todayLogs
          .filter((l) =>
            l.medication_id === med.id &&
            Math.abs(new Date(l.scheduled_for).getTime() - new Date(iso).getTime()) < 60_000,
          )
          .sort((a, b) =>
            (a.created_at ?? "").localeCompare(b.created_at ?? ""),
          );
        const latest = history[history.length - 1];
        rows.push({
          med, time: t, iso, block: blockFor(t),
          history, log: latest, isLocked: latest?.status === "administered",
        });
      });
      // PRN medications get a "log now" entry even without a scheduled time
      if (med.is_prn && med.scheduled_times.length === 0) {
        rows.push({
          med, time: "PRN", iso: new Date().toISOString(), block: "PRN",
          history: [], log: undefined, isLocked: false,
        });
      }
    });
    return rows;
  }, [meds, todayLogs]);

  const grouped = useMemo(() => {
    const m: Record<Block, typeof passes> = { Morning: [], Evening: [], PRN: [] };
    passes.forEach((p) => m[p.block].push(p));
    (Object.keys(m) as Block[]).forEach((k) =>
      m[k].sort((a, b) => a.time.localeCompare(b.time))
    );
    return m;
  }, [passes]);

  const pendingCount = passes.filter((p) => !p.isLocked).length;
  const errorCount = todayLogs.filter((l) => l.is_medication_error && !l.admin_reviewed).length;

  // ── Submit pass via server function (training gate + inventory + incident drafting) ──

  const logPassFn = useServerFn(logMedicationPass);
  const serviceContext = activeShift?.service_type_code || "general";

  async function submitAdmin(payload: {
    status: EmarLog["status"];
    actualTakenAt: string;
    route: string;
    exceptionReason: string | null;
    notes: string | null;
    signatureDataUrl: string | null;
    pillCountValue: number | null;
    pillCountExpected: number | null;
    prnReason: string | null;
    isMedicationError: boolean;
    errorDescription: string | null;
    seizureDurationSeconds: number | null;
    seizureOutcome: string | null;
    emergencyServicesCalled: boolean;
    attested: boolean;
  }) {
    if (!orgId || !user || !activePass) return;
    try {
      await logPassFn({
        data: {
          clientId,
          medicationId: activePass.med.id,
          scheduledFor: activePass.iso,
          scheduledTimeLabel: activePass.time,
          status: payload.status,
          route: payload.route,
          actualTakenAt: payload.actualTakenAt,
          exceptionReason: payload.exceptionReason,
          notes: payload.notes,
          signatureDataUrl: payload.signatureDataUrl ?? "",
          prnReason: payload.prnReason,
          seizureDurationSeconds: payload.seizureDurationSeconds,
          seizureOutcome: payload.seizureOutcome,
          emergencyServicesCalled: payload.emergencyServicesCalled,
          controlledCountedValue: payload.pillCountValue,
          controlledExpected: payload.pillCountExpected,
          isMedicationError: payload.isMedicationError,
          errorDescription: payload.errorDescription,
          serviceContext,
        },
      });
      toast.success(
        payload.isMedicationError
          ? "Medication error recorded. Administrator notified and incident drafted."
          : payload.status === "administered"
          ? "Self-administration confirmed and signed."
          : "Exception documented.",
      );
      qc.invalidateQueries({ queryKey: ["mar-logs-today", clientId, orgId] });
      qc.invalidateQueries({ queryKey: ["mar-logs-cal", clientId] });
      qc.invalidateQueries({ queryKey: ["mar-logs-month", clientId, orgId] });
      setActivePass(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not log medication pass.");
    }
  }

  if (medsLoading || safetyLoading) {
    return (
      <div className="grid place-items-center py-12 text-sm text-muted-foreground">
        <Loader2 className="mb-2 h-5 w-5 animate-spin" />
        Loading medication records...
      </div>
    );
  }

  // Gate: only clients flagged for self-directed self-administration support
  // see the eMAR. Everyone else gets the eligibility notice + admin toggle.
  if (clientSafety && !clientSafety.self_admin_med_support) {
    return <EmarEligibilityGate client={clientSafety} />;
  }

  return (
    <div className="space-y-4">

      {/* HIVE eMAR top bar — wordmark + DEMO chip + acting service indicator */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3">
        <div className="flex items-center gap-3">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-md text-primary-foreground"
            style={{ background: "var(--gradient-amber)" }}
            aria-hidden
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor"><path d="M12 2 3 7v10l9 5 9-5V7z"/></svg>
          </div>
          <div className="leading-tight">
            <p className="text-sm font-bold tracking-wide">HIVE</p>
            <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              eMAR · Medication Support
            </p>
          </div>
          <span
            className="ml-1 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
            style={{ background: "color-mix(in oklab, var(--accent-2) 18%, transparent)", color: "var(--accent-2)" }}
          >
            Demo
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">Acting service</span>
          <span
            className="inline-flex items-center rounded-md border border-border bg-muted px-2 py-1 font-mono text-[11px] font-semibold"
          >
            {serviceContext.toUpperCase()}
          </span>
        </div>
      </div>

      {/* Permanent legal/scope banner — required at every eMAR surface */}
      <EmarLegalBanner />

      {/* Clinical safety header — visible allergies, dysphagia / swallowing alerts */}
      {clientSafety && <ClinicalSafetyHeader client={clientSafety} />}

      {/* Nectar AI Compliance Assistant — advisory simulation actions */}
      <NectarComplianceCard onSelect={() => setActiveTab("nectar")} />


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
          <TabsTrigger value="chart" className="flex-1">
            <Pill className="mr-1.5 h-3.5 w-3.5" />
            Chart
          </TabsTrigger>
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
          <TabsTrigger value="ops" className="flex-1">
            <Settings2 className="mr-1.5 h-3.5 w-3.5" />
            Refills & Transfers
          </TabsTrigger>
          <TabsTrigger value="nectar" className="flex-1">
            <Sparkles className="mr-1.5 h-3.5 w-3.5" />
            Nectar
          </TabsTrigger>
        </TabsList>


        {/* ── CHART — per-med profile with completeness flags ── */}
        <TabsContent value="chart" className="space-y-3 pt-2">
          <MedicationChart clientId={clientId} />
        </TabsContent>


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
                  {passes.filter((p) => p.log?.status === "administered").length} self-administered
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
            const firstTime = block === "PRN" ? "" : items[0]?.time;
            const subtitle = Meta.subtitle(firstTime);
            return (
              <section key={block} className="space-y-2">
                <div className="flex items-baseline gap-2 px-1">
                  <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    {Meta.label}
                  </h3>
                  {subtitle && (
                    <span className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                      · {subtitle}
                    </span>
                  )}
                  <span className="ml-auto text-[11px] text-muted-foreground">
                    {items.filter((i) => i.log?.status === "administered").length}/{items.length} documented
                  </span>
                </div>
                <ul className="space-y-2">
                  {items.map((p) => {
                    const isLocked = p.isLocked;
                    const hasHistory = p.history.length > 0;
                    const passed = p.log?.status === "administered";
                    const errored = p.log?.is_medication_error;
                    const overdue = !isLocked && new Date(p.iso).getTime() < Date.now() - 60 * 60 * 1000 && p.time !== "PRN";
                    const upcoming = !isLocked && !overdue && p.time !== "PRN";
                    const isPrnControlled = p.med.is_prn && p.med.is_controlled;

                    return (
                      <li key={`${p.med.id}-${p.time}`}>
                        <Card className={`flex flex-col gap-3 p-4 sm:flex-row sm:items-center ${errored ? "border-rose-300 bg-rose-50/40 dark:bg-rose-950/10" : ""}`}>
                          {/* Pill icon tile */}
                          <div
                            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                              isPrnControlled
                                ? "bg-rose-100 dark:bg-rose-950/30"
                                : "bg-amber-100 dark:bg-amber-950/30"
                            }`}
                          >
                            <Pill className={`h-5 w-5 ${
                              isPrnControlled ? "text-rose-600" : "text-amber-600"
                            }`} />
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-baseline gap-x-2">
                              <span className="font-mono text-xs text-muted-foreground">
                                {p.time === "PRN" ? "PRN" : p.time.replace(":", ":")}
                              </span>
                              <p className="text-sm font-semibold">{p.med.medication_name}</p>
                              {p.med.dosage && (
                                <span className="text-xs text-muted-foreground">{p.med.dosage}</span>
                              )}
                              {p.med.route && (
                                <span className="text-xs text-muted-foreground">· {p.med.route}</span>
                              )}
                              {p.med.is_prn && (
                                <span className="ml-1 inline-flex items-center rounded-full border border-rose-300 bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-700 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-200">
                                  PRN{p.med.is_controlled ? " · Schedule IV" : ""}
                                </span>
                              )}
                              {p.med.choking_risk && (
                                <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                                  <AlertTriangle className="h-3 w-3" /> Choking risk
                                </span>
                              )}
                            </div>

                            {p.med.purpose && (
                              <p className="mt-0.5 text-xs text-muted-foreground">{p.med.purpose}</p>
                            )}

                            {/* Status chip */}
                            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                              {passed && !errored && (
                                <>
                                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
                                    <CheckCircle2 className="h-3 w-3" />
                                    Self-administered {p.log?.administered_at ? fmtTime(p.log.administered_at) : ""}
                                  </span>
                                  {p.log?.signature_attestation && (
                                    <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground">
                                      <ShieldCheck className="h-3 w-3 text-emerald-500" /> Self-admin attested
                                    </span>
                                  )}
                                </>
                              )}
                              {p.log && !passed && (
                                <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium capitalize text-muted-foreground">
                                  {p.log?.status}
                                  {p.log?.exception_reason ? ` — ${p.log.exception_reason.replace(/^Route:[^·]+·\s*/, "")}` : ""}
                                </span>
                              )}
                              {errored && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-rose-500 px-2 py-0.5 text-[11px] font-semibold text-white">
                                  <AlertOctagon className="h-3 w-3" /> Medication error filed
                                </span>
                              )}
                              {overdue && !p.log && (
                                <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                                  Window passed — documentation required
                                </span>
                              )}
                              {upcoming && !p.log && (
                                <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                                  Upcoming
                                </span>
                              )}
                            </div>

                            {/* Chronological immutable history */}
                            {hasHistory && (
                              <ul className="mt-2 space-y-0.5 border-l border-border pl-2 text-[11px] text-muted-foreground">
                                {p.history.map((h) => {
                                  const code = parseJobCode(h);
                                  const when = h.created_at ? fmtTime(h.created_at) : "";
                                  const cleanNotes = stripJobCodePrefix(h.notes);
                                  const isAdmin = h.status === "administered";
                                  return (
                                    <li key={h.id} className="flex flex-wrap items-center gap-1.5">
                                      <span className="font-mono">{when}</span>
                                      <span className={`capitalize ${isAdmin ? "text-emerald-700 dark:text-emerald-300 font-medium" : ""}`}>
                                        {h.status}{isAdmin ? " ✓" : ""}
                                      </span>
                                      <span>— {h.staff_name || "Staff"}</span>
                                      <Badge variant="outline" className="h-4 px-1 text-[9px] font-mono">{code}</Badge>
                                      {cleanNotes && <span className="opacity-80">· {cleanNotes}</span>}
                                    </li>
                                  );
                                })}
                              </ul>
                            )}
                          </div>

                          {!isLocked && (
                            <Button
                              size="sm"
                              onClick={() => setActivePass({ med: p.med, time: p.time, iso: p.iso })}
                              className="h-10 shrink-0 gap-1.5 text-primary-foreground"
                              style={{ background: "var(--gradient-amber)" }}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              {p.time === "PRN" ? "Log PRN" : hasHistory ? "Add update" : "Observe & Confirm"}
                            </Button>
                          )}
                        </Card>
                      </li>
                    );
                  })}
                </ul>
              </section>
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

        {/* ── OPS — refills, shift counts, transfers ── */}
        <TabsContent value="ops" className="space-y-3 pt-2">
          <EmarOpsPanel clientId={clientId} />
        </TabsContent>

        {/* ── NECTAR — advisory helper ── */}
        <TabsContent value="nectar" className="space-y-3 pt-2">
          <EmarNectarPanel clientId={clientId} />
        </TabsContent>
      </Tabs>


      {/* Administration log dialog */}
      <AdminLogDialog
        pass={activePass}
        clientName={clientName}
        serviceContext={serviceContext}
        onClose={() => setActivePass(null)}
        onSubmit={submitAdmin}
      />
    </div>
  );
}
