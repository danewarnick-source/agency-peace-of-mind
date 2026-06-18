import { Fragment, useEffect, useMemo, useState, type MouseEvent } from "react";
import { useAuth } from "@/hooks/use-auth";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-org";
import { RequirePermission } from "@/components/rbac-guard";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Check, Pencil, MapPin, Clock, Loader2, Download, AlertTriangle, Sparkles, X, Search, Database, Inbox, FolderArchive, Briefcase, MessageSquare, Target, CheckCircle2, ShieldCheck, ShieldAlert, Bot, Calendar, User as UserIcon, Users, Zap, Dna, Filter, AlertCircle, Flag, ChevronRight, ChevronsUpDown, ChevronsDownUp } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { useAuth as useAuthHook } from "@/hooks/use-auth";
import { toast } from "sonner";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { EVV_SERVICE_CODES, evvServiceLabel, isEvvLockedCode } from "@/lib/evv-codes";
import { haversineFeet, isLikelyBadCoord, isDistanceSuspicious, formatDistanceFeet } from "@/lib/geo";
import { UtahExportDialog, EvvExportArchiveStrip } from "@/components/evv/utah-export-dialog";
import { searchTimesheetsByVector, backfillTimesheetEmbeddings } from "@/lib/vector-search.functions";
import { ResidentialDailyTab } from "@/components/residential/residential-daily-tab";
import { useNavigate } from "@tanstack/react-router";
import { Home as HomeIcon } from "lucide-react";
import { CheckboxMultiSelect } from "@/components/ui/checkbox-multi-select";
import { NectarFocusBanner } from "@/components/nectar/nectar-focus-banner";

// Rendered as the dedicated "Geofence Validation Status" column on both
// the Pending Approvals Ledger and the Approved Timesheets Archive.
// Records with an empty/null `outside_geofence_reason` are treated as a
// mathematical compliance MATCH (per the structural integration rule).
function GeofenceBadge({ row }: { row: Pick<Row, "outside_geofence_reason" | "matched_approved_location_label" | "reconciliation_status"> }) {
  const reason = row.outside_geofence_reason;
  const hasReason = !!(reason && reason.trim().length > 0);
  // Approved-location punch → MATCH with site label.
  if (!hasReason && row.matched_approved_location_label) {
    return (
      <TooltipProvider delayDuration={150}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex cursor-help items-center gap-1 whitespace-nowrap rounded-md bg-success/12 px-2 py-0.5 text-[13px] font-medium leading-none text-success">
              <ShieldCheck className="h-3.5 w-3.5" /> MATCH
            </span>
          </TooltipTrigger>
          <TooltipContent className="text-xs">Inside approved location "{row.matched_approved_location_label}".</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }
  if (!hasReason) {
    return (
      <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-md bg-success/12 px-2 py-0.5 text-[13px] font-medium leading-none text-success">
        <ShieldCheck className="h-3.5 w-3.5" /> MATCH
      </span>
    );
  }
  const status = row.reconciliation_status;
  if (status === "accepted") {
    return (
      <TooltipProvider delayDuration={150}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex cursor-help items-center gap-1 whitespace-nowrap rounded-md bg-success/12 px-2 py-0.5 text-[13px] font-medium leading-none text-success">
              <CheckCircle2 className="h-3.5 w-3.5" /> RECONCILED
            </span>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs text-xs">{reason}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }
  if (status === "corrected") {
    return (
      <TooltipProvider delayDuration={150}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex cursor-help items-center gap-1 whitespace-nowrap rounded-md bg-[#137182]/12 px-2 py-0.5 text-[13px] font-medium leading-none text-[#137182]">
              <CheckCircle2 className="h-3.5 w-3.5" /> CORRECTED
            </span>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs text-xs">Marked as a data/GPS error. {reason}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }
  if (status === "flagged") {
    return (
      <TooltipProvider delayDuration={150}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex cursor-help items-center gap-1 whitespace-nowrap rounded-md bg-destructive/12 px-2 py-0.5 text-[13px] font-medium leading-none text-destructive">
              <Flag className="h-3.5 w-3.5" /> FLAGGED
            </span>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs text-xs">{reason}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }
  // status === 'pending' (or null backfill)
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex cursor-help items-center gap-1 whitespace-nowrap rounded-md bg-warning/15 px-2 py-0.5 text-[13px] font-medium leading-none text-warning-foreground">
            <AlertCircle className="h-3.5 w-3.5" /> NEEDS RECONCILIATION
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs text-xs">{reason}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export const Route = createFileRoute("/dashboard/compliance-desk")({
  head: () => ({ meta: [{ title: "EVV & Timesheet Control — HIVE" }] }),
  validateSearch: (s: Record<string, unknown>) => ({
    focus: typeof s.focus === "string" ? s.focus : undefined,
  }),
  component: () => (
    <RequirePermission perm="manage_users">
      <ComplianceDeskPage />
    </RequirePermission>
  ),
});

export function ComplianceDeskWrapped() {
  return (
    <RequirePermission perm="manage_users">
      <ComplianceDeskPage />
    </RequirePermission>
  );
}

type Coord = { latitude: number; longitude: number; accuracy_meters: number };
type AuditEntry = {
  timestamp: string;
  admin: string;
  field_changed: string;
  old_value: string;
  new_value: string;
};
type Row = {
  id: string;
  staff_id: string;
  client_id: string;
  utah_medicaid_provider_id: string;
  utah_medicaid_member_id: string;
  service_type_code: string;
  shift_entry_type: "Client_Profile_Pass" | "General_Sidebar_Unscheduled";
  clock_in_timestamp: string;
  clock_out_timestamp: string | null;
  rounded_clock_in: string | null;
  rounded_clock_out: string | null;
  gps_in_coordinates: Coord;
  gps_out_coordinates: Coord | null;
  outside_geofence_reason: string | null;
  status: string;
  shift_note_text: string | null;
  goals_completed: string[] | null;
  is_edited_by_admin: boolean;
  edited_by_admin_name: string | null;
  edit_audit_history_log: AuditEntry[];
  ai_compliance_status: string | null;
  ai_coaching_iterations: number | null;
  ai_compliance_feedback: string | null;
  matched_approved_location_id: string | null;
  matched_approved_location_label: string | null;
  reconciliation_status: "pending" | "accepted" | "corrected" | "flagged" | null;
  reconciliation_attestation: string | null;
  reconciliation_review_notes: string | null;
  reconciliation_reviewed_by: string | null;
  reconciliation_reviewed_at: string | null;
  // ── Review-by-exception (Timeclock pass) ────────────────────────────────
  review_status: string | null;
  attested_accurate: boolean | null;
  corrected_clock_in: string | null;
  corrected_clock_out: string | null;
  edit_reason: string | null;
  edited_by: string | null;
  edited_at: string | null;
  incident_flag: boolean | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  clients: { first_name: string; last_name: string; physical_address: string | null; medicaid_id: string | null; team_id: string | null } | null;
  staff: { full_name: string | null; email: string | null } | null;
};

function effectiveIn(r: Row) { return r.rounded_clock_in ?? r.clock_in_timestamp; }
function effectiveOut(r: Row) { return r.rounded_clock_out ?? r.clock_out_timestamp; }

function fmtDuration(inIso: string, outIso: string | null) {
  if (!outIso) return "—";
  const ms = new Date(outIso).getTime() - new Date(inIso).getTime();
  const m = Math.max(0, Math.floor(ms / 60000));
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

/** Strict OpenStreetMap deep-link: centered red marker pin at street-level zoom 17. */
function osmPinLink(lat: number | null | undefined, lng: number | null | undefined): string | null {
  if (lat == null || lng == null || Number.isNaN(Number(lat)) || Number.isNaN(Number(lng))) return null;
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`;
}

function EditedByAdminBadge({ row }: { row: Row }) {
  if (!row.is_edited_by_admin) return null;
  const log = row.edit_audit_history_log ?? [];
  const last = log[log.length - 1];
  const when = last ? new Date(last.timestamp).toLocaleString() : "";
  const detail = last
    ? `Modified by ${row.edited_by_admin_name ?? last.admin} on ${when}. Changed ${last.field_changed} from ${last.old_value} to ${last.new_value}.`
    : `Modified by ${row.edited_by_admin_name ?? "Admin"}.`;
  return (
    <TooltipProvider delayDuration={120}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="ml-2 inline-flex cursor-help items-center gap-1 whitespace-nowrap rounded-md bg-warning/15 px-2 py-0.5 text-[13px] font-medium leading-none text-warning-foreground">
            <AlertTriangle className="h-3.5 w-3.5" /> Edited by admin
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs text-xs">{detail}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/** Plain-language explanation of why NECTAR flagged or cleared a shift. */
function nectarReason(row: Row): string {
  const fb = (row.ai_compliance_feedback ?? "").trim();
  if (fb) return fb;
  if (row.ai_compliance_status === "Exception") {
    const reasons: string[] = [];
    const inIso = effectiveIn(row);
    const outIso = effectiveOut(row);
    if (!outIso) {
      reasons.push("clock-out is missing");
    } else {
      const ms = new Date(outIso).getTime() - new Date(inIso).getTime();
      if (ms <= 0) reasons.push("shift duration is 0h 0m");
    }
    if (!(row.shift_note_text ?? "").trim()) reasons.push("no shift narrative was recorded");
    if (row.outside_geofence_reason) reasons.push("clock-in was outside approved locations");
    if ((row.goals_completed ?? []).length === 0) reasons.push("no PCSP goals were checkmarked");
    return reasons.length ? reasons.join("; ") : "narrative did not pass NECTAR's documentation check";
  }
  return "No documentation concerns detected in this shift.";
}

/** Per-table expand/collapse state for condensed shift rows. */
function useRowExpansion() {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const isExpanded = (id: string) => expanded.has(id);
  const toggle = (id: string) =>
    setExpanded((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const expandAll = (ids: string[]) => setExpanded(new Set(ids));
  const collapseAll = () => setExpanded(new Set());
  return { expanded, isExpanded, toggle, expandAll, collapseAll };
}

function ExpandControls({
  exp, ids,
}: { exp: ReturnType<typeof useRowExpansion>; ids: string[] }) {
  const disabled = ids.length === 0;
  return (
    <div className="flex items-center gap-1">
      <Button
        type="button" size="sm" variant="ghost"
        disabled={disabled}
        onClick={() => exp.expandAll(ids)}
        className="h-8 gap-1 text-xs"
      >
        <ChevronsUpDown className="h-3.5 w-3.5" /> Expand all
      </Button>
      <Button
        type="button" size="sm" variant="ghost"
        disabled={disabled || exp.expanded.size === 0}
        onClick={() => exp.collapseAll()}
        className="h-8 gap-1 text-xs"
      >
        <ChevronsDownUp className="h-3.5 w-3.5" /> Collapse all
      </Button>
    </div>
  );
}

function ChevronCell({ open }: { open: boolean }) {
  return (
    <TableCell className="w-8 py-1.5 pr-0 align-middle">
      <ChevronRight
        className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`}
        aria-hidden
      />
    </TableCell>
  );
}

function FlagDot({ row }: { row: Pick<Row, "ai_compliance_status"> }) {
  if (row.ai_compliance_status !== "Exception") return null;
  return (
    <span title="NECTAR flag" aria-label="NECTAR flag" className="ml-1.5 inline-flex align-middle">
      <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
    </span>
  );
}

const stopRowToggle = (e: MouseEvent) => e.stopPropagation();

/** Inline shift narrative + goals strip — visually connected to the shift row above. */
function InlineNotesRow({ row, colSpan }: { row: Row; colSpan: number }) {
  const note = (row.shift_note_text ?? "").trim();
  const goals = row.goals_completed ?? [];
  const isFlag = row.ai_compliance_status === "Exception";
  const isCleared = row.ai_compliance_status === "Verified";
  const reason = nectarReason(row);
  const accent = isFlag
    ? "border-l-destructive/70"
    : isCleared
    ? "border-l-success/60"
    : "border-l-primary/30";
  return (
    <TableRow className="border-t-0 hover:bg-transparent">
      <TableCell colSpan={colSpan} className={`border-b-2 border-b-border ${accent} border-l-[3px] bg-card/60 pt-0 pb-3`}>
        <div className="space-y-2.5 pl-1">
          {(isFlag || isCleared) && (
            <div
              className={
                "flex items-start gap-2 rounded-md px-2.5 py-1.5 text-[13px] leading-snug " +
                (isFlag
                  ? "bg-destructive/10 text-destructive"
                  : "bg-success/10 text-success")
              }
            >
              {isFlag ? (
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              ) : (
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              )}
              <div>
                <span className="font-semibold uppercase tracking-wider text-[11px]">
                  {isFlag ? "NECTAR flag" : "NECTAR cleared"}
                  {isCleared && row.ai_coaching_iterations && row.ai_coaching_iterations > 1
                    ? ` · ${row.ai_coaching_iterations}×`
                    : ""}
                </span>
                <span className="ml-2 font-normal normal-case tracking-normal text-foreground/85">
                  {reason}
                </span>
              </div>
            </div>
          )}
          <div>
            <div className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">
              <MessageSquare className="h-4 w-4" />
              Shift Note
            </div>
            <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
              {note.length > 0 ? note : <span className="italic text-muted-foreground">No narrative recorded.</span>}
            </p>
          </div>
          <div>
            <div className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">
              <Target className="h-4 w-4" />
              Goals Targeted
            </div>
            {goals.length > 0 ? (
              <div className="mt-1 flex flex-wrap gap-1.5">
                {goals.map((g, i) => (
                  <Badge key={`${row.id}-g-${i}`} variant="secondary" className="font-normal">
                    {g}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="mt-1 text-xs italic text-muted-foreground">No PCSP goals checkmarked.</p>
            )}
          </div>
        </div>
      </TableCell>
    </TableRow>
  );
}



const SELECT_COLS = "id, staff_id, client_id, utah_medicaid_provider_id, utah_medicaid_member_id, service_type_code, shift_entry_type, clock_in_timestamp, clock_out_timestamp, rounded_clock_in, rounded_clock_out, gps_in_coordinates, gps_out_coordinates, outside_geofence_reason, status, shift_note_text, goals_completed, is_edited_by_admin, edited_by_admin_name, edit_audit_history_log, ai_compliance_status, ai_coaching_iterations, ai_compliance_feedback, matched_approved_location_id, matched_approved_location_label, reconciliation_status, reconciliation_attestation, reconciliation_review_notes, reconciliation_reviewed_by, reconciliation_reviewed_at, review_status, attested_accurate, corrected_clock_in, corrected_clock_out, edit_reason, edited_by, edited_at, incident_flag, reviewed_by, reviewed_at, review_note, clients(first_name,last_name,physical_address,medicaid_id,team_id)";

async function hydrateStaff(list: Row[]) {
  const ids = Array.from(new Set(list.map((r) => r.staff_id)));
  if (!ids.length) return list;
  const { data: profiles } = await supabase.from("org_member_directory").select("id, full_name, email").in("id", ids);
  const map = new Map((profiles ?? []).filter((p) => !!p.id).map((p) => [p.id as string, p]));
  list.forEach((r) => {
    const p = map.get(r.staff_id);
    r.staff = p ? { full_name: p.full_name, email: p.email } : null;
  });
  return list;
}

// (Frontend regex constraint extractor removed — the hybrid LLM router on the
// server now parses caregiver names, client names, dates, and times directly.)



function ComplianceDeskPage() {
  const { data: org } = useCurrentOrg();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [sub, setSub] = useState<"pending" | "needs-review" | "reconcile" | "evv-archive" | "non-evv-archive" | "residential">("pending");
  const [mapOpen, setMapOpen] = useState<Row | null>(null);
  const [editRow, setEditRow] = useState<Row | null>(null);
  const [reasonRow, setReasonRow] = useState<Row | null>(null);
  const [reviewRow, setReviewRow] = useState<Row | null>(null);

  // 🤖 Hybrid AI Search — LLM routes the query into SQL filters
  // (+ optional vector match). Submission is decoupled from keystrokes:
  // nothing fires until the admin clicks "Ask NECTAR" or presses Enter.
  const [aiInput, setAiInput] = useState("");
  const [submitted, setSubmitted] = useState<{ query: string } | null>(null);
  const isSearching = submitted !== null;

  const runVectorSearch = useServerFn(searchTimesheetsByVector);
  const runBackfill = useServerFn(backfillTimesheetEmbeddings);

  const pendingQ = useQuery({
    enabled: !!org?.organization_id,
    queryKey: ["evv-pending", org?.organization_id],
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await supabase
        .from("evv_timesheets")
        .select(SELECT_COLS)
        .eq("organization_id", org!.organization_id)
        .eq("status", "Pending")
        .order("clock_in_timestamp", { ascending: false });
      if (error) throw error;
      return hydrateStaff((data ?? []) as unknown as Row[]);
    },
  });

  const approvedQ = useQuery({
    enabled: !!org?.organization_id,
    queryKey: ["evv-approved", org?.organization_id],
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await supabase
        .from("evv_timesheets")
        .select(SELECT_COLS)
        .eq("organization_id", org!.organization_id)
        .eq("status", "Approved")
        .order("clock_in_timestamp", { ascending: false })
        .limit(5000);
      if (error) throw error;
      return hydrateStaff((data ?? []) as unknown as Row[]);
    },
  });

  // Homes / teams in the org — feed the EVV-archive "Home" filter.
  const teamsQ = useQuery({
    enabled: !!org?.organization_id,
    queryKey: ["compliance-teams", org?.organization_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("teams")
        .select("id, team_name")
        .eq("organization_id", org!.organization_id)
        .order("team_name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; team_name: string }>;
    },
  });

  // Set of timesheet ids that have already been emitted in an EVV export
  // batch — drives the Billed/Held/Unbilled column + filter on the archive.
  const billedSetQ = useQuery({
    enabled: !!org?.organization_id,
    queryKey: ["compliance-billed-set", org?.organization_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("evv_export_records")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .select("timesheet_id" as any)
        .eq("organization_id", org!.organization_id);
      if (error) throw error;
      const s = new Set<string>();
      for (const r of (data ?? []) as unknown as Array<{ timesheet_id: string }>) s.add(r.timesheet_id);
      return s;
    },
  });

  const reconcileQ = useQuery({
    enabled: !!org?.organization_id,
    queryKey: ["evv-reconcile", org?.organization_id],
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await supabase
        .from("evv_timesheets")
        .select(SELECT_COLS)
        .eq("organization_id", org!.organization_id)
        .not("reconciliation_status", "is", null)
        .order("clock_in_timestamp", { ascending: false })
        .limit(500);
      if (error) throw error;
      return hydrateStaff((data ?? []) as unknown as Row[]);
    },
  });
  const reconcilePendingCount = (reconcileQ.data ?? []).filter((r) => r.reconciliation_status === "pending").length;

  // ── Supervisor review queue ──────────────────────────────────────────────
  // Surfaces every evv_timesheets row where the punch-pad's correction flow
  // sent the shift to `review_status='needs_review'` (incident_flag, ≥16h
  // shifts, or staff used the "forgot to clock out" correction). Approving
  // sets review_status='approved' (corrected times then become effective
  // for billing via effectiveBillingTimes). Rejecting requires a note and
  // sends the shift back to the caregiver as 'rejected' (excluded from
  // billable units until they resubmit).
  const needsReviewQ = useQuery({
    enabled: !!org?.organization_id,
    queryKey: ["evv-needs-review", org?.organization_id],
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await supabase
        .from("evv_timesheets")
        .select(SELECT_COLS)
        .eq("organization_id", org!.organization_id)
        .eq("review_status", "needs_review")
        .order("clock_in_timestamp", { ascending: false });
      if (error) throw error;
      return hydrateStaff((data ?? []) as unknown as Row[]);
    },
  });
  const needsReviewCount = needsReviewQ.data?.length ?? 0;

  const vectorQ = useQuery({
    enabled: isSearching && !!org?.organization_id,
    queryKey: ["evv-hybrid-search", org?.organization_id, submitted?.query],
    queryFn: async () => {
      const res = await runVectorSearch({
        data: {
          query: submitted!.query,
          organizationId: org!.organization_id,
          matchCount: 50,
        },
      });
      return res;
    },
    staleTime: 60_000,
  });

  const backfillM = useMutation({
    mutationFn: async () => {
      if (!org?.organization_id) throw new Error("No organization");
      return runBackfill({ data: { organizationId: org.organization_id, limit: 25 } });
    },
    onSuccess: (res) => {
      toast.success(`Indexed ${res.embedded} shift${res.embedded === 1 ? "" : "s"}. Remaining: ${res.remaining}.`);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const approve = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("evv_timesheets").update({ status: "Approved" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Shift approved.");
      qc.invalidateQueries({ queryKey: ["evv-pending"] });
      qc.invalidateQueries({ queryKey: ["evv-approved"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  // ── Review-by-exception actions ──────────────────────────────────────────
  const { user: reviewUser } = useAuth();
  const reviewApprove = useMutation({
    mutationFn: async (payload: { id: string; note?: string }) => {
      const patch: Record<string, unknown> = {
        review_status: "approved",
        reviewed_by: reviewUser?.id ?? null,
        reviewed_at: new Date().toISOString(),
      };
      if (payload.note && payload.note.trim()) patch.review_note = payload.note.trim();
      const { error } = await supabase
        .from("evv_timesheets")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update(patch as any)
        .eq("id", payload.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Correction approved — corrected times now bill.");
      qc.invalidateQueries({ queryKey: ["evv-needs-review"] });
      qc.invalidateQueries({ queryKey: ["evv-pending"] });
      qc.invalidateQueries({ queryKey: ["evv-approved"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const reviewReject = useMutation({
    mutationFn: async (payload: { id: string; note: string }) => {
      const note = payload.note.trim();
      if (!note) throw new Error("A reviewer note is required to reject.");
      const { error } = await supabase
        .from("evv_timesheets")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update({
          review_status: "rejected",
          reviewed_by: reviewUser?.id ?? null,
          reviewed_at: new Date().toISOString(),
          review_note: note,
        } as any)
        .eq("id", payload.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Returned to caregiver — they will see a resubmit prompt.");
      qc.invalidateQueries({ queryKey: ["evv-needs-review"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const submitAiSearch = () => {
    const q = aiInput.trim();
    if (q.length === 0) {
      toast.error("Type a question first.");
      return;
    }
    setSubmitted({ query: q });
  };
  // 🧹 Reset rule — empties results, unmounts cross-tab grid, restores tabs.
  const resetAiSearch = () => {
    setSubmitted(null);
    qc.cancelQueries({ queryKey: ["evv-hybrid-search"] });
    qc.removeQueries({ queryKey: ["evv-hybrid-search"] });
  };
  const clearAiSearch = () => {
    setAiInput("");
    resetAiSearch();
  };

  const [utahExportOpen, setUtahExportOpen] = useState(false);
  const staffNameMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of approvedQ.data ?? []) {
      if (r.staff_id) m.set(r.staff_id, r.staff?.full_name ?? r.staff?.email ?? "");
    }
    return m;
  }, [approvedQ.data]);
  const onGlobalMasterExport = () => {
    const all = approvedQ.data ?? [];
    if (!all.length) { toast.error("No approved shifts to export."); return; }
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    downloadCsv(`master_agency_ledger_${stamp}.csv`, buildMasterLedgerCsv(all));
    toast.success(`Exported ${all.length} shift${all.length === 1 ? "" : "s"} to Master Agency Ledger.`);
  };

  return (
    <div className="space-y-4">
      <NectarFocusBanner />
      <header className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">EVV & Timesheet Control</h1>
          <p className="text-sm text-muted-foreground">
            Approve EVV shifts, audit GPS punches, and export Utah DHHS billing files.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <Button onClick={() => setUtahExportOpen(true)} disabled={!org?.organization_id}>
            <Download /> Export Utah DHHS EVV CSV
          </Button>
          <Button onClick={onGlobalMasterExport} disabled={approvedQ.isLoading} variant="secondary">
            <Download /> Export Master Agency Ledger CSV
          </Button>
        </div>
      </header>

      {/* 🤖 AI Vector Search — submits ONLY on click or Enter. No keystroke parsing. */}
      <div className="space-y-1.5">
        <div
          className="group relative rounded-xl p-[1.5px] transition"
          style={{
            background: isSearching
              ? "linear-gradient(135deg, hsl(var(--primary)/0.9), hsl(280 90% 60% / 0.9), hsl(190 95% 55% / 0.9))"
              : "linear-gradient(135deg, hsl(var(--primary)/0.5), hsl(280 90% 60% / 0.4), hsl(190 95% 55% / 0.5))",
          }}
        >
          <div className="flex items-center gap-2 rounded-[10px] bg-background px-3 py-2 shadow-sm focus-within:shadow-md">
            <Sparkles className="h-4 w-4 shrink-0 text-primary" />
            <Input
              value={aiInput}
              onChange={(e) => {
                const val = e.target.value;
                setAiInput(val);
                if (val.trim().length === 0) {
                  resetAiSearch();
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  submitAiSearch();
                }
              }}
              placeholder="Search intent via Vector NECTAR… Try: 'Find shifts where they practiced money skills after 3pm last summer'"
              className="h-9 flex-1 border-0 bg-transparent px-1 text-sm shadow-none focus-visible:ring-0"
            />
            {aiInput.length > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={clearAiSearch}
                aria-label="Clear search"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
            <Button
              type="button"
              onClick={submitAiSearch}
              disabled={vectorQ.isFetching || aiInput.trim().length === 0}
              className="h-8 shrink-0 bg-gradient-to-r from-primary to-fuchsia-600 text-primary-foreground hover:opacity-90"
            >
              {vectorQ.isFetching ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Search className="mr-1.5 h-3.5 w-3.5" />
              )}
              Ask NECTAR
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 px-1">
          {isSearching ? (
            <p className="text-xs font-medium text-muted-foreground">
              Showing cross-tab query results matching your criteria…
            </p>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              Vector NECTAR scans every shift's narrative, PCSP goals, and geofence notes by meaning — no keyword match required.
            </p>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-[11px] text-muted-foreground hover:text-foreground"
            onClick={() => backfillM.mutate()}
            disabled={backfillM.isPending}
            title="Generate embeddings for shifts that haven't been indexed yet."
          >
            {backfillM.isPending ? (
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            ) : (
              <Database className="mr-1 h-3 w-3" />
            )}
            Index embeddings
          </Button>
        </div>
      </div>

      {!isSearching && (
        <nav className="inline-flex flex-wrap rounded-lg border border-border bg-card p-1 shadow-soft">
          {[
            { id: "pending" as const, label: "Pending Review", Icon: Inbox, count: undefined as number | undefined },
            { id: "needs-review" as const, label: "Needs Review", Icon: AlertTriangle, count: needsReviewCount },
            
            { id: "reconcile" as const, label: "EVV Reconciliation", Icon: AlertCircle, count: reconcilePendingCount },
            { id: "residential" as const, label: "Residential / Daily", Icon: HomeIcon, count: undefined },
            { id: "evv-archive" as const, label: "State EVV Archive", Icon: FolderArchive, count: undefined },
            { id: "non-evv-archive" as const, label: "Internal / Non-EVV Archive", Icon: Briefcase, count: undefined },
          ].map(({ id, label, Icon, count }) => (
            <button
              key={id}
              type="button"
              onClick={() => setSub(id)}
              className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition ${sub === id ? "bg-accent text-accent-foreground shadow-soft" : "text-muted-foreground hover:text-foreground"}`}
            >
              <Icon className="h-4 w-4" />
              {label}
              {count !== undefined && count > 0 && (
                <span className="ml-1 rounded-full bg-warning/20 px-1.5 py-0.5 text-[10px] font-bold text-warning-foreground">{count}</span>
              )}
            </button>
          ))}
        </nav>
      )}

      {isSearching ? (
        <UnifiedSearchResults
          query={submitted!.query}
          route={vectorQ.data?.route ?? null}
          matches={vectorQ.data?.matches ?? []}
          pending={pendingQ.data ?? []}
          approved={approvedQ.data ?? []}
          loading={vectorQ.isFetching || pendingQ.isLoading || approvedQ.isLoading}
          error={vectorQ.error as Error | null}
          onMap={setMapOpen}
          onEdit={setEditRow}
          onReason={setReasonRow}
          onApprove={(id) => approve.mutate(id)}
          approving={approve.isPending}
        />
      ) : sub === "pending" ? (
        <div className="space-y-4">
          <PendingTable
            title="Pending EVV Shifts"
            description="EVV-locked codes (SOW §1.12 — geofence + UEVV transmission)."
            rows={(pendingQ.data ?? []).filter((r) => isEvvLockedCode(r.service_type_code))}
            loading={pendingQ.isLoading}
            onMap={setMapOpen}
            onEdit={setEditRow}
            onApprove={(id) => approve.mutate(id)}
            approving={approve.isPending}
            onReason={setReasonRow}
          />
          <PendingTable
            title="Internal (non-EVV) pending"
            description="Time-capture only — payroll / service evidence, not transmitted to UEVV."
            rows={(pendingQ.data ?? []).filter((r) => !isEvvLockedCode(r.service_type_code))}
            loading={pendingQ.isLoading}
            onMap={setMapOpen}
            onEdit={setEditRow}
            onApprove={(id) => approve.mutate(id)}
            approving={approve.isPending}
            onReason={setReasonRow}
          />
        </div>
      ) : sub === "needs-review" ? (
        <NeedsReviewTable
          rows={needsReviewQ.data ?? []}
          loading={needsReviewQ.isLoading}
          onApprove={(id) => reviewApprove.mutate({ id })}
          onReject={(id, note) => reviewReject.mutate({ id, note })}
          approving={reviewApprove.isPending}
          rejecting={reviewReject.isPending}
        />
      ) : sub === "reconcile" ? (
        <ReconcileTable
          rows={reconcileQ.data ?? []}
          loading={reconcileQ.isLoading}
          onMap={setMapOpen}
          onReview={setReviewRow}
        />
      ) : sub === "residential" ? (
        <ResidentialDailyTab
          onOpenIncidents={(clientId) => {
            navigate({
              to: "/dashboard/hub/documentation",
              search: { tab: "incidents", ...(clientId ? { clientId } : {}) } as never,
            });
          }}
        />
      ) : sub === "evv-archive" ? (
        <div className="space-y-4">
          {org?.organization_id && (
            <EvvExportArchiveStrip
              organizationId={org.organization_id}
              approvedRows={(approvedQ.data ?? []).map((r) => ({
                id: r.id, service_type_code: r.service_type_code,
                clock_in_timestamp: r.clock_in_timestamp,
                outside_geofence_reason: r.outside_geofence_reason,
                clients: r.clients ? { first_name: r.clients.first_name, last_name: r.clients.last_name, medicaid_id: r.clients.medicaid_id } : null,
              }))}
              staffNameMap={staffNameMap}
              onOpenExport={() => setUtahExportOpen(true)}
            />
          )}
          <ArchiveTable
            variant="evv"
            rows={(approvedQ.data ?? []).filter((r) => isEvvLockedCode(r.service_type_code))}
            loading={approvedQ.isLoading}
            onMap={setMapOpen}
            onEdit={setEditRow}
            staffNameMap={staffNameMap}
            teams={teamsQ.data ?? []}
            billedSet={billedSetQ.data ?? null}
          />
        </div>
      ) : (
        <ArchiveTable
          variant="non-evv"
          rows={(approvedQ.data ?? []).filter((r) => !isEvvLockedCode(r.service_type_code))}
          loading={approvedQ.isLoading}
          onMap={setMapOpen}
          onEdit={setEditRow}
          staffNameMap={staffNameMap}
          teams={teamsQ.data ?? []}
          billedSet={billedSetQ.data ?? null}
        />
      )}

      <GpsMatchDialog row={mapOpen} onClose={() => setMapOpen(null)} />
      <EditShiftDialog row={editRow} onClose={() => setEditRow(null)} />
      <ReasonDialog row={reasonRow} onClose={() => setReasonRow(null)} />
      <ReviewReconciliationDialog row={reviewRow} onClose={() => setReviewRow(null)} />
      {org?.organization_id && (
        <UtahExportDialog
          open={utahExportOpen}
          onClose={() => setUtahExportOpen(false)}
          organizationId={org.organization_id}
          staffNameMap={staffNameMap}
        />
      )}
    </div>
  );
}

// 🤖 Unified vector-search results renderer.
// Receives the ranked id list from pgvector RPC and renders the corresponding
// Row objects in the existing TSheets-style split-block layout.
function UnifiedSearchResults({
  query, route, matches, pending, approved, loading, error,
  onMap, onEdit, onReason, onApprove, approving,
}: {
  query: string;
  route: {
    caregiver_name: string | null;
    client_name: string | null;
    hour_min: number | null;
    date_from: string | null;
    date_to: string | null;
    requires_semantic: boolean;
  } | null;
  matches: Array<{ id: string; similarity: number }>;
  pending: Row[];
  approved: Row[];
  loading: boolean;
  error: Error | null;
  onMap: (r: Row) => void;
  onEdit: (r: Row) => void;
  onReason: (r: Row) => void;
  onApprove: (id: string) => void;
  approving: boolean;
}) {
  const rowMap = useMemo(() => {
    const m = new Map<string, Row>();
    for (const r of pending) m.set(r.id, r);
    for (const r of approved) m.set(r.id, r);
    return m;
  }, [pending, approved]);

  const ranked = useMemo(() => {
    const out: Array<{ row: Row; similarity: number }> = [];
    for (const m of matches) {
      const row = rowMap.get(m.id);
      if (row) out.push({ row, similarity: m.similarity });
    }
    return out;
  }, [matches, rowMap]);

  const exp = useRowExpansion();
  const allIds = useMemo(() => ranked.map((r) => r.row.id), [ranked]);

  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          <Bot className="h-4 w-4" /> Vector NECTAR Cross-Tab Results
        </h2>
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          <Badge variant="secondary" className="font-mono max-w-[260px] truncate" title={query}>
            {query}
          </Badge>
          {route?.caregiver_name && (
            <Badge variant="outline" className="font-mono gap-1"><UserIcon className="h-3 w-3" />{route.caregiver_name}</Badge>
          )}
          {route?.client_name && (
            <Badge variant="outline" className="font-mono gap-1"><Users className="h-3 w-3" />{route.client_name}</Badge>
          )}
          {route?.date_from && route?.date_to && (
            <Badge variant="outline" className="font-mono gap-1">
              <Calendar className="h-3 w-3" />
              {new Date(route.date_from).toLocaleDateString()} → {new Date(route.date_to).toLocaleDateString()}
            </Badge>
          )}
          {route?.hour_min != null && (
            <Badge variant="outline" className="font-mono gap-1"><Clock className="h-3 w-3" />≥ {route.hour_min}:00</Badge>
          )}
          {route && (
            <Badge variant="outline" className="font-mono gap-1">
              {route.requires_semantic ? <><Dna className="h-3 w-3" /> Semantic + SQL</> : <><Zap className="h-3 w-3" /> SQL only</>}
            </Badge>
          )}
          <Badge variant="outline" className="font-mono">{ranked.length} match{ranked.length === 1 ? "" : "es"}</Badge>
        </div>
      </div>


      {error && (
        <div className="mb-3 flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <AlertTriangle className="h-3.5 w-3.5" /> {error.message}
        </div>
      )}

      <div className="mb-2 flex justify-end">
        <ExpandControls exp={exp} ids={allIds} />
      </div>

      <div className="overflow-x-auto [&_thead_th]:h-10 [&_thead_th]:whitespace-nowrap [&_thead_th]:text-[13px] [&_thead_th]:uppercase [&_thead_th]:tracking-wider [&_thead_th]:font-semibold [&_thead_th]:text-muted-foreground [&_tbody_td]:text-sm [&_tbody_td]:align-middle">
        <Table>
          <TableHeader>
                  <TableRow className="[&>td]:border-b-0">
              <TableHead className="w-8" />
              <TableHead>Score</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Caregiver</TableHead>
              <TableHead>Client</TableHead>
              <TableHead>Service</TableHead>
              <TableHead>In → Out</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>GPS</TableHead>
              <TableHead>Geofence Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={`sk-${i}`}>
                  <TableCell colSpan={12} className="py-3">
                    <div className="h-12 w-full animate-pulse rounded-md bg-muted/60" />
                  </TableCell>
                </TableRow>
              ))
            ) : ranked.length === 0 ? (
              <TableRow>
                <TableCell colSpan={12} className="py-10 text-center text-sm text-muted-foreground">
                  No conceptually similar shifts. If you just added shifts, click <span className="font-semibold">Index embeddings</span> above so NECTAR can read them.
                </TableCell>
              </TableRow>
            ) : ranked.map(({ row: r, similarity }) => {
              const inIso = effectiveIn(r);
              const outIso = effectiveOut(r);
              const isPending = r.status === "Pending";
              const open = exp.isExpanded(r.id);
              return (
                <Fragment key={r.id}>
                  <TableRow
                    onClick={() => exp.toggle(r.id)}
                    role="button"
                    aria-expanded={open}
                    className="cursor-pointer hover:bg-muted/40 [&>td]:border-b-0 [&>td]:py-1.5"
                  >
                    <ChevronCell open={open} />
                    <TableCell>
                      <Badge variant="outline" className="font-mono text-[11px]">
                        {(similarity * 100).toFixed(0)}%
                      </Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap font-mono">{fmtDateMDY(inIso)}</TableCell>
                    <TableCell>
                      <Badge variant={isPending ? "default" : "secondary"} className="text-[11px]">
                        {isPending ? "Pending" : "Approved"}
                      </Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap font-medium">
                      {r.staff?.full_name ?? r.staff?.email ?? "—"}
                      <EditedByAdminBadge row={r} />
                      <FlagDot row={r} />
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{r.clients?.first_name} {r.clients?.last_name}</TableCell>
                    <TableCell className="whitespace-nowrap"><Badge variant="outline" className="font-mono">{r.service_type_code}</Badge></TableCell>
                    <TableCell className="whitespace-nowrap font-mono">
                      {fmtTimeAmPm(inIso)} → {outIso ? fmtTimeAmPm(outIso) : "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap font-mono">{fmtDuration(inIso, outIso)}</TableCell>
                    <TableCell onClick={stopRowToggle}>
                      <Button variant="outline" size="sm" onClick={() => onMap(r)}>
                        <MapPin /> View
                      </Button>
                    </TableCell>
                    <TableCell
                      onClick={(e) => { e.stopPropagation(); if (r.outside_geofence_reason) onReason(r); }}
                      className={r.outside_geofence_reason ? "cursor-pointer" : ""}
                    >
                      <GeofenceBadge row={r} />
                    </TableCell>
                    <TableCell className="text-right" onClick={stopRowToggle}>
                      <div className="flex justify-end gap-1.5">
                        {isPending && (
                          <Button
                            size="icon"
                            onClick={() => onApprove(r.id)}
                            disabled={approving}
                            aria-label="Approve"
                          >
                            {approving ? <Loader2 className="animate-spin" /> : <Check />}
                          </Button>
                        )}
                        <Button size="icon" variant="secondary" onClick={() => onEdit(r)} aria-label="Edit">
                          <Pencil />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                  {open && <InlineNotesRow row={r} colSpan={12} />}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}



function PendingTable({
  rows, loading, onMap, onEdit, onApprove, approving, onReason,
  title = "Pending EVV Shifts",
  description,
}: {
  rows: Row[]; loading: boolean;
  onMap: (r: Row) => void; onEdit: (r: Row) => void;
  onApprove: (id: string) => void; approving: boolean;
  onReason: (r: Row) => void;
  title?: string;
  description?: string;
}) {
  const exp = useRowExpansion();
  const allIds = useMemo(() => rows.map((r) => r.id), [rows]);
  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{title}</h2>
          {description && <p className="mt-0.5 text-[11px] text-muted-foreground/80">{description}</p>}
        </div>
        <div className="flex items-center gap-2">
          <ExpandControls exp={exp} ids={allIds} />
          <Badge variant="outline" className="font-mono text-[10px]">{rows.length} pending</Badge>
        </div>
      </div>
      <div className="overflow-x-auto [&_thead_th]:h-10 [&_thead_th]:whitespace-nowrap [&_thead_th]:text-[13px] [&_thead_th]:uppercase [&_thead_th]:tracking-wider [&_thead_th]:font-semibold [&_thead_th]:text-muted-foreground [&_tbody_td]:text-sm [&_tbody_td]:align-middle">
        <Table>
          <TableHeader>
              <TableRow>
              <TableHead className="w-8" />
              <TableHead>Caregiver</TableHead>
              <TableHead>Client</TableHead>
              <TableHead>Origin</TableHead>
              <TableHead>Member ID</TableHead>
              <TableHead>Service</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>GPS</TableHead>
              <TableHead>Geofence Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={10} className="py-10 text-center text-sm text-muted-foreground">Loading…</TableCell></TableRow>
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={10} className="py-10 text-center text-sm text-muted-foreground">No pending shifts.</TableCell></TableRow>
            ) : rows.map((r) => {
              const open = exp.isExpanded(r.id);
              return (
              <Fragment key={r.id}>
              <TableRow
                onClick={() => exp.toggle(r.id)}
                role="button"
                aria-expanded={open}
                className="cursor-pointer hover:bg-muted/40 [&>td]:border-b-0 [&>td]:py-1.5"
              >
                <ChevronCell open={open} />
                <TableCell className="whitespace-nowrap font-medium">
                  {r.staff?.full_name ?? r.staff?.email ?? "—"}
                  <EditedByAdminBadge row={r} />
                  <FlagDot row={r} />
                  {r.edit_reason && (
                    <div className="mt-0.5 max-w-[260px] truncate text-[11px] font-normal italic text-amber-700 dark:text-amber-300" title={r.edit_reason}>
                      ✎ {r.edit_reason}
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  <div className="whitespace-nowrap">{r.clients?.first_name} {r.clients?.last_name}</div>
                  <div className="text-xs text-muted-foreground truncate max-w-[220px]">{r.clients?.physical_address ?? "—"}</div>
                </TableCell>
                <TableCell>
                  <Badge variant={r.shift_entry_type === "Client_Profile_Pass" ? "default" : "secondary"}>
                    {r.shift_entry_type === "Client_Profile_Pass" ? "In-Chart" : "Sidebar"}
                  </Badge>
                </TableCell>
                <TableCell className="whitespace-nowrap font-mono">{r.utah_medicaid_member_id}</TableCell>
                <TableCell className="whitespace-nowrap"><Badge variant="outline" className="font-mono">{r.service_type_code}</Badge></TableCell>
                <TableCell className="whitespace-nowrap font-mono"><Clock className="mr-1 inline h-3.5 w-3.5" />{fmtDuration(effectiveIn(r), effectiveOut(r))}</TableCell>
                <TableCell onClick={stopRowToggle}>
                  <Button variant="outline" size="sm" onClick={() => onMap(r)}>
                    <MapPin /> View
                  </Button>
                </TableCell>
                <TableCell onClick={(e) => { e.stopPropagation(); if (r.outside_geofence_reason) onReason(r); }} className={r.outside_geofence_reason ? "cursor-pointer" : ""}>
                  <GeofenceBadge row={r} />
                </TableCell>
                <TableCell className="text-right" onClick={stopRowToggle}>
                  <div className="flex justify-end gap-1.5">
                    <Button
                      size="icon"
                      onClick={() => onApprove(r.id)}
                      disabled={approving}
                      aria-label="Approve"
                    >
                      {approving ? <Loader2 className="animate-spin" /> : <Check />}
                    </Button>
                    <Button size="icon" variant="secondary" onClick={() => onEdit(r)} aria-label="Edit">
                      <Pencil />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
              {open && <InlineNotesRow row={r} colSpan={10} />}
              </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}

// === Utah DHHS 30-Column State Portal CSV ===
// Header + cell formats lock to the uploaded EVV4_1.csv template verbatim.
function fmtDateMDY(iso: string) {
  // Strict M/D/YYYY (no leading zeros) — matches "3/19/2025".
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
}
function pad2(n: number) { return n < 10 ? `0${n}` : String(n); }
function fmtTimeHMSAmPm(iso: string) {
  // Strict HH:MM:SS AM/PM with exactly one space — matches "01:03:00 PM".
  const d = new Date(iso);
  let h = d.getHours();
  const m = d.getMinutes();
  const s = d.getSeconds();
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12; if (h === 0) h = 12;
  return `${pad2(h)}:${pad2(m)}:${pad2(s)} ${ampm}`;
}
/** Compact "1:19 AM" — UI use only, no seconds, no leading zero on hour. */
function fmtTimeAmPm(iso: string) {
  const d = new Date(iso);
  let h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12; if (h === 0) h = 12;
  return `${h}:${pad2(m)} ${ampm}`;
}
function csvEscape(s: string) {
  const v = s ?? "";
  if (v.includes(",") || v.includes('"') || v.includes("\n")) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

const UTAH_30_HEADER =
  "Member ID (req),First name (req),Middle initial,Last name (req),Service code (req),Service description,Provider ID (req),Employee Performing Service (req),Begin date (req),Begin time (req),Begin address (req),Begin Apt/Suite/Floor,Begin City (req),Begin State,Begin Zip,Begin Geo Latitude,Begin Geo Longitude,End date (req),End time (req),End Address1,End Address2,End City,End State,End Zip,End Geo Latitude,End Geo Longitude,Orig_receipt_id (req if CORRECTION),Batch_id (req),Record_id (req),EVV Vendor (req)";

const EVV_VENDOR_NAME = "HIVE";

function buildUtahCsv(rows: Row[]): string {
  // One incremental batch number per export (seconds since epoch keeps it
  // sequential across exports without colliding within a single file).
  const batchId = Math.floor(Date.now() / 1000).toString();

  const lines = rows.map((r, idx) => {
    const inIso = effectiveIn(r);
    const outIso = effectiveOut(r) ?? inIso;
    const latIn = r.gps_in_coordinates?.latitude ?? 0;
    const lngIn = r.gps_in_coordinates?.longitude ?? 0;
    const latOut = r.gps_out_coordinates?.latitude ?? 0;
    const lngOut = r.gps_out_coordinates?.longitude ?? 0;
    const employee = (r.staff?.full_name ?? r.staff?.email ?? "").trim();

    return [
      "",                                       // Member ID (req) — empty per template
      csvEscape(r.clients?.first_name ?? ""),   // First name (req)
      "",                                       // Middle initial
      csvEscape(r.clients?.last_name ?? ""),    // Last name (req)
      csvEscape(r.service_type_code ?? ""),     // Service code (req)
      "",                                       // Service description
      csvEscape(r.utah_medicaid_provider_id ?? ""), // Provider ID (req)
      csvEscape(employee),                      // Employee Performing Service (req)
      csvEscape(fmtDateMDY(inIso)),             // Begin date (req)
      csvEscape(fmtTimeHMSAmPm(inIso)),         // Begin time (req)
      "",                                       // Begin address (req) — blank placeholder
      "",                                       // Begin Apt/Suite/Floor
      "",                                       // Begin City (req)
      "",                                       // Begin State
      "",                                       // Begin Zip
      String(latIn),                            // Begin Geo Latitude
      String(lngIn),                            // Begin Geo Longitude
      csvEscape(fmtDateMDY(outIso)),            // End date (req)
      csvEscape(fmtTimeHMSAmPm(outIso)),        // End time (req)
      "",                                       // End Address1
      "",                                       // End Address2
      "",                                       // End City
      "",                                       // End State
      "",                                       // End Zip
      String(latOut),                           // End Geo Latitude
      String(lngOut),                           // End Geo Longitude
      "",                                       // Orig_receipt_id (req if CORRECTION)
      batchId,                                  // Batch_id (req)
      String(idx + 1),                          // Record_id (req)
      csvEscape(EVV_VENDOR_NAME),               // EVV Vendor (req)
    ].join(",");
  });
  return [UTAH_30_HEADER, ...lines].join("\r\n");
}


function downloadCsv(filename: string, body: string) {
  const blob = new Blob([body], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

function buildPayrollCsv(rows: Row[]): string {
  const header = "Date,Caregiver,Client,Service Code,Clock In,Clock Out,Rounded Hours";
  const lines = rows.map((r) => {
    const inIso = effectiveIn(r);
    const outIso = effectiveOut(r);
    const ms = outIso ? new Date(outIso).getTime() - new Date(inIso).getTime() : 0;
    const hours = (ms / 3_600_000).toFixed(2);
    return [
      csvEscape(fmtDateMDY(inIso)),
      csvEscape(r.staff?.full_name ?? r.staff?.email ?? ""),
      csvEscape(`${r.clients?.first_name ?? ""} ${r.clients?.last_name ?? ""}`.trim()),
      csvEscape(r.service_type_code ?? ""),
      csvEscape(fmtTimeHMSAmPm(inIso)),
      csvEscape(outIso ? fmtTimeHMSAmPm(outIso) : ""),
      hours,
    ].join(",");
  });
  return [header, ...lines].join("\r\n");
}

// === Master Agency Ledger CSV (full clinical/audit payload) ===
const MASTER_LEDGER_HEADER =
  "Shift ID,Caregiver Name,Client Name,DSPD Service Code,Service Description,Raw Clock-In,Raw Clock-Out,Rounded Clock-In,Rounded Clock-Out,Total Calculated Hours,Geofence Status,Caregiver Location Exception Note,PCSP Goals Completed,Full Caregiver Shift Narrative,Is Admin Modified,Modified By Admin Name,Internal Audit Trail Log";

function buildMasterLedgerCsv(rows: Row[]): string {
  const lines = rows.map((r) => {
    const inIso = effectiveIn(r);
    const outIso = effectiveOut(r);
    const ms = outIso ? new Date(outIso).getTime() - new Date(inIso).getTime() : 0;
    const hours = (ms / 3_600_000).toFixed(2);
    const geofence = r.outside_geofence_reason && r.outside_geofence_reason.trim().length > 0 ? "NO MATCH" : "MATCH";
    const goals = (r.goals_completed ?? []).join(" | ");
    const auditTrail = (r.edit_audit_history_log ?? [])
      .map((a) => `[${a.timestamp}] ${a.admin}: ${a.field_changed} "${a.old_value}" → "${a.new_value}"`)
      .join(" || ");
    return [
      csvEscape(r.id),
      csvEscape(r.staff?.full_name ?? r.staff?.email ?? ""),
      csvEscape(`${r.clients?.first_name ?? ""} ${r.clients?.last_name ?? ""}`.trim()),
      csvEscape(r.service_type_code ?? ""),
      csvEscape(evvServiceLabel(r.service_type_code)),
      csvEscape(r.clock_in_timestamp ? new Date(r.clock_in_timestamp).toISOString() : ""),
      csvEscape(r.clock_out_timestamp ? new Date(r.clock_out_timestamp).toISOString() : ""),
      csvEscape(r.rounded_clock_in ? new Date(r.rounded_clock_in).toISOString() : ""),
      csvEscape(r.rounded_clock_out ? new Date(r.rounded_clock_out).toISOString() : ""),
      hours,
      csvEscape(geofence),
      csvEscape(r.outside_geofence_reason ?? ""),
      csvEscape(goals),
      csvEscape(r.shift_note_text ?? ""),
      r.is_edited_by_admin ? "TRUE" : "FALSE",
      csvEscape(r.edited_by_admin_name ?? ""),
      csvEscape(auditTrail),
    ].join(",");
  });
  return [MASTER_LEDGER_HEADER, ...lines].join("\r\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Supervisor review queue — the EVV punch pad routes shifts here when the
// "forgot to clock out" correction flow runs, an incident_flag is set, or
// the raw duration is ≥16 hours. Approving makes the corrected_* times the
// EFFECTIVE billing times via effectiveBillingTimes() in billing-units.ts.
// Rejecting requires a note and returns the shift to the caregiver, who
// sees a "correction rejected — resubmit" state on the punch pad.
// ─────────────────────────────────────────────────────────────────────────────
function fmtTs(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isFinite(d.getTime())
    ? d.toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })
    : "—";
}
function varianceMinutes(r: Row): number | null {
  const rawIn = r.clock_in_timestamp ? new Date(r.clock_in_timestamp).getTime() : NaN;
  const rawOut = r.clock_out_timestamp ? new Date(r.clock_out_timestamp).getTime() : NaN;
  const corrIn = r.corrected_clock_in ? new Date(r.corrected_clock_in).getTime() : NaN;
  const corrOut = r.corrected_clock_out ? new Date(r.corrected_clock_out).getTime() : NaN;
  if (!Number.isFinite(rawIn) || !Number.isFinite(rawOut)) return null;
  if (!Number.isFinite(corrIn) || !Number.isFinite(corrOut)) return null;
  const rawMin = (rawOut - rawIn) / 60_000;
  const corrMin = (corrOut - corrIn) / 60_000;
  return Math.round(corrMin - rawMin);
}

function NeedsReviewRow({
  row, onApprove, onReject, approving, rejecting,
}: {
  row: Row;
  onApprove: (id: string) => void;
  onReject: (id: string, note: string) => void;
  approving: boolean;
  rejecting: boolean;
}) {
  const [note, setNote] = useState("");
  const [showReject, setShowReject] = useState(false);
  const variance = varianceMinutes(row);
  return (
    <div className="space-y-3 rounded-lg border border-l-4 border-l-amber-500 bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-sm">
            {row.staff?.full_name ?? row.staff?.email ?? "—"}
            {" "}→{" "}
            <span className="text-foreground">
              {row.clients?.first_name} {row.clients?.last_name}
            </span>
          </p>
          <p className="text-xs text-muted-foreground">
            <Badge variant="outline" className="font-mono text-[10px] mr-1.5">{row.service_type_code}</Badge>
            {isEvvLockedCode(row.service_type_code) ? "EVV-locked" : "Non-EVV"}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {row.incident_flag && (
            <Badge className="bg-rose-100 text-rose-800 text-[10px] dark:bg-rose-500/15 dark:text-rose-200">
              <Flag className="mr-1 h-3 w-3" /> Incident flagged
            </Badge>
          )}
          {row.corrected_clock_in && (
            <Badge className="bg-amber-100 text-amber-800 text-[10px] dark:bg-amber-500/15 dark:text-amber-200">
              Correction submitted
            </Badge>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-border bg-muted/30 p-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Original (raw)</p>
          <p className="mt-1 font-mono text-xs">In: {fmtTs(row.clock_in_timestamp)}</p>
          <p className="font-mono text-xs">Out: {fmtTs(row.clock_out_timestamp)}</p>
        </div>
        <div className="rounded-lg border border-amber-400/50 bg-amber-50/40 p-2.5 dark:bg-amber-500/5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300">Corrected</p>
          <p className="mt-1 font-mono text-xs">In: {fmtTs(row.corrected_clock_in)}</p>
          <p className="font-mono text-xs">Out: {fmtTs(row.corrected_clock_out)}</p>
          {variance !== null && (
            <p className="mt-1 text-[11px] font-medium text-amber-700 dark:text-amber-300">
              Variance: {variance >= 0 ? "+" : ""}{variance} min
            </p>
          )}
        </div>
      </div>

      {row.edit_reason && (
        <div className="rounded-lg border border-border bg-card p-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Caregiver reason</p>
          <p className="mt-1 text-xs leading-relaxed">{row.edit_reason}</p>
        </div>
      )}

      {showReject ? (
        <div className="space-y-2">
          <Label className="text-xs">Reviewer note (required for reject)</Label>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="Why is this being returned? The caregiver will see this."
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => { setShowReject(false); setNote(""); }}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={rejecting || note.trim().length === 0}
              onClick={() => onReject(row.id, note)}
            >
              {rejecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Return to caregiver"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowReject(true)}>
            <X className="mr-1 h-3.5 w-3.5" /> Reject
          </Button>
          <Button size="sm" disabled={approving} onClick={() => onApprove(row.id)}>
            {approving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><Check className="mr-1 h-3.5 w-3.5" /> Approve correction</>}
          </Button>
        </div>
      )}
    </div>
  );
}

function NeedsReviewTable({
  rows, loading, onApprove, onReject, approving, rejecting,
}: {
  rows: Row[];
  loading: boolean;
  onApprove: (id: string) => void;
  onReject: (id: string, note: string) => void;
  approving: boolean;
  rejecting: boolean;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Needs Review</h2>
          <p className="mt-0.5 text-[11px] text-muted-foreground/80">
            Caregiver corrections, ≥16h shifts, and incident-flagged punches. Approve to make corrected times bill; reject to return for resubmission.
          </p>
        </div>
        <Badge variant="outline" className="font-mono text-[10px]">{rows.length} awaiting review</Badge>
      </div>
      {loading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">No corrections awaiting review.</p>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <NeedsReviewRow
              key={r.id}
              row={r}
              onApprove={onApprove}
              onReject={onReject}
              approving={approving}
              rejecting={rejecting}
            />
          ))}
        </div>
      )}
    </section>
  );
}

type BillingStatus = "billed" | "held" | "unbilled";

function deriveBillingStatus(r: Row, billedSet: Set<string> | null): BillingStatus {
  if (billedSet?.has(r.id)) return "billed";
  const hasUnresolvedGeo =
    !!(r.outside_geofence_reason && r.outside_geofence_reason.trim().length > 0) &&
    r.reconciliation_status !== "accepted" &&
    r.reconciliation_status !== "corrected";
  const noClockOut = !(r.rounded_clock_out ?? r.clock_out_timestamp);
  if (hasUnresolvedGeo || noClockOut) return "held";
  return "unbilled";
}

function BillingStatusBadge({ status }: { status: BillingStatus }) {
  if (status === "billed")
    return (
      <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-md bg-success/12 px-2 py-0.5 text-[12px] font-medium leading-none text-success">
        <CheckCircle2 className="h-3.5 w-3.5" /> BILLED
      </span>
    );
  if (status === "held")
    return (
      <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-md bg-warning/15 px-2 py-0.5 text-[12px] font-medium leading-none text-warning-foreground">
        <AlertCircle className="h-3.5 w-3.5" /> HELD
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-md bg-muted px-2 py-0.5 text-[12px] font-medium leading-none text-muted-foreground">
      UNBILLED
    </span>
  );
}

function ArchiveTable({
  rows, loading, onMap, onEdit, variant,
  staffNameMap, teams, billedSet,
}: {
  rows: Row[];
  loading: boolean;
  onMap: (r: Row) => void;
  onEdit: (r: Row) => void;
  variant: "evv" | "non-evv";
  staffNameMap?: Map<string, string>;
  teams?: Array<{ id: string; team_name: string }>;
  billedSet?: Set<string> | null;
}) {
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  // Multi-select filters
  const [codes, setCodes] = useState<string[]>([]);
  const [staffIds, setStaffIds] = useState<string[]>([]);
  const [clientIds, setClientIds] = useState<string[]>([]);
  const [teamIds, setTeamIds] = useState<string[]>([]);
  const [billingStatus, setBillingStatus] = useState<"all" | BillingStatus>("all");

  const codeOptions = useMemo(
    () =>
      EVV_SERVICE_CODES.filter((c) => (variant === "evv" ? c.evvLock : !c.evvLock)).map((c) => ({
        value: c.code,
        label: c.code,
        sublabel: c.label.split("— ")[1] ?? c.label,
      })),
    [variant],
  );

  // Derive staff/client options from the rows currently in memory so we never
  // surface options the user can't actually filter to within the loaded set.
  const staffOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rows) {
      const label = r.staff?.full_name ?? r.staff?.email ?? staffNameMap?.get(r.staff_id) ?? r.staff_id;
      if (!m.has(r.staff_id)) m.set(r.staff_id, label);
    }
    return Array.from(m.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [rows, staffNameMap]);

  const clientOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rows) {
      const label = r.clients ? `${r.clients.last_name}, ${r.clients.first_name}` : r.client_id;
      if (!m.has(r.client_id)) m.set(r.client_id, label);
    }
    return Array.from(m.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [rows]);

  const teamOptions = useMemo(
    () => (teams ?? []).map((t) => ({ value: t.id, label: t.team_name })),
    [teams],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const fromMs = from ? new Date(from).getTime() : null;
    const toMs = to ? new Date(to).getTime() + 86_399_000 : null;
    const codeSet = codes.length ? new Set(codes) : null;
    const staffSet = staffIds.length ? new Set(staffIds) : null;
    const clientSet = clientIds.length ? new Set(clientIds) : null;
    const teamSet = teamIds.length ? new Set(teamIds) : null;
    return rows.filter((r) => {
      if (codeSet && !codeSet.has(r.service_type_code)) return false;
      if (staffSet && !staffSet.has(r.staff_id)) return false;
      if (clientSet && !clientSet.has(r.client_id)) return false;
      if (teamSet) {
        const tid = r.clients?.team_id;
        if (!tid || !teamSet.has(tid)) return false;
      }
      const t = new Date(effectiveIn(r)).getTime();
      if (fromMs && t < fromMs) return false;
      if (toMs && t > toMs) return false;
      if (billingStatus !== "all" && deriveBillingStatus(r, billedSet ?? null) !== billingStatus) return false;
      if (q) {
        const hay = [
          r.staff?.full_name, r.staff?.email,
          r.clients?.first_name, r.clients?.last_name,
          r.utah_medicaid_member_id, r.service_type_code,
        ].filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, search, codes, staffIds, clientIds, teamIds, from, to, billingStatus, billedSet]);

  const onExport = () => {
    if (!filtered.length) { toast.error("No rows match the current filters."); return; }
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    if (variant === "evv") {
      downloadCsv(`utah_dhhs_evv_${stamp}.csv`, buildUtahCsv(filtered));
    } else {
      downloadCsv(`internal_payroll_${stamp}.csv`, buildPayrollCsv(filtered));
    }
    toast.success(`Exported ${filtered.length} shift${filtered.length === 1 ? "" : "s"}.`);
  };

  const clearAll = () => {
    setSearch(""); setFrom(""); setTo(""); setCodes([]); setStaffIds([]);
    setClientIds([]); setTeamIds([]); setBillingStatus("all");
  };
  const activeFilterCount =
    (search ? 1 : 0) + (from ? 1 : 0) + (to ? 1 : 0) +
    codes.length + staffIds.length + clientIds.length + teamIds.length +
    (billingStatus !== "all" ? 1 : 0);

  const heading = variant === "evv" ? "State EVV Archive (Geofence-Locked Codes)" : "Internal / Non-EVV Archive";
  const exportLabel = variant === "evv" ? "Export Utah DHHS EVV CSV" : "Export Payroll CSV";

  const exp = useRowExpansion();
  const allIds = useMemo(() => filtered.map((r) => r.id), [filtered]);
  const showBillingCol = variant === "evv";
  const colSpan = showBillingCol ? 12 : 11;

  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
      <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{heading}</h2>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground tabular-nums">
            {filtered.length.toLocaleString()} of {rows.length.toLocaleString()} approved shifts
          </span>
          <ExpandControls exp={exp} ids={allIds} />
          <Button onClick={onExport}>
            <Download /> {exportLabel}
          </Button>
        </div>
      </div>

      <div className="mb-3 grid gap-2 md:grid-cols-2 lg:grid-cols-4">
        <Input
          placeholder="Search staff, client, member ID…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <CheckboxMultiSelect
          value={codes}
          onChange={setCodes}
          options={codeOptions}
          placeholder="All service codes"
          searchPlaceholder="Filter codes…"
          chipMonospace
        />
        <CheckboxMultiSelect
          value={staffIds}
          onChange={setStaffIds}
          options={staffOptions}
          placeholder="All staff"
          searchPlaceholder="Filter staff…"
          emptyLabel="No staff in current results"
        />
        <CheckboxMultiSelect
          value={clientIds}
          onChange={setClientIds}
          options={clientOptions}
          placeholder="All clients"
          searchPlaceholder="Filter clients…"
          emptyLabel="No clients in current results"
        />
        {variant === "evv" && (
          <CheckboxMultiSelect
            value={teamIds}
            onChange={setTeamIds}
            options={teamOptions}
            placeholder="All homes / teams"
            searchPlaceholder="Filter homes…"
            emptyLabel="No teams configured"
          />
        )}
        {variant === "evv" && (
          <Select value={billingStatus} onValueChange={(v) => setBillingStatus(v as typeof billingStatus)}>
            <SelectTrigger><SelectValue placeholder="Billing status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All billing statuses</SelectItem>
              <SelectItem value="billed">Billed (in EVV export)</SelectItem>
              <SelectItem value="held">Held (excluded from export)</SelectItem>
              <SelectItem value="unbilled">Unbilled (eligible, not yet exported)</SelectItem>
            </SelectContent>
          </Select>
        )}
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From date" />
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To date" />
      </div>

      {activeFilterCount > 0 && (
        <div className="mb-3 flex items-center justify-between text-[11px] text-muted-foreground">
          <span><Filter className="mr-1 inline h-3 w-3" />{activeFilterCount} filter{activeFilterCount === 1 ? "" : "s"} active</span>
          <button type="button" onClick={clearAll} className="text-destructive hover:underline">Clear all filters</button>
        </div>
      )}

      <div className="overflow-x-auto [&_thead_th]:h-10 [&_thead_th]:whitespace-nowrap [&_thead_th]:text-[13px] [&_thead_th]:uppercase [&_thead_th]:tracking-wider [&_thead_th]:font-semibold [&_thead_th]:text-muted-foreground [&_tbody_td]:text-sm [&_tbody_td]:align-middle">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8" />
              <TableHead>Date</TableHead>
              <TableHead>Caregiver</TableHead>
              <TableHead>Client</TableHead>
              <TableHead>Member ID</TableHead>
              <TableHead>Service</TableHead>
              <TableHead>In → Out</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>GPS</TableHead>
              <TableHead>Geofence Status</TableHead>
              {showBillingCol && <TableHead>Billing</TableHead>}
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={colSpan} className="py-10 text-center text-sm text-muted-foreground">Loading…</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={colSpan} className="py-10 text-center text-sm text-muted-foreground">No approved shifts match.</TableCell></TableRow>
            ) : filtered.map((r) => {
              const inIso = effectiveIn(r);
              const outIso = effectiveOut(r);
              const open = exp.isExpanded(r.id);
              return (
                <Fragment key={r.id}>
                <TableRow
                  onClick={() => exp.toggle(r.id)}
                  role="button"
                  aria-expanded={open}
                  className="cursor-pointer hover:bg-muted/40 [&>td]:border-b-0 [&>td]:py-1.5"
                >
                  <ChevronCell open={open} />
                  <TableCell className="whitespace-nowrap font-mono">{fmtDateMDY(inIso)}</TableCell>
                  <TableCell className="whitespace-nowrap font-medium">
                    {r.staff?.full_name ?? r.staff?.email ?? "—"}
                    <EditedByAdminBadge row={r} />
                    <FlagDot row={r} />
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{r.clients?.first_name} {r.clients?.last_name}</TableCell>
                  <TableCell className="whitespace-nowrap font-mono">{r.utah_medicaid_member_id}</TableCell>
                  <TableCell className="whitespace-nowrap"><Badge variant="outline" className="font-mono">{r.service_type_code}</Badge></TableCell>
                  <TableCell className="whitespace-nowrap font-mono">{fmtTimeAmPm(inIso)} → {outIso ? fmtTimeAmPm(outIso) : "—"}</TableCell>
                  <TableCell className="whitespace-nowrap font-mono">{fmtDuration(inIso, outIso)}</TableCell>
                  <TableCell onClick={stopRowToggle}>
                    <Button variant="outline" size="sm" onClick={() => onMap(r)}>
                      <MapPin /> View
                    </Button>
                  </TableCell>
                  <TableCell>
                    <GeofenceBadge row={r} />
                  </TableCell>
                  {showBillingCol && (
                    <TableCell>
                      <BillingStatusBadge status={deriveBillingStatus(r, billedSet ?? null)} />
                    </TableCell>
                  )}
                  <TableCell className="text-right" onClick={stopRowToggle}>
                    <Button size="sm" variant="secondary" onClick={() => onEdit(r)}>
                      <Pencil /> Edit
                    </Button>
                  </TableCell>
                </TableRow>
                {open && <InlineNotesRow row={r} colSpan={colSpan} />}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}

function ReasonDialog({ row, onClose }: { row: Row | null; onClose: () => void }) {
  return (
    <Dialog open={!!row} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Geofence Variance Justification</DialogTitle>
          <DialogDescription>Caregiver-submitted reason for an out-of-bounds punch.</DialogDescription>
        </DialogHeader>
        <p className="whitespace-pre-wrap rounded-lg border border-border bg-muted/30 p-3 text-sm">
          {row?.outside_geofence_reason || "—"}
        </p>
        <DialogFooter><Button variant="ghost" onClick={onClose}>Close</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function GpsMatchDialog({ row, onClose }: { row: Row | null; onClose: () => void }) {
  const inLink = useMemo(
    () => (row ? osmPinLink(row.gps_in_coordinates?.latitude, row.gps_in_coordinates?.longitude) : null),
    [row],
  );
  const outLink = useMemo(
    () => (row?.gps_out_coordinates ? osmPinLink(row.gps_out_coordinates.latitude, row.gps_out_coordinates.longitude) : null),
    [row],
  );

  return (
    <Dialog open={!!row} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>GPS Map Match</DialogTitle>
          <DialogDescription>Precise punch-in vs punch-out coordinates.</DialogDescription>
        </DialogHeader>
        {row && (
          <div className="space-y-3 text-sm">
            <div className="rounded-lg border border-border p-3">
              <div className="font-semibold text-emerald-600">Clock-In</div>
              <div className="font-mono text-xs">
                {row.gps_in_coordinates.latitude.toFixed(6)}, {row.gps_in_coordinates.longitude.toFixed(6)}
                <span className="ml-2 text-muted-foreground">± {Math.round(row.gps_in_coordinates.accuracy_meters)}m</span>
              </div>
              <div className="text-[11px] text-muted-foreground">{new Date(row.clock_in_timestamp).toLocaleString()}</div>
              {inLink && (
                <a href={inLink} target="_blank" rel="noreferrer" className="mt-2 inline-flex text-xs font-medium text-primary hover:underline">
                  Open clock-in pin in OpenStreetMap
                </a>
              )}
            </div>
            <div className="rounded-lg border border-border p-3">
              <div className="font-semibold text-rose-600">Clock-Out</div>
              {row.gps_out_coordinates ? (
                <>
                  <div className="font-mono text-xs">
                    {row.gps_out_coordinates.latitude.toFixed(6)}, {row.gps_out_coordinates.longitude.toFixed(6)}
                    <span className="ml-2 text-muted-foreground">± {Math.round(row.gps_out_coordinates.accuracy_meters)}m</span>
                  </div>
                  <div className="text-[11px] text-muted-foreground">{row.clock_out_timestamp ? new Date(row.clock_out_timestamp).toLocaleString() : ""}</div>
                  {outLink && (
                    <a href={outLink} target="_blank" rel="noreferrer" className="mt-2 inline-flex text-xs font-medium text-primary hover:underline">
                      Open clock-out pin in OpenStreetMap
                    </a>
                  )}
                </>
              ) : <div className="text-xs text-muted-foreground">Not captured</div>}
            </div>
          </div>
        )}
        <DialogFooter><Button variant="ghost" onClick={onClose}>Close</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => (n < 10 ? `0${n}` : String(n));
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fmtAuditValue(field: string, v: unknown): string {
  if (v == null || v === "") return "(empty)";
  if (field === "rounded_clock_in" || field === "rounded_clock_out") {
    return new Date(String(v)).toLocaleString();
  }
  return String(v);
}

function EditShiftDialog({ row, onClose }: { row: Row | null; onClose: () => void }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [clockIn, setClockIn] = useState("");
  const [clockOut, setClockOut] = useState("");
  const [svc, setSvc] = useState("");
  const [latIn, setLatIn] = useState("");
  const [lngIn, setLngIn] = useState("");
  const [latOut, setLatOut] = useState("");
  const [lngOut, setLngOut] = useState("");

  useEffect(() => {
    if (!row) return;
    setClockIn(toLocalInput(row.rounded_clock_in ?? row.clock_in_timestamp));
    setClockOut(toLocalInput(row.rounded_clock_out ?? row.clock_out_timestamp));
    setSvc(row.service_type_code);
    setLatIn(String(row.gps_in_coordinates?.latitude ?? ""));
    setLngIn(String(row.gps_in_coordinates?.longitude ?? ""));
    setLatOut(row.gps_out_coordinates ? String(row.gps_out_coordinates.latitude) : "");
    setLngOut(row.gps_out_coordinates ? String(row.gps_out_coordinates.longitude) : "");
  }, [row]);

  const save = useMutation({
    mutationFn: async () => {
      if (!row) return;
      const adminName =
        (user?.user_metadata?.full_name as string | undefined) ?? user?.email ?? "Administrator";
      const nowIso = new Date().toISOString();

      const newRoundedIn = clockIn ? new Date(clockIn).toISOString() : null;
      const newRoundedOut = clockOut ? new Date(clockOut).toISOString() : null;
      const newLatIn = latIn === "" ? null : Number(latIn);
      const newLngIn = lngIn === "" ? null : Number(lngIn);
      const newLatOut = latOut === "" ? null : Number(latOut);
      const newLngOut = lngOut === "" ? null : Number(lngOut);

      const auditAdds: AuditEntry[] = [];
      const pushDiff = (field: string, oldV: unknown, newV: unknown) => {
        const a = oldV == null ? "" : String(oldV);
        const b = newV == null ? "" : String(newV);
        if (a !== b) {
          auditAdds.push({
            timestamp: nowIso,
            admin: adminName,
            field_changed: field,
            old_value: fmtAuditValue(field, oldV),
            new_value: fmtAuditValue(field, newV),
          });
        }
      };
      pushDiff("rounded_clock_in", row.rounded_clock_in ?? row.clock_in_timestamp, newRoundedIn);
      pushDiff("rounded_clock_out", row.rounded_clock_out ?? row.clock_out_timestamp, newRoundedOut);
      pushDiff("service_type_code", row.service_type_code, svc);
      pushDiff("begin_geo_latitude", row.gps_in_coordinates?.latitude, newLatIn);
      pushDiff("begin_geo_longitude", row.gps_in_coordinates?.longitude, newLngIn);
      pushDiff("end_geo_latitude", row.gps_out_coordinates?.latitude ?? null, newLatOut);
      pushDiff("end_geo_longitude", row.gps_out_coordinates?.longitude ?? null, newLngOut);

      if (auditAdds.length === 0) {
        toast.info("No changes to save.");
        return;
      }

      const accIn = row.gps_in_coordinates?.accuracy_meters ?? 0;
      const gpsIn = {
        latitude: newLatIn ?? row.gps_in_coordinates?.latitude ?? 0,
        longitude: newLngIn ?? row.gps_in_coordinates?.longitude ?? 0,
        accuracy_meters: accIn,
      };
      const gpsOut = (newLatOut != null && newLngOut != null)
        ? {
            latitude: newLatOut,
            longitude: newLngOut,
            accuracy_meters: row.gps_out_coordinates?.accuracy_meters ?? 0,
          }
        : null;

      const history = [...(row.edit_audit_history_log ?? []), ...auditAdds];

      const { error } = await supabase
        .from("evv_timesheets")
        .update({
          rounded_clock_in: newRoundedIn,
          rounded_clock_out: newRoundedOut,
          service_type_code: svc,
          gps_in_coordinates: gpsIn,
          gps_out_coordinates: gpsOut,
          is_edited_by_admin: true,
          edited_by_admin_name: adminName,
          edit_audit_history_log: history,
        })
        .eq("id", row.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Shift updated. Audit entry recorded.");
      qc.invalidateQueries({ queryKey: ["evv-pending"] });
      qc.invalidateQueries({ queryKey: ["evv-approved"] });
      onClose();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const history = row?.edit_audit_history_log ?? [];

  return (
    <Dialog open={!!row} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>✎ Administrative Shift Override</DialogTitle>
          <DialogDescription>
            Edits are logged with your name and timestamp to the immutable audit trail.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Rounded Clock-In</Label>
            <Input type="datetime-local" value={clockIn} onChange={(e) => setClockIn(e.target.value)} />
          </div>
          <div>
            <Label>Rounded Clock-Out</Label>
            <Input type="datetime-local" value={clockOut} onChange={(e) => setClockOut(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Label>Service Code</Label>
            <Select value={svc} onValueChange={setSvc}>
              <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>
                {EVV_SERVICE_CODES.map((c) => <SelectItem key={c.code} value={c.code}>{evvServiceLabel(c.code)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Begin Geo Latitude</Label>
            <Input value={latIn} onChange={(e) => setLatIn(e.target.value)} placeholder="40.7608" />
          </div>
          <div>
            <Label>Begin Geo Longitude</Label>
            <Input value={lngIn} onChange={(e) => setLngIn(e.target.value)} placeholder="-111.8910" />
          </div>
          <div>
            <Label>End Geo Latitude</Label>
            <Input value={latOut} onChange={(e) => setLatOut(e.target.value)} placeholder="40.7608" />
          </div>
          <div>
            <Label>End Geo Longitude</Label>
            <Input value={lngOut} onChange={(e) => setLngOut(e.target.value)} placeholder="-111.8910" />
          </div>
        </div>

        {history.length > 0 && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-50/40 p-3 text-xs">
            <div className="mb-1 flex items-center gap-1 font-semibold text-amber-900">
              <AlertTriangle className="h-3 w-3" /> Prior Audit Trail ({history.length})
            </div>
            <ul className="max-h-32 space-y-1 overflow-auto">
              {history.slice().reverse().map((h, i) => (
                <li key={i} className="font-mono text-[11px] text-amber-950">
                  {new Date(h.timestamp).toLocaleString()} · {h.admin} · {h.field_changed}: {h.old_value} → {h.new_value}
                </li>
              ))}
            </ul>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save & Log Audit Entry"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── EVV Reconciliation Queue ──────────────────────────────────────────────
function buildReconciliationCsv(rows: Row[]): string {
  const header = "Shift ID,Date,Caregiver,Client,Service Code,Clock-In,Clock-Out,Begin Lat,Begin Lng,End Lat,End Lng,Reconciliation Status,Staff Reconciliation Explanation,Admin Attestation,Admin Notes,Reviewed By,Reviewed At";
  const lines = rows.map((r) => {
    const inIso = effectiveIn(r);
    const outIso = effectiveOut(r);
    return [
      csvEscape(r.id),
      csvEscape(fmtDateMDY(inIso)),
      csvEscape(r.staff?.full_name ?? r.staff?.email ?? ""),
      csvEscape(`${r.clients?.first_name ?? ""} ${r.clients?.last_name ?? ""}`.trim()),
      csvEscape(r.service_type_code ?? ""),
      csvEscape(fmtTimeHMSAmPm(inIso)),
      csvEscape(outIso ? fmtTimeHMSAmPm(outIso) : ""),
      String(r.gps_in_coordinates?.latitude ?? ""),
      String(r.gps_in_coordinates?.longitude ?? ""),
      String(r.gps_out_coordinates?.latitude ?? ""),
      String(r.gps_out_coordinates?.longitude ?? ""),
      csvEscape((r.reconciliation_status ?? "pending").toUpperCase()),
      csvEscape(r.outside_geofence_reason ?? ""),
      csvEscape(r.reconciliation_attestation ?? ""),
      csvEscape(r.reconciliation_review_notes ?? ""),
      csvEscape(r.reconciliation_reviewed_by ?? ""),
      csvEscape(r.reconciliation_reviewed_at ?? ""),
    ].join(",");
  });
  return [header, ...lines].join("\r\n");
}

function ReconcileTable({
  rows, loading, onMap, onReview,
}: {
  rows: Row[]; loading: boolean;
  onMap: (r: Row) => void;
  onReview: (r: Row) => void;
}) {
  const [filter, setFilter] = useState<"pending" | "accepted" | "corrected" | "flagged" | "all">("pending");
  const filtered = filter === "all" ? rows : rows.filter((r) => r.reconciliation_status === filter);

  const onExport = () => {
    if (!rows.length) { toast.error("No reconciliation records to export."); return; }
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    downloadCsv(`evv_reconciliation_${stamp}.csv`, buildReconciliationCsv(rows));
    toast.success(`Exported ${rows.length} reconciliation record${rows.length === 1 ? "" : "s"}.`);
  };

  const exp = useRowExpansion();
  const allIds = useMemo(() => filtered.map((r) => r.id), [filtered]);

  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
      <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            <AlertCircle className="h-4 w-4 text-warning-foreground" /> EVV Reconciliation Queue
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Shifts that punched outside all approved client locations. Review the staff explanation and either accept with attestation or flag for follow-up. Actual GPS is always captured.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ExpandControls exp={exp} ids={allIds} />
          <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="accepted">Reconciled</SelectItem>
              <SelectItem value="corrected">Corrected</SelectItem>
              <SelectItem value="flagged">Flagged</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={onExport} variant="secondary">
            <Download /> Export Reconciliation Report
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto [&_thead_th]:h-10 [&_thead_th]:whitespace-nowrap [&_thead_th]:text-[13px] [&_thead_th]:uppercase [&_thead_th]:tracking-wider [&_thead_th]:font-semibold [&_thead_th]:text-muted-foreground [&_tbody_td]:text-sm [&_tbody_td]:align-middle">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8" />
              <TableHead>Date</TableHead>
              <TableHead>Caregiver</TableHead>
              <TableHead>Client</TableHead>
              <TableHead>Service</TableHead>
              <TableHead>In → Out</TableHead>
              <TableHead>GPS</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Staff Explanation</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={10} className="py-10 text-center text-sm text-muted-foreground">Loading…</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={10} className="py-10 text-center text-sm text-muted-foreground">No shifts match this filter — geofence reconciliation is clean.</TableCell></TableRow>
            ) : filtered.map((r) => {
              const inIso = effectiveIn(r);
              const outIso = effectiveOut(r);
              const open = exp.isExpanded(r.id);
              return (
                <Fragment key={r.id}>
                <TableRow
                  onClick={() => exp.toggle(r.id)}
                  role="button"
                  aria-expanded={open}
                  className="cursor-pointer hover:bg-muted/40 [&>td]:border-b-0 [&>td]:py-1.5"
                >
                  <ChevronCell open={open} />
                  <TableCell className="whitespace-nowrap font-mono">{fmtDateMDY(inIso)}</TableCell>
                  <TableCell className="whitespace-nowrap font-medium">
                    {r.staff?.full_name ?? r.staff?.email ?? "—"}
                    <FlagDot row={r} />
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{r.clients?.first_name} {r.clients?.last_name}</TableCell>
                  <TableCell className="whitespace-nowrap"><Badge variant="outline" className="font-mono">{r.service_type_code}</Badge></TableCell>
                  <TableCell className="whitespace-nowrap font-mono">{fmtTimeAmPm(inIso)} → {outIso ? fmtTimeAmPm(outIso) : "—"}</TableCell>
                  <TableCell onClick={stopRowToggle}>
                    <Button variant="outline" size="sm" onClick={() => onMap(r)}>
                      <MapPin /> View
                    </Button>
                  </TableCell>
                  <TableCell><GeofenceBadge row={r} /></TableCell>
                  <TableCell className="max-w-xs truncate text-xs text-muted-foreground" title={r.outside_geofence_reason ?? ""}>
                    {r.outside_geofence_reason ?? "—"}
                  </TableCell>
                  <TableCell className="text-right" onClick={stopRowToggle}>
                    <Button size="sm" onClick={() => onReview(r)}>
                      {r.reconciliation_status === "pending" ? "Resolve" : "Review"}
                    </Button>
                  </TableCell>
                </TableRow>
                {open && <InlineNotesRow row={r} colSpan={10} />}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}

const ACCEPT_ATTESTATION_TEXT =
  "I have reviewed this EVV location exception and the staff explanation, and I attest that the service was validly delivered and is approved for billing.";

function ReviewReconciliationDialog({ row, onClose }: { row: Row | null; onClose: () => void }) {
  const qc = useQueryClient();
  const { user } = useAuthHook();
  const [decision, setDecision] = useState<"accepted" | "corrected" | "flagged">("accepted");
  const [signedName, setSignedName] = useState("");
  const [signedTitle, setSignedTitle] = useState("");
  const [attestChecked, setAttestChecked] = useState(false);
  const [notes, setNotes] = useState("");
  const isReadOnly = !!row && row.reconciliation_status && row.reconciliation_status !== "pending";

  useEffect(() => {
    if (!row) return;
    const s = row.reconciliation_status;
    setDecision(s === "flagged" || s === "corrected" ? s : "accepted");
    setSignedName("");
    setSignedTitle("");
    setAttestChecked(false);
    setNotes(row.reconciliation_review_notes ?? "");
  }, [row]);

  // Nearest approved location for distance display.
  const approvedQ = useQuery({
    enabled: !!row?.client_id,
    queryKey: ["evv-reconcile-approved-locs", row?.client_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_approved_locations")
        .select("id, label, address, latitude, longitude, geofence_radius_feet")
        .eq("client_id", row!.client_id);
      if (error) throw error;
      return data ?? [];
    },
  });

  const gpsIn = row?.gps_in_coordinates
    ? { lat: row.gps_in_coordinates.latitude, lng: row.gps_in_coordinates.longitude }
    : null;
  const gpsBad = isLikelyBadCoord(gpsIn);
  const nearest = useMemo(() => {
    if (!gpsIn || gpsBad || !approvedQ.data?.length) return null;
    let best: { label: string; address: string; distFt: number } | null = null;
    for (const loc of approvedQ.data) {
      if (loc.latitude == null || loc.longitude == null) continue;
      const d = haversineFeet(gpsIn, { lat: Number(loc.latitude), lng: Number(loc.longitude) });
      if (!best || d < best.distFt) best = { label: loc.label, address: loc.address ?? "", distFt: d };
    }
    return best;
  }, [gpsIn, gpsBad, approvedQ.data]);
  const distSuspicious = nearest ? isDistanceSuspicious(nearest.distFt) : false;

  const save = useMutation({
    mutationFn: async () => {
      if (!row) return;
      if (decision === "accepted") {
        if (!attestChecked) throw new Error("Please confirm the attestation checkbox.");
        if (signedName.trim().length < 2 || signedTitle.trim().length < 2) {
          throw new Error("Signed name and title are required to accept.");
        }
      }
      if (decision === "corrected" && notes.trim().length < 10) {
        throw new Error("Describe the data/GPS correction (at least 10 characters).");
      }
      const adminName = (user?.user_metadata?.full_name as string | undefined) ?? user?.email ?? "Administrator";
      const attestationPayload =
        decision === "accepted"
          ? JSON.stringify({
              signed_name: signedName.trim(),
              signed_title: signedTitle.trim(),
              attestation_text: ACCEPT_ATTESTATION_TEXT,
              signed_at: new Date().toISOString(),
            })
          : null;
      const { error } = await supabase
        .from("evv_timesheets")
        .update({
          reconciliation_status: decision,
          reconciliation_attestation: attestationPayload,
          reconciliation_review_notes: notes.trim() || null,
          reconciliation_reviewed_by: adminName,
          reconciliation_reviewed_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(
        decision === "accepted"
          ? "Exception accepted and attested — visit is billable."
          : decision === "corrected"
          ? "Marked as data/GPS correction — visit is billable."
          : "Shift flagged for follow-up — held out of billing."
      );
      qc.invalidateQueries({ queryKey: ["evv-reconcile"] });
      qc.invalidateQueries({ queryKey: ["evv-pending"] });
      qc.invalidateQueries({ queryKey: ["evv-approved"] });
      onClose();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  let parsedPriorAttestation: { signed_name?: string; signed_title?: string; attestation_text?: string; signed_at?: string } | null = null;
  if (isReadOnly && row?.reconciliation_attestation) {
    try { parsedPriorAttestation = JSON.parse(row.reconciliation_attestation); } catch { /* legacy free-text */ }
  }

  return (
    <Dialog open={!!row} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isReadOnly ? "EVV Reconciliation — Review" : "Resolve EVV Location Exception"}</DialogTitle>
          <DialogDescription>
            This shift was punched outside all approved client locations. Review the captured GPS and the staff's explanation, then record your decision.
          </DialogDescription>
        </DialogHeader>
        {row && (
          <div className="space-y-3 text-sm">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-md border border-border bg-muted/30 p-2">
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Caregiver</div>
                <div className="font-medium">{row.staff?.full_name ?? row.staff?.email ?? "—"}</div>
              </div>
              <div className="rounded-md border border-border bg-muted/30 p-2">
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Client</div>
                <div className="font-medium">{row.clients?.first_name} {row.clients?.last_name}</div>
                {row.clients?.physical_address && (
                  <div className="mt-0.5 text-[11px] text-muted-foreground">{row.clients.physical_address}</div>
                )}
              </div>
              <div className="rounded-md border border-border bg-muted/30 p-2">
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Service</div>
                <div className="font-mono">{row.service_type_code}</div>
              </div>
              <div className="rounded-md border border-border bg-muted/30 p-2">
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Shift</div>
                <div className="font-mono text-xs">{fmtDateMDY(effectiveIn(row))} · {fmtTimeAmPm(effectiveIn(row))} → {effectiveOut(row) ? fmtTimeAmPm(effectiveOut(row)!) : "—"}</div>
              </div>
            </div>

            <div className="rounded-lg border border-warning/40 bg-warning/10 p-3">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-warning-foreground">Staff Reconciliation Explanation</div>
              <p className="mt-1 whitespace-pre-wrap text-sm text-foreground/90">{row.outside_geofence_reason || "(none captured)"}</p>
            </div>

            {row.shift_note_text && (
              <div className="rounded-lg border border-border p-3">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Shift Note</div>
                <p className="mt-1 whitespace-pre-wrap text-sm">{row.shift_note_text}</p>
              </div>
            )}

            <div className="rounded-lg border border-border p-3 text-xs">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Captured GPS</div>
              {gpsBad ? (
                <div className="mt-1 rounded border border-destructive/40 bg-destructive/10 p-2 text-destructive">
                  Captured GPS appears invalid (lat {String(row.gps_in_coordinates?.latitude ?? "—")}, lng {String(row.gps_in_coordinates?.longitude ?? "—")}). Treat the staff explanation as the primary evidence.
                </div>
              ) : (
                <div className="mt-1 font-mono">
                  In: {gpsIn!.lat.toFixed(6)}, {gpsIn!.lng.toFixed(6)}
                  {row.gps_in_coordinates?.accuracy_meters != null && <> · ±{Math.round(row.gps_in_coordinates.accuracy_meters)}m</>}
                  {row.gps_out_coordinates && (
                    <> · Out: {row.gps_out_coordinates.latitude.toFixed(6)}, {row.gps_out_coordinates.longitude.toFixed(6)}</>
                  )}
                </div>
              )}
              {nearest && (
                <div className={`mt-2 ${distSuspicious ? "text-destructive" : "text-muted-foreground"}`}>
                  Nearest approved location: <span className="font-medium">{nearest.label}</span>
                  {nearest.address ? <> — <span className="font-mono text-[11px]">{nearest.address}</span></> : null}
                  <div>Distance from punch: <span className="font-mono">{formatDistanceFeet(nearest.distFt)}</span>{distSuspicious && " — likely a bad GPS reading"}</div>
                </div>
              )}
              {!nearest && !gpsBad && (
                <div className="mt-2 text-muted-foreground">No approved location coordinates on file — distance can't be computed.</div>
              )}
            </div>

            {isReadOnly ? (
              <div className="rounded-lg border border-border bg-muted/20 p-3 text-xs">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Resolution</div>
                <div className="mt-1">
                  <Badge variant="outline" className="uppercase">{row.reconciliation_status}</Badge>{" "}
                  by <span className="font-medium">{row.reconciliation_reviewed_by ?? "—"}</span> on{" "}
                  {row.reconciliation_reviewed_at ? new Date(row.reconciliation_reviewed_at).toLocaleString() : "—"}
                </div>
                {parsedPriorAttestation?.attestation_text && (
                  <div className="mt-2 rounded border border-border bg-card p-2">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Attestation</div>
                    <p className="mt-1 italic">"{parsedPriorAttestation.attestation_text}"</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Signed: {parsedPriorAttestation.signed_name} · {parsedPriorAttestation.signed_title}
                    </p>
                  </div>
                )}
                {!parsedPriorAttestation && row.reconciliation_attestation && (
                  <p className="mt-2 whitespace-pre-wrap">{row.reconciliation_attestation}</p>
                )}
                {row.reconciliation_review_notes && (
                  <div className="mt-2">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Notes</div>
                    <p className="mt-0.5 whitespace-pre-wrap">{row.reconciliation_review_notes}</p>
                  </div>
                )}
              </div>
            ) : (
              <>
                <div>
                  <Label className="text-xs">Decision</Label>
                  <div className="mt-1 flex flex-wrap gap-2">
                    <Button type="button" size="sm" variant={decision === "accepted" ? "default" : "outline"} onClick={() => setDecision("accepted")}>
                      <CheckCircle2 /> Accept (valid)
                    </Button>
                    <Button type="button" size="sm" variant={decision === "corrected" ? "default" : "outline"} onClick={() => setDecision("corrected")}>
                      <Pencil /> Correct (data/GPS error)
                    </Button>
                    <Button type="button" size="sm" variant={decision === "flagged" ? "destructive" : "outline"} onClick={() => setDecision("flagged")}>
                      <Flag /> Flag — do not bill
                    </Button>
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {decision === "accepted" && "Service was validly delivered away from the address (community, transport, appointment). Keeps the visit billable."}
                    {decision === "corrected" && "Captured GPS or service address was wrong. Keeps the visit billable; note the correction below."}
                    {decision === "flagged" && "Explanation doesn't hold up or visit is questionable. Holds the visit out of billing pending follow-up."}
                  </p>
                </div>

                {decision === "accepted" && (
                  <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs dark:border-amber-800 dark:bg-amber-950/30">
                    <p className="font-semibold text-amber-900 dark:text-amber-100">Attestation (required)</p>
                    <p className="mt-1 whitespace-pre-wrap text-amber-950 dark:text-amber-50">{ACCEPT_ATTESTATION_TEXT}</p>
                    <label className="mt-2 flex items-start gap-2 text-amber-950 dark:text-amber-50">
                      <input
                        type="checkbox"
                        checked={attestChecked}
                        onChange={(e) => setAttestChecked(e.target.checked)}
                        className="mt-0.5"
                      />
                      <span>I confirm the above attestation is true and accurate.</span>
                    </label>
                    <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <div>
                        <Label className="text-[11px]">Your full name *</Label>
                        <Input value={signedName} onChange={(e) => setSignedName(e.target.value)} maxLength={120} />
                      </div>
                      <div>
                        <Label className="text-[11px]">Your title *</Label>
                        <Input value={signedTitle} onChange={(e) => setSignedTitle(e.target.value)} maxLength={120} placeholder="e.g. Program Director" />
                      </div>
                    </div>
                    <p className="mt-1 text-[10px] text-muted-foreground">Signing at: {new Date().toLocaleString()}</p>
                  </div>
                )}

                <div>
                  <Label htmlFor="rnotes" className="text-xs">
                    {decision === "corrected" ? "Correction notes (required)" : "Internal review notes (optional)"}
                  </Label>
                  <Textarea
                    id="rnotes"
                    rows={2}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder={decision === "corrected" ? "Describe the data/GPS error and how you verified it." : "Any internal follow-up actions or context."}
                  />
                </div>
              </>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>{isReadOnly ? "Close" : "Cancel"}</Button>
          {!isReadOnly && (
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save resolution"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
