import { useState, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useCurrentOrg } from "@/hooks/use-org";
import { RequirePermission } from "@/components/rbac-guard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ChevronLeft, ChevronRight, Plus, Users, Contact2,
  Filter, Send, Copy, Trash2, Loader2, CalendarDays,
  Clock, MapPin, RefreshCw, CheckCircle2, XCircle, AlertCircle,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/scheduling")({
  head: () => ({ meta: [{ title: "Scheduling — Care Academy" }] }),
  component: SchedulingPage,
});

// ─── Types ────────────────────────────────────────────────────────────────────

type Shift = {
  id: string;
  organization_id: string;
  staff_id: string;
  client_id: string;
  job_code: string | null;
  shift_type: string;
  starts_at: string;
  ends_at: string;
  notes: string | null;
  status: string;
  is_recurring: boolean;
  recurrence_rule: string | null;
  recurrence_end_date: string | null;
  published: boolean;
  created_at: string;
  clients: { first_name: string; last_name: string; physical_address: string | null } | null;
  profiles: { full_name: string | null; email: string | null } | null;
};

type StaffMember = {
  id: string;
  full_name: string | null;
  email: string | null;
};

type Client = {
  id: string;
  first_name: string;
  last_name: string;
  physical_address: string | null;
  job_code: string[] | null;
};

type ViewMode = "staff" | "client";
type ShiftFilter = "all" | "published" | "unpublished" | "accepted" | "pending" | "declined";

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, { bg: string; text: string; border: string; label: string }> = {
  accepted:  { bg: "bg-emerald-100 dark:bg-emerald-950/40", text: "text-emerald-800 dark:text-emerald-200", border: "border-l-emerald-500", label: "Accepted" },
  pending:   { bg: "bg-amber-100 dark:bg-amber-950/40",    text: "text-amber-800 dark:text-amber-200",    border: "border-l-amber-500",   label: "Pending"  },
  declined:  { bg: "bg-rose-100 dark:bg-rose-950/40",      text: "text-rose-800 dark:text-rose-200",      border: "border-l-rose-500",    label: "Declined" },
  published: { bg: "bg-blue-100 dark:bg-blue-950/40",      text: "text-blue-800 dark:text-blue-200",      border: "border-l-blue-500",    label: "Published"},
  draft:     { bg: "bg-slate-100 dark:bg-slate-800/40",    text: "text-slate-700 dark:text-slate-300",    border: "border-l-slate-400",   label: "Draft"    },
};

const SHIFT_TYPES = [
  { value: "hourly",         label: "Hourly / EVV" },
  { value: "daily_host_home", label: "Host Home (Daily)" },
  { value: "community",      label: "Community Integration" },
  { value: "respite",        label: "Respite" },
  { value: "transportation", label: "Transportation" },
];

const RECURRENCE_OPTIONS = [
  { value: "none",    label: "Does not repeat" },
  { value: "daily",   label: "Every day" },
  { value: "weekly",  label: "Every week" },
  { value: "biweekly",label: "Every 2 weeks" },
  { value: "monthly", label: "Every month" },
];

const DAYS_OF_WEEK = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}
function isoDate(d: Date): string {
  return d.toISOString().split("T")[0];
}
function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
function shiftDuration(start: string, end: string): string {
  const h = (new Date(end).getTime() - new Date(start).getTime()) / 3_600_000;
  return `${h % 1 === 0 ? h : h.toFixed(1)}h`;
}
function localDatetimeValue(iso?: string): string {
  if (!iso) {
    const d = new Date();
    d.setMinutes(0, 0, 0);
    return d.toISOString().slice(0, 16);
  }
  return new Date(iso).toISOString().slice(0, 16);
}

// ─── Shift Card ───────────────────────────────────────────────────────────────

function ShiftCard({
  shift,
  viewMode,
  onEdit,
  onDuplicate,
  onDelete,
}: {
  shift: Shift;
  viewMode: ViewMode;
  onEdit: (s: Shift) => void;
  onDuplicate: (s: Shift) => void;
  onDelete: (id: string) => void;
}) {
  const statusKey = shift.status === "accepted" ? "accepted"
    : shift.status === "declined" ? "declined"
    : shift.published ? "published"
    : "draft";
  const style = STATUS_STYLES[statusKey] ?? STATUS_STYLES.draft;
  const clientName = shift.clients
    ? `${shift.clients.first_name} ${shift.clients.last_name}`
    : "—";
  const staffName = shift.profiles?.full_name ?? shift.profiles?.email ?? "—";

  return (
    <div className={`group relative flex flex-col rounded-xl border border-border border-l-4 ${style.border} ${style.bg} p-3 shadow-sm transition hover:shadow-md`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">
            {viewMode === "staff" ? clientName : staffName}
          </p>
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            {fmtTime(shift.starts_at)} – {fmtTime(shift.ends_at)}
            <span className="ml-1 text-[10px]">({shiftDuration(shift.starts_at, shift.ends_at)})</span>
          </p>
        </div>
        <Badge className={`shrink-0 text-[10px] ${style.bg} ${style.text} border-0`}>
          {style.label}
        </Badge>
      </div>

      {/* Details */}
      <div className="mt-1.5 space-y-0.5">
        {shift.shift_type && (
          <p className="text-[11px] text-muted-foreground capitalize">
            {SHIFT_TYPES.find((t) => t.value === shift.shift_type)?.label ?? shift.shift_type}
          </p>
        )}
        {shift.clients?.physical_address && (
          <p className="flex items-center gap-1 text-[11px] text-muted-foreground truncate">
            <MapPin className="h-2.5 w-2.5 shrink-0" />
            {shift.clients.physical_address}
          </p>
        )}
        {shift.is_recurring && (
          <p className="flex items-center gap-1 text-[11px] text-primary">
            <RefreshCw className="h-2.5 w-2.5" /> Recurring
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="mt-2 flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
        <button type="button" onClick={() => onEdit(shift)}
          className="rounded px-2 py-1 text-[11px] font-medium text-primary hover:bg-primary/10 transition">
          Edit
        </button>
        <button type="button" onClick={() => onDuplicate(shift)}
          className="rounded px-2 py-1 text-[11px] font-medium text-muted-foreground hover:bg-accent transition">
          <Copy className="h-3 w-3" />
        </button>
        <button type="button" onClick={() => onDelete(shift.id)}
          className="rounded px-2 py-1 text-[11px] font-medium text-rose-600 hover:bg-rose-50 transition dark:hover:bg-rose-950/30">
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

// ─── Shift Form Dialog ────────────────────────────────────────────────────────

function ShiftFormDialog({
  open,
  initial,
  staff,
  clients,
  orgId,
  userId,
  onClose,
  onSaved,
}: {
  open: boolean;
  initial: Partial<Shift> | null;
  staff: StaffMember[];
  clients: Client[];
  orgId: string;
  userId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!initial?.id;
  const [staffId, setStaffId] = useState(initial?.staff_id ?? "");
  const [clientId, setClientId] = useState(initial?.client_id ?? "");
  const [shiftType, setShiftType] = useState(initial?.shift_type ?? "hourly");
  const [startsAt, setStartsAt] = useState(localDatetimeValue(initial?.starts_at));
  const [endsAt, setEndsAt] = useState(localDatetimeValue(initial?.ends_at));
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [recurrence, setRecurrence] = useState(initial?.recurrence_rule ?? "none");
  const [recurrenceEnd, setRecurrenceEnd] = useState(
    initial?.recurrence_end_date ? initial.recurrence_end_date.split("T")[0] : ""
  );
  const [busy, setBusy] = useState(false);

  const selectedClient = clients.find((c) => c.id === clientId);
  const authorizedCodes = selectedClient?.job_code ?? [];

  async function save() {
    if (!staffId || !clientId || !startsAt || !endsAt) {
      toast.error("Please fill in all required fields.");
      return;
    }
    if (new Date(endsAt) <= new Date(startsAt)) {
      toast.error("End time must be after start time.");
      return;
    }
    setBusy(true);
    try {
      const payload = {
        organization_id: orgId,
        staff_id: staffId,
        client_id: clientId,
        job_code: shiftType,
        shift_type: shiftType,
        starts_at: new Date(startsAt).toISOString(),
        ends_at: new Date(endsAt).toISOString(),
        notes: notes.trim() || null,
        is_recurring: recurrence !== "none",
        recurrence_rule: recurrence !== "none" ? recurrence : null,
        recurrence_end_date: recurrence !== "none" && recurrenceEnd
          ? new Date(recurrenceEnd).toISOString()
          : null,
        status: initial?.status ?? "pending",
        published: initial?.published ?? false,
        created_by: userId,
      };

      if (isEdit) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await supabase.from("scheduled_shifts").update(payload as any).eq("id", initial!.id!);
        if (error) throw error;
        toast.success("Shift updated.");
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await supabase.from("scheduled_shifts").insert(payload as any);
        if (error) throw error;
        toast.success("Shift created.");
      }
      onSaved();
      onClose();
    } catch (e) {
      toast.error((e as Error).message || "Could not save shift.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !busy) onClose(); }}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Shift" : "Add New Shift"}</DialogTitle>
          <DialogDescription>
            Fill in the shift details below. All fields marked * are required.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Staff */}
          <div className="grid gap-1.5">
            <Label className="text-xs font-semibold">Caregiver / Staff *</Label>
            <Select value={staffId} onValueChange={setStaffId}>
              <SelectTrigger><SelectValue placeholder="Select a caregiver" /></SelectTrigger>
              <SelectContent>
                {staff.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.full_name ?? s.email ?? s.id.slice(0, 8)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Client */}
          <div className="grid gap-1.5">
            <Label className="text-xs font-semibold">Client *</Label>
            <Select value={clientId} onValueChange={(v) => { setClientId(v); setShiftType("hourly"); }}>
              <SelectTrigger><SelectValue placeholder="Select a client" /></SelectTrigger>
              <SelectContent>
                {clients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.first_name} {c.last_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Shift type */}
          <div className="grid gap-1.5">
            <Label className="text-xs font-semibold">Service Type *</Label>
            <Select value={shiftType} onValueChange={setShiftType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(authorizedCodes.length > 0
                  ? SHIFT_TYPES.filter((t) => authorizedCodes.includes(t.value) || t.value === "hourly")
                  : SHIFT_TYPES
                ).map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Date/Time */}
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label className="text-xs font-semibold">Start *</Label>
              <Input type="datetime-local" value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)} className="text-sm" />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs font-semibold">End *</Label>
              <Input type="datetime-local" value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)} className="text-sm" />
            </div>
          </div>

          {/* Duration preview */}
          {startsAt && endsAt && new Date(endsAt) > new Date(startsAt) && (
            <p className="text-xs text-emerald-600 dark:text-emerald-400">
              Duration: {shiftDuration(new Date(startsAt).toISOString(), new Date(endsAt).toISOString())}
            </p>
          )}

          {/* Location preview */}
          {selectedClient?.physical_address && (
            <div className="flex items-center gap-1.5 rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs">
              <MapPin className="h-3 w-3 text-muted-foreground" />
              <span>{selectedClient.physical_address}</span>
            </div>
          )}

          {/* Recurrence */}
          <div className="grid gap-1.5">
            <Label className="text-xs font-semibold">Repeat</Label>
            <Select value={recurrence} onValueChange={setRecurrence}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {RECURRENCE_OPTIONS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {recurrence !== "none" && (
            <div className="grid gap-1.5">
              <Label className="text-xs font-semibold">Repeat Until (optional)</Label>
              <Input type="date" value={recurrenceEnd}
                onChange={(e) => setRecurrenceEnd(e.target.value)} className="text-sm" />
            </div>
          )}

          {/* Notes */}
          <div className="grid gap-1.5">
            <Label className="text-xs font-semibold">Notes / Special Instructions</Label>
            <Textarea rows={3} value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any special instructions, care notes, or shift details…"
              className="text-sm" />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={save} disabled={busy} className="bg-primary text-primary-foreground">
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEdit ? "Save Changes" : "Create Shift"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

function SchedulingPage() {
  const { data: org } = useCurrentOrg();
  return (
    <RequirePermission perm="manage_users">
      {org && <SchedulerInner orgId={org.organization_id} />}
    </RequirePermission>
  );
}

function SchedulerInner({ orgId }: { orgId: string }) {
  const { user } = useAuth();
  const qc = useQueryClient();

  const [cursor, setCursor] = useState(() => new Date());
  const [viewMode, setViewMode] = useState<ViewMode>("staff");
  const [filter, setFilter] = useState<ShiftFilter>("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editShift, setEditShift] = useState<Partial<Shift> | null>(null);
  const [publishBusy, setPublishBusy] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState<string>("all");
  const [selectedClient, setSelectedClient] = useState<string>("all");

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const monthStart = startOfMonth(cursor);
  const monthEnd = endOfMonth(cursor);
  const monthLabel = cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  // Build calendar grid (6 weeks)
  const calendarDays = useMemo(() => {
    const days: Date[] = [];
    const start = new Date(monthStart);
    start.setDate(start.getDate() - start.getDay());
    for (let i = 0; i < 42; i++) {
      days.push(new Date(start));
      start.setDate(start.getDate() + 1);
    }
    return days;
  }, [year, month]);

  // ── Queries ─────────────────────────────────────────────────────────────────

  const { data: shifts = [], isLoading } = useQuery({
    enabled: !!orgId,
    queryKey: ["shifts", orgId, year, month],
    queryFn: async (): Promise<Shift[]> => {
      const { data, error } = await supabase
        .from("scheduled_shifts")
        .select(`
          id, organization_id, staff_id, client_id, job_code, shift_type,
          starts_at, ends_at, notes, status, is_recurring, recurrence_rule,
          recurrence_end_date, published, created_at,
          clients:client_id (first_name, last_name, physical_address),
          profiles:staff_id (full_name, email)
        `)
        .eq("organization_id", orgId)
        .gte("starts_at", monthStart.toISOString())
        .lte("starts_at", monthEnd.toISOString())
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .order("starts_at") as any;
      if (error) throw error;
      return (data ?? []) as unknown as Shift[];
    },
  });

  const { data: staffList = [] } = useQuery({
    enabled: !!orgId,
    queryKey: ["sched-staff", orgId],
    queryFn: async (): Promise<StaffMember[]> => {
      // profiles has no organization_id; resolve org members via organization_members join
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("organization_members")
        .select("user_id, profiles:user_id(id, full_name, email)")
        .eq("organization_id", orgId)
        .eq("active", true);
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return ((data ?? []) as any[])
        .map((r) => r.profiles)
        .filter((p): p is StaffMember => !!p && !!p.id);
    },
  });

  const { data: clientList = [] } = useQuery({
    enabled: !!orgId,
    queryKey: ["sched-clients", orgId],
    queryFn: async (): Promise<Client[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("clients")
        .select("id, first_name, last_name, physical_address, job_code")
        .eq("organization_id", orgId)
        .eq("account_status", "active");
      if (error) throw error;
      return (data ?? []) as unknown as Client[];
    },
  });

  // ── Filtered shifts ──────────────────────────────────────────────────────────

  const filteredShifts = useMemo(() => {
    return shifts.filter((s) => {
      if (selectedStaff !== "all" && s.staff_id !== selectedStaff) return false;
      if (selectedClient !== "all" && s.client_id !== selectedClient) return false;
      if (filter === "published" && !s.published) return false;
      if (filter === "unpublished" && s.published) return false;
      if (filter === "accepted" && s.status !== "accepted") return false;
      if (filter === "pending" && s.status !== "pending") return false;
      if (filter === "declined" && s.status !== "declined") return false;
      return true;
    });
  }, [shifts, filter, selectedStaff, selectedClient]);

  // Shifts grouped by date string
  const shiftsByDate = useMemo(() => {
    const map = new Map<string, Shift[]>();
    filteredShifts.forEach((s) => {
      const key = isoDate(new Date(s.starts_at));
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    });
    return map;
  }, [filteredShifts]);

  // ── Stats ────────────────────────────────────────────────────────────────────

  const stats = useMemo(() => ({
    total:     shifts.length,
    published: shifts.filter((s) => s.published).length,
    accepted:  shifts.filter((s) => s.status === "accepted").length,
    pending:   shifts.filter((s) => s.status === "pending").length,
    declined:  shifts.filter((s) => s.status === "declined").length,
  }), [shifts]);

  // ── Mutations ────────────────────────────────────────────────────────────────

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("scheduled_shifts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Shift deleted.");
      qc.invalidateQueries({ queryKey: ["shifts", orgId, year, month] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function publishAll() {
    const unpublished = shifts.filter((s) => !s.published).map((s) => s.id);
    if (!unpublished.length) { toast.info("All shifts already published."); return; }
    setPublishBusy(true);
    try {
      const { error } = await supabase
        .from("scheduled_shifts")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update({ published: true } as any)
        .in("id", unpublished);
      if (error) throw error;
      toast.success(`${unpublished.length} shift${unpublished.length > 1 ? "s" : ""} published to staff.`);
      qc.invalidateQueries({ queryKey: ["shifts", orgId, year, month] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPublishBusy(false);
    }
  }

  function handleDuplicate(shift: Shift) {
    // Pre-fill form with shift data but no ID (creates new)
    setEditShift({
      staff_id:       shift.staff_id,
      client_id:      shift.client_id,
      shift_type:     shift.shift_type,
      starts_at:      shift.starts_at,
      ends_at:        shift.ends_at,
      notes:          shift.notes,
      is_recurring:   shift.is_recurring,
      recurrence_rule: shift.recurrence_rule,
      recurrence_end_date: shift.recurrence_end_date,
    });
    setFormOpen(true);
  }

  const today = isoDate(new Date());

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">

      {/* Page header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Scheduling</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Manage caregiver shifts, publish schedules, and track status.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={publishAll}
            disabled={publishBusy || stats.published === stats.total}
            className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {publishBusy
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <Send className="h-4 w-4" />}
            Publish All Shifts
            {stats.total - stats.published > 0 && (
              <Badge className="bg-white/20 text-white text-[10px]">
                {stats.total - stats.published} draft
              </Badge>
            )}
          </Button>
          <Button onClick={() => { setEditShift(null); setFormOpen(true); }} className="gap-2">
            <Plus className="h-4 w-4" /> Add Shift
          </Button>
        </div>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {[
          { label: "Total",     value: stats.total,     color: "text-foreground"         },
          { label: "Published", value: stats.published, color: "text-blue-600"           },
          { label: "Accepted",  value: stats.accepted,  color: "text-emerald-600"        },
          { label: "Pending",   value: stats.pending,   color: "text-amber-600"          },
          { label: "Declined",  value: stats.declined,  color: "text-rose-600"           },
        ].map((s) => (
          <Card key={s.label} className="p-3 text-center">
            <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-[11px] text-muted-foreground">{s.label}</p>
          </Card>
        ))}
      </div>

      {/* Controls row */}
      <div className="flex flex-wrap items-center gap-3">

        {/* View toggle */}
        <div className="flex rounded-lg border border-border bg-muted/30 p-0.5">
          {(["staff","client"] as ViewMode[]).map((v) => (
            <button key={v} type="button" onClick={() => setViewMode(v)}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition ${
                viewMode === v
                  ? "bg-background shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}>
              {v === "staff" ? <Users className="h-3.5 w-3.5" /> : <Contact2 className="h-3.5 w-3.5" />}
              {v === "staff" ? "Staff" : "Client"}
            </button>
          ))}
        </div>

        {/* Staff filter */}
        <Select value={selectedStaff} onValueChange={setSelectedStaff}>
          <SelectTrigger className="h-8 w-44 text-xs">
            <Users className="mr-1.5 h-3.5 w-3.5 text-muted-foreground" />
            <SelectValue placeholder="All staff" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Staff</SelectItem>
            {staffList.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.full_name ?? s.email ?? s.id.slice(0, 8)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Client filter */}
        <Select value={selectedClient} onValueChange={setSelectedClient}>
          <SelectTrigger className="h-8 w-44 text-xs">
            <Contact2 className="mr-1.5 h-3.5 w-3.5 text-muted-foreground" />
            <SelectValue placeholder="All clients" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Clients</SelectItem>
            {clientList.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.first_name} {c.last_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Status filter pills */}
        <div className="flex gap-1 flex-wrap">
          {(["all","published","unpublished","accepted","pending","declined"] as ShiftFilter[]).map((f) => (
            <button key={f} type="button" onClick={() => setFilter(f)}
              className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition capitalize ${
                filter === f
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}>
              {f === "all" ? "All" : f}
            </button>
          ))}
        </div>

        {/* Month nav */}
        <div className="ml-auto flex items-center gap-1.5">
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8"
            onClick={() => setCursor(new Date(year, month - 1, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-[140px] text-center text-sm font-semibold">{monthLabel}</span>
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8"
            onClick={() => setCursor(new Date(year, month + 1, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button type="button" variant="ghost" size="sm" className="h-8 text-xs"
            onClick={() => setCursor(new Date())}>
            Today
          </Button>
        </div>
      </div>

      {/* Calendar legend */}
      <div className="flex flex-wrap items-center gap-3 text-[11px]">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm border-l-2 border-l-emerald-500 bg-emerald-100" />
          Accepted
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm border-l-2 border-l-amber-500 bg-amber-100" />
          Pending
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm border-l-2 border-l-rose-500 bg-rose-100" />
          Declined
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm border-l-2 border-l-blue-500 bg-blue-100" />
          Published
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm border-l-2 border-l-slate-400 bg-slate-100" />
          Draft
        </span>
      </div>

      {/* Calendar grid */}
      {isLoading ? (
        <div className="grid place-items-center py-16 text-sm text-muted-foreground">
          <Loader2 className="mb-2 h-6 w-6 animate-spin" /> Loading schedule…
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border">
          {/* Day headers */}
          <div className="grid grid-cols-7 border-b border-border bg-muted/40">
            {DAYS_OF_WEEK.map((d) => (
              <div key={d} className="py-2 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {d}
              </div>
            ))}
          </div>

          {/* Weeks */}
          <div className="grid grid-cols-7">
            {calendarDays.map((day, idx) => {
              const key = isoDate(day);
              const dayShifts = shiftsByDate.get(key) ?? [];
              const isCurrentMonth = day.getMonth() === month;
              const isToday = key === today;

              return (
                <div key={idx}
                  className={`min-h-[120px] border-b border-r border-border p-1.5 ${
                    !isCurrentMonth ? "bg-muted/20" : "bg-background"
                  } ${idx % 7 === 6 ? "border-r-0" : ""}`}>

                  {/* Day number */}
                  <div className="mb-1 flex items-center justify-between">
                    <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${
                      isToday
                        ? "bg-primary text-primary-foreground"
                        : isCurrentMonth
                        ? "text-foreground"
                        : "text-muted-foreground/40"
                    }`}>
                      {day.getDate()}
                    </span>
                    {isCurrentMonth && (
                      <button type="button"
                        onClick={() => {
                          const d = new Date(day);
                          d.setHours(9, 0, 0, 0);
                          const e = new Date(day);
                          e.setHours(17, 0, 0, 0);
                          setEditShift({
                            starts_at: d.toISOString(),
                            ends_at:   e.toISOString(),
                          });
                          setFormOpen(true);
                        }}
                        className="rounded p-0.5 text-muted-foreground/40 opacity-0 hover:bg-accent hover:text-foreground hover:opacity-100 transition [div:hover_&]:opacity-100">
                        <Plus className="h-3 w-3" />
                      </button>
                    )}
                  </div>

                  {/* Shift cards */}
                  <div className="space-y-1">
                    {dayShifts.slice(0, 3).map((s) => {
                      const statusKey = s.status === "accepted" ? "accepted"
                        : s.status === "declined" ? "declined"
                        : s.published ? "published" : "draft";
                      const style = STATUS_STYLES[statusKey];
                      const name = viewMode === "staff"
                        ? (s.clients ? `${s.clients.first_name} ${s.clients.last_name}` : "—")
                        : (s.profiles?.full_name ?? s.profiles?.email ?? "—");
                      return (
                        <button key={s.id} type="button"
                          onClick={() => { setEditShift(s); setFormOpen(true); }}
                          className={`w-full rounded border-l-2 ${style.border} ${style.bg} px-1.5 py-0.5 text-left text-[10px] font-medium ${style.text} truncate hover:opacity-80 transition`}>
                          {fmtTime(s.starts_at)} {name}
                        </button>
                      );
                    })}
                    {dayShifts.length > 3 && (
                      <p className="text-[10px] text-muted-foreground px-1">
                        +{dayShifts.length - 3} more
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Shift list below calendar */}
      {filteredShifts.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            All Shifts This Month
            <Badge variant="secondary">{filteredShifts.length}</Badge>
          </h3>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredShifts.map((s) => (
              <ShiftCard key={s.id} shift={s} viewMode={viewMode}
                onEdit={(sh) => { setEditShift(sh); setFormOpen(true); }}
                onDuplicate={handleDuplicate}
                onDelete={(id) => deleteMut.mutate(id)}
              />
            ))}
          </div>
        </div>
      )}

      {filteredShifts.length === 0 && !isLoading && (
        <Card className="p-12 text-center">
          <CalendarDays className="mx-auto mb-3 h-10 w-10 text-muted-foreground/30" />
          <p className="font-semibold">No shifts this month</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Click "Add Shift" to schedule a caregiver.
          </p>
        </Card>
      )}

      {/* Shift form dialog */}
      <ShiftFormDialog
        open={formOpen}
        initial={editShift}
        staff={staffList}
        clients={clientList}
        orgId={orgId}
        userId={user?.id ?? ""}
        onClose={() => { setFormOpen(false); setEditShift(null); }}
        onSaved={() => qc.invalidateQueries({ queryKey: ["shifts", orgId, year, month] })}
      />
    </div>
  );
}
