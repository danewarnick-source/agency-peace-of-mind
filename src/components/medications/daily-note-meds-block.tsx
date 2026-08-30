import { useEffect, useMemo, useState } from "react";
import { Pill } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { type PendingMedDose } from "@/components/medications/shift-med-due-check";
import { type EmarStatus } from "@/lib/emar-status";

export type DailyNoteMedication = {
  id: string;
  medication_name: string;
  dosage?: string | null;
  route?: string | null;
  scheduled_times?: string[] | null;
};

const OUTCOMES: { value: EmarStatus; label: string }[] = [
  { value: "self_administered", label: "Self administered" },
  { value: "missed", label: "Missed" },
  { value: "refused", label: "Refused" },
  { value: "loa", label: "LOA" },
];

const ATTEST =
  "I attest that I supported the client with self-administration of each medication listed. Selecting Self administered means the person took the medication themselves; I did not administer it.";

function denverYmd(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Denver",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function denverWallToIso(ymd: string, hh: number, mm: number): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  // Probe UTC then shift so the wall clock in America/Denver matches hh:mm.
  const utcGuess = Date.parse(`${ymd}T${pad(hh)}:${pad(mm)}:00Z`);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Denver",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(utcGuess));
  const gotH = Number(parts.find((p) => p.type === "hour")?.value ?? hh);
  const gotM = Number(parts.find((p) => p.type === "minute")?.value ?? mm);
  const deltaMin = (gotH * 60 + gotM) - (hh * 60 + mm);
  return new Date(utcGuess - deltaMin * 60_000).toISOString();
}

type RowState = {
  status: EmarStatus;
  why: string;
};

/**
 * HHS daily-note medications: every active med listed on the same form.
 * Default outcome takes liability off staff. Missed / Refused / LOA require why.
 */
export function DailyNoteMedsBlock({
  clientId,
  clientName,
  medications,
  onPendingDosesChange,
  onResolvedChange,
}: {
  clientId: string;
  clientName: string;
  medications: DailyNoteMedication[];
  onPendingDosesChange: (pending: PendingMedDose[]) => void;
  onResolvedChange: (resolved: boolean) => void;
}) {
  const active = useMemo(
    () => medications.filter((m) => m.id && m.medication_name),
    [medications],
  );
  const medKey = active.map((m) => m.id).join("|");
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [attested, setAttested] = useState(false);

  useEffect(() => {
    setRows((prev) => {
      const next = { ...prev };
      for (const m of active) {
        if (!next[m.id]) next[m.id] = { status: "self_administered", why: "" };
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [medKey]);

  const exceptionOk = useMemo(() => {
    return active.every((m) => {
      const r = rows[m.id];
      if (!r) return false;
      if (r.status === "self_administered") return true;
      return r.why.trim().length > 0;
    });
  }, [active, rows]);

  const resolved = active.length === 0 || (attested && exceptionOk);

  useEffect(() => {
    onResolvedChange(resolved);
  }, [resolved, onResolvedChange]);

  useEffect(() => {
    if (active.length === 0 || !attested || !exceptionOk) {
      onPendingDosesChange([]);
      return;
    }
    const ymd = denverYmd();
    const pending: PendingMedDose[] = active.map((m) => {
      const r = rows[m.id] ?? { status: "self_administered" as const, why: "" };
      const firstTime = (m.scheduled_times ?? [])[0];
      const [hhRaw, mmRaw] = String(firstTime ?? "12:00").split(":");
      const hh = Number(hhRaw);
      const mm = Number(mmRaw);
      const scheduledFor = denverWallToIso(
        ymd,
        Number.isFinite(hh) ? hh : 12,
        Number.isFinite(mm) ? mm : 0,
      );
      return {
        clientId,
        medicationId: m.id,
        scheduledFor,
        scheduledTimeLabel: firstTime ?? "daily",
        status: r.status,
        route: m.route || "PO",
        actualTakenAt: new Date().toISOString(),
        exceptionReason: r.status !== "self_administered" ? r.why.trim() : null,
        notes: null,
        signatureDataUrl: `Daily note self-admin support attestation for ${clientName}`,
        isMedicationError: false,
      };
    });
    onPendingDosesChange(pending);
  }, [active, attested, clientId, clientName, exceptionOk, onPendingDosesChange, rows]);

  if (active.length === 0) return null;

  return (
    <div className="space-y-3 rounded-xl border-2 border-amber-500/50 bg-amber-500/5 p-3 sm:p-4">
      <div className="flex items-start gap-2">
        <Pill className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300" />
        <div>
          <p className="text-sm font-semibold">Medications — {clientName}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Each medication on file. Default is Self administered (the person took it;
            you supported self-administration). Missed, Refused, or LOA need a reason.
          </p>
        </div>
      </div>

      {active.map((m) => {
        const r = rows[m.id] ?? { status: "self_administered" as const, why: "" };
        const needsWhy = r.status !== "self_administered";
        return (
          <div key={m.id} className="space-y-2 rounded-md border border-border bg-background p-2.5">
            <div className="text-sm font-semibold">
              {m.medication_name}
              {m.dosage ? (
                <span className="ml-1.5 font-normal text-muted-foreground">· {m.dosage}</span>
              ) : null}
            </div>
            <div className="grid gap-1.5">
              <Label className="text-[11px]">How was this medication handled?</Label>
              <Select
                value={r.status}
                onValueChange={(v) =>
                  setRows((prev) => ({
                    ...prev,
                    [m.id]: { ...r, status: v as EmarStatus },
                  }))
                }
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OUTCOMES.map((o) => (
                    <SelectItem key={o.value} value={o.value} className="text-sm">
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {needsWhy && (
              <div className="grid gap-1.5">
                <Label className="text-[11px]">Why was it not administered?</Label>
                <Textarea
                  rows={2}
                  value={r.why}
                  onChange={(e) =>
                    setRows((prev) => ({
                      ...prev,
                      [m.id]: { ...r, why: e.target.value },
                    }))
                  }
                  placeholder="Explain why this dose was missed, refused, or LOA."
                  maxLength={200}
                  className={`text-sm ${r.why.trim() ? "" : "border-rose-400"}`}
                />
              </div>
            )}
          </div>
        );
      })}

      <label className="flex cursor-pointer items-start gap-2 rounded-md border-2 border-primary/30 bg-primary/5 p-3 text-xs">
        <Checkbox
          checked={attested}
          onCheckedChange={(v) => setAttested(v === true)}
          className="mt-0.5"
        />
        <span>{ATTEST}</span>
      </label>
    </div>
  );
}
