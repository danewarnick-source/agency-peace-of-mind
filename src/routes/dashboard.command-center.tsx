import { useState, useMemo, useEffect } from "react";
import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useCurrentOrg } from "@/hooks/use-org";
import { RequirePermission } from "@/components/rbac-guard";
import { AgencyHealthSnapshot } from "@/components/agency-health-snapshot";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertTriangle, CheckCircle2, Clock, ShieldAlert,
  Search, BarChart3, Loader2, TimerReset, CalendarX,
  ChevronDown, ChevronUp, MapPin, FileText, User,
  Calendar, Pen, RefreshCcw, Printer, Sparkles, ArrowRight,
  Home, FolderArchive, Pill,
} from "lucide-react";
import { isEvvLockedCode } from "@/lib/evv-codes";
import { toast } from "sonner";
import { AddonLock } from "@/components/nectar/addon-lock";
import { NectarTaskCenter } from "@/components/nectar/nectar-task-center";
import { SmartImportRemindersPanel } from "@/components/smart-import/reminders-panel";

const cmdSearch = z.object({
  cc: z.enum(["urgent", "pending", "approved", "analytics", "nectar"]).optional(),
});

export const Route = createFileRoute("/dashboard/command-center")({
  head: () => ({ meta: [{ title: "Agency Command Center — HIVE" }] }),
  validateSearch: cmdSearch,
  component: CommandCenter,
});



// ─── Types ────────────────────────────────────────────────────────────────────

type IncidentReport = {
  id: string; report_number: string; client_id: string; reported_by: string;
  incident_date: string; incident_time: string; incident_types: string[];
  narrative_before: string; narrative_during: string; narrative_after: string;
  immediate_actions: string; incident_address: string | null;
  incident_city: string | null; incident_state: string | null;
  supervisor_notified: boolean; supervisor_name: string | null;
  family_notified: boolean; family_name: string | null;
  law_enforcement_called: boolean; aps_notified: boolean;
  medical_attention_required: boolean; medical_response_type: string | null;
  medical_facility: string | null; medical_outcome: string | null;
  staff_involved: { name: string; role: string }[];
  other_individuals: { name: string; relationship: string }[];
  witnesses: { name: string; contact: string }[];
  staff_signature_url: string | null;
  status: string; submitted_at: string;
  state_submission_deadline: string; state_submitted_at: string | null;
  state_confirmation_number: string | null; ai_trigger_reasons: string[];
  clients: { first_name: string; last_name: string; medicaid_id: string | null } | null;
  profiles: { full_name: string | null; email: string | null } | null;
};

type Timesheet = {
  id: string; client_id: string; staff_id: string; service_type_code: string;
  clock_in_timestamp: string; clock_out_timestamp: string | null;
  rounded_clock_in: string | null; rounded_clock_out: string | null;
  status: string; ai_compliance_status: string | null;
  ai_compliance_feedback: string | null; ai_coaching_iterations: number | null;
  is_out_of_bounds: boolean | null; outside_geofence_reason: string | null;
  gps_in_coordinates: { latitude: number | null; longitude: number | null; accuracy_meters: number | null } | null;
  gps_out_coordinates: { latitude: number | null; longitude: number | null; accuracy_meters: number | null } | null;
  shift_note_text: string | null; goals_completed: string[] | null;
  submitted_late: boolean; denial_reason: string | null;
  approved_at: string | null; approved_by: string | null;
  edit_reason?: string | null;
  review_status?: string | null;
  clients: { first_name: string; last_name: string; physical_address: string | null } | null;
  profiles: { full_name: string | null; email: string | null } | null;
};

type DailyLog = {
  id: string; client_id: string; user_id: string; log_date: string;
  narrative: string; pcsp_goals_addressed: string[]; status: string;
  ai_compliance_status: string | null; ai_compliance_feedback: string | null;
  ai_coaching_iterations: number | null;
  submitted_at: string; submitted_late: boolean; backdated: boolean;
  original_due_date: string | null; denial_reason: string | null;
  approved_at: string | null; approved_by: string | null;
  signature_data_url: string | null;
  clients: { first_name: string; last_name: string; medicaid_id: string | null } | null;
  profiles: { full_name: string | null; email: string | null } | null;
};

type OpenShift = {
  id: string; client_id: string; staff_id: string;
  service_type_code: string; clock_in_timestamp: string;
  clients: { first_name: string; last_name: string } | null;
  profiles: { full_name: string | null; email: string | null } | null;
};

type Tab = "nectar" | "urgent" | "pending" | "approved" | "analytics";
type PendingFilter = "all" | "timesheets" | "daily_logs" | "incidents";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hoursAgo(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / 3_600_000;
}
function hoursLeft(iso: string): number {
  return (new Date(iso).getTime() - Date.now()) / 3_600_000;
}
function fmtDeadline(iso: string): string {
  const h = hoursLeft(iso);
  if (h <= 0) return "⏰ OVERDUE";
  if (h < 1) return `${Math.floor(h * 60)}m remaining`;
  return `${Math.floor(h)}h ${Math.floor((h % 1) * 60)}m remaining`;
}
function deadlineColor(iso: string): string {
  const h = hoursLeft(iso);
  if (h <= 0) return "text-rose-600 font-bold";
  if (h <= 4) return "text-rose-500 font-semibold";
  if (h <= 8) return "text-amber-500 font-semibold";
  return "text-muted-foreground";
}
function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: "short", month: "short", day: "numeric", year: "numeric",
  });
}
function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function fmtDateTime(iso: string): string {
  return `${fmtDate(iso)} at ${fmtTime(iso)}`;
}
function clientName(r: { clients: { first_name: string; last_name: string } | null }): string {
  return r.clients ? `${r.clients.first_name} ${r.clients.last_name}`.trim() : "—";
}
function staffName(r: { profiles: { full_name: string | null; email: string | null } | null }): string {
  return r.profiles?.full_name ?? r.profiles?.email ?? "—";
}
/**
 * evv_timesheets has no FK to profiles, so PostgREST can't embed the staff
 * profile. Fetch the profiles for the rows' staff_ids in one query and graft
 * them on under the same `profiles` key the render helpers expect.
 */
async function attachStaffProfiles<T extends { staff_id: string | null }>(
  rows: T[],
): Promise<(T & { profiles: { full_name: string | null; email: string | null } | null })[]> {
  const ids = [...new Set(rows.map((r) => r.staff_id).filter((v): v is string => !!v))];
  const { data } = ids.length
    ? await supabase.from("profiles").select("id, full_name, email").in("id", ids)
    : { data: [] as { id: string; full_name: string | null; email: string | null }[] };
  const byId = new Map((data ?? []).map((p) => [p.id, { full_name: p.full_name, email: p.email }]));
  return rows.map((r) => ({ ...r, profiles: r.staff_id ? byId.get(r.staff_id) ?? null : null }));
}
function fmtGps(
  coords: { latitude: number | null; longitude: number | null; accuracy_meters: number | null } | null
): string {
  if (!coords?.latitude || !coords?.longitude) return "Not captured";
  const acc = coords.accuracy_meters ? ` (±${Math.round(coords.accuracy_meters)}m)` : "";
  return `${coords.latitude.toFixed(6)}, ${coords.longitude.toFixed(6)}${acc}`;
}
function mapsLink(
  coords: { latitude: number | null; longitude: number | null } | null
): string | null {
  if (!coords?.latitude || !coords?.longitude) return null;
  return `https://maps.google.com/?q=${coords.latitude},${coords.longitude}`;
}
function shiftDuration(clockIn: string, clockOut: string | null): string {
  if (!clockOut) return "Still active";
  const ms = new Date(clockOut).getTime() - new Date(clockIn).getTime();
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return `${h}h ${m}m`;
}

// ─── Reusable detail section ──────────────────────────────────────────────────

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{title}</p>
      {children}
    </div>
  );
}

function DetailBlock({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm leading-relaxed">
      {children}
    </div>
  );
}

// ─── AI Status badge ─────────────────────────────────────────────────────────

function AiBadge({ status, feedback, iterations }: {
  status: string | null; feedback: string | null; iterations: number | null;
}) {
  if (!status) return null;
  const cfg = {
    Verified: { cls: "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-500/15 dark:text-emerald-200", label: "🟢 NECTAR Verified" },
    Exception: { cls: "bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-500/15 dark:text-rose-200", label: "🔴 NECTAR Exception" },
    Flagged:   { cls: "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-500/15 dark:text-amber-200", label: "⚠️ NECTAR Flagged" },
  }[status] ?? { cls: "bg-muted text-muted-foreground border-border", label: status };

  return (
    <div className={`rounded-lg border p-3 text-xs ${cfg.cls}`}>
      <p className="font-semibold">{cfg.label}{iterations && iterations > 1 ? ` · ${iterations} coaching iterations` : ""}</p>
      {feedback && <p className="mt-1 leading-relaxed">{feedback}</p>}
    </div>
  );
}

// ─── Timesheet detail panel ───────────────────────────────────────────────────

function TimesheetDetail({
  row, onApprove, onDeny, onUnapprove, approving, denying, denialReason, setDenialReason,
}: {
  row: Timesheet;
  onApprove: () => void;
  onDeny: () => void;
  onUnapprove?: () => void;
  approving: boolean;
  denying: boolean;
  denialReason: string;
  setDenialReason: (v: string) => void;
}) {
  const inLink  = mapsLink(row.gps_in_coordinates ?? null);
  const outLink = mapsLink(row.gps_out_coordinates ?? null);
  const isApproved = row.status === "Approved";

  return (
    <div className="space-y-4 p-4 bg-muted/20 rounded-b-lg border-t border-border">

      {/* Identity strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border bg-background p-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Service Code</p>
          <p className="mt-0.5 font-mono font-bold">{row.service_type_code}</p>
        </div>
        <div className="rounded-lg border bg-background p-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Duration</p>
          <p className="mt-0.5 font-semibold">{shiftDuration(row.clock_in_timestamp, row.clock_out_timestamp)}</p>
        </div>
        <div className="rounded-lg border bg-background p-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Clock In</p>
          <p className="mt-0.5 text-xs">{fmtDateTime(row.clock_in_timestamp)}</p>
          {row.rounded_clock_in && (
            <p className="text-[10px] text-muted-foreground">Billed: {fmtTime(row.rounded_clock_in)}</p>
          )}
        </div>
        <div className="rounded-lg border bg-background p-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Clock Out</p>
          <p className="mt-0.5 text-xs">
            {row.clock_out_timestamp ? fmtDateTime(row.clock_out_timestamp) : <span className="text-amber-500 font-medium">Not clocked out</span>}
          </p>
          {row.rounded_clock_out && (
            <p className="text-[10px] text-muted-foreground">Billed: {fmtTime(row.rounded_clock_out)}</p>
          )}
        </div>
      </div>

      {/* Client info */}
      {row.clients?.physical_address && (
        <DetailSection title="Service Location">
          <DetailBlock>{row.clients.physical_address}</DetailBlock>
        </DetailSection>
      )}

      {/* EVV GPS */}
      <DetailSection title="EVV GPS Verification">
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="rounded-lg border bg-background p-3 text-xs space-y-1">
            <p className="font-semibold text-muted-foreground">Clock-In Location</p>
            <p className="font-mono">{fmtGps(row.gps_in_coordinates ?? null)}</p>
            {inLink && (
              <a href={inLink} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-primary hover:underline">
                <MapPin className="h-3 w-3" /> View on map
              </a>
            )}
          </div>
          <div className="rounded-lg border bg-background p-3 text-xs space-y-1">
            <p className="font-semibold text-muted-foreground">Clock-Out Location</p>
            <p className="font-mono">{fmtGps(row.gps_out_coordinates ?? null)}</p>
            {outLink && (
              <a href={outLink} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-primary hover:underline">
                <MapPin className="h-3 w-3" /> View on map
              </a>
            )}
          </div>
        </div>
        <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold ${
          row.is_out_of_bounds
            ? "border-rose-500/40 bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300"
            : "border-emerald-500/40 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300"
        }`}>
          {row.is_out_of_bounds ? "🔴 Outside authorized geofence" : "🟢 Within authorized geofence"}
        </div>
      </DetailSection>

      {/* Variance justification */}
      {row.outside_geofence_reason && (
        <DetailSection title="Geofence Variance Justification">
          <DetailBlock>
            <p className="whitespace-pre-wrap text-amber-900 dark:text-amber-100">{row.outside_geofence_reason}</p>
          </DetailBlock>
        </DetailSection>
      )}

      {/* PCSP goals */}
      <DetailSection title="PCSP Goals Addressed This Shift">
        {row.goals_completed?.length ? (
          <div className="flex flex-wrap gap-1.5">
            {row.goals_completed.map((g) => (
              <Badge key={g} variant="secondary" className="font-normal">{g}</Badge>
            ))}
          </div>
        ) : (
          <p className="text-xs italic text-muted-foreground">No goals recorded.</p>
        )}
      </DetailSection>

      {/* Shift narrative */}
      <DetailSection title="Shift Progress Note">
        <DetailBlock>
          {row.shift_note_text
            ? <p className="whitespace-pre-wrap">{row.shift_note_text}</p>
            : <p className="italic text-muted-foreground">No narrative recorded.</p>}
        </DetailBlock>
      </DetailSection>

      {/* NECTAR coach */}
      <AiBadge
        status={row.ai_compliance_status}
        feedback={row.ai_compliance_feedback}
        iterations={row.ai_coaching_iterations}
      />

      {/* Late submission flag */}
      {row.submitted_late && (
        <div className="rounded-lg border border-blue-500/30 bg-blue-50 p-3 text-xs dark:bg-blue-950/30">
          🕐 <strong>Late submission</strong> — this timesheet was submitted after the expected date.
        </div>
      )}

      {/* Approval metadata */}
      {isApproved && row.approved_at && (
        <DetailSection title="Approval Record">
          <DetailBlock>
            <p className="text-emerald-700 dark:text-emerald-300 font-medium">
              ✅ Approved {fmtDateTime(row.approved_at)}
            </p>
          </DetailBlock>
        </DetailSection>
      )}

      {/* Denial reason */}
      {row.denial_reason && (
        <DetailSection title="Denial Reason on File">
          <DetailBlock>
            <p className="text-rose-700 dark:text-rose-300 whitespace-pre-wrap">{row.denial_reason}</p>
          </DetailBlock>
        </DetailSection>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-2 border-t border-border pt-3">
        {!isApproved && (
          <>
            <Button size="sm" onClick={onApprove} disabled={approving}
              className="bg-emerald-600 hover:bg-emerald-700 text-white">
              {approving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              ✅ Approve
            </Button>
            <Dialog>
              <Button size="sm" variant="outline"
                className="border-rose-500/50 text-rose-700 hover:bg-rose-500/10 dark:text-rose-300"
                onClick={onDeny} disabled={denying || denialReason.trim().length < 5}>
                {denying && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                🔴 Deny
              </Button>
            </Dialog>
          </>
        )}
        {isApproved && onUnapprove && (
          <Button size="sm" variant="outline" onClick={onUnapprove}
            className="gap-1.5 text-muted-foreground hover:text-foreground">
            <RefreshCcw className="h-3.5 w-3.5" /> Reopen for Correction
          </Button>
        )}
        {row.clock_in_timestamp && (
          <a
            href={`https://maps.google.com/?q=${row.gps_in_coordinates?.latitude},${row.gps_in_coordinates?.longitude}`}
            target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition"
          >
            <MapPin className="h-3.5 w-3.5" /> Open GPS in Maps
          </a>
        )}
      </div>

      {/* Denial textarea — only shown when not approved */}
      {!isApproved && (
        <div className="grid gap-1.5">
          <Label className="text-xs">Denial reason (required to deny)</Label>
          <Textarea rows={2} value={denialReason} onChange={(e) => setDenialReason(e.target.value)}
            placeholder="Explain why this timesheet is being returned to staff…"
            className="text-xs" />
        </div>
      )}
    </div>
  );
}

// ─── Daily log detail panel ───────────────────────────────────────────────────

function DailyLogDetail({
  row, onApprove, onDeny, onUnapprove, approving, denying, denialReason, setDenialReason,
}: {
  row: DailyLog;
  onApprove: () => void;
  onDeny: () => void;
  onUnapprove?: () => void;
  approving: boolean;
  denying: boolean;
  denialReason: string;
  setDenialReason: (v: string) => void;
}) {
  const isApproved = row.status === "approved";

  return (
    <div className="space-y-4 p-4 bg-muted/20 rounded-b-lg border-t border-border">

      {/* Metadata strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-lg border bg-background p-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Service Date</p>
          <p className="mt-0.5 font-semibold text-sm">{fmtDate(row.log_date)}</p>
        </div>
        <div className="rounded-lg border bg-background p-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Submitted</p>
          <p className="mt-0.5 text-xs">{fmtDateTime(row.submitted_at)}</p>
        </div>
        <div className="rounded-lg border bg-background p-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Medicaid ID</p>
          <p className="mt-0.5 font-mono text-xs">{row.clients?.medicaid_id ?? "—"}</p>
        </div>
      </div>

      {/* Late / backdated flags */}
      {(row.submitted_late || row.backdated) && (
        <div className="rounded-lg border border-blue-500/30 bg-blue-50 p-3 text-xs space-y-1 dark:bg-blue-950/30">
          {row.backdated && (
            <p>📅 <strong>Backdated entry</strong> — service date was {fmtDate(row.log_date)},
            submitted {fmtDateTime(row.submitted_at)}.</p>
          )}
          {row.submitted_late && (
            <p>🕐 <strong>Late submission</strong> — submitted after the expected due date.</p>
          )}
          <p className="text-muted-foreground">
            Disclosed for admin awareness. Documentation is complete and auditable.
          </p>
        </div>
      )}

      {/* PCSP goals */}
      <DetailSection title="PCSP Goals Addressed Today">
        {row.pcsp_goals_addressed?.length ? (
          <div className="flex flex-wrap gap-1.5">
            {row.pcsp_goals_addressed.map((g) => (
              <Badge key={g} variant="secondary" className="font-normal">{g}</Badge>
            ))}
          </div>
        ) : (
          <p className="text-xs italic text-muted-foreground">No goals recorded.</p>
        )}
      </DetailSection>

      {/* Narrative */}
      <DetailSection title="Daily Progress Narrative">
        <DetailBlock>
          <p className="whitespace-pre-wrap">{row.narrative}</p>
        </DetailBlock>
        <p className="text-[10px] text-muted-foreground mt-1">
          Word count: {row.narrative.trim().split(/\s+/).filter(Boolean).length}
        </p>
      </DetailSection>

      {/* NECTAR coach */}
      <AiBadge
        status={row.ai_compliance_status}
        feedback={row.ai_compliance_feedback}
        iterations={row.ai_coaching_iterations}
      />

      {/* Signature */}
      <DetailSection title="Caregiver Signature">
        {row.signature_data_url ? (
          <div className="overflow-hidden rounded-lg border border-border bg-white p-2">
            <img src={row.signature_data_url} alt="Caregiver signature"
              className="max-h-24 w-full object-contain" />
          </div>
        ) : (
          <p className="text-xs italic text-muted-foreground">No signature captured.</p>
        )}
      </DetailSection>

      {/* Approval record */}
      {isApproved && row.approved_at && (
        <DetailSection title="Approval Record">
          <DetailBlock>
            <p className="text-emerald-700 dark:text-emerald-300 font-medium">
              ✅ Approved for billing {fmtDateTime(row.approved_at)}
            </p>
          </DetailBlock>
        </DetailSection>
      )}

      {/* Denial reason */}
      {row.denial_reason && (
        <DetailSection title="Denial Reason on File">
          <DetailBlock>
            <p className="text-rose-700 dark:text-rose-300 whitespace-pre-wrap">{row.denial_reason}</p>
          </DetailBlock>
        </DetailSection>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-2 border-t border-border pt-3">
        {!isApproved && (
          <>
            <Button size="sm" onClick={onApprove} disabled={approving}
              className="bg-emerald-600 hover:bg-emerald-700 text-white">
              {approving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              ✅ Approve for Billing
            </Button>
            <Button size="sm" variant="outline"
              className="border-rose-500/50 text-rose-700 hover:bg-rose-500/10 dark:text-rose-300"
              onClick={onDeny} disabled={denying || denialReason.trim().length < 5}>
              {denying && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              🔴 Deny &amp; Return
            </Button>
          </>
        )}
        {isApproved && onUnapprove && (
          <Button size="sm" variant="outline" onClick={onUnapprove}
            className="gap-1.5 text-muted-foreground hover:text-foreground">
            <RefreshCcw className="h-3.5 w-3.5" /> Reopen for Correction
          </Button>
        )}
        <button type="button" onClick={() => window.print()}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition">
          <Printer className="h-3.5 w-3.5" /> Print Record
        </button>
      </div>

      {/* Denial textarea */}
      {!isApproved && (
        <div className="grid gap-1.5">
          <Label className="text-xs">Denial reason (required to deny)</Label>
          <Textarea rows={2} value={denialReason} onChange={(e) => setDenialReason(e.target.value)}
            placeholder="Explain why this log is being returned to the caregiver…"
            className="text-xs" />
        </div>
      )}
    </div>
  );
}

// ─── Incident detail dialog ───────────────────────────────────────────────────

function IncidentDetailDialog({
  inc, stateRefNum, setStateRefNum, onSubmitState, submitting, onClose,
}: {
  inc: IncidentReport | null;
  stateRefNum: string;
  setStateRefNum: (v: string) => void;
  onSubmitState: () => void;
  submitting: boolean;
  onClose: () => void;
}) {
  if (!inc) return null;
  const isSubmitted = inc.status !== "Pending_Admin_Review";

  return (
    <Dialog open={!!inc} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-rose-500" />
            Incident Report {inc.report_number}
          </DialogTitle>
          <DialogDescription>
            {clientName(inc)} · Filed by {staffName(inc)} · {fmtDateTime(inc.submitted_at)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Deadline / status */}
          {!isSubmitted && (
            <div className={`rounded-lg border p-3 text-sm font-semibold ${deadlineColor(inc.state_submission_deadline)}`}>
              ⏱ State submission deadline: {fmtDeadline(inc.state_submission_deadline)}
            </div>
          )}
          {isSubmitted && (
            <div className="rounded-lg border border-emerald-500/40 bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200">
              ✅ Submitted to state {inc.state_submitted_at ? fmtDateTime(inc.state_submitted_at) : ""}
              {inc.state_confirmation_number && (
                <span className="ml-2 font-mono text-xs">Ref: {inc.state_confirmation_number}</span>
              )}
            </div>
          )}

          {/* Event identity */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Incident Date</p>
              <p className="mt-0.5 font-semibold text-sm">{fmtDate(inc.incident_date)}</p>
            </div>
            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Time of Incident</p>
              <p className="mt-0.5 font-semibold text-sm">{inc.incident_time}</p>
            </div>
            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Client Medicaid ID</p>
              <p className="mt-0.5 font-mono text-xs">{inc.clients?.medicaid_id ?? "—"}</p>
            </div>
          </div>

          {/* Classification */}
          {inc.incident_types?.length > 0 && (
            <DetailSection title="Incident Classification">
              <div className="flex flex-wrap gap-1.5">
                {inc.incident_types.map((t) => (
                  <Badge key={t} className="bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-200">{t}</Badge>
                ))}
              </div>
            </DetailSection>
          )}

          {/* Location */}
          {(inc.incident_address || inc.incident_city) && (
            <DetailSection title="Location of Incident">
              <DetailBlock>
                <p>{[inc.incident_address, inc.incident_city, inc.incident_state].filter(Boolean).join(", ")}</p>
              </DetailBlock>
            </DetailSection>
          )}

          {/* People involved */}
          {(inc.staff_involved?.length > 0 || inc.other_individuals?.length > 0 || inc.witnesses?.length > 0) && (
            <DetailSection title="People Involved">
              <div className="space-y-2">
                {inc.staff_involved?.map((s, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <User className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="font-medium">{s.name}</span>
                    <Badge variant="secondary" className="text-[10px]">{s.role}</Badge>
                  </div>
                ))}
                {inc.other_individuals?.map((p, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <User className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="font-medium">{p.name}</span>
                    <Badge variant="outline" className="text-[10px]">{p.relationship}</Badge>
                  </div>
                ))}
                {inc.witnesses?.map((w, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                    <FileText className="h-3.5 w-3.5" />
                    <span>Witness: {w.name}{w.contact ? ` · ${w.contact}` : ""}</span>
                  </div>
                ))}
              </div>
            </DetailSection>
          )}

          {/* Narratives */}
          {inc.narrative_before && (
            <DetailSection title="Before the Incident — Antecedents &amp; Context">
              <DetailBlock><p className="whitespace-pre-wrap">{inc.narrative_before}</p></DetailBlock>
            </DetailSection>
          )}
          {inc.narrative_during && (
            <DetailSection title="During the Incident — Sequence of Events">
              <DetailBlock><p className="whitespace-pre-wrap">{inc.narrative_during}</p></DetailBlock>
            </DetailSection>
          )}
          {inc.narrative_after && (
            <DetailSection title="After the Incident — Resolution &amp; Current Status">
              <DetailBlock><p className="whitespace-pre-wrap">{inc.narrative_after}</p></DetailBlock>
            </DetailSection>
          )}
          {inc.immediate_actions && (
            <DetailSection title="Immediate Actions Taken by Staff">
              <DetailBlock><p className="whitespace-pre-wrap">{inc.immediate_actions}</p></DetailBlock>
            </DetailSection>
          )}

          {/* Medical */}
          {inc.medical_attention_required && (
            <DetailSection title="Medical Response">
              <DetailBlock>
                <p><span className="font-medium">Type:</span> {inc.medical_response_type ?? "—"}</p>
                {inc.medical_facility && <p><span className="font-medium">Facility:</span> {inc.medical_facility}</p>}
                {inc.medical_outcome && <p><span className="font-medium">Outcome:</span> {inc.medical_outcome}</p>}
              </DetailBlock>
            </DetailSection>
          )}

          {/* Notifications made */}
          <DetailSection title="Notifications Made by Staff">
            <div className="grid grid-cols-2 gap-2 text-xs">
              {[
                { label: "Supervisor notified", val: inc.supervisor_notified, name: inc.supervisor_name },
                { label: "Family/guardian notified", val: inc.family_notified, name: inc.family_name },
                { label: "Law enforcement called", val: inc.law_enforcement_called, name: null },
                { label: "APS/DHS notified", val: inc.aps_notified, name: null },
              ].map(({ label, val, name }) => (
                <div key={label} className={`rounded border p-2 ${val ? "border-emerald-500/30 bg-emerald-50 dark:bg-emerald-950/20" : "border-border bg-muted/20"}`}>
                  <p className={val ? "font-semibold text-emerald-700 dark:text-emerald-300" : "text-muted-foreground"}>
                    {val ? "✅" : "☐"} {label}
                  </p>
                  {name && <p className="mt-0.5 text-muted-foreground">{name}</p>}
                </div>
              ))}
            </div>
          </DetailSection>

          {/* Signature */}
          {inc.staff_signature_url && (
            <DetailSection title="Staff Signature &amp; Attestation">
              <div className="overflow-hidden rounded-lg border bg-white p-2">
                <img src={inc.staff_signature_url} alt="Staff signature"
                  className="max-h-20 w-full object-contain" />
              </div>
            </DetailSection>
          )}

          {/* State submission */}
          {!isSubmitted && (
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-3">
              <p className="text-sm font-semibold">Submit to State Database</p>
              <p className="text-xs text-muted-foreground">
                After reporting to the Utah DSPD state database, enter the confirmation
                reference number below and mark as submitted.
              </p>
              <div className="grid gap-2">
                <Label htmlFor="state-ref" className="text-xs">State confirmation / reference number (optional)</Label>
                <Input id="state-ref" value={stateRefNum} onChange={(e) => setStateRefNum(e.target.value)}
                  placeholder="e.g. DSPD-2026-00412" className="text-sm" />
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 flex-col sm:flex-col">
          <button type="button" onClick={() => window.print()}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-border px-3 py-2 text-xs text-muted-foreground hover:bg-accent transition">
            <Printer className="h-3.5 w-3.5" /> Print / Export This Report
          </button>
          {!isSubmitted && (
            <Button onClick={onSubmitState} disabled={submitting}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white">
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              ✅ Mark Submitted to State Database
            </Button>
          )}
          <Button variant="outline" className="w-full" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Expandable row wrapper ───────────────────────────────────────────────────

function ExpandableRow({
  id, summary, children, defaultOpen = false,
}: {
  id: string;
  summary: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`rounded-lg border transition-all ${open ? "border-primary/30 shadow-sm" : "border-border hover:border-primary/20"}`}>
      <button type="button" onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 p-4 text-left">
        <div className="min-w-0 flex-1">{summary}</div>
        {open
          ? <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
          : <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />}
      </button>
      {open && children}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function CommandCenter() {
  const { data: org } = useCurrentOrg();
  return (
    <RequirePermission perm="manage_users">
      {org && <CommandCenterInner orgId={org.organization_id} />}
    </RequirePermission>
  );
}

function CommandCenterInner({ orgId }: { orgId: string }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const urlSearch = useSearch({ strict: false }) as { cc?: Tab };
  const navigate = useNavigate();
  const [tab, setTabState] = useState<Tab>(urlSearch.cc ?? "urgent");
  // Keep tab in sync with URL `?cc=` so deep-links land on the right view.
  useEffect(() => {
    if (urlSearch.cc && urlSearch.cc !== tab) setTabState(urlSearch.cc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlSearch.cc]);
  const setTab = (next: Tab) => {
    setTabState(next);
    navigate({
      to: ".",
      search: (prev: Record<string, unknown>) => ({ ...prev, cc: next }),
      replace: true,
    });
  };
  const [pendingFilter, setPendingFilter] = useState<PendingFilter>("all");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [activeIncident, setActiveIncident] = useState<IncidentReport | null>(null);
  const [stateRefNum, setStateRefNum] = useState("");

  // Per-row denial reason state (keyed by record id)
  const [denialReasons, setDenialReasons] = useState<Record<string, string>>({});
  const setDenial = (id: string, v: string) =>
    setDenialReasons((p) => ({ ...p, [id]: v }));

  // ── Queries ──────────────────────────────────────────────────────────────────

  const { data: incidents = [], isLoading: incLoading } = useQuery({
    enabled: !!orgId,
    queryKey: ["cmd-incidents", orgId],
    queryFn: async (): Promise<IncidentReport[]> => {
      const { data, error } = await supabase
        .from("incident_reports")
        .select(`id, report_number, client_id, reported_by, incident_date, incident_time,
          incident_types, narrative_before, narrative_during, narrative_after, immediate_actions,
          incident_address, incident_city, incident_state,
          supervisor_notified, supervisor_name, family_notified, family_name,
          law_enforcement_called, aps_notified,
          medical_attention_required, medical_response_type, medical_facility, medical_outcome,
          staff_involved, other_individuals, witnesses, staff_signature_url,
          status, submitted_at, state_submission_deadline, state_submitted_at,
          state_confirmation_number, ai_trigger_reasons,
          clients:client_id (first_name, last_name, medicaid_id),
          profiles:reported_by (full_name, email)`)
        .eq("organization_id", orgId)
        .order("submitted_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as IncidentReport[];
    },
    refetchInterval: 60_000,
  });

  // evv_timesheets has NO FK to profiles (staff_id keys off auth.users.id),
  // so staff names are joined in JS after the fetch — never via embed.
  const tsSelect = `id, client_id, staff_id, service_type_code,
    clock_in_timestamp, clock_out_timestamp, rounded_clock_in, rounded_clock_out,
    status, ai_compliance_status, ai_compliance_feedback, ai_coaching_iterations,
    is_out_of_bounds, outside_geofence_reason,
    gps_in_coordinates, gps_out_coordinates,
    shift_note_text, goals_completed, submitted_late, denial_reason,
    approved_at, approved_by, edit_reason, review_status,
    clients:client_id (first_name, last_name, physical_address)`;

  const { data: pendingTimesheets = [], isLoading: tsLoading } = useQuery({
    enabled: !!orgId,
    queryKey: ["cmd-timesheets-pending", orgId],
    queryFn: async (): Promise<Timesheet[]> => {
      const { data, error } = await supabase
        .from("evv_timesheets").select(tsSelect)
        .eq("organization_id", orgId)
        .in("status", ["Pending", "Flagged"])
        .order("clock_in_timestamp", { ascending: false }).limit(200);
      if (error) throw error;
      return (await attachStaffProfiles((data ?? []) as unknown as { staff_id: string | null }[])) as unknown as Timesheet[];
    },
  });

  const { data: approvedTimesheets = [] } = useQuery({
    enabled: !!orgId && tab === "approved",
    queryKey: ["cmd-timesheets-approved", orgId],
    queryFn: async (): Promise<Timesheet[]> => {
      const { data, error } = await supabase
        .from("evv_timesheets").select(tsSelect)
        .eq("organization_id", orgId).eq("status", "Approved")
        .order("clock_in_timestamp", { ascending: false }).limit(300);
      if (error) throw error;
      return (await attachStaffProfiles((data ?? []) as unknown as { staff_id: string | null }[])) as unknown as Timesheet[];
    },
  });

  const dlSelect = `id, client_id, user_id, log_date, narrative, pcsp_goals_addressed,
    status, ai_compliance_status, ai_compliance_feedback, ai_coaching_iterations,
    submitted_at, submitted_late, backdated, original_due_date, denial_reason,
    approved_at, approved_by, signature_data_url,
    clients:client_id (first_name, last_name, medicaid_id),
    profiles:user_id (full_name, email)`;

  const { data: pendingLogs = [], isLoading: dlLoading } = useQuery({
    enabled: !!orgId,
    queryKey: ["cmd-logs-pending", orgId],
    queryFn: async (): Promise<DailyLog[]> => {
      const { data, error } = await supabase
        .from("daily_logs").select(dlSelect)
        .eq("organization_id", orgId).eq("status", "pending_approval")
        .order("log_date", { ascending: false }).limit(200);
      if (error) throw error;
      return (data ?? []) as unknown as DailyLog[];
    },
  });

  const { data: rejectedTimesheets = [] } = useQuery({
    enabled: !!orgId,
    queryKey: ["cmd-timesheets-rejected", orgId],
    queryFn: async (): Promise<Timesheet[]> => {
      const { data, error } = await supabase
        .from("evv_timesheets").select(tsSelect)
        .eq("organization_id", orgId).eq("status", "Rejected")
        .order("clock_in_timestamp", { ascending: false }).limit(100);
      if (error) throw error;
      return (await attachStaffProfiles((data ?? []) as unknown as { staff_id: string | null }[])) as unknown as Timesheet[];
    },
  });

  const { data: rejectedLogs = [] } = useQuery({
    enabled: !!orgId,
    queryKey: ["cmd-logs-rejected", orgId],
    queryFn: async (): Promise<DailyLog[]> => {
      const { data, error } = await supabase
        .from("daily_logs").select(dlSelect)
        .eq("organization_id", orgId).eq("status", "rejected")
        .order("log_date", { ascending: false }).limit(100);
      if (error) throw error;
      return (data ?? []) as unknown as DailyLog[];
    },
  });


  const { data: approvedLogs = [] } = useQuery({
    enabled: !!orgId && tab === "approved",
    queryKey: ["cmd-logs-approved", orgId],
    queryFn: async (): Promise<DailyLog[]> => {
      const { data, error } = await supabase
        .from("daily_logs").select(dlSelect)
        .eq("organization_id", orgId).eq("status", "approved")
        .order("log_date", { ascending: false }).limit(300);
      if (error) throw error;
      return (data ?? []) as unknown as DailyLog[];
    },
  });

  const { data: openShifts = [] } = useQuery({
    enabled: !!orgId,
    queryKey: ["cmd-open-shifts", orgId],
    queryFn: async (): Promise<OpenShift[]> => {
      const cutoff = new Date(Date.now() - 16 * 3_600_000).toISOString();
      const { data, error } = await supabase
        .from("evv_timesheets")
        .select(`id, client_id, staff_id, service_type_code, clock_in_timestamp,
          clients:client_id (first_name, last_name)`)
        .eq("organization_id", orgId).eq("status", "Active")
        .is("clock_out_timestamp", null).lt("clock_in_timestamp", cutoff)
        .order("clock_in_timestamp", { ascending: true });
      if (error) throw error;
      return (await attachStaffProfiles((data ?? []) as unknown as { staff_id: string | null }[])) as unknown as OpenShift[];
    },
    refetchInterval: 300_000,
  });

  const { data: medErrors = [] } = useQuery({
    enabled: !!orgId,
    queryKey: ["cmd-med-errors", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("emar_logs")
        .select(`
          id, client_id, medication_id, scheduled_for, status,
          exception_reason, notes, staff_name, is_medication_error,
          admin_reviewed, created_at,
          clients:client_id (first_name, last_name)
        `)
        .eq("organization_id", orgId)
        .eq("is_medication_error", true)
        .eq("admin_reviewed", false)
        .order("created_at", { ascending: false })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .limit(50) as any;
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string; client_id: string; medication_id: string;
        scheduled_for: string; status: string; exception_reason: string | null;
        notes: string | null; staff_name: string | null;
        is_medication_error: boolean; admin_reviewed: boolean; created_at: string;
        clients: { first_name: string; last_name: string } | null;
      }>;
    },
    refetchInterval: 60_000,
  });

  // ── Mutations ────────────────────────────────────────────────────────────────

  const submitToStateMut = useMutation({
    mutationFn: async ({ id, refNum }: { id: string; refNum: string }) => {
      const { error } = await supabase.from("incident_reports").update({
        status: "Submitted_To_State",
        state_submitted_at: new Date().toISOString(),
        state_submitted_by: user!.id,
        state_confirmation_number: refNum || null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("✅ Marked as submitted to state database.");
      qc.invalidateQueries({ queryKey: ["cmd-incidents", orgId] });
      setActiveIncident(null); setStateRefNum("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function makeTsMutations(id: string) {
    const approve = async () => {
      const { error } = await supabase.from("evv_timesheets").update({
        status: "Approved", approved_at: new Date().toISOString(), approved_by: user!.id,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any).eq("id", id);
      if (error) throw error;
      toast.success("Timesheet approved.");
      qc.invalidateQueries({ queryKey: ["cmd-timesheets-pending", orgId] });
      qc.invalidateQueries({ queryKey: ["cmd-timesheets-approved", orgId] });
    };
    const deny = async () => {
      const reason = denialReasons[id]?.trim();
      if (!reason || reason.length < 5) { toast.error("Please enter a denial reason."); return; }
      const { error } = await supabase.from("evv_timesheets").update({
        status: "Rejected",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        denial_reason: reason } as any).eq("id", id);
      if (error) throw error;
      toast.success("Timesheet returned to staff.");
      qc.invalidateQueries({ queryKey: ["cmd-timesheets-pending", orgId] });
      qc.invalidateQueries({ queryKey: ["cmd-timesheets-rejected", orgId] });
    };
    const unapprove = async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await supabase.from("evv_timesheets").update({ status: "Pending" } as any).eq("id", id);
      if (error) throw error;
      toast.success("Timesheet reopened for correction.");
      qc.invalidateQueries({ queryKey: ["cmd-timesheets-approved", orgId] });
      qc.invalidateQueries({ queryKey: ["cmd-timesheets-pending", orgId] });
    };
    return { approve, deny, unapprove };
  }

  function makeDlMutations(id: string) {
    const approve = async () => {
      const { error } = await supabase.from("daily_logs").update({
        status: "approved", approved_at: new Date().toISOString(), approved_by: user!.id,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any).eq("id", id);
      if (error) throw error;
      toast.success("Daily log approved.");
      qc.invalidateQueries({ queryKey: ["cmd-logs-pending", orgId] });
      qc.invalidateQueries({ queryKey: ["cmd-logs-approved", orgId] });
    };
    const deny = async () => {
      const reason = denialReasons[id]?.trim();
      if (!reason || reason.length < 5) { toast.error("Please enter a denial reason."); return; }
      const { error } = await supabase.from("daily_logs").update({
        status: "rejected", denial_reason: reason,
        denied_by: user!.id, denied_at: new Date().toISOString(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any).eq("id", id);
      if (error) throw error;
      toast.success("Daily log returned to caregiver.");
      qc.invalidateQueries({ queryKey: ["cmd-logs-pending", orgId] });
      qc.invalidateQueries({ queryKey: ["cmd-logs-rejected", orgId] });
    };
    const unapprove = async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await supabase.from("daily_logs").update({ status: "pending_approval" } as any).eq("id", id);
      if (error) throw error;
      toast.success("Daily log reopened for correction.");
      qc.invalidateQueries({ queryKey: ["cmd-logs-approved", orgId] });
      qc.invalidateQueries({ queryKey: ["cmd-logs-pending", orgId] });
    };
    return { approve, deny, unapprove };
  }

  // Per-row loading state
  const [loadingIds, setLoadingIds] = useState<Record<string, string>>({});
  const withLoading = async (id: string, key: string, fn: () => Promise<void>) => {
    setLoadingIds((p) => ({ ...p, [`${id}-${key}`]: "1" }));
    try { await fn(); } catch (e) { toast.error((e as Error).message); }
    finally { setLoadingIds((p) => { const n = { ...p }; delete n[`${id}-${key}`]; return n; }); }
  };

  // ── Derived ──────────────────────────────────────────────────────────────────

  const urgentIncidents  = incidents.filter((i) => i.status === "Pending_Admin_Review");
  const urgentTimesheets = pendingTimesheets.filter((t) => t.ai_compliance_status === "Exception" || t.is_out_of_bounds);
  const urgentCount      = urgentIncidents.length + urgentTimesheets.length + openShifts.length + medErrors.length;
  const rejectedCount    = rejectedTimesheets.length + rejectedLogs.length;
  const pendingCount     = pendingTimesheets.length + pendingLogs.length + urgentIncidents.length;

  const q = search.toLowerCase().trim();

  function filterBySearch<T extends {
    clients: { first_name: string; last_name: string } | null;
    profiles: { full_name: string | null; email: string | null } | null;
  }>(arr: T[]): T[] {
    if (!q) return arr;
    return arr.filter((r) =>
      clientName(r).toLowerCase().includes(q) ||
      staffName(r).toLowerCase().includes(q)
    );
  }

  function filterByDate<T extends { log_date?: string; clock_in_timestamp?: string; submitted_at?: string }>(arr: T[]): T[] {
    return arr.filter((r) => {
      const d = r.log_date ?? r.clock_in_timestamp ?? r.submitted_at ?? "";
      if (dateFrom && d < dateFrom) return false;
      if (dateTo && d > dateTo + "T23:59:59") return false;
      return true;
    });
  }

  const nectarCount = urgentCount + rejectedCount + pendingTimesheets.length + pendingLogs.length;
  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "nectar",    label: "🍯 NECTAR Infusion", count: nectarCount },
    { id: "urgent",    label: "🚨 Urgent",         count: urgentCount  },
    { id: "pending",   label: "📋 Pending Review",  count: pendingCount + rejectedCount },
    { id: "approved",  label: "✅ Approved Archive"                      },
    { id: "analytics", label: "📊 Analytics"                             },
  ];

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">🏢 Agency Command Center</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Daily triage desk — everything that needs your attention, in priority order.
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex flex-wrap gap-2 border-b border-border pb-3">
        {tabs.map((t) => (
          <button key={t.id} type="button" onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition ${
              tab === t.id
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}>
            {t.label}
            {t.count !== undefined && t.count > 0 && (
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                tab === t.id ? "bg-white/20 text-white"
                  : t.id === "urgent" ? "bg-rose-500 text-white"
                  : "bg-primary/15 text-primary"
              }`}>{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* ── NECTAR INFUSION ─────────────────────────────────────────────────────── */}
      {tab === "nectar" && (
        <AddonLock
          addon="nectar_infusion"
          featureName="NECTAR Infusion — Records Desk overview"
          benefit="One prioritized, plain-language list of everything that needs your attention across Command Center, EVV & Timesheets, Host Home, and Audit Zone — with deep-links straight to where each item is fixed."
        >
          <NectarInfusionView
            orgId={orgId}
            urgentIncidents={urgentIncidents}
            urgentTimesheets={urgentTimesheets}
            openShifts={openShifts}
            medErrors={medErrors}
            pendingTimesheets={pendingTimesheets}
            pendingLogs={pendingLogs}
            rejectedTimesheets={rejectedTimesheets}
            rejectedLogs={rejectedLogs}
            onJumpUrgent={() => setTab("urgent")}
            onJumpPending={() => setTab("pending")}
          />
        </AddonLock>
      )}

      {/* ── URGENT ──────────────────────────────────────────────────────────────── */}
      {tab === "urgent" && (
        <div className="space-y-6">
          {urgentCount === 0 && !incLoading && !tsLoading ? (
            <div className="space-y-4">
              <SmartImportRemindersPanel scope="admin" />
              <Card className="p-12 text-center">
                <CheckCircle2 className="mx-auto mb-3 h-12 w-12 text-emerald-500" />
                <p className="text-lg font-semibold text-emerald-700 dark:text-emerald-400">All Clear</p>
                <p className="mt-1 text-sm text-muted-foreground">No urgent items require your attention right now.</p>
              </Card>
            </div>
          ) : (
            <>
              <SmartImportRemindersPanel scope="admin" />

              {urgentIncidents.length > 0 && (
                <section>
                  <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-rose-600">

                    <ShieldAlert className="h-4 w-4" /> Incident Reports — State Submission Required
                  </h2>
                  <div className="space-y-2">
                    {urgentIncidents.map((inc) => (
                      <Card key={inc.id} className="border-l-4 border-l-rose-500 p-4 cursor-pointer hover:shadow-md transition"
                        onClick={() => { setActiveIncident(inc); setStateRefNum(""); }}>
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold">{clientName(inc)}</p>
                            <p className="text-xs text-muted-foreground">
                              {inc.report_number} · {staffName(inc)} · {fmtDateTime(inc.submitted_at)}
                            </p>
                            {inc.incident_types?.length > 0 && (
                              <div className="mt-1.5 flex flex-wrap gap-1">
                                {inc.incident_types.map((t) => (
                                  <Badge key={t} className="bg-rose-100 text-rose-800 text-[10px] dark:bg-rose-500/15 dark:text-rose-200">{t}</Badge>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="flex flex-col items-end gap-2">
                            <span className={`text-xs ${deadlineColor(inc.state_submission_deadline)}`}>
                              ⏱ {fmtDeadline(inc.state_submission_deadline)}
                            </span>
                            <Button size="sm" onClick={(e) => { e.stopPropagation(); setActiveIncident(inc); setStateRefNum(""); }}>
                              Review Full Report →
                            </Button>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                </section>
              )}

              {openShifts.length > 0 && (
                <section>
                  <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-amber-600">
                    <TimerReset className="h-4 w-4" /> Open Shifts — Staff Did Not Clock Out
                  </h2>
                  <div className="space-y-2">
                    {openShifts.map((s) => (
                      <Card key={s.id} className="border-l-4 border-l-amber-500 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="font-semibold">{staffName(s)}</p>
                            <p className="text-xs text-muted-foreground">
                              Serving {clientName(s)} · {s.service_type_code} · Clocked in {fmtDateTime(s.clock_in_timestamp)}
                            </p>
                            <p className="mt-0.5 text-xs font-medium text-amber-600">
                              {Math.floor(hoursAgo(s.clock_in_timestamp))}h open with no clock-out
                            </p>
                          </div>
                          <Link to="/dashboard/hub/documentation" search={{ tab: "records" }}
                            className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-500/20 dark:text-amber-300">
                            Manage in Records →
                          </Link>
                        </div>
                      </Card>
                    ))}
                  </div>
                </section>
              )}

              {urgentTimesheets.length > 0 && (
                <section>
                  <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-amber-600">
                    <AlertTriangle className="h-4 w-4" /> EVV Exceptions — Manual Review Required
                  </h2>
                  <div className="space-y-2">
                    {urgentTimesheets.map((t) => {
                      const { approve, deny, } = makeTsMutations(t.id);
                      return (
                        <ExpandableRow key={t.id} id={t.id}
                          summary={
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div>
                                <p className="font-semibold text-sm">{staffName(t)} → {clientName(t)}</p>
                                <p className="text-xs text-muted-foreground">
                                  {t.service_type_code} · {fmtDate(t.clock_in_timestamp)} · {shiftDuration(t.clock_in_timestamp, t.clock_out_timestamp)}
                                </p>
                              </div>
                              <div className="flex gap-1.5">
                                {t.is_out_of_bounds && <Badge className="bg-rose-100 text-rose-800 text-[10px] dark:bg-rose-500/15 dark:text-rose-200">Out of Bounds</Badge>}
                                {t.ai_compliance_status === "Exception" && <Badge className="bg-amber-100 text-amber-800 text-[10px]">NECTAR Exception</Badge>}
                              </div>
                            </div>
                          }>
                          <TimesheetDetail row={t}
                            onApprove={() => withLoading(t.id, "approve", approve)}
                            onDeny={() => withLoading(t.id, "deny", deny)}
                            approving={!!loadingIds[`${t.id}-approve`]}
                            denying={!!loadingIds[`${t.id}-deny`]}
                            denialReason={denialReasons[t.id] ?? ""}
                            setDenialReason={(v) => setDenial(t.id, v)}
                          />
                        </ExpandableRow>
                      );
                    })}
                  </div>
                </section>
              )}

              {medErrors.length > 0 && (
                <section>
                  <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-rose-600">
                    <AlertTriangle className="h-4 w-4" /> Medication Errors — Admin Review Required
                  </h2>
                  <div className="space-y-2">
                    {medErrors.map((err) => (
                      <Card key={err.id} className="border-l-4 border-l-rose-500 p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold">
                              {err.clients ? `${err.clients.first_name} ${err.clients.last_name}` : "—"}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Reported by {err.staff_name ?? "staff"} ·{" "}
                              {new Date(err.created_at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                            </p>
                            {err.exception_reason && (
                              <p className="mt-1 text-xs text-rose-700 dark:text-rose-300">{err.exception_reason}</p>
                            )}
                            {err.notes && (
                              <p className="mt-0.5 text-xs text-muted-foreground">{err.notes}</p>
                            )}
                          </div>
                          <Button
                            size="sm"
                            onClick={async () => {
                              const { error } = await supabase
                                .from("emar_logs")
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                .update({ admin_reviewed: true, admin_reviewed_by: user!.id, admin_reviewed_at: new Date().toISOString() } as any)
                                .eq("id", err.id);
                              if (error) { toast.error(error.message); return; }
                              toast.success("Medication error marked as reviewed.");
                              qc.invalidateQueries({ queryKey: ["cmd-med-errors", orgId] });
                              qc.invalidateQueries({ queryKey: ["notifications", orgId] });
                            }}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white"
                          >
                            ✅ Mark Reviewed
                          </Button>
                        </div>
                      </Card>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      )}

      {/* ── PENDING REVIEW ──────────────────────────────────────────────────────── */}
      {tab === "pending" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-[200px] flex-1">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by client or staff name…" className="pl-8 h-9 text-sm" />
            </div>
            <div className="flex gap-1.5">
              {(["all","timesheets","daily_logs","incidents"] as PendingFilter[]).map((f) => (
                <button key={f} type="button" onClick={() => setPendingFilter(f)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                    pendingFilter === f ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}>
                  {f === "all" ? "All" : f === "timesheets" ? "Timesheets" : f === "daily_logs" ? "Daily Logs" : "Incidents"}
                </button>
              ))}
            </div>
          </div>

          {/* Pending incidents */}
          {(pendingFilter === "all" || pendingFilter === "incidents") && filterBySearch(urgentIncidents).length > 0 && (
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <ShieldAlert className="h-3.5 w-3.5 text-rose-500" /> Incident Reports ({filterBySearch(urgentIncidents).length})
              </h3>
              <div className="space-y-2">
                {filterBySearch(urgentIncidents).map((inc) => (
                  <Card key={inc.id} className="border-l-4 border-l-rose-400 p-4 cursor-pointer hover:shadow-md transition"
                    onClick={() => { setActiveIncident(inc); setStateRefNum(""); }}>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-sm">{clientName(inc)}</p>
                        <p className="text-xs text-muted-foreground">{inc.report_number} · {staffName(inc)} · {fmtDate(inc.submitted_at)}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span className={`text-[11px] ${deadlineColor(inc.state_submission_deadline)}`}>
                          {fmtDeadline(inc.state_submission_deadline)}
                        </span>
                        <Badge className="bg-amber-100 text-amber-800 text-[10px] dark:bg-amber-500/15 dark:text-amber-200">Pending State</Badge>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </section>
          )}

          {/* Pending timesheets — split EVV-locked (SOW §1.12) vs internal/non-EVV */}
          {(pendingFilter === "all" || pendingFilter === "timesheets") && filterBySearch(pendingTimesheets).length > 0 && (
            <>
              {([
                { key: "evv", label: "Pending EVV Shifts", rows: filterBySearch(pendingTimesheets).filter((t) => isEvvLockedCode(t.service_type_code)) },
                { key: "internal", label: "Internal (non-EVV) pending", rows: filterBySearch(pendingTimesheets).filter((t) => !isEvvLockedCode(t.service_type_code)) },
              ] as const).map((group) => group.rows.length === 0 ? null : (
                <section key={group.key}>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" /> {group.label} ({group.rows.length})
                  </h3>
                  <div className="space-y-2">
                    {group.rows.map((t) => {
                      const { approve, deny } = makeTsMutations(t.id);
                      return (
                        <ExpandableRow key={t.id} id={t.id}
                          summary={
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div>
                                <p className="font-semibold text-sm">{staffName(t)}</p>
                                <p className="text-xs text-muted-foreground">
                                  {clientName(t)} · {t.service_type_code} · {fmtDate(t.clock_in_timestamp)} · {shiftDuration(t.clock_in_timestamp, t.clock_out_timestamp)}
                                </p>
                                {t.edit_reason && (
                                  <p className="mt-0.5 text-[11px] italic text-amber-700 dark:text-amber-300">✎ {t.edit_reason}</p>
                                )}
                              </div>
                              <div className="flex gap-1.5">
                                {t.is_out_of_bounds && <Badge className="bg-rose-100 text-rose-800 text-[10px] dark:bg-rose-500/15 dark:text-rose-200">OOB</Badge>}
                                {t.ai_compliance_status === "Exception" && <Badge className="bg-amber-100 text-amber-800 text-[10px]">NECTAR Exception</Badge>}
                                {t.submitted_late && <Badge className="bg-blue-100 text-blue-800 text-[10px]">Late</Badge>}
                                <Badge className="bg-amber-100 text-amber-800 text-[10px] dark:bg-amber-500/15 dark:text-amber-200">Pending</Badge>
                              </div>
                            </div>
                          }>
                          <TimesheetDetail row={t}
                            onApprove={() => withLoading(t.id, "approve", approve)}
                            onDeny={() => withLoading(t.id, "deny", deny)}
                            approving={!!loadingIds[`${t.id}-approve`]}
                            denying={!!loadingIds[`${t.id}-deny`]}
                            denialReason={denialReasons[t.id] ?? ""}
                            setDenialReason={(v) => setDenial(t.id, v)}
                          />
                        </ExpandableRow>
                      );
                    })}
                  </div>
                </section>
              ))}
            </>
          )}

          {/* Pending daily logs */}
          {(pendingFilter === "all" || pendingFilter === "daily_logs") && filterBySearch(pendingLogs).length > 0 && (
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5" /> HHS Daily Logs ({filterBySearch(pendingLogs).length})
              </h3>
              <div className="space-y-2">
                {filterBySearch(pendingLogs).map((l) => {
                  const { approve, deny } = makeDlMutations(l.id);
                  return (
                    <ExpandableRow key={l.id} id={l.id}
                      summary={
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="font-semibold text-sm">{staffName(l)}</p>
                            <p className="text-xs text-muted-foreground">
                              {clientName(l)} · {fmtDate(l.log_date)}
                            </p>
                          </div>
                          <div className="flex gap-1.5">
                            {l.submitted_late && <Badge className="bg-blue-100 text-blue-800 text-[10px]">Late</Badge>}
                            {l.backdated && <Badge className="bg-purple-100 text-purple-800 text-[10px]">Backdated</Badge>}
                            {l.ai_compliance_status === "Exception" && <Badge className="bg-amber-100 text-amber-800 text-[10px]">NECTAR Exception</Badge>}
                            <Badge className="bg-amber-100 text-amber-800 text-[10px] dark:bg-amber-500/15 dark:text-amber-200">Pending</Badge>
                          </div>
                        </div>
                      }>
                      <DailyLogDetail row={l}
                        onApprove={() => withLoading(l.id, "approve", approve)}
                        onDeny={() => withLoading(l.id, "deny", deny)}
                        approving={!!loadingIds[`${l.id}-approve`]}
                        denying={!!loadingIds[`${l.id}-deny`]}
                        denialReason={denialReasons[l.id] ?? ""}
                        setDenialReason={(v) => setDenial(l.id, v)}
                      />
                    </ExpandableRow>
                  );
                })}
              </div>
            </section>
          )}

          {/* Returned to Staff — rejected records awaiting correction */}
          {rejectedCount > 0 && (pendingFilter === "all" || pendingFilter === "timesheets" || pendingFilter === "daily_logs") && (
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-rose-600 flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5" />
                Returned to Staff — Awaiting Correction ({rejectedCount})
              </h3>
              <p className="mb-3 text-xs text-muted-foreground">
                These records were denied and returned. They will reappear in Pending Review once staff resubmit.
              </p>
              <div className="space-y-2">
                {(pendingFilter === "all" || pendingFilter === "timesheets") && filterBySearch(rejectedTimesheets).map((t) => {
                  const { unapprove } = makeTsMutations(t.id);
                  return (
                    <ExpandableRow key={t.id} id={t.id}
                      summary={
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="font-semibold text-sm">{staffName(t)}</p>
                            <p className="text-xs text-muted-foreground">
                              {clientName(t)} · {t.service_type_code} · {fmtDate(t.clock_in_timestamp)}
                            </p>
                            {t.denial_reason && (
                              <p className="mt-0.5 text-xs text-rose-600 dark:text-rose-400">
                                Returned: {t.denial_reason}
                              </p>
                            )}
                          </div>
                          <Badge className="bg-rose-100 text-rose-800 text-[10px] dark:bg-rose-500/15 dark:text-rose-200">
                            Returned to Staff
                          </Badge>
                        </div>
                      }>
                      <TimesheetDetail row={t}
                        onApprove={() => {}}
                        onDeny={() => {}}
                        onUnapprove={() => withLoading(t.id, "unapprove", unapprove)}
                        approving={false} denying={false}
                        denialReason={denialReasons[t.id] ?? ""}
                        setDenialReason={(v) => setDenial(t.id, v)}
                      />
                    </ExpandableRow>
                  );
                })}
                {(pendingFilter === "all" || pendingFilter === "daily_logs") && filterBySearch(rejectedLogs).map((l) => {
                  const { unapprove } = makeDlMutations(l.id);
                  return (
                    <ExpandableRow key={l.id} id={l.id}
                      summary={
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="font-semibold text-sm">{staffName(l)}</p>
                            <p className="text-xs text-muted-foreground">
                              {clientName(l)} · {fmtDate(l.log_date)}
                            </p>
                            {l.denial_reason && (
                              <p className="mt-0.5 text-xs text-rose-600 dark:text-rose-400">
                                Returned: {l.denial_reason}
                              </p>
                            )}
                          </div>
                          <Badge className="bg-rose-100 text-rose-800 text-[10px] dark:bg-rose-500/15 dark:text-rose-200">
                            Returned to Caregiver
                          </Badge>
                        </div>
                      }>
                      <DailyLogDetail row={l}
                        onApprove={() => {}}
                        onDeny={() => {}}
                        onUnapprove={() => withLoading(l.id, "unapprove", unapprove)}
                        approving={false} denying={false}
                        denialReason={denialReasons[l.id] ?? ""}
                        setDenialReason={(v) => setDenial(l.id, v)}
                      />
                    </ExpandableRow>
                  );
                })}
              </div>
            </section>
          )}

          {pendingCount === 0 && !tsLoading && !dlLoading && !incLoading && (
            <Card className="p-12 text-center">
              <CheckCircle2 className="mx-auto mb-3 h-12 w-12 text-emerald-500" />
              <p className="text-lg font-semibold">Nothing pending review</p>
              <p className="mt-1 text-sm text-muted-foreground">All submitted records have been reviewed.</p>
            </Card>
          )}
        </div>
      )}

      {/* ── APPROVED ARCHIVE ────────────────────────────────────────────────────── */}
      {tab === "approved" && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-[180px] flex-1">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by client or staff…" className="pl-8 h-9 text-sm" />
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Calendar className="h-3.5 w-3.5" />
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
                className="h-9 w-36 text-xs" />
              <span>to</span>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
                className="h-9 w-36 text-xs" />
              {(dateFrom || dateTo) && (
                <button type="button" onClick={() => { setDateFrom(""); setDateTo(""); }}
                  className="text-primary hover:underline text-xs">Clear</button>
              )}
            </div>
          </div>

          {/* Approved timesheets */}
          {filterBySearch(filterByDate(approvedTimesheets)).length > 0 && (
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                Approved Timesheets ({filterBySearch(filterByDate(approvedTimesheets)).length})
              </h3>
              <div className="space-y-2">
                {filterBySearch(filterByDate(approvedTimesheets)).map((t) => {
                  const { unapprove } = makeTsMutations(t.id);
                  return (
                    <ExpandableRow key={t.id} id={t.id}
                      summary={
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="font-semibold text-sm">{staffName(t)}</p>
                            <p className="text-xs text-muted-foreground">
                              {clientName(t)} · {t.service_type_code} · {fmtDate(t.clock_in_timestamp)} · {shiftDuration(t.clock_in_timestamp, t.clock_out_timestamp)}
                            </p>
                          </div>
                          <div className="flex gap-1.5">
                            {t.is_out_of_bounds && <Badge className="bg-amber-100 text-amber-800 text-[10px]">Variance on File</Badge>}
                            <Badge className="bg-emerald-100 text-emerald-800 text-[10px] dark:bg-emerald-500/15 dark:text-emerald-200">Approved</Badge>
                          </div>
                        </div>
                      }>
                      <TimesheetDetail row={t}
                        onApprove={() => {}}
                        onDeny={() => {}}
                        onUnapprove={() => withLoading(t.id, "unapprove", unapprove)}
                        approving={false} denying={false}
                        denialReason={denialReasons[t.id] ?? ""}
                        setDenialReason={(v) => setDenial(t.id, v)}
                      />
                    </ExpandableRow>
                  );
                })}
              </div>
            </section>
          )}

          {/* Approved daily logs */}
          {filterBySearch(filterByDate(approvedLogs)).length > 0 && (
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                Approved Daily Logs ({filterBySearch(filterByDate(approvedLogs)).length})
              </h3>
              <div className="space-y-2">
                {filterBySearch(filterByDate(approvedLogs)).map((l) => {
                  const { unapprove } = makeDlMutations(l.id);
                  return (
                    <ExpandableRow key={l.id} id={l.id}
                      summary={
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="font-semibold text-sm">{staffName(l)}</p>
                            <p className="text-xs text-muted-foreground">
                              {clientName(l)} · {fmtDate(l.log_date)}
                            </p>
                          </div>
                          <div className="flex gap-1.5">
                            {l.submitted_late && <Badge className="bg-blue-100 text-blue-800 text-[10px]">Late</Badge>}
                            {l.backdated && <Badge className="bg-purple-100 text-purple-800 text-[10px]">Backdated</Badge>}
                            <Badge className="bg-emerald-100 text-emerald-800 text-[10px] dark:bg-emerald-500/15 dark:text-emerald-200">Approved</Badge>
                          </div>
                        </div>
                      }>
                      <DailyLogDetail row={l}
                        onApprove={() => {}}
                        onDeny={() => {}}
                        onUnapprove={() => withLoading(l.id, "unapprove", unapprove)}
                        approving={false} denying={false}
                        denialReason={denialReasons[l.id] ?? ""}
                        setDenialReason={(v) => setDenial(l.id, v)}
                      />
                    </ExpandableRow>
                  );
                })}
              </div>
            </section>
          )}

          {filterBySearch(filterByDate(approvedTimesheets)).length === 0 &&
           filterBySearch(filterByDate(approvedLogs)).length === 0 && (
            <Card className="p-12 text-center">
              <CalendarX className="mx-auto mb-3 h-10 w-10 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">
                {search || dateFrom || dateTo ? "No records match your filters." : "No approved records yet."}
              </p>
            </Card>
          )}
        </div>
      )}

      {/* ── ANALYTICS ───────────────────────────────────────────────────────────── */}
      {tab === "analytics" && <AgencyHealthSnapshot organizationId={orgId} />}

      {/* Incident detail dialog */}
      <IncidentDetailDialog
        inc={activeIncident}
        stateRefNum={stateRefNum}
        setStateRefNum={setStateRefNum}
        onSubmitState={() => submitToStateMut.mutate({ id: activeIncident!.id, refNum: stateRefNum })}
        submitting={submitToStateMut.isPending}
        onClose={() => { setActiveIncident(null); setStateRefNum(""); }}
      />
    </div>
  );
}

// ─── NECTAR Infusion view ────────────────────────────────────────────────────

type NectarItem = {
  id: string;
  severity: "critical" | "high" | "medium";
  source: "Command Center" | "EVV & Timesheets" | "Host Home" | "Audit Zone";
  area: string;
  title: string;
  why: string;
  to?: { pathname: string; search?: Record<string, string> };
  onClick?: () => void;
};

const SEVERITY_RANK: Record<NectarItem["severity"], number> = { critical: 0, high: 1, medium: 2 };
const SEVERITY_STYLE: Record<NectarItem["severity"], string> = {
  critical: "bg-rose-100 text-rose-800 border-rose-200",
  high: "bg-amber-100 text-amber-800 border-amber-200",
  medium: "bg-blue-100 text-blue-800 border-blue-200",
};

type IncidentLite = { id: string; report_number: string; state_submission_deadline: string;
  clients: { first_name: string; last_name: string } | null };
type TsLite = { id: string; ai_compliance_status: string | null; is_out_of_bounds: boolean | null;
  outside_geofence_reason: string | null; clock_in_timestamp: string;
  clients: { first_name: string; last_name: string } | null;
  profiles: { full_name: string | null; email: string | null } | null };
type OpenShiftLite = { id: string; clock_in_timestamp: string;
  clients: { first_name: string; last_name: string } | null;
  profiles: { full_name: string | null; email: string | null } | null };
type MedErrLite = { id: string; medication_id: string;
  clients: { first_name: string; last_name: string } | null; staff_name: string | null };
type DlLite = { id: string; log_date: string;
  clients: { first_name: string; last_name: string } | null;
  profiles: { full_name: string | null; email: string | null } | null };

function NectarInfusionView(props: {
  orgId: string;
  urgentIncidents: IncidentLite[];
  urgentTimesheets: TsLite[];
  openShifts: OpenShiftLite[];
  medErrors: MedErrLite[];
  pendingTimesheets: TsLite[];
  pendingLogs: DlLite[];
  rejectedTimesheets: TsLite[];
  rejectedLogs: DlLite[];
  onJumpUrgent: () => void;
  onJumpPending: () => void;
}) {
  const [taskOpen, setTaskOpen] = useState(false);
  const [taskGoal, setTaskGoal] = useState<string>("");

  const items = useMemo<NectarItem[]>(() => {
    const out: NectarItem[] = [];
    const cn = (r: { clients: { first_name: string; last_name: string } | null }) =>
      r.clients ? `${r.clients.first_name} ${r.clients.last_name}` : "—";
    const sn = (r: { profiles: { full_name: string | null; email: string | null } | null }) =>
      r.profiles?.full_name ?? r.profiles?.email ?? "—";

    props.urgentIncidents.forEach((i) => out.push({
      id: `inc-${i.id}`, severity: "critical", source: "Command Center", area: "Incidents",
      title: `Incident ${i.report_number} — ${cn(i)}`,
      why: `State submission required by ${new Date(i.state_submission_deadline).toLocaleString()}. Until it's submitted to the state database with a confirmation number, it remains an open compliance liability.`,
      onClick: props.onJumpUrgent,
    }));
    props.openShifts.forEach((s) => out.push({
      id: `open-${s.id}`, severity: "critical", source: "Command Center", area: "Open shifts",
      title: `${sn(s)} still clocked in for ${cn(s)}`,
      why: `Clocked in over 16 hours ago without a clock-out. EVV cannot be billed until the shift is closed — review and resolve before the next payroll cycle.`,
      onClick: props.onJumpUrgent,
    }));
    props.medErrors.forEach((m) => out.push({
      id: `med-${m.id}`, severity: "critical", source: "Host Home", area: "eMAR",
      title: `Medication error reported — ${cn(m)}`,
      why: `A staff member flagged a medication event as an error. Per policy this needs admin review and a written follow-up before it can be closed.`,
      to: { pathname: "/dashboard/records-desk", search: { tab: "host-home" } },
    }));
    props.urgentTimesheets.forEach((t) => out.push({
      id: `uts-${t.id}`, severity: "high", source: "EVV & Timesheets", area: "Geofence / NECTAR flag",
      title: `${sn(t)} — ${cn(t)}`,
      why: t.outside_geofence_reason
        ? `Clock-in was outside approved locations: "${t.outside_geofence_reason}". Reconcile with attestation or flag for follow-up.`
        : `NECTAR flagged this shift's narrative. Review and either approve or return it to staff for correction.`,
      to: { pathname: "/dashboard/records-desk", search: { tab: "evv-timesheets" } },
    }));
    props.pendingTimesheets.slice(0, 25).forEach((t) => out.push({
      id: `pts-${t.id}`, severity: "medium", source: "EVV & Timesheets", area: "Pending Review",
      title: `Timesheet pending — ${sn(t)} for ${cn(t)}`,
      why: `Submitted and waiting on admin review before it can be billed.`,
      to: { pathname: "/dashboard/records-desk", search: { tab: "evv-timesheets" } },
    }));
    props.pendingLogs.slice(0, 25).forEach((l) => out.push({
      id: `pdl-${l.id}`, severity: "medium", source: "Command Center", area: "Daily Logs",
      title: `Daily log pending — ${sn(l)} for ${cn(l)}`,
      why: `Daily log submitted and waiting on admin review. Approve or return for correction.`,
      onClick: props.onJumpPending,
    }));
    props.rejectedTimesheets.forEach((t) => out.push({
      id: `rts-${t.id}`, severity: "high", source: "EVV & Timesheets", area: "Returned to staff",
      title: `Returned timesheet — ${sn(t)} for ${cn(t)}`,
      why: `Returned to caregiver for correction. Track until resubmitted so it doesn't fall off the radar.`,
      to: { pathname: "/dashboard/records-desk", search: { tab: "evv-timesheets" } },
    }));
    props.rejectedLogs.forEach((l) => out.push({
      id: `rdl-${l.id}`, severity: "high", source: "Command Center", area: "Returned daily log",
      title: `Returned daily log — ${sn(l)} for ${cn(l)}`,
      why: `Returned to caregiver for correction. Follow up to make sure it gets resubmitted and re-reviewed.`,
      onClick: props.onJumpPending,
    }));

    out.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
    return out;
  }, [props]);

  const grouped = useMemo(() => {
    const g: Record<string, NectarItem[]> = {};
    items.forEach((it) => { (g[it.source] ??= []).push(it); });
    return g;
  }, [items]);

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-[color:var(--amber-200)] bg-gradient-to-br from-[color:var(--amber-50)] to-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span
              className="mt-0.5 inline-flex h-9 w-9 items-center justify-center text-[color:var(--amber-700)]"
              style={{
                clipPath: "polygon(50% 0, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%)",
                background: "linear-gradient(135deg, var(--amber-100), var(--amber-200))",
              }}
            >
              <Sparkles className="h-4 w-4" />
            </span>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-[color:var(--amber-700)]">
                NECTAR Infusion
              </div>
              <h2 className="font-display text-lg font-bold text-[color:var(--navy-900)]">
                Everything that needs your attention, in priority order
              </h2>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                NECTAR pulls flags, pending items, and exceptions from across the entire Records Desk
                — Command Center, EVV &amp; Timesheets, Host Home, and Audit Zone — and surfaces them
                here with plain-language explanations. Click any item to jump to where it's fixed.
                NECTAR surfaces and routes; you review and decide.
              </p>
            </div>
          </div>
          <Button
            size="sm"
            onClick={() => { setTaskGoal("Walk me through the top items in my NECTAR Infusion overview"); setTaskOpen(true); }}
            className="bg-[color:var(--amber-600)] text-white hover:bg-[color:var(--amber-700)]"
          >
            <Sparkles className="mr-1 h-3.5 w-3.5" /> Guide me
          </Button>
        </div>
      </div>

      {items.length === 0 ? (
        <Card className="p-12 text-center">
          <CheckCircle2 className="mx-auto mb-3 h-12 w-12 text-emerald-500" />
          <p className="text-lg font-semibold text-emerald-700 dark:text-emerald-400">All clear</p>
          <p className="mt-1 text-sm text-muted-foreground">
            NECTAR isn't seeing anything that needs attention across the Records Desk right now.
          </p>
        </Card>
      ) : (
        <div className="space-y-5">
          {(["Command Center", "EVV & Timesheets", "Host Home", "Audit Zone"] as const).map((src) => {
            const list = grouped[src];
            if (!list || list.length === 0) return null;
            return (
              <section key={src}>
                <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {src === "Command Center" && <ShieldAlert className="h-3.5 w-3.5" />}
                  {src === "EVV & Timesheets" && <Clock className="h-3.5 w-3.5" />}
                  {src === "Host Home" && <Home className="h-3.5 w-3.5" />}
                  {src === "Audit Zone" && <FolderArchive className="h-3.5 w-3.5" />}
                  {src} <span className="text-muted-foreground/70">({list.length})</span>
                </h3>
                <div className="space-y-2">
                  {list.map((it) => (
                    <NectarItemRow
                      key={it.id}
                      item={it}
                      onGuide={() => { setTaskGoal(`Help me resolve: ${it.title}`); setTaskOpen(true); }}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <NectarTaskCenter open={taskOpen} onOpenChange={setTaskOpen} initialGoal={taskGoal} />
    </div>
  );
}

function NectarItemRow({ item, onGuide }: { item: NectarItem; onGuide: () => void }) {
  const body = (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${SEVERITY_STYLE[item.severity]}`}>
            {item.severity}
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {item.area}
          </span>
        </div>
        <p className="mt-1 font-semibold text-sm text-[color:var(--navy-900)]">{item.title}</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{item.why}</p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <span className="inline-flex items-center gap-1 text-xs font-medium text-[color:var(--amber-700)]">
          Open <ArrowRight className="h-3 w-3" />
        </span>
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onGuide(); }}
          className="inline-flex items-center gap-1 rounded-md border border-[color:var(--amber-300)] bg-white px-2 py-0.5 text-[11px] font-semibold text-[color:var(--amber-700)] hover:bg-[color:var(--amber-50)]"
        >
          <Sparkles className="h-3 w-3" /> Guide me
        </button>
      </div>
    </div>
  );
  const cardClass =
    "block rounded-lg border border-l-4 border-border bg-white p-3 shadow-sm transition hover:border-[color:var(--amber-300)] hover:shadow-md " +
    (item.severity === "critical"
      ? "border-l-rose-500"
      : item.severity === "high"
      ? "border-l-amber-500"
      : "border-l-blue-400");

  if (item.to) {
    return (
      <Link to={item.to.pathname} search={item.to.search as never} className={cardClass}>
        {body}
      </Link>
    );
  }
  return (
    <button type="button" onClick={item.onClick} className={`${cardClass} w-full text-left`}>
      {body}
    </button>
  );
}
