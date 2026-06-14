// Records — unified work-records surface.
// Replaces the old Documentation sub-tabs: Review, EVV & timesheets (all
// sub-tabs), Approved EVV Archive, and Host home. ONE table, every filter.
//
// Reuses, does not rewrite:
//   • src/lib/evv-codes.ts                — EVV_SERVICE_CODES, isEvvLockedCode
//   • src/lib/utah-evv-export.ts          — downloadCsv (Master Ledger export)
//   • src/lib/records-review-rules.ts     — exception engine
//   • src/components/evv/utah-export-dialog.tsx — DHHS EVV CSV export dialog
//   • src/components/residential/residential-daily-tab.tsx — HHS+RHS grid
//   • src/components/nectar/nectar-search-bar.tsx — semantic search above table
//
// Reads: evv_timesheets (org-scoped RLS) + evv_export_records. No new tables.
import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import {
  Download, MapPin, AlertTriangle, CheckCircle2, Circle, FileWarning, Clock, ShieldAlert,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-org";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { CheckboxMultiSelect } from "@/components/ui/checkbox-multi-select";
import { EVV_SERVICE_CODES, isEvvLockedCode } from "@/lib/evv-codes";
import { downloadCsv } from "@/lib/utah-evv-export";
import { reviewExceptions, type ReviewException } from "@/lib/records-review-rules";
import { ResidentialDailyTab } from "@/components/residential/residential-daily-tab";
import { NectarSearchBar } from "@/components/nectar/nectar-search-bar";
import { UtahExportDialog } from "@/components/evv/utah-export-dialog";
import { toast } from "sonner";

const PAGE_SIZE = 100;
const FETCH_CAP = 2000;

type RecordType = "evv" | "residential" | "internal";
type RecordStatus = "needs_review" | "pending" | "approved" | "billed";

const RESIDENTIAL_CODES = new Set(["HHS", "RHS"]);

type Row = {
  id: string;
  staff_id: string;
  client_id: string;
  service_type_code: string;
  clock_in_timestamp: string;
  clock_out_timestamp: string | null;
  corrected_clock_in: string | null;
  corrected_clock_out: string | null;
  is_edited_by_admin: boolean;
  is_out_of_bounds: boolean | null;
  outside_geofence_reason: string | null;
  shift_note_text: string | null;
  goals_completed: string[] | null;
  review_status: string | null;
  status: string | null;
  incident_flag: boolean | null;
  denial_reason: string | null;
  utah_medicaid_member_id: string | null;
  clients: { first_name: string; last_name: string; team_id: string | null } | null;
};

type Derived = Row & {
  staff_name: string;
  client_name: string;
  team_name: string | null;
  duration_min: number;
  derived_status: RecordStatus;
  exceptions: ReviewException[];
  is_evv_locked: boolean;
};

const SELECT_COLS =
  "id, staff_id, client_id, service_type_code, clock_in_timestamp, clock_out_timestamp, corrected_clock_in, corrected_clock_out, is_edited_by_admin, is_out_of_bounds, outside_geofence_reason, shift_note_text, goals_completed, review_status, status, incident_flag, denial_reason, utah_medicaid_member_id, clients:client_id(first_name, last_name, team_id)";

function fmtTs(iso: string | null): string {
  if (!iso) return "—";
  try { return format(parseISO(iso), "h:mm a"); } catch { return "—"; }
}
function fmtDate(iso: string): string {
  try { return format(parseISO(iso), "MMM d, yyyy"); } catch { return iso; }
}
function durationMin(start: string, end: string | null): number {
  if (!end) return 0;
  return Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000));
}
function fmtDur(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}h ${m.toString().padStart(2, "0")}m`;
}
function defaultFrom(): string {
  const d = new Date(); d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}
function defaultTo(): string { return new Date().toISOString().slice(0, 10); }

export function RecordsTab() {
  const { data: org } = useCurrentOrg();
  const orgId = org?.organization_id;
  const isAdmin = org?.role === "admin" || org?.role === "manager" || org?.role === "super_admin";

  // Filters — default landing state is "Needs review".
  const [status, setStatus] = useState<RecordStatus>("needs_review");
  const [type, setType] = useState<RecordType | "all">("all");
  const [staff, setStaff] = useState<string[]>([]);
  const [client, setClient] = useState<string[]>([]);
  const [code, setCode] = useState<string[]>([]);
  const [team, setTeam] = useState<string[]>([]);
  const [from, setFrom] = useState<string>(defaultFrom());
  const [to, setTo] = useState<string>(defaultTo());
  const [utahDialogOpen, setUtahDialogOpen] = useState(false);

  // ── Option sources ──────────────────────────────────────────────────────
  const staffOptionsQ = useQuery({
    enabled: !!orgId,
    queryKey: ["records-staff", orgId],
    queryFn: async () => {
      const { data } = await supabase
        .from("organization_members")
        .select("user_id, profiles:user_id(first_name, last_name)")
        .eq("organization_id", orgId!)
        .eq("active", true);
      type R = { user_id: string; profiles: { first_name: string; last_name: string } | null };
      return ((data as unknown as R[]) ?? [])
        .map((r) => ({
          value: r.user_id,
          label: r.profiles
            ? `${r.profiles.first_name ?? ""} ${r.profiles.last_name ?? ""}`.trim() || r.user_id.slice(0, 8)
            : r.user_id.slice(0, 8),
        }))
        .sort((a, b) => a.label.localeCompare(b.label));
    },
  });

  const clientOptionsQ = useQuery({
    enabled: !!orgId,
    queryKey: ["records-clients", orgId],
    queryFn: async () => {
      const { data } = await supabase
        .from("clients")
        .select("id, first_name, last_name, team_id")
        .eq("organization_id", orgId!)
        .order("last_name");
      return (data ?? []).map((c) => ({
        value: c.id,
        label: `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || c.id.slice(0, 8),
      }));
    },
  });

  const teamOptionsQ = useQuery({
    enabled: !!orgId,
    queryKey: ["records-teams", orgId],
    queryFn: async () => {
      const { data } = await supabase
        .from("teams")
        .select("id, team_name")
        .eq("organization_id", orgId!)
        .eq("active", true)
        .order("team_name");
      return (data ?? []).map((t) => ({ value: t.id, label: t.team_name }));
    },
  });

  const codeOptions = useMemo(
    () => EVV_SERVICE_CODES.map((c) => ({ value: c.code, label: c.code, sublabel: c.label })),
    [],
  );

  // ── Main query ──────────────────────────────────────────────────────────
  // Server-side: org, date range, staff, clients (resolved through team), code,
  // and a coarse status pre-filter to keep payload small. We always need
  // candidates for client-side derivation (exceptions + billing).
  const rowsQ = useQuery({
    enabled: !!orgId && isAdmin && type !== "residential",
    queryKey: [
      "records", orgId, status, type, staff, client, code, team, from, to,
    ],
    queryFn: async () => {
      // Resolve team → client_ids
      let clientIds = client.slice();
      if (team.length > 0) {
        const { data } = await supabase
          .from("clients").select("id")
          .eq("organization_id", orgId!).in("team_id", team);
        const t = (data ?? []).map((c) => c.id);
        clientIds = clientIds.length ? clientIds.filter((id) => t.includes(id)) : t;
        if (clientIds.length === 0) return { rows: [] as Derived[] };
      }

      // Resolve service codes per "type"
      let codeFilter = code.slice();
      if (type === "evv") {
        const evvOnly = EVV_SERVICE_CODES.filter((c) => c.evvLock).map((c) => c.code);
        codeFilter = codeFilter.length ? codeFilter.filter((c) => evvOnly.includes(c)) : evvOnly;
        if (codeFilter.length === 0) return { rows: [] as Derived[] };
      } else if (type === "internal") {
        const internalOnly = EVV_SERVICE_CODES
          .filter((c) => !c.evvLock && !RESIDENTIAL_CODES.has(c.code))
          .map((c) => c.code);
        codeFilter = codeFilter.length ? codeFilter.filter((c) => internalOnly.includes(c)) : internalOnly;
        if (codeFilter.length === 0) return { rows: [] as Derived[] };
      }

      const fromIso = new Date(`${from}T00:00:00`).toISOString();
      const toIso = new Date(`${to}T23:59:59.999`).toISOString();

      let q = supabase
        .from("evv_timesheets")
        .select(SELECT_COLS)
        .eq("organization_id", orgId!)
        .gte("clock_in_timestamp", fromIso)
        .lte("clock_in_timestamp", toIso)
        .order("clock_in_timestamp", { ascending: false })
        .limit(FETCH_CAP);

      if (staff.length) q = q.in("staff_id", staff);
      if (codeFilter.length) q = q.in("service_type_code", codeFilter);
      if (clientIds.length) q = q.in("client_id", clientIds);

      // Coarse server-side narrowing by status (final classification still
      // happens client-side after exception derivation).
      if (status === "approved" || status === "billed") {
        q = q.eq("status", "Approved");
      }

      const { data, error } = await q;
      if (error) throw error;
      const baseRows = (data as unknown as Row[]) ?? [];

      // Pull export records for these timesheet ids
      const ids = baseRows.map((r) => r.id);
      let exportSet = new Set<string>();
      if (ids.length) {
        const { data: er } = await supabase
          .from("evv_export_records")
          .select("timesheet_id")
          .in("timesheet_id", ids);
        exportSet = new Set((er ?? []).map((r) => r.timesheet_id));
      }

      const staffMap = new Map((staffOptionsQ.data ?? []).map((s) => [s.value, s.label]));
      const teamMap = new Map((teamOptionsQ.data ?? []).map((t) => [t.value, t.label]));

      const derivedAll: Derived[] = baseRows.map((r) => {
        const exc = reviewExceptions(r);
        const hasExport = exportSet.has(r.id);
        const isApproved = r.status === "Approved";
        let derived_status: RecordStatus;
        if (exc.length > 0) derived_status = "needs_review";
        else if (hasExport) derived_status = "billed";
        else if (isApproved) derived_status = "approved";
        else derived_status = "pending";

        const inTs = r.corrected_clock_in ?? r.clock_in_timestamp;
        const outTs = r.corrected_clock_out ?? r.clock_out_timestamp;
        return {
          ...r,
          staff_name: staffMap.get(r.staff_id) ?? r.staff_id.slice(0, 8),
          client_name: r.clients
            ? `${r.clients.first_name ?? ""} ${r.clients.last_name ?? ""}`.trim()
            : r.client_id.slice(0, 8),
          team_name: r.clients?.team_id ? teamMap.get(r.clients.team_id) ?? null : null,
          duration_min: durationMin(inTs, outTs),
          derived_status,
          exceptions: exc,
          is_evv_locked: isEvvLockedCode(r.service_type_code),
        };
      });

      return { rows: derivedAll.filter((r) => r.derived_status === status) };
    },
  });

  if (!isAdmin) {
    return (
      <div className="rounded-md border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
        Admins and managers only.
      </div>
    );
  }

  const rows = (rowsQ.data?.rows ?? []).slice(0, PAGE_SIZE);
  const total = rowsQ.data?.rows.length ?? 0;

  // ── Export gate ─────────────────────────────────────────────────────────
  // DHHS EVV button only when every code in the actual filtered result set is
  // EVV-locked. Compliance-critical: never allow a mixed export.
  const allEvvLocked =
    rows.length > 0 && rows.every((r) => r.is_evv_locked);
  const canDhhsExport = allEvvLocked;

  const handleMasterCsv = () => {
    if (rows.length === 0) {
      toast.info("Nothing to export — adjust filters first.");
      return;
    }
    const header = [
      "Caregiver", "Client", "Member ID", "Service code", "Date",
      "Clock in", "Clock out", "Duration (min)", "Edited by admin",
      "Geofence", "Status", "Exceptions", "Home/Team",
    ];
    const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
    const body = [header.join(",")].concat(
      (rowsQ.data?.rows ?? []).map((r) => [
        r.staff_name, r.client_name, r.utah_medicaid_member_id ?? "",
        r.service_type_code, fmtDate(r.clock_in_timestamp),
        fmtTs(r.corrected_clock_in ?? r.clock_in_timestamp),
        fmtTs(r.corrected_clock_out ?? r.clock_out_timestamp),
        String(r.duration_min),
        r.is_edited_by_admin ? "yes" : "no",
        r.is_out_of_bounds ? "out-of-bounds" : "in-bounds",
        r.derived_status,
        r.exceptions.map((e) => e.label).join("; "),
        r.team_name ?? "",
      ].map((v) => esc(String(v))).join(",")),
    ).join("\r\n");
    downloadCsv(`agency-records_${from}_${to}.csv`, body);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <h3 className="text-base font-semibold text-[#0B1126]">Records</h3>
          <p className="text-xs text-muted-foreground">
            Every work record in one place. Default view shows shifts that need a human look. Clean shifts flow straight through.
          </p>
        </div>
        <div className="w-full md:w-[440px]">
          <NectarSearchBar nav={[]} isAdminCapable variant="desktop" />
        </div>
      </div>

      {/* Status segmented control */}
      <div className="flex flex-wrap items-center gap-1 rounded-md border border-border bg-card p-1">
        {(["needs_review", "pending", "approved", "billed"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setStatus(k)}
            className={`min-h-[36px] rounded px-3 py-1 text-xs font-medium transition ${
              status === k ? "bg-[#137182] text-white" : "text-muted-foreground hover:bg-accent"
            }`}
          >
            {k === "needs_review" ? "Needs review" : k === "pending" ? "Pending approval" : k === "approved" ? "Approved" : "Billed"}
          </button>
        ))}
      </div>

      {/* Type control */}
      <div className="flex flex-wrap items-center gap-1 rounded-md border border-border bg-card p-1">
        {(["all", "evv", "residential", "internal"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setType(k)}
            className={`min-h-[36px] rounded px-3 py-1 text-xs font-medium transition ${
              type === k ? "bg-[#0B1126] text-white" : "text-muted-foreground hover:bg-accent"
            }`}
          >
            {k === "all" ? "All types" : k === "evv" ? "EVV-locked" : k === "residential" ? "Residential & Daily" : "Internal / Non-EVV"}
          </button>
        ))}
      </div>

      {type === "residential" ? (
        <div className="rounded-lg border border-border bg-card p-3">
          <ResidentialDailyTab />
        </div>
      ) : (
        <>
          {/* Filters */}
          <div className="grid grid-cols-1 gap-3 rounded-lg border border-border bg-card p-3 md:grid-cols-2 lg:grid-cols-3">
            <FilterLabel label="Staff">
              <CheckboxMultiSelect
                value={staff} onChange={setStaff}
                options={staffOptionsQ.data ?? []}
                placeholder="All staff" searchPlaceholder="Filter staff…"
              />
            </FilterLabel>
            <FilterLabel label="Client">
              <CheckboxMultiSelect
                value={client} onChange={setClient}
                options={clientOptionsQ.data ?? []}
                placeholder="All clients" searchPlaceholder="Filter clients…"
              />
            </FilterLabel>
            <FilterLabel label="Service code">
              <CheckboxMultiSelect
                value={code} onChange={setCode}
                options={codeOptions}
                placeholder="All codes" chipMonospace
              />
            </FilterLabel>
            <FilterLabel label="Home / team">
              <CheckboxMultiSelect
                value={team} onChange={setTeam}
                options={teamOptionsQ.data ?? []}
                placeholder="All homes/teams"
              />
            </FilterLabel>
            <FilterLabel label="From">
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </FilterLabel>
            <FilterLabel label="To">
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </FilterLabel>
          </div>

          {/* Export bar + result count */}
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <span className="text-xs text-muted-foreground">
              {rowsQ.isLoading ? "Loading…" : `${total.toLocaleString()} record${total === 1 ? "" : "s"} match`}
              {total > PAGE_SIZE && ` — showing first ${PAGE_SIZE}`}
            </span>
            <div className="flex flex-wrap items-center gap-2">
              {canDhhsExport ? (
                <Button
                  type="button" size="sm" variant="default"
                  onClick={() => setUtahDialogOpen(true)}
                  className="gap-2"
                >
                  <ShieldAlert className="h-4 w-4" /> Export Utah DHHS EVV CSV
                </Button>
              ) : (
                <span
                  className="text-[11px] text-muted-foreground"
                  title="DHHS EVV export is available only when the filter shows EVV-locked codes only."
                >
                  DHHS EVV export hidden (mixed/non-EVV codes in result)
                </span>
              )}
              <Button
                type="button" size="sm" variant="outline"
                onClick={handleMasterCsv}
                disabled={rowsQ.isLoading || total === 0}
                className="gap-2"
              >
                <Download className="h-4 w-4" /> Export Master Agency Ledger CSV
              </Button>
            </div>
          </div>

          {/* Results table */}
          <div className="overflow-x-auto rounded-lg border border-border bg-card">
            <table className="w-full min-w-[960px] text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Caregiver</th>
                  <th className="px-3 py-2">Client</th>
                  <th className="px-3 py-2">Code</th>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">In → Out</th>
                  <th className="px-3 py-2">Duration</th>
                  <th className="px-3 py-2">Geofence</th>
                  <th className="px-3 py-2">{status === "needs_review" ? "Why flagged" : "Status"}</th>
                </tr>
              </thead>
              <tbody>
                {rowsQ.isLoading && (
                  <tr><td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">Loading…</td></tr>
                )}
                {!rowsQ.isLoading && rows.length === 0 && (
                  <tr><td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">
                    {status === "needs_review" ? "No exceptions — everything is clean for these filters." : "No records match these filters."}
                  </td></tr>
                )}
                {rows.map((r) => {
                  const inTs = r.corrected_clock_in ?? r.clock_in_timestamp;
                  const outTs = r.corrected_clock_out ?? r.clock_out_timestamp;
                  return (
                    <tr key={r.id} className="border-t border-border hover:bg-accent/40">
                      <td className="px-3 py-2">{r.staff_name}</td>
                      <td className="px-3 py-2">
                        <Link
                          to="/dashboard/shift/$shiftId"
                          params={{ shiftId: r.id }}
                          target="_blank"
                          className="text-[#137182] hover:underline"
                        >
                          {r.client_name}
                        </Link>
                        {r.team_name && (
                          <span className="ml-1 text-xs text-muted-foreground">· {r.team_name}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">{r.service_type_code}</td>
                      <td className="px-3 py-2">{fmtDate(r.clock_in_timestamp)}</td>
                      <td className="px-3 py-2">
                        {fmtTs(inTs)} → {fmtTs(outTs)}
                        {r.is_edited_by_admin && (
                          <span className="ml-1 text-[10px] font-medium uppercase tracking-wider text-amber-700">edited</span>
                        )}
                      </td>
                      <td className="px-3 py-2 tabular-nums">{fmtDur(r.duration_min)}</td>
                      <td className="px-3 py-2">
                        {r.is_out_of_bounds ? (
                          <span className="inline-flex items-center gap-1 text-xs text-amber-700">
                            <AlertTriangle className="h-3 w-3" /> out
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                            <MapPin className="h-3 w-3" /> in
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {r.exceptions.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {r.exceptions.map((e) => <ReasonBadge key={e.code} ex={e} />)}
                          </div>
                        ) : (
                          <StatusBadge value={r.derived_status} />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Utah DHHS EVV export dialog — only mounted/opened when gate passes. */}
      {utahDialogOpen && canDhhsExport && (
        <UtahExportDialog open={utahDialogOpen} onOpenChange={setUtahDialogOpen} />
      )}
    </div>
  );
}

function FilterLabel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

function ReasonBadge({ ex }: { ex: ReviewException }) {
  if (ex.code === "out_of_geofence") {
    return (
      <Badge variant="outline" className="gap-1 border-amber-300 text-amber-800">
        <MapPin className="h-3 w-3" /> {ex.label}
      </Badge>
    );
  }
  if (ex.code === "no_clockout_stale") {
    return (
      <Badge variant="outline" className="gap-1 border-rose-300 text-rose-800">
        <Clock className="h-3 w-3" /> {ex.label}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1 border-orange-300 text-orange-800">
      <FileWarning className="h-3 w-3" /> {ex.label}
    </Badge>
  );
}

function StatusBadge({ value }: { value: RecordStatus }) {
  if (value === "billed")
    return <Badge className="gap-1 bg-emerald-100 text-emerald-800 hover:bg-emerald-100"><CheckCircle2 className="h-3 w-3" /> Billed</Badge>;
  if (value === "approved")
    return <Badge variant="outline" className="gap-1 border-[#137182]/40 text-[#137182]"><CheckCircle2 className="h-3 w-3" /> Approved</Badge>;
  if (value === "needs_review")
    return <Badge variant="outline" className="gap-1 border-amber-300 text-amber-800"><AlertTriangle className="h-3 w-3" /> Needs review</Badge>;
  return <Badge variant="outline" className="gap-1 border-muted-foreground/30 text-muted-foreground"><Circle className="h-3 w-3" /> Pending</Badge>;
}
