import { useState, useEffect, useCallback } from "react";
import { Pill, CheckCircle2, AlertTriangle, Pencil } from "lucide-react";
import { useShiftMedDueStatus } from "@/hooks/use-shift-med-due-status";
import { type EmarStatus } from "@/lib/emar-status";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";

type MedAnswer = "yes" | "no" | "not_scheduled";

type DoseEntry = {
  checked: boolean;
  status: EmarStatus | "";
  timeValue: string;
  note: string;
};

/**
 * Payload the parent will pass to `logMedicationPass` on final Submit
 * Timeclock. One entry per medication the staff checked.
 */
export type PendingMedDose = {
  clientId: string;
  medicationId: string;
  scheduledFor: string;
  scheduledTimeLabel: string;
  status: EmarStatus;
  route: string;
  actualTakenAt: string;
  exceptionReason: string | null;
  notes: string | null;
  signatureDataUrl: string;
  isMedicationError: false;
};

const INLINE_STATUS_OPTIONS: { value: EmarStatus; label: string }[] = [
  { value: "self_administered", label: "Observed" },
  { value: "missed", label: "Missed" },
  { value: "refused", label: "Refused" },
  { value: "loa", label: "LOA (away with meds)" },
];

const ATTESTATION =
  "I attest that I personally observed the client take, or administered, each medication I checked above during this shift. Medications not checked were not given at the noted time.";

/**
 * Inline medication check for the EVV clock-out (and HHS daily note) flows.
 * This component NO LONGER writes to emar_logs on its own. Staff fill in the
 * per-dose checklist, type their name, tick the attestation, then click
 * **Save**. The prepared payloads are handed to the parent via
 * `onPendingDosesChange`, and the parent flushes them to `emar_logs` when the
 * staff finally submits the whole timeclock / daily note.
 *
 * Saving marks the section resolved so the parent's Submit button can enable.
 * The section then collapses to a read-only summary with an **Edit** button
 * that clears the resolved state until Save is pressed again.
 */
export function ShiftMedDueCheck({
  organizationId,
  clientId,
  clientName,
  windowStart,
  windowEnd,
  emarHref: _emarHref,
  onResolvedChange,
  onPendingDosesChange,
}: {
  organizationId: string | null | undefined;
  clientId: string | null | undefined;
  clientName: string;
  windowStart: string | null | undefined;
  windowEnd: string | null | undefined;
  /** Deep link to the client's real MAR tab — used as fallback for complex meds. */
  emarHref: string;
  onResolvedChange: (resolved: boolean) => void;
  /** Emits the payloads the parent will pass to `logMedicationPass` on submit. */
  onPendingDosesChange?: (pending: PendingMedDose[]) => void;
}) {
  const medStatus = useShiftMedDueStatus({ organizationId, clientId, windowStart, windowEnd });
  const [answer, setAnswer] = useState<MedAnswer | null>(null);
  const [doseEntries, setDoseEntries] = useState<Record<string, DoseEntry>>({});
  const [typedName, setTypedName] = useState("");
  const [attested, setAttested] = useState(false);
  const [saved, setSaved] = useState(false);
  const [savedSummary, setSavedSummary] = useState<{
    count: number;
    name: string;
    kind: MedAnswer;
  } | null>(null);

  const unloggedDoses = medStatus.scheduledDoses.filter((d) => !d.logged);

  // Initialize dose entry slots when "yes" is selected.
  useEffect(() => {
    if (answer !== "yes") return;
    setDoseEntries((prev) => {
      const next = { ...prev };
      unloggedDoses.forEach((d) => {
        const k = `${d.medication_id}|${d.scheduled_for_iso}`;
        if (!next[k]) next[k] = { checked: false, status: "", timeValue: "", note: "" };
      });
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answer, medStatus.scheduledDoses]);

  const resolved = (() => {
    if (medStatus.loading) return false;
    if (medStatus.scheduledDoses.length === 0) return true;
    if (medStatus.allDosesLogged) return true;
    return saved;
  })();

  useEffect(() => {
    onResolvedChange(resolved);
  }, [resolved, onResolvedChange]);

  const emitPending = useCallback(
    (payload: PendingMedDose[]) => {
      onPendingDosesChange?.(payload);
    },
    [onPendingDosesChange],
  );

  const updateEntry = useCallback(
    (key: string, field: keyof DoseEntry, value: string | boolean) => {
      setDoseEntries((prev) => ({ ...prev, [key]: { ...prev[key], [field]: value } }));
    },
    [],
  );

  const checkedDoses = unloggedDoses.filter((d) => {
    const k = `${d.medication_id}|${d.scheduled_for_iso}`;
    return doseEntries[k]?.checked;
  });

  const allCheckedValid = checkedDoses.every((d) => {
    const k = `${d.medication_id}|${d.scheduled_for_iso}`;
    const e = doseEntries[k];
    if (!e?.status) return false;
    if (e.status !== "self_administered" && !e.note.trim()) return false;
    return true;
  });

  const canSave =
    answer === "yes" &&
    checkedDoses.length > 0 &&
    allCheckedValid &&
    typedName.trim().length > 0 &&
    attested;

  function buildPending(): PendingMedDose[] {
    if (!clientId) return [];
    const signatureText = `Typed signature: ${typedName.trim()}`;
    return checkedDoses.map((d) => {
      const k = `${d.medication_id}|${d.scheduled_for_iso}`;
      const e = doseEntries[k]!;
      let actualIso = new Date().toISOString();
      if (e.timeValue) {
        const [hh, mm] = e.timeValue.split(":").map(Number);
        const dt = new Date();
        dt.setHours(hh, Number.isFinite(mm) ? mm : 0, 0, 0);
        actualIso = dt.toISOString();
      }
      return {
        clientId,
        medicationId: d.medication_id,
        scheduledFor: d.scheduled_for_iso,
        scheduledTimeLabel: d.time_label,
        status: e.status as EmarStatus,
        route: d.route || "PO",
        actualTakenAt: actualIso,
        exceptionReason: e.status !== "self_administered" ? e.note : null,
        notes: null,
        signatureDataUrl: signatureText,
        isMedicationError: false,
      };
    });
  }

  function handleSave() {
    if (!canSave) return;
    const pending = buildPending();
    emitPending(pending);
    setSavedSummary({
      count: pending.length,
      name: typedName.trim(),
      kind: "yes",
    });
    setSaved(true);
  }

  function handleEdit() {
    setSaved(false);
    setSavedSummary(null);
    emitPending([]);
  }

  function handleAnswerNone(kind: "no" | "not_scheduled") {
    setAnswer(kind);
    emitPending([]);
    setSavedSummary({ count: 0, name: "", kind });
    setSaved(true);
  }

  function handleReset() {
    setAnswer(null);
    setSaved(false);
    setSavedSummary(null);
    emitPending([]);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (medStatus.loading) {
    return (
      <div className="rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
        Checking scheduled medications…
      </div>
    );
  }

  // Nothing scheduled → nothing to show, but the section counts as resolved.
  if (medStatus.scheduledDoses.length === 0) return null;

  // All doses already logged elsewhere (real MAR).
  if (medStatus.allDosesLogged) {
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

  // Saved summary — read-only until user hits Edit.
  if (saved && savedSummary) {
    const summaryLabel =
      savedSummary.kind === "not_scheduled"
        ? "No medications scheduled for this shift."
        : savedSummary.kind === "no"
          ? "Medications not applicable for this shift."
          : savedSummary.count === 1
            ? `1 medication ready to log — signed by ${savedSummary.name}.`
            : `${savedSummary.count} medications ready to log — signed by ${savedSummary.name}.`;
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-900 dark:text-emerald-200">
        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
        <span className="min-w-0 flex-1">
          <span className="font-semibold">Saved.</span> {summaryLabel}{" "}
          <span className="text-muted-foreground">
            Doses will be logged to eMAR when you submit the timeclock.
          </span>
        </span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 gap-1 text-[11px]"
          onClick={handleEdit}
        >
          <Pencil className="h-3 w-3" /> Edit
        </Button>
      </div>
    );
  }

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
            onClick={() => handleAnswerNone("no")}
          >
            No
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="flex-1"
            onClick={() => handleAnswerNone("not_scheduled")}
          >
            Not scheduled
          </Button>
        </div>
      )}

      {answer === "yes" && (
        <div className="space-y-3">
          <p className="text-[11px] leading-snug text-muted-foreground">
            Check the medications you administered or observed. Unchecked medications will not be
            logged from this shift verification.
          </p>

          {/* Already-logged doses */}
          {medStatus.scheduledDoses
            .filter((d) => d.logged)
            .map((d) => (
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

          {/* Unlogged doses — checkbox + optional per-dose form */}
          {unloggedDoses.map((d) => {
            const k = `${d.medication_id}|${d.scheduled_for_iso}`;
            const e = doseEntries[k] ?? { checked: false, status: "", timeValue: "", note: "" };
            const isException = !!e.status && e.status !== "self_administered";
            const noteRequired = isException && !e.note.trim();
            return (
              <div
                key={k}
                className={`space-y-2 rounded-md border p-2.5 ${
                  e.checked ? "border-amber-500/50 bg-amber-500/10" : "border-border bg-background"
                }`}
              >
                <label className="flex cursor-pointer items-start gap-2">
                  <Checkbox
                    checked={e.checked}
                    onCheckedChange={(v) => updateEntry(k, "checked", v === true)}
                    className="mt-0.5"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5 text-xs">
                      {e.checked && (
                        <AlertTriangle className="h-3 w-3 shrink-0 text-amber-700 dark:text-amber-300" />
                      )}
                      <span className="font-mono text-[11px]">{d.time_label}</span>
                      <span className="font-semibold">{d.medication_name}</span>
                      {d.dosage && <span className="text-muted-foreground">· {d.dosage}</span>}
                    </div>
                    {!e.checked && (
                      <p className="mt-0.5 text-[11px] italic text-muted-foreground">
                        Not administered this shift — will not be logged.
                      </p>
                    )}
                  </div>
                </label>

                {e.checked && (
                  <div className="space-y-2 pl-6">
                    <div className="grid gap-1.5">
                      <Label className="text-[11px]">Outcome *</Label>
                      <Select
                        value={e.status}
                        onValueChange={(v) => updateEntry(k, "status", v)}
                      >
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
                )}
              </div>
            );
          })}

          {/* Typed-name attestation */}
          {checkedDoses.length > 0 && allCheckedValid && (
            <>
              <div className="grid gap-1.5">
                <Label className="text-xs">Type your full name to sign *</Label>
                <Input
                  value={typedName}
                  onChange={(ev) => setTypedName(ev.target.value)}
                  placeholder="Your full name"
                  className="h-9 text-sm"
                  autoComplete="off"
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

          {checkedDoses.length === 0 && (
            <p className="text-[11px] italic text-muted-foreground">
              Check the medications you administered, or choose “No” / “Not scheduled” above.
            </p>
          )}

          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleReset}
              className="shrink-0"
            >
              Back
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={!canSave}
              onClick={handleSave}
              className="flex-1"
            >
              Save
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
