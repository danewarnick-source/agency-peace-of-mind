// Records — unified work-records surface.
// Reuses, does not rewrite:
//   • src/lib/evv-codes.ts                — EVV_SERVICE_CODES, isEvvLockedCode
//   • src/lib/utah-evv-export.ts          — downloadCsv (Master Ledger export)
//   • src/lib/records-review-rules.ts     — exception engine
//   • src/components/evv/utah-export-dialog.tsx — DHHS EVV CSV export dialog
//   • src/components/residential/residential-daily-tab.tsx — HHS daily logs
//   • src/components/nectar/nectar-search-bar.tsx — semantic search above table
import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import {
  Download, MapPin, AlertTriangle, Clock, ShieldAlert,
  FileWarning, AlertCircle, ListChecks, CalendarRange, SlidersHorizontal,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-org";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { CheckboxMultiSelect } from "@/components/ui/checkbox-multi-select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { EVV_SERVICE_CODES, isEvvLockedCode } from "@/lib/evv-codes";
import { downloadCsv } from "@/lib/utah-evv-export";
import { reviewExceptions, type ReviewException } from "@/lib/records-review-rules";
import { ResidentialDailyTab } from "@/components/residential/residential-daily-tab";
import { NectarSearchBar } from "@/components/nectar/nectar-search-bar";
import { UtahExportDialog } from "@/components/evv/utah-export-dialog";
import { toast } from "sonner";

const PAGE_SIZE = 100;
const FETCH_CAP = 2000;

type Mode = "attention" | "all";
type RecordType = "all" | "evv" | "non_evv" | "hhs_daily";

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
function fmtShort(iso: string): string {
  try { return format(parseISO(iso), "MMM d"); } catch { return iso; }
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

  const [mode, setMode] = useState<Mode>("attention");
  const [type, setType] = useState<RecordType>("all");
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
  const rowsQ = useQuery({
    enabled: !!orgId && isAdmin && type !== "hhs_daily",
    queryKey: [
      "records", orgId, mode, type, staff, client, code, team, from, to,
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
        if (clientIds.length === 0) return { all: [] as Derived[], attention: [] as Derived[] };
      }

      // Resolve service codes per "type"
      let codeFilter = code.slice();
      if (type === "evv") {
        const evvOnly = EVV_SERVICE_CODES.filter((c) => c.evvLock).map((c) => c.code);
        codeFilter = codeFilter.length ? codeFilter.filter((c) => evvOnly.includes(c)) : evvOnly;
        if (codeFilter.length === 0) return { all: [] as Derived[], attention: [] as Derived[] };
      } else if (type === "non_evv") {
        // Every non-EVV-mandated code (RHS, DSI, SEI, etc.). HHS is a daily-log
        // code and lives under its own type — exclude here so the bucket means
        // "clockable, non-EVV".
        const nonEvv = EVV_SERVICE_CODES
          .filter((c) => !c.evvLock && c.code !== "HHS")
          .map((c) => c.code);
        codeFilter = codeFilter.length ? codeFilter.filter((c) => nonEvv.includes(c)) : nonEvv;
        if (codeFilter.length === 0) return { all: [] as Derived[], attention: [] as Derived[] };
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

      const { data, error } = await q;
      if (error) throw error;
      const baseRows = (data as unknown as Row[]) ?? [];

      const staffMap = new Map((staffOptionsQ.data ?? []).map((s) => [s.value, s.label]));
      const teamMap = new Map((teamOptionsQ.data ?? []).map((t) => [t.value, t.label]));

      const derivedAll: Derived[] = baseRows.map((r) => {
        const exc = reviewExceptions(r);
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
          exceptions: exc,
          is_evv_locked: isEvvLockedCode(r.service_type_code),
        };
      });

      const attention = derivedAll.filter((r) => r.exceptions.length > 0);
      return { all: derivedAll, attention };
    },
  });

  if (!isAdmin) {
    return (
      <div className="rounded-md border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
        Admins and managers only.
      </div>
    );
  }

  const visibleSet = mode === "attention" ? rowsQ.data?.attention ?? [] : rowsQ.data?.all ?? [];
  const attentionCount = rowsQ.data?.attention.length ?? 0;
  const total = visibleSet.length;
  const rows = visibleSet.slice(0, PAGE_SIZE);

  // DHHS EVV export only when every visible row is EVV-locked.
  const allEvvLocked = rows.length > 0 && rows.every((r) => r.is_evv_locked);
  const canDhhsExport = allEvvLocked;

  const handleMasterCsv = () => {
    if (visibleSet.length === 0) {
      toast.info("Nothing to export — adjust filters first.");
      return;
    }
    const header = [
      "Caregiver", "Client", "Member ID", "Service code", "Date",
      "Clock in", "Clock out", "Duration (min)", "Edited by admin",
      "Geofence", "Exceptions", "Home/Team",
    ];
    const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
    const body = [header.join(",")].concat(
      visibleSet.map((r) => [
        r.staff_name, r.client_name, r.utah_medicaid_member_id ?? "",
        r.service_type_code, fmtDate(r.clock_in_timestamp),
        fmtTs(r.corrected_clock_in ?? r.clock_in_timestamp),
        fmtTs(r.corrected_clock_out ?? r.clock_out_timestamp),
        String(r.duration_min),
        r.is_edited_by_admin ? "yes" : "no",
        r.is_out_of_bounds ? "out-of-bounds" : "in-bounds",
        r.exceptions.map((e) => e.label).join("; "),
        r.team_name ?? "",
      ].map((v) => esc(String(v))).join(",")),
    ).join("\r\n");
    downloadCsv(`agency-records_${from}_${to}.csv`, body);
  };

  const dateLabel = `${fmtShort(from)} – ${fmtShort(to)}`;

  const filterControls = (
    <>
      <div className="min-w-[150px]">
        <CheckboxMultiSelect
          value={staff} onChange={setStaff}
          options={staffOptionsQ.data ?? []}
          placeholder="All staff" searchPlaceholder="Filter staff…"
        />
      </div>
      <div className="min-w-[150px]">
        <CheckboxMultiSelect
          value={client} onChange={setClient}
          options={clientOptionsQ.data ?? []}
          placeholder="All clients" searchPlaceholder="Filter clients…"
        />
      </div>
      <div className="min-w-[140px]">
        <CheckboxMultiSelect
          value={code} onChange={setCode}
          options={codeOptions}
          placeholder="All codes" chipMonospace
        />
      </div>
      <div className="min-w-[150px]">
        <CheckboxMultiSelect
          value={team} onChange={setTeam}
          options={teamOptionsQ.data ?? []}
          placeholder="All homes/teams"
        />
      </div>
      <Popover>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" size="sm" className="h-9 gap-2 font-normal">
            <CalendarRange className="h-4 w-4" />
            {dateLabel}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[260px] space-y-2 p-3">
          <label className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">From</label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <label className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">To</label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </PopoverContent>
      </Popover>
    </>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <h3 className="text-base font-semibold text-[#0B1126]">Records</h3>
          <p className="text-xs text-muted-foreground">
            Every work record in one place. Default view is the exception queue; switch to All records to search the archive.
          </p>
        </div>
        <div className="w-full md:w-[440px]">
          <NectarSearchBar nav={[]} isAdminCapable variant="desktop" />
        </div>
      </div>

      {/* Mode toggle — two-way */}
      <div className="inline-flex overflow-hidden rounded-md border border-border">
        <button
          type="button"
          onClick={() => setMode("attention")}
          className={`flex min-h-[36px] items-center gap-2 px-3 py-1.5 text-xs font-medium transition ${
            mode === "attention" ? "bg-[#137182] text-white" : "bg-card text-muted-foreground hover:bg-accent"
          }`}
        >
          <AlertCircle className="h-3.5 w-3.5" /> Needs attention
          <span className={`rounded px-1.5 py-0.5 text-[10px] ${mode === "attention" ? "bg-white/20" : "bg-muted text-foreground"}`}>
            {attentionCount}
          </span>
        </button>
        <button
          type="button"
          onClick={() => setMode("all")}
          className={`flex min-h-[36px] items-center gap-2 border-l border-border px-3 py-1.5 text-xs font-medium transition ${
            mode === "all" ? "bg-[#137182] text-white" : "bg-card text-muted-foreground hover:bg-accent"
          }`}
        >
          <ListChecks className="h-3.5 w-3.5" /> All records
        </button>
      </div>

      {/* Type control — 4 buttons, fixed order */}
      <div className="flex flex-wrap items-center gap-1 rounded-md border border-border bg-card p-1">
        {([
          ["all", "All types"],
          ["evv", "EVV timesheets"],
          ["non_evv", "Non-EVV timesheets"],
          ["hhs_daily", "Daily logs (HHS)"],
        ] as const).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setType(k)}
            className={`min-h-[36px] rounded px-3 py-1 text-xs font-medium transition ${
              type === k ? "bg-[#0B1126] text-white" : "text-muted-foreground hover:bg-accent"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {type === "hhs_daily" ? (
        <div className="rounded-lg border border-border bg-card p-3">
          <ResidentialDailyTab />
        </div>
      ) : (
        <>
          {/* Compact inline filter strip */}
          <div className="hidden flex-wrap items-center gap-2 md:flex">
            {filterControls}
          </div>
          {/* Mobile: collapsed into a Sheet */}
          <div className="flex items-center justify-between md:hidden">
            <Sheet>
              <SheetTrigger asChild>
                <Button type="button" variant="outline" size="sm" className="h-9 gap-2">
                  <SlidersHorizontal className="h-4 w-4" /> Filters
                </Button>
              </SheetTrigger>
              <SheetContent side="bottom" className="space-y-3">
                <SheetHeader>
                  <SheetTitle>Filters</SheetTitle>
                </SheetHeader>
                <div className="flex flex-col gap-2">{filterControls}</div>
              </SheetContent>
            </Sheet>
          </div>

          {/* Count + exports */}
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
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
                  title="DHHS EVV export is available only when every visible row is an EVV-locked code."
                >
                  DHHS EVV export hidden (mixed/non-EVV codes in result)
                </span>
              )}
              <Button
                type="button" size="sm" variant="outline"
                onClick={handleMasterCsv}
                disabled={rowsQ.isLoading || total === 0}
                title={total === 0 ? "No records in the current view to export" : undefined}
                className="gap-2"
              >
                <Download className="h-4 w-4" /> Export Master Agency Ledger CSV
              </Button>
            </div>
          </div>

          {/* Results table */}
          <div className="overflow-x-auto rounded-lg border border-border bg-card">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Caregiver</th>
                  <th className="px-3 py-2">Client</th>
                  <th className="px-3 py-2">Code</th>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">In → Out</th>
                  <th className="px-3 py-2">Duration</th>
                  <th className="px-3 py-2">Geofence</th>
                  <th className="px-3 py-2">{mode === "attention" ? "Why flagged" : "Flags"}</th>
                </tr>
              </thead>
              <tbody>
                {rowsQ.isLoading && (
                  <tr><td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">Loading…</td></tr>
                )}
                {!rowsQ.isLoading && rows.length === 0 && (
                  <tr><td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">
                    {mode === "attention" ? "No exceptions — everything is clean for these filters." : "No records match these filters."}
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
                          <span className="text-xs text-muted-foreground">—</span>
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

      {utahDialogOpen && canDhhsExport && orgId && (
        <UtahExportDialog
          open={utahDialogOpen}
          onClose={() => setUtahDialogOpen(false)}
          organizationId={orgId}
          staffNameMap={new Map((staffOptionsQ.data ?? []).map((s) => [s.value, s.label]))}
        />
      )}
    </div>
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
