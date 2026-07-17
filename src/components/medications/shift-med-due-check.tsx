import { useState, useEffect, useRef, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Pill, CheckCircle2, AlertTriangle, Eraser, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useShiftMedDueStatus } from "@/hooks/use-shift-med-due-status";
import { logMedicationPass } from "@/lib/emar-pass.functions";
import { type EmarStatus } from "@/lib/emar-status";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";

type MedAnswer = "yes" | "no" | "not_scheduled";

type DoseEntry = {
  status: EmarStatus | "";
  timeValue: string;
  note: string;
};

const INLINE_STATUS_OPTIONS: { value: EmarStatus; label: string }[] = [
  { value: "self_administered", label: "Observed" },
  { value: "missed", label: "Missed" },
  { value: "refused", label: "Refused" },
  { value: "loa", label: "LOA (away with meds)" },
];

const ATTESTATION =
  "I attest that the medication information logged here is accurate and complete for this shift.";

/**
 * Inline medication check for the EVV clock-out and HHS daily note flows.
 * Staff answer Yes / No / Not scheduled for whether medications were addressed.
 * Choosing Yes reveals an inline per-dose form that writes directly to emar_logs —
 * the same table the eMAR chart, MAR sheet, and audit desk read from.
 */
export function ShiftMedDueCheck({
  organizationId,
  clientId,
  clientName,
  windowStart,
  windowEnd,
  emarHref,
  onResolvedChange,
}: {
  organizationId: string | null | undefined;
  clientId: string | null | undefined;
  clientName: string;
  windowStart: string | null | undefined;
  windowEnd: string | null | undefined;
  /** Deep link to the client's real MAR tab — used as fallback for complex meds. */
  emarHref: string;
  onResolvedChange: (resolved: boolean) => void;
}) {
  const medStatus = useShiftMedDueStatus({ organizationId, clientId, windowStart, windowEnd });
  const [answer, setAnswer] = useState<MedAnswer | null>(null);
  const [doseEntries, setDoseEntries] = useState<Record<string, DoseEntry>>({});
  const [attested, setAttested] = useState(false);
  const [done, setDone] = useState(false);

  const sigRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const hasSig = useRef(false);

  const qc = useQueryClient();
  const logPass = useServerFn(logMedicationPass);

  const unloggedDoses = medStatus.scheduledDoses.filter((d) => !d.logged);

  // Initialize dose entry slots when "yes" is selected.
  useEffect(() => {
    if (answer !== "yes") return;
    setDoseEntries((prev) => {
      const next = { ...prev };
      unloggedDoses.forEach((d) => {
        const k = `${d.medication_id}|${d.scheduled_for_iso}`;
        if (!next[k]) next[k] = { status: "", timeValue: "", note: "" };
      });
      return next;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answer, medStatus.scheduledDoses]);

  const resolved = (() => {
    if (medStatus.loading) return false;
    if (medStatus.scheduledDoses.length === 0) return true;
    if (done || medStatus.allDosesLogged) return true;
    if (answer === "not_scheduled" || answer === "no") return true;
    return false;
  })();

  useEffect(() => {
    onResolvedChange(resolved);
  }, [resolved, onResolvedChange]);

  // Signature helpers
  function clearSig() {
    const c = sigRef.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    hasSig.current = false;
  }
  function sigPos(e: React.PointerEvent<HTMLCanvasElement>) {
    const c = sigRef.current!;
    const r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * c.width, y: ((e.clientY - r.top) / r.height) * c.height };
  }
  function sigDown(e: React.PointerEvent<HTMLCanvasElement>) {
    const ctx = sigRef.current?.getContext("2d");
    if (!ctx) return;
    drawing.current = true;
    const { x, y } = sigPos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
  }
  function sigMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const ctx = sigRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = sigPos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    hasSig.current = true;
  }
  function sigUp() { drawing.current = false; }

  const updateEntry = useCallback((key: string, field: keyof DoseEntry, value: string) => {
    setDoseEntries((prev) => ({ ...prev, [key]: { ...prev[key], [field]: value } }));
  }, []);

  const allEntriesValid = unloggedDoses.every((d) => {
    const k = `${d.medication_id}|${d.scheduled_for_iso}`;
    const e = doseEntries[k];
    if (!e?.status) return false;
    if (e.status !== "self_administered" && !e.note.trim()) return false;
    return true;
  });

  const canSubmit = answer === "yes" && allEntriesValid && attested;

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!hasSig.current) throw new Error("Sign the pad to confirm.");
      const sig = sigRef.current?.toDataURL("image/png") ?? "";
      for (const d of unloggedDoses) {
        const k = `${d.medication_id}|${d.scheduled_for_iso}`;
        const e = doseEntries[k];
        if (!e?.status) continue;
        let actualIso = new Date().toISOString();
        if (e.timeValue) {
          const [hh, mm] = e.timeValue.split(":").map(Number);
          const dt = new Date();
          dt.setHours(hh, Number.isFinite(mm) ? mm : 0, 0, 0);
          actualIso = dt.toISOString();
        }
        await logPass({
          data: {
            clientId: clientId!,
            medicationId: d.medication_id,
            scheduledFor: d.scheduled_for_iso,
            scheduledTimeLabel: d.time_label,
            status: e.status as EmarStatus,
            route: d.route || "PO",
            actualTakenAt: actualIso,
            exceptionReason: e.status !== "self_administered" ? e.note : null,
            notes: null,
            signatureDataUrl: sig,
            isMedicationError: false,
          },
        });
      }
    },
    onSuccess: () => {
      toast.success("Medications logged.");
      setDone(true);
      qc.invalidateQueries({ queryKey: ["shift-med-due-status"] });
      qc.invalidateQueries({ queryKey: ["mar-logs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ── Render ────────────────────────────────────────────────────────────────

  if (medStatus.loading) {
    return (
      <div className="rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
        Checking scheduled medications…
      </div>
    );
  }

  // No doses scheduled in this window → nothing to show.
  if (medStatus.scheduledDoses.length === 0) return null;

  // All doses logged (whether pre-existing or just submitted via this form).
  if (done || medStatus.allDosesLogged) {
    return (
      <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-900 dark:text-emerald-200">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>
            <span className="font-semibold">All scheduled doses logged</span> for {clientName}{" "}
            during this window ({medStatus.scheduledDoses.length}).
          </span>
        </div>
      </div>
    );
  }

  // Staff answered "not scheduled" or "no" — section resolved.
  if (answer === "not_scheduled" || answer === "no") {
    return (
      <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
          <span>
            {answer === "not_scheduled"
              ? "No medications scheduled for this shift."
              : "Medications not applicable for this shift."}
          </span>
          <button
            type="button"
            className="ml-auto text-[11px] underline hover:no-underline"
            onClick={() => setAnswer(null)}
          >
            Change
          </button>
        </div>
      </div>
    );
  }

  // Main section: question + optional inline form.
  return (
    <div className="rounded-xl border-2 border-amber-500/50 bg-amber-500/5 p-3 sm:p-4 space-y-3">
      <div className="flex items-start gap-2">
        <Pill className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-snug">Medications — {clientName}</p>
          <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
            Were medications addressed this shift?
          </p>
        </div>
      </div>

      {/* Answer picker */}
      {answer === null && (
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="flex-1 border-emerald-500/50 hover:bg-emerald-500/10"
            onClick={() => setAnswer("yes")}
          >
            Yes
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="flex-1"
            onClick={() => setAnswer("no")}
          >
            No
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="flex-1"
            onClick={() => setAnswer("not_scheduled")}
          >
            Not scheduled
          </Button>
        </div>
      )}

      {/* Inline logging form (answer === "yes") */}
      {answer === "yes" && (
        <div className="space-y-3">
          {/* Already-logged doses */}
          {medStatus.scheduledDoses.filter((d) => d.logged).map((d) => (
            <div
              key={`${d.medication_id}|${d.scheduled_for_iso}`}
              className="flex flex-wrap items-center gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1.5 text-xs"
            >
              <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-600" />
              <span className="font-mono text-[11px]">{d.time_label}</span>
              <span className="font-medium">{d.medication_name}</span>
              {d.dosage && <span className="text-muted-foreground">· {d.dosage}</span>}
              <span className="ml-auto text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                Logged
              </span>
            </div>
          ))}

          {/* Unlogged doses — per-dose form */}
          {unloggedDoses.map((d) => {
            const k = `${d.medication_id}|${d.scheduled_for_iso}`;
            const e = doseEntries[k] ?? { status: "", timeValue: "", note: "" };
            const isException = !!e.status && e.status !== "self_administered";
            const noteRequired = isException && !e.note.trim();
            return (
              <div
                key={k}
                className="space-y-2 rounded-md border border-amber-500/50 bg-amber-500/10 p-2.5"
              >
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  <AlertTriangle className="h-3 w-3 shrink-0 text-amber-700 dark:text-amber-300" />
                  <span className="font-mono text-[11px]">{d.time_label}</span>
                  <span className="font-semibold">{d.medication_name}</span>
                  {d.dosage && <span className="text-muted-foreground">· {d.dosage}</span>}
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-[11px]">Outcome *</Label>
                  <Select value={e.status} onValueChange={(v) => updateEntry(k, "status", v)}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Select outcome" />
                    </SelectTrigger>
                    <SelectContent>
                      {INLINE_STATUS_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value} className="text-xs">
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-[11px]">Time addressed</Label>
                  <Input
                    type="time"
                    value={e.timeValue}
                    onChange={(ev) => updateEntry(k, "timeValue", ev.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
                {isException && (
                  <div className="grid gap-1.5">
                    <Label className="text-[11px]">
                      Note *{" "}
                      <span className="font-normal text-muted-foreground">(required)</span>
                    </Label>
                    <Textarea
                      rows={2}
                      value={e.note}
                      onChange={(ev) => updateEntry(k, "note", ev.target.value)}
                      placeholder="Describe what happened"
                      maxLength={200}
                      className={`text-xs ${noteRequired ? "border-rose-400" : ""}`}
                    />
                    {noteRequired && (
                      <p className="text-[11px] text-rose-600">Note is required.</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* Signature + attestation — shown once all entries have valid statuses */}
          {allEntriesValid && unloggedDoses.length > 0 && (
            <>
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <Label className="text-xs">Staff signature</Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={clearSig}
                    className="h-7 text-[11px]"
                  >
                    <Eraser className="mr-1 h-3 w-3" /> Clear
                  </Button>
                </div>
                <canvas
                  ref={(el) => { sigRef.current = el; if (el) setTimeout(clearSig, 0); }}
                  width={520}
                  height={100}
                  onPointerDown={sigDown}
                  onPointerMove={sigMove}
                  onPointerUp={sigUp}
                  onPointerLeave={sigUp}
                  className="w-full touch-none rounded-md border-2 border-dashed border-border bg-white"
                />
              </div>
              <label className="flex cursor-pointer items-start gap-2 rounded-md border-2 border-primary/30 bg-primary/5 p-3 text-xs">
                <Checkbox
                  checked={attested}
                  onCheckedChange={(v) => setAttested(v === true)}
                  className="mt-0.5"
                />
                <span>
                  <span className="font-semibold">Attestation:</span> {ATTESTATION}
                </span>
              </label>
            </>
          )}

          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setAnswer(null)}
              disabled={saveMut.isPending}
              className="shrink-0"
            >
              Back
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={!canSubmit || saveMut.isPending}
              onClick={() => saveMut.mutate()}
              className="flex-1"
            >
              {saveMut.isPending ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
              Log {unloggedDoses.length} dose{unloggedDoses.length !== 1 ? "s" : ""}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
