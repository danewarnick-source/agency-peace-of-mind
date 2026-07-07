// Approved EVV Archive — searchable cross-agency view of approved EVV shifts.
// READ-ONLY surface over evv_timesheets (status='Approved') + evv_export_records.
// Does NOT change approval, billing math, DHHS export, or reconciliation logic.
import { useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { format, parseISO } from "date-fns";
import { Download, MapPin, AlertTriangle, CheckCircle2, Circle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-org";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { CheckboxMultiSelect } from "@/components/ui/checkbox-multi-select";
import { EVV_SERVICE_CODES } from "@/lib/evv-codes";
import { downloadCsv } from "@/lib/utah-evv-export";
import { HistoricalTimesheetBadge } from "@/components/smart-import/timesheets/historical-timesheet-badge";
import { toast } from "sonner";

const searchSchema = z.object({
  staff: z.array(z.string()).optional(),
  client: z.array(z.string()).optional(),
  code: z.array(z.string()).optional(),
  team: z.array(z.string()).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  billing: z.enum(["all", "billed", "unbilled", "held"]).optional(),
  page: z.number().int().min(1).optional(),
});

const PAGE_SIZE = 100;

type Row = {
  id: string;
  staff_id: string;
  client_id: string;
  service_type_code: string;
  clock_in_timestamp: string;
  clock_out_timestamp: string | null;
  raw_clock_in: string | null;
  raw_clock_out: string | null;
  corrected_clock_in: string | null;
  corrected_clock_out: string | null;
  is_edited_by_admin: boolean;
  is_out_of_bounds: boolean;
  gps_validated: boolean;
  review_status: string;
  incident_flag: boolean;
  denial_reason: string | null;
  utah_medicaid_member_id: string;
  import_source: string | null;
  clients: { first_name: string; last_name: string; team_id: string | null } | null;
};

type Derived = Row & {
  staff_name: string;
  client_name: string;
  team_name: string | null;
  billing: "billed" | "unbilled" | "held";
  duration_min: number;
};

function deriveBilling(r: Row, hasExport: boolean): "billed" | "unbilled" | "held" {
  if (hasExport) return "billed";
  if (
    r.incident_flag ||
    r.denial_reason ||
    ["needs_review", "rejected"].includes(r.review_status || "")
  )
    return "held";
  return "unbilled";
}

function fmtTs(iso: string | null): string {
  if (!iso) return "—";
  try {
    return format(parseISO(iso), "h:mm a");
  } catch {
    return "—";
  }
}
function fmtDate(iso: string): string {
  try {
    return format(parseISO(iso), "MMM d, yyyy");
  } catch {
    return iso;
  }
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

export function EvvArchivePage() {
  const navigate = useNavigate();
  const { data: org } = useCurrentOrg();
  const orgId = org?.organization_id;
  const isAdmin = org?.role === "admin" || org?.role === "manager" || org?.role === "super_admin";

  // Filter state — local only. We sync to URL when embedded as a standalone route,
  // but since this component is also rendered inside the Documentation hub
  // (which owns its own search params), we keep state local for safety.
  const [staff, setStaff] = useState<string[]>([]);
  const [client, setClient] = useState<string[]>([]);
  const [code, setCode] = useState<string[]>([]);
  const [team, setTeam] = useState<string[]>([]);
  const [from, setFrom] = useState<string>(defaultFrom());
  const [to, setTo] = useState<string>(defaultTo());
  const [billing, setBilling] = useState<"all" | "billed" | "unbilled" | "held">("all");
  const [page, setPage] = useState<number>(1);
  const [exportLoading, setExportLoading] = useState(false);

  // No-op stub kept for future URL syncing — currently we just navigate to self.
  const syncUrl = (_next: Partial<z.infer<typeof searchSchema>>) => {
    void _next;
    void navigate;
  };

  // Option sources
  const staffOptionsQ = useQuery({
    enabled: !!orgId,
    queryKey: ["evv-archive-staff", orgId],
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
    queryKey: ["evv-archive-clients", orgId],
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
    queryKey: ["evv-archive-teams", orgId],
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

  // Main query — server-side filter where we can, then derive billing client-side.
  const rowsQ = useQuery({
    enabled: !!orgId && isAdmin,
    queryKey: ["evv-archive", orgId, staff, client, code, team, from, to, billing, page],
    queryFn: async () => {
      const result = await fetchArchive({
        orgId: orgId!,
        staff,
        client,
        code,
        team,
        from,
        to,
        billing,
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
        clientLookup: clientOptionsQ.data ?? [],
        teamLookup: teamOptionsQ.data ?? [],
        staffLookup: staffOptionsQ.data ?? [],
      });
      return result;
    },
  });

  const handleCsv = async () => {
    if (!orgId) return;
    setExportLoading(true);
    try {
      const allDerived = await fetchArchiveForExport({
        orgId,
        staff,
        client,
        code,
        team,
        from,
        to,
        clientLookup: clientOptionsQ.data ?? [],
        teamLookup: teamOptionsQ.data ?? [],
        staffLookup: staffOptionsQ.data ?? [],
      });
      const exportRows = billing === "all" ? allDerived : allDerived.filter((r) => r.billing === billing);
      const header = [
      "Caregiver",
      "Client",
      "Member ID",
      "Service code",
      "Date",
      "Clock in",
      "Clock out",
      "Duration (min)",
      "Edited by admin",
      "Geofence",
      "Billing status",
      "Home/Team",
    ];
      const esc = (s: string) =>
        /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      const body = [header.join(",")]
        .concat(
          exportRows.map((r) =>
            [
              r.staff_name,
              r.client_name,
              r.utah_medicaid_member_id ?? "",
              r.service_type_code,
              fmtDate(r.clock_in_timestamp),
              fmtTs(r.corrected_clock_in ?? r.clock_in_timestamp),
              fmtTs(r.corrected_clock_out ?? r.clock_out_timestamp),
              String(r.duration_min),
              r.is_edited_by_admin ? "yes" : "no",
              r.is_out_of_bounds ? "out-of-bounds" : "in-bounds",
              r.billing,
              r.team_name ?? "",
            ]
              .map((v) => esc(String(v)))
              .join(","),
          ),
        )
        .join("\r\n");
      downloadCsv(`approved-evv-archive_${from}_${to}.csv`, body);
    } catch (err) {
      toast.error("Export failed. Please try again.");
      console.error(err);
    } finally {
      setExportLoading(false);
    }
  };

  if (!isAdmin) {
    return (
      <div className="rounded-md border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
        Admins and managers only.
      </div>
    );
  }

  const rows = rowsQ.data?.rows ?? [];
  const total = rowsQ.data?.total ?? 0;

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold text-[#0B1126]">Approved EVV Archive</h3>
        <p className="text-xs text-muted-foreground">
          Searchable record of every approved EVV shift. Read-only — does not change approval, billing, or DHHS export.
        </p>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 gap-3 rounded-lg border border-border bg-card p-3 md:grid-cols-2 lg:grid-cols-3">
        <FilterLabel label="Staff">
          <CheckboxMultiSelect
            value={staff}
            onChange={(v) => {
              setStaff(v);
              setPage(1);
              syncUrl({ staff: v.length ? v : undefined, page: undefined });
            }}
            options={staffOptionsQ.data ?? []}
            placeholder="All staff"
            searchPlaceholder="Filter staff…"
          />
        </FilterLabel>
        <FilterLabel label="Client">
          <CheckboxMultiSelect
            value={client}
            onChange={(v) => {
              setClient(v);
              setPage(1);
              syncUrl({ client: v.length ? v : undefined, page: undefined });
            }}
            options={clientOptionsQ.data ?? []}
            placeholder="All clients"
            searchPlaceholder="Filter clients…"
          />
        </FilterLabel>
        <FilterLabel label="Service code">
          <CheckboxMultiSelect
            value={code}
            onChange={(v) => {
              setCode(v);
              setPage(1);
              syncUrl({ code: v.length ? v : undefined, page: undefined });
            }}
            options={codeOptions}
            placeholder="All codes"
            chipMonospace
          />
        </FilterLabel>
        <FilterLabel label="Home / team">
          <CheckboxMultiSelect
            value={team}
            onChange={(v) => {
              setTeam(v);
              setPage(1);
              syncUrl({ team: v.length ? v : undefined, page: undefined });
            }}
            options={teamOptionsQ.data ?? []}
            placeholder="All homes/teams"
          />
        </FilterLabel>
        <FilterLabel label="From">
          <Input
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPage(1);
              syncUrl({ from: e.target.value, page: undefined });
            }}
          />
        </FilterLabel>
        <FilterLabel label="To">
          <Input
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setPage(1);
              syncUrl({ to: e.target.value, page: undefined });
            }}
          />
        </FilterLabel>
      </div>

      {/* Billing status + CSV */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap items-center gap-1 rounded-md border border-border bg-card p-1">
          {(["all", "billed", "unbilled", "held"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => {
                setBilling(k);
                setPage(1);
                syncUrl({ billing: k === "all" ? undefined : k, page: undefined });
              }}
              className={`min-h-[36px] rounded px-3 py-1 text-xs font-medium capitalize transition ${
                billing === k
                  ? "bg-[#137182] text-white"
                  : "text-muted-foreground hover:bg-accent"
              }`}
            >
              {k === "all" ? "All" : k}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            {rowsQ.isLoading ? "Loading…" : `${total.toLocaleString()} approved shifts`}
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={handleCsv}
            disabled={rowsQ.isLoading || total === 0 || exportLoading}
            className="gap-2"
          >
            <Download className="h-4 w-4" /> {exportLoading ? "Exporting…" : "Download CSV"}
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
              <th className="px-3 py-2">Billing</th>
            </tr>
          </thead>
          <tbody>
            {rowsQ.isLoading && (
              <tr><td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">Loading…</td></tr>
            )}
            {!rowsQ.isLoading && rows.length === 0 && (
              <tr><td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">No approved shifts match these filters.</td></tr>
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
                  <td className="px-3 py-2">
                    {fmtDate(r.clock_in_timestamp)}
                    {r.import_source === "historical_import" && (
                      <div className="mt-0.5"><HistoricalTimesheetBadge /></div>
                    )}
                  </td>
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
                  <td className="px-3 py-2"><BillingBadge value={r.billing} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">
          Page {page} of {Math.max(1, Math.ceil(total / PAGE_SIZE))}
        </span>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => {
              const n = page - 1;
              setPage(n);
              syncUrl({ page: n > 1 ? n : undefined });
            }}
          >
            Previous
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page * PAGE_SIZE >= total}
            onClick={() => {
              const n = page + 1;
              setPage(n);
              syncUrl({ page: n });
            }}
          >
            Next
          </Button>
        </div>
      </div>
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

function BillingBadge({ value }: { value: "billed" | "unbilled" | "held" }) {
  if (value === "billed")
    return (
      <Badge className="gap-1 bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
        <CheckCircle2 className="h-3 w-3" /> Billed
      </Badge>
    );
  if (value === "held")
    return (
      <Badge variant="outline" className="gap-1 border-amber-300 text-amber-800">
        <AlertTriangle className="h-3 w-3" /> Held
      </Badge>
    );
  return (
    <Badge variant="outline" className="gap-1 border-[#137182]/40 text-[#137182]">
      <Circle className="h-3 w-3" /> Unbilled
    </Badge>
  );
}

// ─── Data fetch ──────────────────────────────────────────────────────────────
async function fetchArchive(args: {
  orgId: string;
  staff: string[];
  client: string[];
  code: string[];
  team: string[];
  from: string;
  to: string;
  billing: "all" | "billed" | "unbilled" | "held";
  limit: number;
  offset: number;
  clientLookup: { value: string; label: string }[];
  teamLookup: { value: string; label: string }[];
  staffLookup: { value: string; label: string }[];
}): Promise<{ rows: Derived[]; total: number }> {
  // If team filter is set, resolve to client_ids (clients.team_id ∈ team).
  let clientIds = args.client.slice();
  if (args.team.length > 0) {
    const { data } = await supabase
      .from("clients")
      .select("id")
      .eq("organization_id", args.orgId)
      .in("team_id", args.team);
    const teamClientIds = (data ?? []).map((c) => c.id);
    clientIds = clientIds.length
      ? clientIds.filter((id) => teamClientIds.includes(id))
      : teamClientIds;
    if (clientIds.length === 0) return { rows: [], total: 0 };
  }

  // Build base query
  const fromIso = new Date(`${args.from}T00:00:00`).toISOString();
  const toIso = new Date(`${args.to}T23:59:59.999`).toISOString();
  let q = supabase
    .from("evv_timesheets")
    .select(
      "id, staff_id, client_id, service_type_code, clock_in_timestamp, clock_out_timestamp, raw_clock_in, raw_clock_out, corrected_clock_in, corrected_clock_out, is_edited_by_admin, is_out_of_bounds, gps_validated, review_status, incident_flag, denial_reason, utah_medicaid_member_id, clients:client_id(first_name, last_name, team_id)",
      { count: "exact" },
    )
    .eq("organization_id", args.orgId)
    .eq("status", "Approved")
    .gte("clock_in_timestamp", fromIso)
    .lte("clock_in_timestamp", toIso)
    .order("clock_in_timestamp", { ascending: false });

  if (args.staff.length) q = q.in("staff_id", args.staff);
  if (args.code.length) q = q.in("service_type_code", args.code);
  if (clientIds.length) q = q.in("client_id", clientIds);

  // Over-fetch a window we can derive billing on, then page client-side AFTER
  // billing filter is applied. To keep this simple and correct, we fetch up to
  // limit*5 candidates when a billing filter is active; otherwise we fetch the
  // page directly.
  const needsBillingFilter = args.billing !== "all";
  const fetchLimit = needsBillingFilter ? Math.min(2000, args.limit * 5) : args.limit;
  const fetchOffset = needsBillingFilter ? 0 : args.offset;
  q = q.range(fetchOffset, fetchOffset + fetchLimit - 1);

  const { data, count, error } = await q;
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

  const staffMap = new Map(args.staffLookup.map((s) => [s.value, s.label]));
  const teamMap = new Map(args.teamLookup.map((t) => [t.value, t.label]));

  const derivedAll: Derived[] = baseRows.map((r) => {
    const billing = deriveBilling(r, exportSet.has(r.id));
    const inTs = r.corrected_clock_in ?? r.clock_in_timestamp;
    const outTs = r.corrected_clock_out ?? r.clock_out_timestamp;
    return {
      ...r,
      staff_name: staffMap.get(r.staff_id) ?? r.staff_id.slice(0, 8),
      client_name: r.clients
        ? `${r.clients.first_name ?? ""} ${r.clients.last_name ?? ""}`.trim()
        : r.client_id.slice(0, 8),
      team_name: r.clients?.team_id ? teamMap.get(r.clients.team_id) ?? null : null,
      billing,
      duration_min: durationMin(inTs, outTs),
    };
  });

  if (!needsBillingFilter) {
    return { rows: derivedAll, total: count ?? derivedAll.length };
  }
  const filtered = derivedAll.filter((r) => r.billing === args.billing);
  const total = filtered.length; // approximate when fetchLimit caps; UI shows "of fetched"
  const paged = filtered.slice(args.offset, args.offset + args.limit);
  return { rows: paged, total };
}

// Export-only fetch: pages through ALL matching rows in batches, applies no cap.
async function fetchArchiveForExport(args: {
  orgId: string;
  staff: string[];
  client: string[];
  code: string[];
  team: string[];
  from: string;
  to: string;
  clientLookup: { value: string; label: string }[];
  teamLookup: { value: string; label: string }[];
  staffLookup: { value: string; label: string }[];
}): Promise<Derived[]> {
  // Resolve team filter to client IDs — identical logic to fetchArchive
  let clientIds = args.client.slice();
  if (args.team.length > 0) {
    const { data } = await supabase
      .from("clients")
      .select("id")
      .eq("organization_id", args.orgId)
      .in("team_id", args.team);
    const teamClientIds = (data ?? []).map((c) => c.id);
    clientIds = clientIds.length
      ? clientIds.filter((id) => teamClientIds.includes(id))
      : teamClientIds;
    if (clientIds.length === 0) return [];
  }

  const fromIso = new Date(`${args.from}T00:00:00`).toISOString();
  const toIso = new Date(`${args.to}T23:59:59.999`).toISOString();

  // Factory returns a fresh base query on each call (same select/filters as fetchArchive)
  const buildQuery = () => {
    let q = supabase
      .from("evv_timesheets")
      .select(
        "id, staff_id, client_id, service_type_code, clock_in_timestamp, clock_out_timestamp, raw_clock_in, raw_clock_out, corrected_clock_in, corrected_clock_out, is_edited_by_admin, is_out_of_bounds, gps_validated, review_status, incident_flag, denial_reason, utah_medicaid_member_id, clients:client_id(first_name, last_name, team_id)",
      )
      .eq("organization_id", args.orgId)
      .eq("status", "Approved")
      .gte("clock_in_timestamp", fromIso)
      .lte("clock_in_timestamp", toIso)
      .order("clock_in_timestamp", { ascending: false });
    if (args.staff.length) q = q.in("staff_id", args.staff);
    if (args.code.length) q = q.in("service_type_code", args.code);
    if (clientIds.length) q = q.in("client_id", clientIds);
    return q;
  };

  // Page until exhausted
  const BATCH = 1000;
  let offset = 0;
  const allRows: Row[] = [];
  for (;;) {
    const { data, error } = await buildQuery().range(offset, offset + BATCH - 1);
    if (error) throw error;
    const rows = (data as unknown as Row[]) ?? [];
    allRows.push(...rows);
    if (rows.length < BATCH) break;
    offset += BATCH;
    if (offset > 200_000) break; // safety valve against pathological data
  }

  if (allRows.length === 0) return [];

  // Resolve export status — chunk .in() to avoid URL length limits
  const ids = allRows.map((r) => r.id);
  const exportSet = new Set<string>();
  const ID_CHUNK = 500;
  for (let i = 0; i < ids.length; i += ID_CHUNK) {
    const chunk = ids.slice(i, i + ID_CHUNK);
    const { data: er } = await supabase
      .from("evv_export_records")
      .select("timesheet_id")
      .in("timesheet_id", chunk);
    (er ?? []).forEach((r) => exportSet.add(r.timesheet_id));
  }

  const staffMap = new Map(args.staffLookup.map((s) => [s.value, s.label]));
  const teamMap = new Map(args.teamLookup.map((t) => [t.value, t.label]));

  return allRows.map((r) => {
    const billing = deriveBilling(r, exportSet.has(r.id));
    const inTs = r.corrected_clock_in ?? r.clock_in_timestamp;
    const outTs = r.corrected_clock_out ?? r.clock_out_timestamp;
    return {
      ...r,
      staff_name: staffMap.get(r.staff_id) ?? r.staff_id.slice(0, 8),
      client_name: r.clients
        ? `${r.clients.first_name ?? ""} ${r.clients.last_name ?? ""}`.trim()
        : r.client_id.slice(0, 8),
      team_name: r.clients?.team_id ? teamMap.get(r.clients.team_id) ?? null : null,
      billing,
      duration_min: durationMin(inTs, outTs),
    };
  });
}

function defaultFrom(): string {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}
function defaultTo(): string {
  return new Date().toISOString().slice(0, 10);
}
