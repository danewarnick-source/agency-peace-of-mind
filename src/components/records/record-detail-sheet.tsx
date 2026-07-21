// Full-field record detail/edit view for Documentation > Records.
// Opened by clicking any row in the results table. Every field on the
// evv_timesheets row is editable here (not just the narrow rounded-time /
// service-code / GPS-lat-lng set the old Compliance Desk override dialog
// exposed). Edits are diffed field-by-field into edit_audit_history_log and
// stamp is_edited_by_admin / edited_by / edited_by_admin_name / edited_at —
// the same audit columns dashboard.compliance-desk.tsx's EditShiftDialog
// already writes, so both surfaces feed one shared history.
//
// The manager/admin note (manager_note_text / manager_note_by /
// manager_note_by_name / manager_note_at) is a SEPARATE field from the
// caregiver's own shift_note_text — saved by its own mutation, never mixed
// into the audit diff or the caregiver's note.
import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Loader2, History, StickyNote, UserCog } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter,
} from "@/components/ui/sheet";
import { EVV_SERVICE_CODES } from "@/lib/evv-codes";
import { toast } from "sonner";

export type AuditEntry = {
  timestamp: string;
  admin: string;
  field_changed: string;
  old_value: string;
  new_value: string;
};

export type RecordDetailRow = {
  id: string;
  staff_id: string;
  client_id: string;
  service_type_code: string;
  clock_in_timestamp: string;
  clock_out_timestamp: string | null;
  rounded_clock_in: string | null;
  rounded_clock_out: string | null;
  corrected_clock_in: string | null;
  corrected_clock_out: string | null;
  status: string | null;
  review_status: string | null;
  incident_flag: boolean | null;
  is_out_of_bounds: boolean | null;
  outside_geofence_reason: string | null;
  gps_in_bypassed: boolean | null;
  gps_in_bypass_reason: string | null;
  gps_out_bypassed: boolean | null;
  gps_out_bypass_reason: string | null;
  denial_reason: string | null;
  utah_medicaid_member_id: string | null;
  shift_note_text: string | null;
  goals_completed: string[] | null;
  shift_entry_type: string | null;
  import_source: string | null;
  is_edited_by_admin: boolean | null;
  edited_by_admin_name: string | null;
  edited_at: string | null;
  edit_audit_history_log: AuditEntry[] | null;
  manager_note_text: string | null;
  manager_note_by_name: string | null;
  manager_note_at: string | null;
  staff_name: string;
  client_name: string;
};

const STATUS_OPTIONS = ["Active", "Pending", "Approved", "Rejected", "Pending_Staff_Confirmation"];
const REVIEW_STATUS_OPTIONS = ["clean", "needs_review", "approved", "rejected"];

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  const pad = (n: number) => (n < 10 ? `0${n}` : String(n));
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fromLocalInput(v: string): string | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}
function diffVal(field: string, v: unknown): string {
  if (v == null || v === "") return "(empty)";
  if (field.includes("clock_")) return new Date(String(v)).toLocaleString();
  if (typeof v === "boolean") return v ? "true" : "false";
  return String(v);
}

export function RecordDetailSheet({
  row, organizationId, onClose,
}: {
  row: RecordDetailRow | null;
  organizationId: string | undefined;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { user } = useAuth();

  const [svc, setSvc] = useState("");
  const [clockIn, setClockIn] = useState("");
  const [clockOut, setClockOut] = useState("");
  const [roundedIn, setRoundedIn] = useState("");
  const [roundedOut, setRoundedOut] = useState("");
  const [correctedIn, setCorrectedIn] = useState("");
  const [correctedOut, setCorrectedOut] = useState("");
  const [status, setStatus] = useState("");
  const [reviewStatus, setReviewStatus] = useState("");
  const [incidentFlag, setIncidentFlag] = useState(false);
  const [outOfBounds, setOutOfBounds] = useState(false);
  const [geofenceReason, setGeofenceReason] = useState("");
  const [gpsInBypassed, setGpsInBypassed] = useState(false);
  const [gpsInBypassReason, setGpsInBypassReason] = useState("");
  const [gpsOutBypassed, setGpsOutBypassed] = useState(false);
  const [gpsOutBypassReason, setGpsOutBypassReason] = useState("");
  const [denialReason, setDenialReason] = useState("");
  const [memberId, setMemberId] = useState("");
  const [shiftNote, setShiftNote] = useState("");
  const [goals, setGoals] = useState("");

  const [managerNote, setManagerNote] = useState("");

  useEffect(() => {
    if (!row) return;
    setSvc(row.service_type_code);
    setClockIn(toLocalInput(row.clock_in_timestamp));
    setClockOut(toLocalInput(row.clock_out_timestamp));
    setRoundedIn(toLocalInput(row.rounded_clock_in));
    setRoundedOut(toLocalInput(row.rounded_clock_out));
    setCorrectedIn(toLocalInput(row.corrected_clock_in));
    setCorrectedOut(toLocalInput(row.corrected_clock_out));
    setStatus(row.status ?? "Active");
    setReviewStatus(row.review_status ?? "clean");
    setIncidentFlag(!!row.incident_flag);
    setOutOfBounds(!!row.is_out_of_bounds);
    setGeofenceReason(row.outside_geofence_reason ?? "");
    setGpsInBypassed(!!row.gps_in_bypassed);
    setGpsInBypassReason(row.gps_in_bypass_reason ?? "");
    setGpsOutBypassed(!!row.gps_out_bypassed);
    setGpsOutBypassReason(row.gps_out_bypass_reason ?? "");
    setDenialReason(row.denial_reason ?? "");
    setMemberId(row.utah_medicaid_member_id ?? "");
    setShiftNote(row.shift_note_text ?? "");
    setGoals((row.goals_completed ?? []).join(", "));
    setManagerNote(row.manager_note_text ?? "");
  }, [row]);

  const save = useMutation({
    mutationFn: async () => {
      if (!row) return;
      const adminName = (user?.user_metadata?.full_name as string | undefined) ?? user?.email ?? "Administrator";
      const nowIso = new Date().toISOString();

      const newClockIn = fromLocalInput(clockIn) ?? row.clock_in_timestamp;
      const newClockOut = fromLocalInput(clockOut);
      const newRoundedIn = fromLocalInput(roundedIn);
      const newRoundedOut = fromLocalInput(roundedOut);
      const newCorrectedIn = fromLocalInput(correctedIn);
      const newCorrectedOut = fromLocalInput(correctedOut);
      const newGoals = goals.split(",").map((g) => g.trim()).filter(Boolean);

      const audit: AuditEntry[] = [];
      const push = (field: string, oldV: unknown, newV: unknown) => {
        const a = oldV == null ? "" : String(oldV);
        const b = newV == null ? "" : String(newV);
        if (a !== b) {
          audit.push({ timestamp: nowIso, admin: adminName, field_changed: field, old_value: diffVal(field, oldV), new_value: diffVal(field, newV) });
        }
      };

      push("service_type_code", row.service_type_code, svc);
      push("clock_in_timestamp", row.clock_in_timestamp, newClockIn);
      push("clock_out_timestamp", row.clock_out_timestamp, newClockOut);
      push("rounded_clock_in", row.rounded_clock_in, newRoundedIn);
      push("rounded_clock_out", row.rounded_clock_out, newRoundedOut);
      push("corrected_clock_in", row.corrected_clock_in, newCorrectedIn);
      push("corrected_clock_out", row.corrected_clock_out, newCorrectedOut);
      push("status", row.status, status);
      push("review_status", row.review_status, reviewStatus);
      push("incident_flag", row.incident_flag, incidentFlag);
      push("is_out_of_bounds", row.is_out_of_bounds, outOfBounds);
      push("outside_geofence_reason", row.outside_geofence_reason, geofenceReason || null);
      push("gps_in_bypassed", row.gps_in_bypassed, gpsInBypassed);
      push("gps_in_bypass_reason", row.gps_in_bypass_reason, gpsInBypassReason || null);
      push("gps_out_bypassed", row.gps_out_bypassed, gpsOutBypassed);
      push("gps_out_bypass_reason", row.gps_out_bypass_reason, gpsOutBypassReason || null);
      push("denial_reason", row.denial_reason, denialReason || null);
      push("utah_medicaid_member_id", row.utah_medicaid_member_id, memberId);
      push("shift_note_text", row.shift_note_text, shiftNote || null);
      push("goals_completed", (row.goals_completed ?? []).join(", "), newGoals.join(", "));

      if (audit.length === 0) {
        toast.info("No changes to save.");
        return;
      }

      const history = [...(row.edit_audit_history_log ?? []), ...audit];

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from("evv_timesheets") as any)
        .update({
          service_type_code: svc,
          clock_in_timestamp: newClockIn,
          clock_out_timestamp: newClockOut,
          rounded_clock_in: newRoundedIn,
          rounded_clock_out: newRoundedOut,
          corrected_clock_in: newCorrectedIn,
          corrected_clock_out: newCorrectedOut,
          status,
          review_status: reviewStatus,
          incident_flag: incidentFlag,
          is_out_of_bounds: outOfBounds,
          outside_geofence_reason: geofenceReason || null,
          gps_in_bypassed: gpsInBypassed,
          gps_in_bypass_reason: gpsInBypassReason || null,
          gps_out_bypassed: gpsOutBypassed,
          gps_out_bypass_reason: gpsOutBypassReason || null,
          denial_reason: denialReason || null,
          utah_medicaid_member_id: memberId,
          shift_note_text: shiftNote || null,
          goals_completed: newGoals,
          is_edited_by_admin: true,
          edited_by: user?.id ?? null,
          edited_by_admin_name: adminName,
          edited_at: nowIso,
          edit_audit_history_log: history,
        })
        .eq("id", row.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Record updated. Edit tracked with your name and timestamp.");
      qc.invalidateQueries({ queryKey: ["records"] });
      onClose();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const saveManagerNote = useMutation({
    mutationFn: async () => {
      if (!row) return;
      const adminName = (user?.user_metadata?.full_name as string | undefined) ?? user?.email ?? "Administrator";
      const nowIso = new Date().toISOString();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from("evv_timesheets") as any)
        .update({
          manager_note_text: managerNote || null,
          manager_note_by: user?.id ?? null,
          manager_note_by_name: adminName,
          manager_note_at: nowIso,
        })
        .eq("id", row.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Manager note saved.");
      qc.invalidateQueries({ queryKey: ["records"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  if (!row) return null;
  const history = row.edit_audit_history_log ?? [];
  const isManualEntry = row.shift_entry_type === "Manual_Entry";

  return (
    <Sheet open={!!row} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle className="flex flex-wrap items-center gap-2">
            {row.staff_name} → {row.client_name}
            {isManualEntry && (
              <Badge variant="outline" className="gap-1 border-[#137182] text-[#137182]">
                <UserCog className="h-3 w-3" /> Manually entered
              </Badge>
            )}
          </SheetTitle>
          <SheetDescription>
            Every field here is editable. Saving logs your name and the exact time to this record's audit trail.
          </SheetDescription>
        </SheetHeader>

        {(row.is_edited_by_admin || row.edited_by_admin_name) && (
          <div className="mt-3 rounded-md border border-amber-300 bg-amber-50/60 px-3 py-2 text-xs text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
            Last edited by <span className="font-semibold">{row.edited_by_admin_name ?? "Administrator"}</span>
            {row.edited_at && <> on {new Date(row.edited_at).toLocaleString()}</>}.
          </div>
        )}

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label>Service code</Label>
            <Select value={svc} onValueChange={setSvc}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {EVV_SERVICE_CODES.map((c) => (
                  <SelectItem key={c.code} value={c.code}>{c.code} — {c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Clock in (raw)</Label>
            <Input type="datetime-local" value={clockIn} onChange={(e) => setClockIn(e.target.value)} />
          </div>
          <div>
            <Label>Clock out (raw)</Label>
            <Input type="datetime-local" value={clockOut} onChange={(e) => setClockOut(e.target.value)} />
          </div>
          <div>
            <Label>Rounded clock in</Label>
            <Input type="datetime-local" value={roundedIn} onChange={(e) => setRoundedIn(e.target.value)} />
          </div>
          <div>
            <Label>Rounded clock out</Label>
            <Input type="datetime-local" value={roundedOut} onChange={(e) => setRoundedOut(e.target.value)} />
          </div>
          <div>
            <Label>Corrected clock in</Label>
            <Input type="datetime-local" value={correctedIn} onChange={(e) => setCorrectedIn(e.target.value)} />
          </div>
          <div>
            <Label>Corrected clock out</Label>
            <Input type="datetime-local" value={correctedOut} onChange={(e) => setCorrectedOut(e.target.value)} />
          </div>
          <div>
            <Label>Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Review status</Label>
            <Select value={reviewStatus} onValueChange={setReviewStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {REVIEW_STATUS_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2 pt-6">
            <Checkbox id="incident" checked={incidentFlag} onCheckedChange={(v) => setIncidentFlag(!!v)} />
            <Label htmlFor="incident" className="cursor-pointer font-normal">Incident flagged</Label>
          </div>
          <div className="flex items-center gap-2 pt-6">
            <Checkbox id="oob" checked={outOfBounds} onCheckedChange={(v) => setOutOfBounds(!!v)} />
            <Label htmlFor="oob" className="cursor-pointer font-normal">Out of geofence bounds</Label>
          </div>
          <div className="sm:col-span-2">
            <Label>Geofence variance reason</Label>
            <Textarea value={geofenceReason} onChange={(e) => setGeofenceReason(e.target.value)} rows={2} />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="gpsin" checked={gpsInBypassed} onCheckedChange={(v) => setGpsInBypassed(!!v)} />
            <Label htmlFor="gpsin" className="cursor-pointer font-normal">GPS bypassed (clock-in)</Label>
          </div>
          <div>
            <Input placeholder="Bypass reason (clock-in)" value={gpsInBypassReason} onChange={(e) => setGpsInBypassReason(e.target.value)} />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="gpsout" checked={gpsOutBypassed} onCheckedChange={(v) => setGpsOutBypassed(!!v)} />
            <Label htmlFor="gpsout" className="cursor-pointer font-normal">GPS bypassed (clock-out)</Label>
          </div>
          <div>
            <Input placeholder="Bypass reason (clock-out)" value={gpsOutBypassReason} onChange={(e) => setGpsOutBypassReason(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Label>Denial reason</Label>
            <Textarea value={denialReason} onChange={(e) => setDenialReason(e.target.value)} rows={2} />
          </div>
          <div>
            <Label>Utah Medicaid member ID</Label>
            <Input value={memberId} onChange={(e) => setMemberId(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Label>Goals completed (comma-separated)</Label>
            <Input value={goals} onChange={(e) => setGoals(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Label>Caregiver's shift note</Label>
            <Textarea value={shiftNote} onChange={(e) => setShiftNote(e.target.value)} rows={3} />
          </div>
        </div>

        {history.length > 0 && (
          <div className="mt-4 rounded-lg border border-amber-500/40 bg-amber-50/40 p-3 text-xs dark:bg-amber-500/5">
            <div className="mb-1 flex items-center gap-1 font-semibold text-amber-900 dark:text-amber-200">
              <History className="h-3 w-3" /> Edit history ({history.length})
            </div>
            <ul className="max-h-32 space-y-1 overflow-auto">
              {history.slice().reverse().map((h, i) => (
                <li key={i} className="font-mono text-[11px] text-amber-950 dark:text-amber-100">
                  {new Date(h.timestamp).toLocaleString()} · {h.admin} · {h.field_changed}: {h.old_value} → {h.new_value}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Manager/admin note — deliberately separate from shift_note_text above.
            Saved with its own mutation so it never overwrites, or gets
            overwritten by, the caregiver's own note. */}
        <div className="mt-5 space-y-2 rounded-lg border border-[#137182]/30 bg-[#137182]/5 p-3">
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[#137182]">
            <StickyNote className="h-3.5 w-3.5" /> Manager / admin note
          </div>
          <p className="text-[11px] text-muted-foreground">
            Internal note for admins/managers only — never shown to the caregiver, never merged with their shift note.
          </p>
          <Textarea
            value={managerNote}
            onChange={(e) => setManagerNote(e.target.value)}
            rows={3}
            placeholder="Anything you want on file about this record…"
          />
          {row.manager_note_by_name && row.manager_note_at && (
            <p className="text-[11px] text-muted-foreground">
              Last noted by <span className="font-medium">{row.manager_note_by_name}</span> on {new Date(row.manager_note_at).toLocaleString()}.
            </p>
          )}
          <div className="flex justify-end">
            <Button size="sm" variant="outline" onClick={() => saveManagerNote.mutate()} disabled={saveManagerNote.isPending}>
              {saveManagerNote.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save manager note"}
            </Button>
          </div>
        </div>

        {isManualEntry && (
          <div className="mt-4 flex items-start gap-2 rounded-md border border-border bg-muted/30 p-2.5 text-[11px] text-muted-foreground">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            This record was entered manually (not captured by a live EVV punch). It is marked as such and excluded from being mistaken for a GPS-verified visit.
          </div>
        )}

        <SheetFooter className="mt-5">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save changes"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
