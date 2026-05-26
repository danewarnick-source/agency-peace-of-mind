import { Fragment, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
import { Check, Pencil, MapPin, Clock, Loader2, Download, AlertTriangle, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { EVV_SERVICE_CODES, evvServiceLabel, isEvvLockedCode } from "@/lib/evv-codes";

// Rendered as the dedicated "Geofence Validation Status" column on both
// the Pending Approvals Ledger and the Approved Timesheets Archive.
// Records with an empty/null `outside_geofence_reason` are treated as a
// mathematical compliance MATCH (per the structural integration rule).
function GeofenceBadge({ reason }: { reason: string | null }) {
  const hasReason = !!(reason && reason.trim().length > 0);
  if (!hasReason) {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full border border-emerald-600/30 px-2.5 py-0.5 text-[11px] font-semibold"
        style={{ backgroundColor: "#d1fae5", color: "#065f46" }}
      >
        🟢 MATCH
      </span>
    );
  }
  return (
    <div className="flex flex-col items-start gap-0.5">
      <TooltipProvider delayDuration={150}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className="inline-flex cursor-help items-center gap-1 rounded-full border border-rose-700/30 px-2.5 py-0.5 text-[11px] font-semibold"
              style={{ backgroundColor: "#fee2e2", color: "#991b1b" }}
            >
              🔴 NO MATCH
            </span>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs text-xs">{reason}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <span
        className="max-w-[180px] truncate text-[10px] italic text-muted-foreground"
        title={reason ?? ""}
      >
        {reason}
      </span>
    </div>
  );
}

export const Route = createFileRoute("/dashboard/compliance-desk")({
  head: () => ({ meta: [{ title: "Compliance Desk — Care Academy" }] }),
  component: () => (
    <RequirePermission perm="manage_users">
      <ComplianceDeskPage />
    </RequirePermission>
  ),
});

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
  clients: { first_name: string; last_name: string; physical_address: string | null } | null;
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
          <span
            className="ml-2 inline-flex cursor-help items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
            style={{ backgroundColor: "rgba(251,191,36,0.25)", color: "#1f2937", borderColor: "rgba(217,119,6,0.55)" }}
          >
            ⚠️ EDITED BY ADMIN
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs text-xs">{detail}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/** TSheets-style inline shift narrative + goals strip, rendered under every row. */
function InlineNotesRow({ row, colSpan }: { row: Row; colSpan: number }) {
  const note = (row.shift_note_text ?? "").trim();
  const goals = row.goals_completed ?? [];
  return (
    <TableRow className="border-t-0 hover:bg-transparent">
      <TableCell colSpan={colSpan} className="bg-muted/30 py-3">
        <div className="rounded-lg border border-border bg-background/60 p-3 space-y-2.5">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-foreground">
              💬 Shift Note
              {row.ai_compliance_status === "Verified" && (
                <span
                  className="inline-flex items-center gap-1 rounded-md border border-emerald-500/50 bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-300"
                  title={row.ai_compliance_feedback ?? "AI Documentation Coach cleared this note."}
                >
                  🟢 AI CLEARED
                  {row.ai_coaching_iterations && row.ai_coaching_iterations > 1
                    ? ` · ${row.ai_coaching_iterations}×`
                    : ""}
                </span>
              )}
              {row.ai_compliance_status === "Exception" && (
                <span
                  className="inline-flex items-center gap-1 rounded-md border border-rose-500/50 bg-rose-500/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-rose-700 dark:text-rose-300"
                  title={row.ai_compliance_feedback ?? "Submitted with Exception Flag — review required."}
                >
                  🔴 AI FLAG
                </span>
              )}
            </div>
            <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-foreground/90">
              {note.length > 0 ? note : <span className="italic text-muted-foreground">No narrative recorded.</span>}
            </p>
          </div>
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-foreground">
              🎯 Goals Targeted
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



const SELECT_COLS = "id, staff_id, client_id, utah_medicaid_provider_id, utah_medicaid_member_id, service_type_code, shift_entry_type, clock_in_timestamp, clock_out_timestamp, rounded_clock_in, rounded_clock_out, gps_in_coordinates, gps_out_coordinates, outside_geofence_reason, status, shift_note_text, goals_completed, is_edited_by_admin, edited_by_admin_name, edit_audit_history_log, ai_compliance_status, ai_coaching_iterations, ai_compliance_feedback, clients(first_name,last_name,physical_address)";

async function hydrateStaff(list: Row[]) {
  const ids = Array.from(new Set(list.map((r) => r.staff_id)));
  if (!ids.length) return list;
  const { data: profiles } = await supabase.from("profiles").select("id, full_name, email").in("id", ids);
  const map = new Map((profiles ?? []).map((p) => [p.id, p]));
  list.forEach((r) => {
    const p = map.get(r.staff_id);
    r.staff = p ? { full_name: p.full_name, email: p.email } : null;
  });
  return list;
}

// ============================================================
// 🤖 Natural-language query parser for the AI Command Search bar
// ============================================================
type ParsedQuery = {
  dateFrom: number | null;
  dateTo: number | null;
  hourMin: number | null;   // inclusive
  hourMax: number | null;   // inclusive
  nameTokens: string[];     // residual tokens after temporal/diurnal stripped
  fullText: string;         // lowercased original
};

const MONTHS: Record<string, number> = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3,
  may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7,
  sep: 8, sept: 8, september: 8, oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11,
};

function endOfMonth(y: number, m: number) {
  return new Date(y, m + 1, 0, 23, 59, 59, 999).getTime();
}
function startOfMonth(y: number, m: number) {
  return new Date(y, m, 1, 0, 0, 0, 0).getTime();
}

function parseNlQuery(raw: string): ParsedQuery {
  const original = raw.trim();
  const q = original.toLowerCase();
  let dateFrom: number | null = null;
  let dateTo: number | null = null;
  let hourMin: number | null = null;
  let hourMax: number | null = null;
  let stripped = q;

  const now = new Date();
  const year = now.getFullYear();

  // "from <month> to <month>" (assume current year)
  const monthRange = q.match(/from\s+([a-z]+)\s+to\s+([a-z]+)/);
  if (monthRange && MONTHS[monthRange[1]] != null && MONTHS[monthRange[2]] != null) {
    const a = MONTHS[monthRange[1]];
    const b = MONTHS[monthRange[2]];
    dateFrom = startOfMonth(year, Math.min(a, b));
    dateTo = endOfMonth(year, Math.max(a, b));
    stripped = stripped.replace(monthRange[0], " ");
  } else {
    // single "in <month>" or "<month>"
    const single = q.match(/(?:^|\s)(?:in\s+)?(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?=\s|$)/);
    if (single) {
      const m = MONTHS[single[1]];
      dateFrom = startOfMonth(year, m);
      dateTo = endOfMonth(year, m);
      stripped = stripped.replace(single[0], " ");
    }
  }

  if (q.includes("last month")) {
    const d = new Date(year, now.getMonth() - 1, 1);
    dateFrom = startOfMonth(d.getFullYear(), d.getMonth());
    dateTo = endOfMonth(d.getFullYear(), d.getMonth());
    stripped = stripped.replace("last month", " ");
  } else if (q.includes("this month")) {
    dateFrom = startOfMonth(year, now.getMonth());
    dateTo = endOfMonth(year, now.getMonth());
    stripped = stripped.replace("this month", " ");
  } else if (q.includes("this week")) {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - d.getDay());
    dateFrom = d.getTime();
    const end = new Date(d);
    end.setDate(end.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    dateTo = end.getTime();
    stripped = stripped.replace("this week", " ");
  } else if (q.includes("last week")) {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - d.getDay() - 7);
    dateFrom = d.getTime();
    const end = new Date(d);
    end.setDate(end.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    dateTo = end.getTime();
    stripped = stripped.replace("last week", " ");
  } else if (q.includes("yesterday")) {
    const d = new Date(now); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - 1);
    dateFrom = d.getTime();
    dateTo = d.getTime() + 86_399_999;
    stripped = stripped.replace("yesterday", " ");
  } else if (q.includes("today")) {
    const d = new Date(now); d.setHours(0, 0, 0, 0);
    dateFrom = d.getTime();
    dateTo = d.getTime() + 86_399_999;
    stripped = stripped.replace("today", " ");
  }

  // Diurnal: "after 3pm", "before 9am", "at 10"
  const afterRe = q.match(/after\s+(\d{1,2})\s*(am|pm)?/);
  if (afterRe) {
    let h = parseInt(afterRe[1], 10);
    if (afterRe[2] === "pm" && h < 12) h += 12;
    if (afterRe[2] === "am" && h === 12) h = 0;
    hourMin = h;
    stripped = stripped.replace(afterRe[0], " ");
  }
  const beforeRe = q.match(/before\s+(\d{1,2})\s*(am|pm)?/);
  if (beforeRe) {
    let h = parseInt(beforeRe[1], 10);
    if (beforeRe[2] === "pm" && h < 12) h += 12;
    if (beforeRe[2] === "am" && h === 12) h = 0;
    hourMax = h;
    stripped = stripped.replace(beforeRe[0], " ");
  }
  if (q.includes("night shift")) {
    hourMin = hourMin ?? 18;
    stripped = stripped.replace("night shift", " ");
  }
  if (q.includes("morning")) {
    hourMin = hourMin ?? 6;
    hourMax = hourMax ?? 12;
    stripped = stripped.replace("morning", " ");
  }
  if (q.includes("afternoon")) {
    hourMin = hourMin ?? 12;
    hourMax = hourMax ?? 17;
    stripped = stripped.replace("afternoon", " ");
  }
  if (q.includes("evening")) {
    hourMin = hourMin ?? 17;
    hourMax = hourMax ?? 22;
    stripped = stripped.replace("evening", " ");
  }

  // Tokenize residual for entity matching, dropping common stopwords / connectors
  const STOP = new Set([
    "with", "and", "the", "for", "all", "any", "shift", "shifts", "worked",
    "pull", "up", "show", "me", "find", "list", "of", "from", "to", "on",
    "in", "at", "by", "between", "around", "every", "times", "time",
  ]);
  const nameTokens = stripped
    .split(/[^a-z0-9']+/i)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && !STOP.has(t.toLowerCase()) && !/^\d+$/.test(t));

  return { dateFrom, dateTo, hourMin, hourMax, nameTokens, fullText: q };
}

function rowMatchesQuery(r: Row, p: ParsedQuery): boolean {
  const inIso = effectiveIn(r);
  const inDate = new Date(inIso);
  const inMs = inDate.getTime();
  if (p.dateFrom != null && inMs < p.dateFrom) return false;
  if (p.dateTo != null && inMs > p.dateTo) return false;
  const h = inDate.getHours();
  if (p.hourMin != null && h < p.hourMin) return false;
  if (p.hourMax != null && h > p.hourMax) return false;

  const caregiver = (r.staff?.full_name ?? r.staff?.email ?? "").toLowerCase();
  const client = `${r.clients?.first_name ?? ""} ${r.clients?.last_name ?? ""}`.trim().toLowerCase();
  const haystack = [
    caregiver, client,
    (r.service_type_code ?? "").toLowerCase(),
    (r.outside_geofence_reason ?? "").toLowerCase(),
    (r.shift_note_text ?? "").toLowerCase(),
    (r.utah_medicaid_member_id ?? "").toLowerCase(),
  ].join(" \u0001 ");

  if (p.nameTokens.length > 0) {
    // Every residual token must appear somewhere in the row's text fields.
    for (const tok of p.nameTokens) {
      if (!haystack.includes(tok.toLowerCase())) return false;
    }
  }
  return true;
}

function ComplianceDeskPage() {
  const { data: org } = useCurrentOrg();
  const qc = useQueryClient();
  const [sub, setSub] = useState<"pending" | "evv-archive" | "non-evv-archive">("pending");
  const [mapOpen, setMapOpen] = useState<Row | null>(null);
  const [editRow, setEditRow] = useState<Row | null>(null);
  const [reasonRow, setReasonRow] = useState<Row | null>(null);
  const [aiQuery, setAiQuery] = useState("");
  const isSearching = aiQuery.trim().length > 0;

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
        .limit(1000);
      if (error) throw error;
      return hydrateStaff((data ?? []) as unknown as Row[]);
    },
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

  const onGlobalUtahExport = () => {
    const all = approvedQ.data ?? [];
    const eligible = all.filter((r) => isEvvLockedCode(r.service_type_code) && !r.outside_geofence_reason);
    if (!eligible.length) { toast.error("No approved EVV-locked, in-bounds shifts to export."); return; }
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    downloadCsv(`utah_dhhs_evv_${stamp}.csv`, buildUtahCsv(eligible));
    const skipped = all.length - eligible.length;
    toast.success(`Exported ${eligible.length} shift${eligible.length === 1 ? "" : "s"}.${skipped > 0 ? ` Skipped ${skipped} (non-EVV or 🔴 NO MATCH).` : ""}`);
  };
  const onGlobalMasterExport = () => {
    const all = approvedQ.data ?? [];
    if (!all.length) { toast.error("No approved shifts to export."); return; }
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    downloadCsv(`master_agency_ledger_${stamp}.csv`, buildMasterLedgerCsv(all));
    toast.success(`Exported ${all.length} shift${all.length === 1 ? "" : "s"} to Master Agency Ledger.`);
  };

  return (
    <div className="space-y-4">
      <header className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Compliance Desk</h1>
          <p className="text-sm text-muted-foreground">
            Approve EVV shifts, audit GPS punches, and export Utah DHHS billing files.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <Button
            onClick={onGlobalUtahExport}
            disabled={approvedQ.isLoading}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            <Download className="mr-2 h-4 w-4" /> 📥 Export Utah DHHS EVV CSV
          </Button>
          <Button
            onClick={onGlobalMasterExport}
            disabled={approvedQ.isLoading}
            variant="secondary"
          >
            <Download className="mr-2 h-4 w-4" /> 📊 Export Master Agency Ledger CSV
          </Button>
        </div>
      </header>

      {/* 🤖 AI Command Search — sits above the tab filters, intercepts cross-tab queries */}
      <div className="space-y-1.5">
        <div
          className="group relative rounded-xl p-[1.5px] transition"
          style={{
            background: isSearching
              ? "linear-gradient(135deg, hsl(var(--primary)/0.85), hsl(280 90% 60% / 0.85), hsl(190 95% 55% / 0.85))"
              : "linear-gradient(135deg, hsl(var(--primary)/0.45), hsl(280 90% 60% / 0.35), hsl(190 95% 55% / 0.45))",
          }}
        >
          <div className="flex items-center gap-2 rounded-[10px] bg-background px-3 py-2 shadow-sm focus-within:shadow-md">
            <Sparkles className="h-4 w-4 shrink-0 text-primary" />
            <Input
              value={aiQuery}
              onChange={(e) => setAiQuery(e.target.value)}
              placeholder="🤖 Search everything via AI... Try: 'Pull up all times Dane worked with John Smith from May to July after 3pm'"
              className="h-9 flex-1 border-0 bg-transparent px-1 text-sm shadow-none focus-visible:ring-0"
            />
            {isSearching && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={() => setAiQuery("")}
                aria-label="Clear search"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
        {isSearching && (
          <p className="px-1 text-xs font-medium text-muted-foreground">
            📊 Showing cross-tab query results matching your criteria…
          </p>
        )}
      </div>

      {!isSearching && (
        <nav className="inline-flex flex-wrap rounded-lg border border-border bg-card p-1">
          <button
            type="button"
            onClick={() => setSub("pending")}
            className={`rounded-md px-4 py-2 text-sm font-medium transition ${sub === "pending" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            📥 Pending Review
          </button>
          <button
            type="button"
            onClick={() => setSub("evv-archive")}
            className={`rounded-md px-4 py-2 text-sm font-medium transition ${sub === "evv-archive" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            📁 State EVV Archive
          </button>
          <button
            type="button"
            onClick={() => setSub("non-evv-archive")}
            className={`rounded-md px-4 py-2 text-sm font-medium transition ${sub === "non-evv-archive" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            💼 Internal / Non-EVV Archive
          </button>
        </nav>
      )}

      {isSearching ? (
        <UnifiedSearchResults
          query={aiQuery}
          pending={pendingQ.data ?? []}
          approved={approvedQ.data ?? []}
          loading={pendingQ.isLoading || approvedQ.isLoading}
          onMap={setMapOpen}
          onEdit={setEditRow}
          onReason={setReasonRow}
          onApprove={(id) => approve.mutate(id)}
          approving={approve.isPending}
        />
      ) : sub === "pending" ? (
        <PendingTable
          rows={pendingQ.data ?? []}
          loading={pendingQ.isLoading}
          onMap={setMapOpen}
          onEdit={setEditRow}
          onApprove={(id) => approve.mutate(id)}
          approving={approve.isPending}
          onReason={setReasonRow}
        />
      ) : sub === "evv-archive" ? (
        <ArchiveTable
          variant="evv"
          rows={(approvedQ.data ?? []).filter((r) => isEvvLockedCode(r.service_type_code))}
          loading={approvedQ.isLoading}
          onMap={setMapOpen}
          onEdit={setEditRow}
        />
      ) : (
        <ArchiveTable
          variant="non-evv"
          rows={(approvedQ.data ?? []).filter((r) => !isEvvLockedCode(r.service_type_code))}
          loading={approvedQ.isLoading}
          onMap={setMapOpen}
          onEdit={setEditRow}
        />
      )}

      <GpsMatchDialog row={mapOpen} onClose={() => setMapOpen(null)} />
      <EditShiftDialog row={editRow} onClose={() => setEditRow(null)} />
      <ReasonDialog row={reasonRow} onClose={() => setReasonRow(null)} />
    </div>
  );
}

// 🤖 Unified cross-tab AI search results — merges Pending + Approved (EVV + Non-EVV)
function UnifiedSearchResults({
  query, pending, approved, loading,
  onMap, onEdit, onReason, onApprove, approving,
}: {
  query: string;
  pending: Row[];
  approved: Row[];
  loading: boolean;
  onMap: (r: Row) => void;
  onEdit: (r: Row) => void;
  onReason: (r: Row) => void;
  onApprove: (id: string) => void;
  approving: boolean;
}) {
  const parsed = useMemo(() => parseNlQuery(query), [query]);
  const merged = useMemo(() => {
    const all = [...pending, ...approved];
    const seen = new Set<string>();
    const dedup: Row[] = [];
    for (const r of all) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      dedup.push(r);
    }
    return dedup
      .filter((r) => rowMatchesQuery(r, parsed))
      .sort((a, b) => new Date(effectiveIn(b)).getTime() - new Date(effectiveIn(a)).getTime());
  }, [pending, approved, parsed]);

  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          🤖 AI Cross-Tab Results
        </h2>
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          {parsed.dateFrom != null && parsed.dateTo != null && (
            <Badge variant="outline" className="font-mono">
              📅 {new Date(parsed.dateFrom).toLocaleDateString()} → {new Date(parsed.dateTo).toLocaleDateString()}
            </Badge>
          )}
          {parsed.hourMin != null && (
            <Badge variant="outline" className="font-mono">⏰ ≥ {parsed.hourMin}:00</Badge>
          )}
          {parsed.hourMax != null && (
            <Badge variant="outline" className="font-mono">⏰ ≤ {parsed.hourMax}:00</Badge>
          )}
          {parsed.nameTokens.slice(0, 4).map((t) => (
            <Badge key={t} variant="secondary" className="font-mono">🔎 {t}</Badge>
          ))}
          <Badge variant="outline" className="font-mono">{merged.length} match{merged.length === 1 ? "" : "es"}</Badge>
        </div>
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Caregiver</TableHead>
              <TableHead>Client</TableHead>
              <TableHead>Service</TableHead>
              <TableHead>In → Out</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>GPS</TableHead>
              <TableHead>Geofence Validation Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={10} className="py-10 text-center text-sm text-muted-foreground">Loading…</TableCell></TableRow>
            ) : merged.length === 0 ? (
              <TableRow><TableCell colSpan={10} className="py-10 text-center text-sm text-muted-foreground">No shifts match your AI query.</TableCell></TableRow>
            ) : merged.map((r) => {
              const inIso = effectiveIn(r);
              const outIso = effectiveOut(r);
              const isPending = r.status === "Pending";
              return (
                <Fragment key={r.id}>
                  <TableRow>
                    <TableCell className="font-mono text-xs">{fmtDateMDY(inIso)}</TableCell>
                    <TableCell>
                      <Badge variant={isPending ? "default" : "secondary"} className="text-[10px]">
                        {isPending ? "PENDING" : "APPROVED"}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">
                      {r.staff?.full_name ?? r.staff?.email ?? "—"}
                      <EditedByAdminBadge row={r} />
                    </TableCell>
                    <TableCell>{r.clients?.first_name} {r.clients?.last_name}</TableCell>
                    <TableCell><Badge variant="outline" className="font-mono">{r.service_type_code}</Badge></TableCell>
                    <TableCell className="font-mono text-xs">
                      {fmtTimeHMSAmPm(inIso)} → {outIso ? fmtTimeHMSAmPm(outIso) : "—"}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{fmtDuration(inIso, outIso)}</TableCell>
                    <TableCell>
                      <Button variant="outline" size="sm" onClick={() => onMap(r)}>
                        <MapPin className="mr-1 h-3 w-3" /> View
                      </Button>
                    </TableCell>
                    <TableCell
                      onClick={() => r.outside_geofence_reason && onReason(r)}
                      className={r.outside_geofence_reason ? "cursor-pointer" : ""}
                    >
                      <GeofenceBadge reason={r.outside_geofence_reason} />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1.5">
                        {isPending && (
                          <Button
                            size="icon"
                            className="h-8 w-8 bg-emerald-600 hover:bg-emerald-700"
                            onClick={() => onApprove(r.id)}
                            disabled={approving}
                            aria-label="Approve"
                          >
                            {approving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                          </Button>
                        )}
                        <Button size="icon" variant="secondary" className="h-8 w-8" onClick={() => onEdit(r)} aria-label="Edit">
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                  <InlineNotesRow row={r} colSpan={10} />
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
}: {
  rows: Row[]; loading: boolean;
  onMap: (r: Row) => void; onEdit: (r: Row) => void;
  onApprove: (id: string) => void; approving: boolean;
  onReason: (r: Row) => void;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Pending EVV Shifts</h2>
        <Badge variant="outline" className="font-mono text-[10px]">{rows.length} pending</Badge>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Caregiver</TableHead>
              <TableHead>Client</TableHead>
              <TableHead>Origin</TableHead>
              <TableHead>Member ID</TableHead>
              <TableHead>Service</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>GPS</TableHead>
              <TableHead>Geofence Validation Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={9} className="py-10 text-center text-sm text-muted-foreground">Loading…</TableCell></TableRow>
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={9} className="py-10 text-center text-sm text-muted-foreground">No pending shifts. ✓</TableCell></TableRow>
            ) : rows.map((r) => (
              <Fragment key={r.id}>
              <TableRow>
                <TableCell className="font-medium">
                  {r.staff?.full_name ?? r.staff?.email ?? "—"}
                  <EditedByAdminBadge row={r} />
                </TableCell>
                <TableCell>
                  <div className="text-sm">{r.clients?.first_name} {r.clients?.last_name}</div>
                  <div className="text-[11px] text-muted-foreground">{r.clients?.physical_address ?? "—"}</div>
                </TableCell>
                <TableCell>
                  <Badge variant={r.shift_entry_type === "Client_Profile_Pass" ? "default" : "secondary"}>
                    {r.shift_entry_type === "Client_Profile_Pass" ? "In-Chart" : "Sidebar"}
                  </Badge>
                </TableCell>
                <TableCell className="font-mono text-xs">{r.utah_medicaid_member_id}</TableCell>
                <TableCell><Badge variant="outline" className="font-mono">{r.service_type_code}</Badge></TableCell>
                <TableCell className="font-mono text-xs"><Clock className="mr-1 inline h-3 w-3" />{fmtDuration(effectiveIn(r), effectiveOut(r))}</TableCell>
                <TableCell>
                  <Button variant="outline" size="sm" onClick={() => onMap(r)}>
                    <MapPin className="mr-1 h-3 w-3" /> View
                  </Button>
                </TableCell>
                <TableCell onClick={() => r.outside_geofence_reason && onReason(r)} className={r.outside_geofence_reason ? "cursor-pointer" : ""}>
                  <GeofenceBadge reason={r.outside_geofence_reason} />
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1.5">
                    <Button
                      size="icon"
                      className="h-8 w-8 bg-emerald-600 hover:bg-emerald-700"
                      onClick={() => onApprove(r.id)}
                      disabled={approving}
                      aria-label="Approve"
                    >
                      {approving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    </Button>
                    <Button size="icon" variant="secondary" className="h-8 w-8" onClick={() => onEdit(r)} aria-label="Edit">
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
              <InlineNotesRow row={r} colSpan={9} />
              </Fragment>
            ))}
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
function csvEscape(s: string) {
  const v = s ?? "";
  if (v.includes(",") || v.includes('"') || v.includes("\n")) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

const UTAH_30_HEADER =
  "Member ID (req),First name (req),Middle initial,Last name (req),Service code (req),Service description,Provider ID (req),Employee Performing Service (req),Begin date (req),Begin time (req),Begin address (req),Begin Apt/Suite/Floor,Begin City (req),Begin State,Begin Zip,Begin Geo Latitude,Begin Geo Longitude,End date (req),End time (req),End Address1,End Address2,End City,End State,End Zip,End Geo Latitude,End Geo Longitude,Orig_receipt_id (req if CORRECTION),Batch_id (req),Record_id (req),EVV Vendor (req)";

const EVV_VENDOR_NAME = "Care Academy";

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

function ArchiveTable({
  rows, loading, onMap, onEdit, variant,
}: { rows: Row[]; loading: boolean; onMap: (r: Row) => void; onEdit: (r: Row) => void; variant: "evv" | "non-evv" }) {
  const [search, setSearch] = useState("");
  const [svc, setSvc] = useState<string>("all");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");

  const codeOptions = useMemo(
    () => EVV_SERVICE_CODES.filter((c) => (variant === "evv" ? c.evvLock : !c.evvLock)),
    [variant],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const fromMs = from ? new Date(from).getTime() : null;
    const toMs = to ? new Date(to).getTime() + 86_399_000 : null;
    return rows.filter((r) => {
      if (svc !== "all" && r.service_type_code !== svc) return false;
      const t = new Date(effectiveIn(r)).getTime();
      if (fromMs && t < fromMs) return false;
      if (toMs && t > toMs) return false;
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
  }, [rows, search, svc, from, to]);

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

  const heading = variant === "evv" ? "State EVV Archive (Geofence-Locked Codes)" : "Internal / Non-EVV Archive";
  const exportLabel = variant === "evv" ? "📥 Export Utah DHHS EVV CSV" : "📥 Export Payroll CSV";

  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
      <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{heading}</h2>
        <Button onClick={onExport} className="bg-emerald-600 hover:bg-emerald-700">
          <Download className="mr-2 h-4 w-4" /> {exportLabel}
        </Button>
      </div>

      <div className="mb-3 grid gap-2 md:grid-cols-4">
        <Input placeholder="Search staff, client, member ID…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <Select value={svc} onValueChange={setSvc}>
          <SelectTrigger><SelectValue placeholder="Service code" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All service codes</SelectItem>
            {codeOptions.map((c) => <SelectItem key={c.code} value={c.code}>{evvServiceLabel(c.code)}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From date" />
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To date" />
      </div>


      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Caregiver</TableHead>
              <TableHead>Client</TableHead>
              <TableHead>Member ID</TableHead>
              <TableHead>Service</TableHead>
              <TableHead>In → Out (rounded)</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>GPS</TableHead>
              <TableHead>Geofence Validation Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={10} className="py-10 text-center text-sm text-muted-foreground">Loading…</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={10} className="py-10 text-center text-sm text-muted-foreground">No approved shifts match.</TableCell></TableRow>
            ) : filtered.map((r) => {
              const inIso = effectiveIn(r);
              const outIso = effectiveOut(r);
              return (
                <Fragment key={r.id}>
                <TableRow>
                  <TableCell className="font-mono text-xs">{fmtDateMDY(inIso)}</TableCell>
                  <TableCell className="font-medium">
                    {r.staff?.full_name ?? r.staff?.email ?? "—"}
                    <EditedByAdminBadge row={r} />
                  </TableCell>
                  <TableCell>{r.clients?.first_name} {r.clients?.last_name}</TableCell>
                  <TableCell className="font-mono text-xs">{r.utah_medicaid_member_id}</TableCell>
                  <TableCell><Badge variant="outline" className="font-mono">{r.service_type_code}</Badge></TableCell>
                  <TableCell className="font-mono text-xs">{fmtTimeHMSAmPm(inIso)} → {outIso ? fmtTimeHMSAmPm(outIso) : "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{fmtDuration(inIso, outIso)}</TableCell>
                  <TableCell>
                    <Button variant="outline" size="sm" onClick={() => onMap(r)}>
                      <MapPin className="mr-1 h-3 w-3" /> View
                    </Button>
                  </TableCell>
                  <TableCell>
                    <GeofenceBadge reason={r.outside_geofence_reason} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="secondary" onClick={() => onEdit(r)}>
                      <Pencil className="mr-1 h-3 w-3" /> Edit
                    </Button>
                  </TableCell>
                </TableRow>
                <InlineNotesRow row={r} colSpan={10} />
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
          <DialogTitle>📍 Geofence Variance Justification</DialogTitle>
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
          <DialogTitle>📍 GPS Map Match</DialogTitle>
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
                  🔗 Open clock-in pin in OpenStreetMap
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
                      🔗 Open clock-out pin in OpenStreetMap
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
