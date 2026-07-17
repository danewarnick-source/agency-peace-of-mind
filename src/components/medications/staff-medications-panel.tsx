import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-org";
import { useShiftMedDueStatus } from "@/hooks/use-shift-med-due-status";
import { logMedicationPass } from "@/lib/emar-pass.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type StatusChoice = "observed" | "refused" | "missed" | "loa";

const STATUS_LABEL: Record<StatusChoice, string> = {
  observed: "Observed",
  refused: "Refused",
  missed: "Missed",
  loa: "LOA",
};

const STATUS_BADGE_CLASS: Record<string, string> = {
  observed: "bg-emerald-100 text-emerald-800 border-emerald-300",
  refused: "bg-rose-100 text-rose-800 border-rose-300",
  missed: "bg-amber-100 text-amber-900 border-amber-300",
  loa: "bg-sky-100 text-sky-800 border-sky-300",
  omitted: "bg-amber-100 text-amber-900 border-amber-300",
};

type ClientHeader = {
  allergies: string[] | null;
  self_admin_med_support: boolean | null;
};

type MedRow = {
  id: string;
  medication_name: string;
  dosage: string | null;
  route: string | null;
  scheduled_times: string[] | null;
  is_prn: boolean;
  is_controlled: boolean;
  is_rescue: boolean;
};

type DueRow = {
  medication_id: string;
  medication_name: string;
  dosage: string | null;
  route: string | null;
  is_prn: boolean;
  is_controlled: boolean;
  is_rescue: boolean;
  time_label: string | null; // null for PRN
  scheduled_for_iso: string; // for PRN: current ISO
  logged: boolean;
  loggedStatus?: string | null;
  loggedAt?: string | null;
};

function fmtTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function fmtTimeLabel(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h)) return hhmm;
  const d = new Date();
  d.setHours(h, Number.isFinite(m) ? m : 0, 0, 0);
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export interface StaffMedicationsPanelProps {
  clientId: string;
  clientName: string;
  serviceContext?: string | null;
}

export function StaffMedicationsPanel({
  clientId,
  clientName,
  serviceContext,
}: StaffMedicationsPanelProps) {
  const { data: org } = useCurrentOrg();
  const orgId = org?.organization_id ?? null;
  const qc = useQueryClient();

  // Today's window (local)
  const { windowStart, windowEnd } = useMemo(() => {
    const s = new Date();
    s.setHours(0, 0, 0, 0);
    const e = new Date();
    e.setHours(23, 59, 59, 999);
    return { windowStart: s.toISOString(), windowEnd: e.toISOString() };
  }, []);

  // Client header (allergies + self-admin support)
  const { data: header } = useQuery({
    enabled: !!clientId,
    queryKey: ["staff-med-panel-header", clientId],
    queryFn: async (): Promise<ClientHeader> => {
      const { data, error } = await supabase
        .from("clients")
        .select("allergies, self_admin_med_support")
        .eq("id", clientId)
        .single();
      if (error) throw error;
      return data as unknown as ClientHeader;
    },
  });

  // Active meds for this client (used for PRN rows + full list)
  const { data: allMeds } = useQuery({
    enabled: !!orgId && !!clientId,
    queryKey: ["staff-med-panel-meds", orgId, clientId],
    queryFn: async (): Promise<MedRow[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("client_medications")
        .select(
          "id, medication_name, dosage, route, scheduled_times, is_prn, is_controlled, is_rescue",
        )
        .eq("organization_id", orgId!)
        .eq("client_id", clientId)
        .eq("is_active", true)
        .order("medication_name");
      if (error) throw error;
      return (data ?? []) as MedRow[];
    },
  });

  // Scheduled dose expansion + logged flag
  const due = useShiftMedDueStatus({
    organizationId: orgId,
    clientId,
    windowStart,
    windowEnd,
  });

  // Fetch today's emar_logs to enrich rows with status + recorded time
  const { data: todaysLogs } = useQuery({
    enabled: !!orgId && !!clientId,
    queryKey: ["staff-med-panel-logs", orgId, clientId, windowStart, windowEnd],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("emar_logs")
        .select("medication_id, scheduled_for, status, administered_at, created_at")
        .eq("organization_id", orgId!)
        .eq("client_id", clientId)
        .gte("scheduled_for", windowStart)
        .lte("scheduled_for", windowEnd);
      if (error) throw error;
      return (data ?? []) as Array<{
        medication_id: string;
        scheduled_for: string;
        status: string;
        administered_at: string | null;
        created_at: string | null;
      }>;
    },
  });

  const rows: DueRow[] = useMemo(() => {
    const logMap = new Map<string, { status: string; at: string | null }>();
    (todaysLogs ?? []).forEach((l) => {
      logMap.set(`${l.medication_id}|${new Date(l.scheduled_for).toISOString()}`, {
        status: l.status,
        at: l.administered_at ?? l.created_at,
      });
    });
    const scheduled: DueRow[] = due.scheduledDoses.map((d) => {
      const match = logMap.get(`${d.medication_id}|${d.scheduled_for_iso}`);
      return {
        medication_id: d.medication_id,
        medication_name: d.medication_name,
        dosage: d.dosage,
        route: d.route,
        is_prn: d.is_prn,
        is_controlled: d.is_controlled,
        is_rescue: d.is_rescue,
        time_label: d.time_label,
        scheduled_for_iso: d.scheduled_for_iso,
        logged: d.logged || !!match,
        loggedStatus: match?.status ?? null,
        loggedAt: match?.at ?? null,
      };
    });

    // Add PRN meds as separate always-available rows
    const prnRows: DueRow[] = (allMeds ?? [])
      .filter((m) => m.is_prn)
      .map((m) => ({
        medication_id: m.id,
        medication_name: m.medication_name,
        dosage: m.dosage,
        route: m.route,
        is_prn: true,
        is_controlled: m.is_controlled,
        is_rescue: m.is_rescue,
        time_label: null,
        scheduled_for_iso: new Date().toISOString(),
        logged: false,
      }));

    return [...scheduled, ...prnRows];
  }, [due.scheduledDoses, todaysLogs, allMeds]);

  const [showFull, setShowFull] = useState(false);
  const [logTarget, setLogTarget] = useState<DueRow | null>(null);

  const supportText = header?.self_admin_med_support
    ? "Self-administers with support"
    : header?.self_admin_med_support === false
      ? "Not currently cleared for self-administration"
      : null;

  const allergies = header?.allergies ?? [];

  return (
    <div className="space-y-5">
      {/* 1. Client header */}
      <Card className="p-4">
        <div className="text-lg font-semibold">{clientName}</div>
        <div className="mt-1 space-y-0.5 text-sm text-muted-foreground">
          <div>
            {allergies.length === 0
              ? "No known allergies"
              : `Allergies: ${allergies.join(", ")}`}
          </div>
          {supportText && <div>{supportText}</div>}
        </div>
      </Card>

      {/* 2. Due today */}
      <Card className="p-4">
        <h3 className="text-base font-semibold">Due today</h3>
        <div className="mt-3">
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing due right now.</p>
          ) : (
            <ul className="divide-y">
              {rows.map((row, idx) => (
                <li
                  key={`${row.medication_id}|${row.scheduled_for_iso}|${idx}`}
                  className="flex items-center justify-between gap-3 py-3"
                >
                  <div className="min-w-0">
                    <div className="font-semibold">{row.medication_name}</div>
                    <div className="text-xs text-muted-foreground">
                      {[
                        row.dosage,
                        row.route,
                        row.is_prn
                          ? "PRN"
                          : row.time_label
                            ? fmtTimeLabel(row.time_label)
                            : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  </div>
                  <div className="shrink-0">
                    {row.logged && row.loggedStatus ? (
                      <LoggedBadge status={row.loggedStatus} at={row.loggedAt} />
                    ) : (
                      <Button size="sm" onClick={() => setLogTarget(row)}>
                        Log
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* 3. Disclosure — full list */}
        <div className="mt-4">
          <button
            type="button"
            onClick={() => setShowFull((v) => !v)}
            className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            {showFull ? "Hide full medication list" : "View full medication list"}
          </button>
          {showFull && (
            <ul className="mt-3 space-y-1.5 text-sm">
              {(allMeds ?? []).length === 0 ? (
                <li className="text-muted-foreground">No medications on file.</li>
              ) : (
                (allMeds ?? []).map((m) => (
                  <li key={m.id} className="text-sm">
                    <span className="font-medium">{m.medication_name}</span>
                    <span className="text-muted-foreground">
                      {" — "}
                      {[
                        m.dosage,
                        m.route,
                        m.is_prn
                          ? "PRN"
                          : (m.scheduled_times ?? []).length > 0
                            ? (m.scheduled_times ?? [])
                                .map(fmtTimeLabel)
                                .join(", ")
                            : "No schedule",
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </li>
                ))
              )}
            </ul>
          )}
        </div>
      </Card>

      {logTarget && (
        <LogDoseDialog
          row={logTarget}
          clientId={clientId}
          serviceContext={serviceContext ?? null}
          onClose={() => setLogTarget(null)}
          onSaved={() => {
            setLogTarget(null);
            qc.invalidateQueries({ queryKey: ["shift-med-due-status"] });
            qc.invalidateQueries({ queryKey: ["staff-med-panel-logs"] });
          }}
        />
      )}
    </div>
  );
}

function LoggedBadge({ status, at }: { status: string; at: string | null }) {
  const s = status.toLowerCase();
  // Map DB status → user label. DB stores "administered" for both observed
  // self-admin and hands-on given; from staff Log flow we only produce
  // administered/refused/missed/omitted (LOA maps to omitted server-side).
  const label =
    s === "administered"
      ? "Observed"
      : s === "refused"
        ? "Refused"
        : s === "missed"
          ? "Missed"
          : s === "loa"
            ? "LOA"
            : s === "omitted"
              ? "Omitted"
              : status;
  const cls = STATUS_BADGE_CLASS[s] ?? "bg-muted text-foreground";
  return (
    <Badge variant="outline" className={cn("border", cls)}>
      {label}
      {at ? ` · ${fmtTime(at)}` : ""}
    </Badge>
  );
}

function LogDoseDialog({
  row,
  clientId,
  serviceContext,
  onClose,
  onSaved,
}: {
  row: DueRow;
  clientId: string;
  serviceContext: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [status, setStatus] = useState<StatusChoice | null>(null);
  const [timeStr, setTimeStr] = useState<string>(() => {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  });
  const [note, setNote] = useState("");
  const [typedName, setTypedName] = useState("");
  const [saving, setSaving] = useState(false);

  const savePass = useServerFn(logMedicationPass);

  // Reset on open (row change)
  useEffect(() => {
    setStatus(null);
    setNote("");
    setTypedName("");
    const d = new Date();
    setTimeStr(
      `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`,
    );
  }, [row.medication_id, row.scheduled_for_iso]);

  const attestation = useMemo(() => {
    if (!status) return "Select a status to see the attestation statement.";
    const timeLabel = fmtTimeLabel(timeStr || "00:00");
    if (status === "observed")
      return `I attest that ${row.medication_name} was observed being self-administered at ${timeLabel}, as recorded above.`;
    if (status === "refused")
      return `I attest that ${row.medication_name} was refused at ${timeLabel}, as recorded above.`;
    if (status === "missed")
      return `I attest that ${row.medication_name} was missed at ${timeLabel}, as recorded above.`;
    return `I attest that ${row.medication_name} was sent with the Person during an approved leave at ${timeLabel}, as recorded above.`;
  }, [status, timeStr, row.medication_name]);

  async function handleSave() {
    if (!status) return toast.error("Select a status.");
    if (!timeStr) return toast.error("Enter the time observed.");
    if (status !== "observed" && !note.trim())
      return toast.error("A note is required for Refused, Missed, or LOA.");
    if (!typedName.trim()) return toast.error("Type your full name to confirm.");

    // Build actualTakenAt from today + timeStr
    const [hh, mm] = timeStr.split(":").map(Number);
    const at = new Date();
    at.setHours(hh, mm, 0, 0);

    // Map to server enum
    const statusMap: Record<StatusChoice, "self_administered" | "refused" | "missed" | "loa"> = {
      observed: "self_administered",
      refused: "refused",
      missed: "missed",
      loa: "loa",
    };
    const serverStatus = statusMap[status];
    const role = status === "observed" ? "staff_observed" : "self";

    // Encode typed name into a tiny SVG so signatureDataUrl satisfies the
    // server's min(10) length check while preserving the typed-name evidence.
    const safeName = typedName.replace(/[<>&]/g, "");
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='320' height='60'><text x='10' y='40' font-family='cursive' font-size='28'>${safeName}</text></svg>`;
    const signatureDataUrl = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;

    setSaving(true);
    try {
      await savePass({
        data: {
          clientId,
          medicationId: row.medication_id,
          scheduledFor: row.scheduled_for_iso,
          scheduledTimeLabel: row.time_label,
          status: serverStatus,
          administratorRole: role,
          route: row.route ?? "PO",
          actualTakenAt: at.toISOString(),
          exceptionReason: status !== "observed" ? note.trim() : null,
          notes: status === "observed" && note.trim() ? note.trim() : null,
          signatureDataUrl,
          serviceContext: serviceContext ?? null,
          isMedicationError: false,
        },
      });
      toast.success("Dose logged.");
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not log dose.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Log {row.medication_name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* 2x2 status grid */}
          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(STATUS_LABEL) as StatusChoice[]).map((s) => (
              <Button
                key={s}
                type="button"
                variant={status === s ? "default" : "outline"}
                onClick={() => setStatus(s)}
                className="h-11"
              >
                {STATUS_LABEL[s]}
              </Button>
            ))}
          </div>

          <div>
            <Label htmlFor="time-observed">Time observed</Label>
            <Input
              id="time-observed"
              type="time"
              value={timeStr}
              onChange={(e) => setTimeStr(e.target.value)}
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="note">
              Note{" "}
              {status && status !== "observed" ? (
                <span className="text-rose-600">*</span>
              ) : (
                <span className="text-muted-foreground">(optional)</span>
              )}
            </Label>
            <Textarea
              id="note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              className="mt-1"
              placeholder={
                status && status !== "observed"
                  ? "Explain what happened."
                  : "Optional note"
              }
            />
          </div>

          <div className="rounded-md border bg-muted/40 p-3 text-sm">
            {attestation}
          </div>

          <div>
            <Label htmlFor="typed-name">Type your full name to confirm</Label>
            <Input
              id="typed-name"
              value={typedName}
              onChange={(e) => setTypedName(e.target.value)}
              autoComplete="off"
              className="mt-1"
              placeholder="Your full name"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
