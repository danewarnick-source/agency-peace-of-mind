import { useMemo, useState } from "react";
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
import { Check, Pencil, MapPin, Clock, Loader2, Download, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { EVV_SERVICE_CODES, evvServiceLabel } from "@/lib/evv-codes";

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

const SELECT_COLS = "id, staff_id, client_id, utah_medicaid_provider_id, utah_medicaid_member_id, service_type_code, shift_entry_type, clock_in_timestamp, clock_out_timestamp, rounded_clock_in, rounded_clock_out, gps_in_coordinates, gps_out_coordinates, outside_geofence_reason, status, clients(first_name,last_name,physical_address)";

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

function ComplianceDeskPage() {
  const { data: org } = useCurrentOrg();
  const qc = useQueryClient();
  const [sub, setSub] = useState<"pending" | "archive">("pending");
  const [mapOpen, setMapOpen] = useState<Row | null>(null);
  const [editRow, setEditRow] = useState<Row | null>(null);
  const [reasonRow, setReasonRow] = useState<Row | null>(null);

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
    enabled: !!org?.organization_id && sub === "archive",
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

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Compliance Desk</h1>
        <p className="text-sm text-muted-foreground">
          Approve EVV shifts, audit GPS punches, and export Utah DHHS billing files.
        </p>
      </header>

      <nav className="inline-flex flex-wrap rounded-lg border border-border bg-card p-1">
        <button
          type="button"
          onClick={() => setSub("pending")}
          className={`rounded-md px-4 py-2 text-sm font-medium transition ${sub === "pending" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
        >
          📥 Pending Approvals Ledger
        </button>
        <button
          type="button"
          onClick={() => setSub("archive")}
          className={`rounded-md px-4 py-2 text-sm font-medium transition ${sub === "archive" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
        >
          📁 Approved Timesheets Archive
        </button>
      </nav>

      {sub === "pending" ? (
        <PendingTable
          rows={pendingQ.data ?? []}
          loading={pendingQ.isLoading}
          onMap={setMapOpen}
          onEdit={setEditRow}
          onApprove={(id) => approve.mutate(id)}
          approving={approve.isPending}
          onReason={setReasonRow}
        />
      ) : (
        <ArchiveTable
          rows={approvedQ.data ?? []}
          loading={approvedQ.isLoading}
          onMap={setMapOpen}
        />
      )}

      <GpsMatchDialog row={mapOpen} onClose={() => setMapOpen(null)} />
      <EditShiftDialog row={editRow} onClose={() => setEditRow(null)} />
      <ReasonDialog row={reasonRow} onClose={() => setReasonRow(null)} />
    </div>
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
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.staff?.full_name ?? r.staff?.email ?? "—"}</TableCell>
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
                <TableCell>
                  {r.outside_geofence_reason ? (
                    <Button variant="ghost" size="sm" className="text-amber-600" onClick={() => onReason(r)}>
                      <AlertTriangle className="mr-1 h-3 w-3" /> Justified
                    </Button>
                  ) : <span className="text-[11px] text-muted-foreground">—</span>}
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
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}

// === Utah DHHS CSV helpers ===
function pad2(n: number) { return n < 10 ? `0${n}` : String(n); }
function fmtDate(iso: string) {
  const d = new Date(iso);
  return `${pad2(d.getMonth() + 1)}/${pad2(d.getDate())}/${d.getFullYear()}`;
}
function fmtTime12(iso: string) {
  const d = new Date(iso);
  let h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12; if (h === 0) h = 12;
  return `${pad2(h)}:${pad2(m)} ${ampm}`;
}
function csvEscape(s: string) {
  if (s.includes(",") || s.includes('"') || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
function textQualified(s: string) {
  // Wrap so spreadsheets don't strip leading zeroes: ="0012345678"
  return `"=""${(s ?? "").replace(/"/g, "")}"""`;
}

function buildUtahCsv(rows: Row[]): string {
  const header = "Provider ID,Member ID,Service Code,Begin Date,Begin Time,End Date,End Time,Original Receipt ID,Batch ID,Record ID";
  const lines = rows.map((r) => {
    const inIso = effectiveIn(r);
    const outIso = effectiveOut(r) ?? inIso;
    return [
      textQualified(r.utah_medicaid_provider_id ?? ""),
      textQualified(r.utah_medicaid_member_id ?? ""),
      csvEscape(r.service_type_code ?? ""),
      csvEscape(fmtDate(inIso)),
      csvEscape(fmtTime12(inIso)),
      csvEscape(fmtDate(outIso)),
      csvEscape(fmtTime12(outIso)),
      "",
      "",
      "",
    ].join(",");
  });
  return [header, ...lines].join("\r\n");
}

function downloadCsv(filename: string, body: string) {
  const blob = new Blob([body], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

function ArchiveTable({
  rows, loading, onMap,
}: { rows: Row[]; loading: boolean; onMap: (r: Row) => void }) {
  const [search, setSearch] = useState("");
  const [svc, setSvc] = useState<string>("all");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");

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
    const csv = buildUtahCsv(filtered);
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    downloadCsv(`utah_dhhs_evv_${stamp}.csv`, csv);
    toast.success(`Exported ${filtered.length} shift${filtered.length === 1 ? "" : "s"}.`);
  };

  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
      <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Approved Timesheets Archive</h2>
        <Button onClick={onExport} className="bg-emerald-600 hover:bg-emerald-700">
          <Download className="mr-2 h-4 w-4" /> 📥 Export Utah DHHS EVV CSV
        </Button>
      </div>

      <div className="mb-3 grid gap-2 md:grid-cols-4">
        <Input placeholder="Search staff, client, member ID…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <Select value={svc} onValueChange={setSvc}>
          <SelectTrigger><SelectValue placeholder="Service code" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All service codes</SelectItem>
            {EVV_SERVICE_CODES.map((c) => <SelectItem key={c.code} value={c.code}>{evvServiceLabel(c.code)}</SelectItem>)}
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
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">Loading…</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">No approved shifts match.</TableCell></TableRow>
            ) : filtered.map((r) => {
              const inIso = effectiveIn(r);
              const outIso = effectiveOut(r);
              return (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs">{fmtDate(inIso)}</TableCell>
                  <TableCell className="font-medium">{r.staff?.full_name ?? r.staff?.email ?? "—"}</TableCell>
                  <TableCell>{r.clients?.first_name} {r.clients?.last_name}</TableCell>
                  <TableCell className="font-mono text-xs">{r.utah_medicaid_member_id}</TableCell>
                  <TableCell><Badge variant="outline" className="font-mono">{r.service_type_code}</Badge></TableCell>
                  <TableCell className="font-mono text-xs">{fmtTime12(inIso)} → {outIso ? fmtTime12(outIso) : "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{fmtDuration(inIso, outIso)}</TableCell>
                  <TableCell>
                    <Button variant="outline" size="sm" onClick={() => onMap(r)}>
                      <MapPin className="mr-1 h-3 w-3" /> View
                    </Button>
                  </TableCell>
                </TableRow>
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
  const link = useMemo(() => {
    if (!row) return "";
    const a = row.gps_in_coordinates;
    const b = row.gps_out_coordinates;
    if (!a) return "";
    if (!b) return `https://www.openstreetmap.org/?mlat=${a.latitude}&mlon=${a.longitude}#map=17/${a.latitude}/${a.longitude}`;
    return `https://www.openstreetmap.org/?bbox=${Math.min(a.longitude,b.longitude)},${Math.min(a.latitude,b.latitude)},${Math.max(a.longitude,b.longitude)},${Math.max(a.latitude,b.latitude)}`;
  }, [row]);

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
                </>
              ) : <div className="text-xs text-muted-foreground">Not captured</div>}
            </div>
            {link && <Button asChild variant="outline" className="w-full"><a href={link} target="_blank" rel="noreferrer">Open in OpenStreetMap</a></Button>}
          </div>
        )}
        <DialogFooter><Button variant="ghost" onClick={onClose}>Close</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditShiftDialog({ row, onClose }: { row: Row | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [clockIn, setClockIn] = useState("");
  const [clockOut, setClockOut] = useState("");
  const [svc, setSvc] = useState("");

  useMemo(() => {
    if (row) {
      setClockIn(row.clock_in_timestamp.slice(0, 16));
      setClockOut(row.clock_out_timestamp ? row.clock_out_timestamp.slice(0, 16) : "");
      setSvc(row.service_type_code);
    }
  }, [row]);

  const save = useMutation({
    mutationFn: async () => {
      if (!row) return;
      const { error } = await supabase
        .from("evv_timesheets")
        .update({
          clock_in_timestamp: new Date(clockIn).toISOString(),
          clock_out_timestamp: clockOut ? new Date(clockOut).toISOString() : null,
          service_type_code: svc,
        })
        .eq("id", row.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Shift adjusted.");
      qc.invalidateQueries({ queryKey: ["evv-pending"] });
      qc.invalidateQueries({ queryKey: ["evv-approved"] });
      onClose();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <Dialog open={!!row} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Manual Adjustment</DialogTitle>
          <DialogDescription>Update the shift timestamps or service code before approval.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div>
            <Label>Clock-In</Label>
            <Input type="datetime-local" value={clockIn} onChange={(e) => setClockIn(e.target.value)} />
          </div>
          <div>
            <Label>Clock-Out</Label>
            <Input type="datetime-local" value={clockOut} onChange={(e) => setClockOut(e.target.value)} />
          </div>
          <div>
            <Label>Service Code</Label>
            <Select value={svc} onValueChange={setSvc}>
              <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>
                {EVV_SERVICE_CODES.map((c) => <SelectItem key={c.code} value={c.code}>{evvServiceLabel(c.code)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
