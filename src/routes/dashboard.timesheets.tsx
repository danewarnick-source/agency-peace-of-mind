import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-org";
import { RequirePermission } from "@/components/rbac-guard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import {
  Download, Loader2, AlertTriangle, MapPin, Info, Check, Pencil, Filter, ClipboardList,
  ShieldCheck, FileText, Clock, User, IdCard, Stethoscope, CalendarDays, Navigation, Hash,
} from "lucide-react";
import { toast } from "sonner";
import { jobCodeLabel } from "@/lib/job-codes";

export const Route = createFileRoute("/dashboard/timesheets")({
  head: () => ({ meta: [{ title: "Timesheets — Care Academy" }] }),
  component: () => (
    <RequirePermission perm="export_reports">
      <TimesheetsPage />
    </RequirePermission>
  ),
});

type ShiftRow = {
  id: string;
  user_id: string;
  client_id: string | null;
  clock_in_time: string | null;
  clock_out_time: string | null;
  clock_in_lat: number | null;
  clock_in_long: number | null;
  clock_out_lat: number | null;
  clock_out_long: number | null;
  outside_geofence: boolean;
  clock_in_bypass_reason: string | null;
  clock_out_bypass_reason: string | null;
  geofence_bypass_reason: string | null; // legacy
  device_fingerprint: string | null;
  status: string;
  created_at: string | null;
  profiles: { id?: string; full_name: string | null; email: string | null; employee_id: string | null } | null;
  clients: { id?: string; first_name: string | null; last_name: string | null; job_code: string | null; medicaid_id: string | null } | null;
  shift_notes: { goals_addressed: string[] | null; narrative_summary: string | null }[] | null;
};

const SELECT = `id, user_id, client_id, clock_in_time, clock_out_time,
  clock_in_lat, clock_in_long, clock_out_lat, clock_out_long,
  outside_geofence, clock_in_bypass_reason, clock_out_bypass_reason, geofence_bypass_reason,
  device_fingerprint, status, created_at,
  profiles:user_id ( full_name, email, employee_id ),
  clients:client_id ( first_name, last_name, job_code, medicaid_id ),
  shift_notes ( goals_addressed, narrative_summary )`;

function employeeName(r: ShiftRow) {
  return r.profiles?.full_name || r.profiles?.email || "—";
}
function clientName(r: ShiftRow) {
  return r.clients ? `${r.clients.first_name ?? ""} ${r.clients.last_name ?? ""}`.trim() || "—" : "—";
}
function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString();
}
function fmtDateTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}
function fmtTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function decimalHours(inIso: string | null, outIso: string | null) {
  if (!inIso || !outIso) return "—";
  const ms = new Date(outIso).getTime() - new Date(inIso).getTime();
  if (!isFinite(ms) || ms <= 0) return "0.00";
  return (ms / 3600000).toFixed(2);
}
function gpsString(lat: number | null, lng: number | null) {
  if (lat == null || lng == null) return "";
  return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
}
function csvEscape(v: unknown) {
  const s = v == null ? "" : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
function toDtLocal(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function TimesheetsPage() {
  const { data: org } = useCurrentOrg();
  const qc = useQueryClient();

  // RELAXED DEFAULTS — load every shift so the table is never empty on initial mount.
  const [staffId, setStaffId] = useState<string>("all");
  const [clientId, setClientId] = useState<string>("all");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [exporting, setExporting] = useState(false);
  const [editing, setEditing] = useState<ShiftRow | null>(null);
  const [auditRow, setAuditRow] = useState<ShiftRow | null>(null);

  // Staff & client option lists
  const { data: staff } = useQuery({
    enabled: !!org,
    queryKey: ["ts-staff", org?.organization_id],
    queryFn: async () => {
      const { data: mems } = await supabase
        .from("organization_members")
        .select("user_id")
        .eq("organization_id", org!.organization_id)
        .eq("active", true);
      const ids = (mems ?? []).map((m) => m.user_id);
      if (!ids.length) return [] as { id: string; name: string }[];
      const { data: profs } = await supabase
        .from("profiles").select("id, full_name, email").in("id", ids);
      return (profs ?? []).map((p) => ({
        id: p.id,
        name: p.full_name || p.email || "—",
      })).sort((a, b) => a.name.localeCompare(b.name));
    },
  });

  const { data: clientOptions } = useQuery({
    enabled: !!org,
    queryKey: ["ts-clients", org?.organization_id],
    queryFn: async () => {
      const { data } = await supabase
        .from("clients")
        .select("id, first_name, last_name")
        .eq("organization_id", org!.organization_id)
        .order("last_name");
      return data ?? [];
    },
  });

  const filterKey = [staffId, clientId, startDate, endDate];

  const fetchShifts = async (): Promise<ShiftRow[]> => {
    let q = supabase
      .from("shifts")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .select(SELECT as any)
      .order("clock_in_time", { ascending: false, nullsFirst: false });
    // RLS restricts to orgs the admin manages.
    if (staffId !== "all") q = q.eq("user_id", staffId);
    if (clientId !== "all") q = q.eq("client_id", clientId);
    if (startDate) {
      const [y, m, d] = startDate.split("-").map(Number);
      const start = new Date(y, m - 1, d, 0, 0, 0, 0);
      q = q.gte("clock_in_time", start.toISOString());
    }
    if (endDate) {
      const [y, m, d] = endDate.split("-").map(Number);
      const end = new Date(y, m - 1, d, 23, 59, 59, 999);
      q = q.lte("clock_in_time", end.toISOString());
    }
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as unknown as ShiftRow[];
  };

  const { data: shifts, isLoading } = useQuery({
    enabled: !!org,
    queryKey: ["timesheets", org?.organization_id, ...filterKey],
    queryFn: fetchShifts,
  });

  const pending = useMemo(
    () => (shifts ?? []).filter((s) => s.status === "pending_approval" || s.status === "flagged_review" || s.status === "active"),
    [shifts]
  );
  const historical = useMemo(
    () => (shifts ?? []).filter((s) => s.status === "approved"),
    [shifts]
  );

  const approveMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("shifts").update({ status: "approved" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Shift approved");
      qc.invalidateQueries({ queryKey: ["timesheets"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const editMutation = useMutation({
    mutationFn: async (input: { id: string; clock_in_time: string; clock_out_time: string | null }) => {
      const { error } = await supabase
        .from("shifts")
        .update({
          clock_in_time: new Date(input.clock_in_time).toISOString(),
          clock_out_time: input.clock_out_time ? new Date(input.clock_out_time).toISOString() : null,
        })
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Shift timestamps updated");
      qc.invalidateQueries({ queryKey: ["timesheets"] });
      setEditing(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const exportCsv = async () => {
    if (!shifts) return;
    setExporting(true);
    try {
      const headers = [
        "Staff_Name", "Employee_ID", "Client_Name", "Medicaid_ID", "Job_Code",
        "Date_of_Service", "Clock_In_Time", "Clock_Out_Time", "Total_Hours",
        "Clock_In_GPS", "Clock_Out_GPS", "Outside_Geofence_Status",
        "Clock_In_Bypass_Reason", "Clock_Out_Bypass_Reason",
        "Care_Goals_Addressed", "Shift_Narrative_Summary", "Electronic_Record_Created_At",
      ];
      const rows = [headers.join(",")];
      for (const r of shifts) {
        const note = r.shift_notes?.[0];
        rows.push([
          employeeName(r),
          r.profiles?.employee_id ?? "",
          clientName(r),
          r.clients?.medicaid_id ?? "",
          r.clients?.job_code ?? "",
          fmtDate(r.clock_in_time),
          r.clock_in_time ?? "",
          r.clock_out_time ?? "",
          decimalHours(r.clock_in_time, r.clock_out_time),
          gpsString(r.clock_in_lat, r.clock_in_long),
          gpsString(r.clock_out_lat, r.clock_out_long),
          r.outside_geofence ? "FLAGGED - Outside Geofence" : "PASS - On-Site",
          r.clock_in_bypass_reason ?? r.geofence_bypass_reason ?? "",
          r.clock_out_bypass_reason ?? "",
          (note?.goals_addressed ?? []).join("; "),
          note?.narrative_summary ?? "",
          r.created_at ?? "",
        ].map(csvEscape).join(","));
      }
      const csv = "\ufeff" + rows.join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const today = new Date().toISOString().slice(0, 10);
      const a = document.createElement("a");
      a.href = url;
      a.download = `utah_evv_compliance_audit_report_${today}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${shifts.length} shift record${shifts.length === 1 ? "" : "s"}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to export");
    } finally {
      setExporting(false);
    }
  };

  const clearFilters = () => {
    setStaffId("all"); setClientId("all"); setStartDate(""); setEndDate("");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <ClipboardList className="h-6 w-6 text-muted-foreground" /> Timesheets
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            21st Century Cures Act EVV records — click a row to open the federal audit view.
          </p>
        </div>
        <Button onClick={exportCsv} disabled={exporting || !shifts?.length} className="shrink-0">
          {exporting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Compiling…</>
            : <><Download className="mr-2 h-4 w-4" /> Export EVV Compliance Report (.CSV)</>}
        </Button>
      </div>

      {/* Filters */}
      <div className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
        <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <Filter className="h-3.5 w-3.5" /> Filters
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="grid gap-1.5">
            <Label className="text-xs">Staff Member</Label>
            <Select value={staffId} onValueChange={setStaffId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All staff</SelectItem>
                {staff?.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">Client</Label>
            <Select value={clientId} onValueChange={setClientId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All clients</SelectItem>
                {clientOptions?.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.first_name} {c.last_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs" htmlFor="start-date">Start date</Label>
            <Input id="start-date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs" htmlFor="end-date">End date</Label>
            <Input id="end-date" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
          <div className="flex items-end">
            <Button variant="outline" onClick={clearFilters} className="w-full">Clear filters</Button>
          </div>
        </div>
      </div>

      <ShiftSection
        title="Pending Review"
        subtitle="Active shifts and entries awaiting administrative approval"
        rows={pending}
        loading={isLoading}
        showActions
        onApprove={(id) => approveMutation.mutate(id)}
        onEdit={setEditing}
        onRowClick={setAuditRow}
        approvingId={approveMutation.variables ?? null}
        approving={approveMutation.isPending}
      />

      <ShiftSection
        title="Historical / Approved Logs"
        subtitle="Archived and approved shift records"
        rows={historical}
        loading={isLoading}
        showActions={false}
        onApprove={() => {}}
        onEdit={setEditing}
        onRowClick={setAuditRow}
        approvingId={null}
        approving={false}
      />

      {editing && (
        <EditShiftDialog
          shift={editing}
          onClose={() => setEditing(null)}
          onSave={(v) => editMutation.mutate(v)}
          saving={editMutation.isPending}
        />
      )}

      <AuditSheet row={auditRow} onClose={() => setAuditRow(null)} />
    </div>
  );
}

function ShiftSection({
  title, subtitle, rows, loading, showActions, onApprove, onEdit, onRowClick, approvingId, approving,
}: {
  title: string;
  subtitle: string;
  rows: ShiftRow[];
  loading: boolean;
  showActions: boolean;
  onApprove: (id: string) => void;
  onEdit: (r: ShiftRow) => void;
  onRowClick: (r: ShiftRow) => void;
  approvingId: string | null;
  approving: boolean;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card shadow-[var(--shadow-card)]">
      <div className="flex items-end justify-between border-b border-border px-6 py-4">
        <div>
          <h3 className="text-base font-semibold">{title}</h3>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
        <span className="text-xs text-muted-foreground">{rows.length} record{rows.length === 1 ? "" : "s"}</span>
      </div>
      {loading ? (
        <p className="p-8 text-center text-sm text-muted-foreground">Loading…</p>
      ) : !rows.length ? (
        <p className="p-8 text-center text-sm text-muted-foreground">No records match the current filters.</p>
      ) : (
        <TooltipProvider delayDuration={150}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Staff</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Job Code</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Clock In</TableHead>
                <TableHead>Clock Out</TableHead>
                <TableHead className="text-right">Hours</TableHead>
                <TableHead>Geofence</TableHead>
                {showActions && <TableHead className="text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const inBypass = r.clock_in_bypass_reason ?? r.geofence_bypass_reason;
                const outBypass = r.clock_out_bypass_reason;
                return (
                  <TableRow
                    key={r.id}
                    onClick={() => onRowClick(r)}
                    className={`cursor-pointer ${r.outside_geofence ? "bg-orange-50/50 dark:bg-orange-500/5" : ""}`}
                  >
                    <TableCell className="font-medium">{employeeName(r)}</TableCell>
                    <TableCell>{clientName(r)}</TableCell>
                    <TableCell>
                      {r.clients?.job_code ? (
                        <Badge variant="outline" className="font-mono" title={jobCodeLabel(r.clients.job_code)}>
                          {r.clients.job_code}
                        </Badge>
                      ) : "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{fmtDate(r.clock_in_time)}</TableCell>
                    <TableCell className="tabular-nums">{fmtTime(r.clock_in_time)}</TableCell>
                    <TableCell className="tabular-nums">{fmtTime(r.clock_out_time)}</TableCell>
                    <TableCell className="text-right tabular-nums">{decimalHours(r.clock_in_time, r.clock_out_time)}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {r.outside_geofence ? (
                          <Badge variant="outline" className="border-orange-400 text-orange-700 dark:text-orange-300">
                            <AlertTriangle className="mr-1 h-3 w-3" /> Flagged
                          </Badge>
                        ) : (
                          <Badge variant="secondary"><MapPin className="mr-1 h-3 w-3" /> On-site</Badge>
                        )}
                        {inBypass && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge variant="outline" className="border-orange-300 text-orange-700 dark:text-orange-300">
                                <Info className="mr-1 h-3 w-3" /> In
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs">
                              <p className="text-xs font-medium">Clock-in deviation</p>
                              <p className="mt-1 text-xs text-muted-foreground">{inBypass}</p>
                            </TooltipContent>
                          </Tooltip>
                        )}
                        {outBypass && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge variant="outline" className="border-orange-300 text-orange-700 dark:text-orange-300">
                                <Info className="mr-1 h-3 w-3" /> Out
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs">
                              <p className="text-xs font-medium">Clock-out deviation</p>
                              <p className="mt-1 text-xs text-muted-foreground">{outBypass}</p>
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    </TableCell>
                    {showActions && (
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-end gap-1.5">
                          <Button size="sm" variant="ghost" onClick={() => onEdit(r)}>
                            <Pencil className="mr-1 h-3.5 w-3.5" /> Edit
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => onApprove(r.id)}
                            disabled={(approving && approvingId === r.id) || r.status === "active"}
                            title={r.status === "active" ? "Shift still active" : "Approve shift"}
                          >
                            {approving && approvingId === r.id ? (
                              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Check className="mr-1 h-3.5 w-3.5" />
                            )}
                            Approve
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TooltipProvider>
      )}
    </div>
  );
}

function EditShiftDialog({
  shift, onClose, onSave, saving,
}: {
  shift: ShiftRow;
  onClose: () => void;
  onSave: (v: { id: string; clock_in_time: string; clock_out_time: string | null }) => void;
  saving: boolean;
}) {
  const [inT, setInT] = useState(toDtLocal(shift.clock_in_time));
  const [outT, setOutT] = useState(toDtLocal(shift.clock_out_time));
  return (
    <Dialog open onOpenChange={(o) => { if (!o && !saving) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit shift timestamps</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="in-t">Clock-in time</Label>
            <Input id="in-t" type="datetime-local" value={inT} onChange={(e) => setInT(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="out-t">Clock-out time</Label>
            <Input id="out-t" type="datetime-local" value={outT} onChange={(e) => setOutT(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button
            disabled={!inT || saving}
            onClick={() => onSave({ id: shift.id, clock_in_time: inT, clock_out_time: outT || null })}
          >
            {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving…</> : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ----------------------- Federal Audit Slide-out Sheet ---------------------- */

function MandateBlock({
  number, title, icon: Icon, children,
}: {
  number: number;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-card/50 p-4">
      <header className="mb-3 flex items-start gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Federal Mandate {number}
          </p>
          <p className="text-sm font-semibold">{title}</p>
        </div>
      </header>
      <div className="space-y-1.5 pl-11 text-sm">{children}</div>
    </section>
  );
}

function KV({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex flex-wrap items-baseline gap-2">
      <span className="text-xs text-muted-foreground">{label}:</span>
      <span className={mono ? "font-mono text-xs" : "text-sm"}>{value}</span>
    </div>
  );
}

function AuditSheet({ row, onClose }: { row: ShiftRow | null; onClose: () => void }) {
  const r = row;
  const note = r?.shift_notes?.[0];
  const inBypass = r?.clock_in_bypass_reason ?? r?.geofence_bypass_reason ?? null;
  const outBypass = r?.clock_out_bypass_reason ?? null;
  return (
    <Sheet open={!!r} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        {r && (
          <>
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-primary" />
                Detailed Shift Audit View
              </SheetTitle>
              <SheetDescription>
                21st Century Cures Act EVV compliance record · Shift{" "}
                <span className="font-mono text-xs">{r.id.slice(0, 8)}</span>
              </SheetDescription>
            </SheetHeader>

            <div className="mt-6 space-y-4">
              <MandateBlock number={1} title="Service Type Performed" icon={Stethoscope}>
                {r.clients?.job_code ? (
                  <>
                    <KV label="Job Code" value={<Badge variant="outline" className="font-mono">{r.clients.job_code}</Badge>} />
                    <p className="text-xs text-muted-foreground">{jobCodeLabel(r.clients.job_code)}</p>
                  </>
                ) : <p className="text-xs text-muted-foreground">No job code on file.</p>}
              </MandateBlock>

              <MandateBlock number={2} title="Individual Receiving Service" icon={User}>
                <KV label="Name" value={clientName(r)} />
                <KV label="Medicaid ID" value={r.clients?.medicaid_id ?? "—"} mono />
              </MandateBlock>

              <MandateBlock number={3} title="Individual Providing Service" icon={IdCard}>
                <KV label="Name" value={employeeName(r)} />
                <KV label="Employee ID" value={r.profiles?.employee_id ?? "—"} mono />
              </MandateBlock>

              <MandateBlock number={4} title="Date of Service" icon={CalendarDays}>
                <KV label="Service Date" value={fmtDate(r.clock_in_time)} />
              </MandateBlock>

              <MandateBlock number={5} title="Time Service Begins/Ends" icon={Clock}>
                <KV label="Clock-In" value={fmtDateTime(r.clock_in_time)} mono />
                <KV label="Clock-Out" value={fmtDateTime(r.clock_out_time)} mono />
                <KV label="Total Hours" value={`${decimalHours(r.clock_in_time, r.clock_out_time)} hrs`} mono />
              </MandateBlock>

              <MandateBlock number={6} title="Location of Service Delivery" icon={Navigation}>
                <KV
                  label="Clock-In GPS"
                  value={gpsString(r.clock_in_lat, r.clock_in_long) || "—"}
                  mono
                />
                <KV
                  label="Clock-Out GPS"
                  value={gpsString(r.clock_out_lat, r.clock_out_long) || "—"}
                  mono
                />
                <div className="pt-1">
                  {r.outside_geofence ? (
                    <Badge variant="outline" className="border-orange-400 text-orange-700 dark:text-orange-300">
                      <AlertTriangle className="mr-1 h-3 w-3" /> Geofence: FLAGGED
                    </Badge>
                  ) : (
                    <Badge variant="secondary"><MapPin className="mr-1 h-3 w-3" /> Geofence: PASS</Badge>
                  )}
                </div>
                {inBypass && (
                  <div className="mt-2 rounded-md border border-orange-300/60 bg-orange-50/60 p-2 text-xs dark:bg-orange-500/5">
                    <p className="font-semibold text-orange-800 dark:text-orange-200">Clock-In Deviation Reason</p>
                    <p className="text-muted-foreground">{inBypass}</p>
                  </div>
                )}
                {outBypass && (
                  <div className="mt-2 rounded-md border border-orange-300/60 bg-orange-50/60 p-2 text-xs dark:bg-orange-500/5">
                    <p className="font-semibold text-orange-800 dark:text-orange-200">Clock-Out Deviation Reason</p>
                    <p className="text-muted-foreground">{outBypass}</p>
                  </div>
                )}
              </MandateBlock>

              <MandateBlock number={7} title="Date of Creation of Electronic Record" icon={Hash}>
                <KV label="Record Created (immutable)" value={fmtDateTime(r.created_at)} mono />
                {r.device_fingerprint && <KV label="Device Fingerprint" value={r.device_fingerprint} mono />}
              </MandateBlock>

              <section className="rounded-xl border border-border bg-card/50 p-4">
                <header className="mb-3 flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <p className="text-sm font-semibold">PCSP Care Goals Addressed</p>
                </header>
                <div className="flex flex-wrap gap-1.5">
                  {note?.goals_addressed?.length ? (
                    note.goals_addressed.map((g) => (
                      <Badge key={g} variant="secondary" className="font-normal">{g}</Badge>
                    ))
                  ) : (
                    <p className="text-xs text-muted-foreground">No goals checked for this shift.</p>
                  )}
                </div>
              </section>

              <section className="rounded-xl border border-border bg-card/50 p-4">
                <header className="mb-2 flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <p className="text-sm font-semibold">Narrative Shift Summary</p>
                </header>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                  {note?.narrative_summary || "No narrative submitted."}
                </p>
              </section>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
