import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Pill, AlertTriangle, CheckCircle2, Eraser, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useShiftMedAttestationStatus } from "@/hooks/use-shift-med-attestation-required";

export type MedAttestationValue = {
  resolved: boolean;
  observed: boolean | null;
  reason: string;
  signatureDataUrl: string | null;
  attested: boolean;
};

export const emptyMedAttestation: MedAttestationValue = {
  resolved: false,
  observed: null,
  reason: "",
  signatureDataUrl: null,
  attested: false,
};

/**
 * Per-client medication observation attestation block. Renders nothing if
 * the client has no active medications. Renders a "pending database update"
 * note (treated as resolved) if the `shift_medication_attestations` table
 * has not been created yet, so the surrounding flow keeps working.
 *
 * Used inside both the EVV clock-out compliance dialog and the HHS daily
 * note form. The parent enforces `value.resolved` before allowing submit.
 */
export function ShiftMedAttestation({
  organizationId,
  clientId,
  clientName,
  windowStart,
  windowEnd,
  emarHref,
  value,
  onChange,
}: {
  organizationId: string | null | undefined;
  clientId: string | null | undefined;
  clientName: string;
  windowStart: string | null | undefined;
  windowEnd: string | null | undefined;
  /** Where to send staff to log a missing eMAR pass. */
  emarHref: string;
  value: MedAttestationValue;
  onChange: (next: MedAttestationValue) => void;
}) {
  const status = useShiftMedAttestationStatus({
    organizationId,
    clientId,
    windowStart,
    windowEnd,
  });

  // Mark resolved automatically when the gate doesn't apply, so the parent
  // can include this in its overall submit-disabled calculation without
  // needing to know the internal state.
  useEffect(() => {
    if (status.loading) return;
    if (status.tableMissing || !status.hasActiveMeds) {
      if (!value.resolved) onChange({ ...value, resolved: true });
      return;
    }
    // Recompute resolved when relevant inputs change.
    const observedYes = value.observed === true;
    const observedNo = value.observed === false;
    const reasonOk = value.reason.trim().length >= 10;
    const sigOk = !!value.signatureDataUrl;
    let resolved = false;
    if (observedYes && status.allDosesLogged && value.attested && sigOk) {
      resolved = true;
    } else if (observedNo && reasonOk && value.attested && sigOk) {
      resolved = true;
    }
    if (resolved !== value.resolved) onChange({ ...value, resolved });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    status.loading,
    status.tableMissing,
    status.hasActiveMeds,
    status.allDosesLogged,
    value.observed,
    value.reason,
    value.signatureDataUrl,
    value.attested,
  ]);

  // Signature canvas
  const sigRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const hasSig = useRef(false);

  const [paintReady, setPaintReady] = useState(false);
  useEffect(() => {
    const c = sigRef.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    setPaintReady(true);
  }, []);

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
    onChange({ ...value, signatureDataUrl: null });
  }
  function pos(e: React.PointerEvent<HTMLCanvasElement>) {
    const c = sigRef.current!;
    const r = c.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * c.width,
      y: ((e.clientY - r.top) / r.height) * c.height,
    };
  }
  function down(e: React.PointerEvent<HTMLCanvasElement>) {
    const ctx = sigRef.current?.getContext("2d");
    if (!ctx) return;
    drawing.current = true;
    const { x, y } = pos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
  }
  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const ctx = sigRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = pos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    hasSig.current = true;
  }
  function up() {
    if (drawing.current) {
      drawing.current = false;
      const dataUrl = sigRef.current?.toDataURL("image/png") ?? null;
      if (hasSig.current && dataUrl) onChange({ ...value, signatureDataUrl: dataUrl });
    }
  }

  if (status.loading) {
    return (
      <div className="rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
        Checking medications on file…
      </div>
    );
  }

  if (!status.hasActiveMeds) return null;

  if (status.tableMissing) {
    return (
      <div className="rounded-md border border-amber-400/60 bg-amber-50/60 px-3 py-2 text-[12px] text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">Medication attestation pending database update.</p>
            <p className="mt-0.5">
              This client has active medications. Once an administrator runs the
              pending database update, you'll be asked to confirm whether you
              observed self-administration before finishing.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const observedYes = value.observed === true;
  const observedNo = value.observed === false;

  return (
    <div className="rounded-xl border-2 border-primary/30 bg-primary/5 p-3 sm:p-4 space-y-3">
      <div className="flex items-start gap-2">
        <Pill className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-snug">
            Medication observation — {clientName}
          </p>
          <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
            {clientName} has active medication(s) on file. Confirm whether you
            observed and supported their self-administration during this
            {windowEnd && windowStart ? " period." : " shift."}
          </p>
        </div>
      </div>

      {/* Yes / No segmented */}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() =>
            onChange({ ...value, observed: true, reason: "" })
          }
          className={`min-h-11 rounded-md border-2 px-3 py-2 text-sm font-semibold transition ${
            observedYes
              ? "border-emerald-600 bg-emerald-50 text-emerald-900 dark:bg-emerald-500/15 dark:text-emerald-100"
              : "border-border bg-card hover:bg-secondary/60"
          }`}
        >
          ✅ Yes — observed
        </button>
        <button
          type="button"
          onClick={() => onChange({ ...value, observed: false })}
          className={`min-h-11 rounded-md border-2 px-3 py-2 text-sm font-semibold transition ${
            observedNo
              ? "border-rose-600 bg-rose-50 text-rose-900 dark:bg-rose-500/15 dark:text-rose-100"
              : "border-border bg-card hover:bg-secondary/60"
          }`}
        >
          🛑 No — did not take
        </button>
      </div>

      {observedYes && (
        <div className="rounded-md border border-border bg-card p-3 space-y-2">
          <p className="text-xs font-semibold">
            Scheduled doses during this {windowEnd ? "period" : "shift"}
          </p>
          {status.scheduledDoses.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">
              No scheduled doses fall inside this window. You may still attest
              that you observed support (e.g. PRN doses).
            </p>
          ) : (
            <ul className="space-y-1.5">
              {status.scheduledDoses.map((d) => (
                <li
                  key={`${d.medication_id}-${d.scheduled_for_iso}`}
                  className={`flex flex-wrap items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-xs ${
                    d.logged
                      ? "border-emerald-500/40 bg-emerald-500/10"
                      : "border-amber-500/50 bg-amber-500/10"
                  }`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="font-mono text-[11px]">{d.time_label}</span>{" "}
                    <span className="font-medium">{d.medication_name}</span>
                    {d.dosage ? <span className="text-muted-foreground"> · {d.dosage}</span> : null}
                  </span>
                  {d.logged ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                      <CheckCircle2 className="h-3 w-3" /> Logged
                    </span>
                  ) : (
                    <Button asChild type="button" size="sm" variant="outline" className="h-8 gap-1 text-[11px]">
                      <Link to={emarHref}>
                        <ExternalLink className="h-3 w-3" /> Log pass
                      </Link>
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {!status.allDosesLogged && (
            <p className="text-[11px] text-amber-700 dark:text-amber-300">
              Log every scheduled pass in eMAR before attesting.
            </p>
          )}
        </div>
      )}

      {observedNo && (
        <div className="space-y-1">
          <Label className="text-xs">
            Reason {clientName} did not take medication this {windowEnd ? "period" : "shift"} *
          </Label>
          <Textarea
            rows={3}
            value={value.reason}
            onChange={(e) => onChange({ ...value, reason: e.target.value })}
            placeholder="Describe what happened — refusal, asleep, NPO, dose held by physician, etc."
            className={value.reason.trim().length < 10 ? "border-rose-400" : ""}
          />
          {value.reason.trim().length < 10 && (
            <p className="text-[11px] text-rose-600">Required — minimum 10 characters.</p>
          )}
        </div>
      )}

      {value.observed !== null && (
        <>
          <div>
            <div className="mb-1 flex items-center justify-between">
              <Label className="text-xs">Staff signature *</Label>
              <Button type="button" variant="ghost" size="sm" onClick={clearSig} className="h-7 text-[11px]">
                <Eraser className="mr-1 h-3 w-3" /> Clear
              </Button>
            </div>
            <canvas
              ref={sigRef}
              width={520}
              height={110}
              onPointerDown={down}
              onPointerMove={move}
              onPointerUp={up}
              onPointerLeave={up}
              className="w-full touch-none rounded-md border-2 border-dashed border-border bg-white"
              style={paintReady ? undefined : { visibility: "hidden" }}
            />
          </div>

          <label className="flex cursor-pointer items-start gap-2 rounded-md border-2 border-primary/30 bg-card p-2 text-xs">
            <Checkbox
              className="mt-0.5"
              checked={value.attested}
              onCheckedChange={(c) => onChange({ ...value, attested: c === true })}
            />
            <span>
              {observedYes ? (
                <>
                  <span className="font-semibold">Attestation:</span> I observed
                  and supported {clientName} with self-administration of their
                  medication(s) during this {windowEnd ? "period" : "shift"}.
                </>
              ) : (
                <>
                  <span className="font-semibold">Attestation:</span>{" "}
                  {clientName} did not take any medication during this{" "}
                  {windowEnd ? "period" : "shift"}, for the reason described
                  above.
                </>
              )}
            </span>
          </label>
        </>
      )}
    </div>
  );
}
