import { useState, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useCurrentOrg } from "@/hooks/use-org";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Users,
  Contact2,
  Send,
  Copy,
  Trash2,
  Loader2,
  CalendarDays,
  Clock,
  MapPin,
  RefreshCw,
  Sparkles,
  ShieldCheck,
  Eye,
} from "lucide-react";
import { toast } from "sonner";
import { evvServiceLabel } from "@/lib/evv-codes";
import { AlertTriangle, Lock } from "lucide-react";
import { NectarGuidanceStrip } from "@/components/nectar/nectar-guidance-strip";
import { NectarAutoAssignDialog } from "@/components/nectar/nectar-auto-assign-dialog";

import { z } from "zod";
import { Link, useSearch } from "@tanstack/react-router";
import { HomesTeamsBoard } from "@/components/scheduling/homes-teams-board";
import { CoverageViews } from "@/components/scheduling/coverage-views";
import { ScheduleBuilder } from "@/components/scheduling/schedule-builder";
import { TimesheetsReconcile } from "@/components/scheduling/timesheets-reconcile";

const schedulingSearch = z.object({
  tab: z.enum(["schedule", "builder", "coverage", "homes", "timesheets"]).optional(),
});

type SchedulingTab = "schedule" | "builder" | "coverage" | "homes" | "timesheets";

export const Route = createFileRoute("/dashboard/scheduling")({
  head: () => ({ meta: [{ title: "Scheduling" }] }),
  validateSearch: (s) => schedulingSearch.parse(s),
  component: SchedulingShell,
});

function SchedulingShell() {
  const { tab } = useSearch({ from: "/dashboard/scheduling" });
  const active: SchedulingTab = tab ?? "schedule";
  return (
    <div className="space-y-4">
      <div className="border-b border-border">
        <nav className="-mb-px flex flex-wrap gap-1" aria-label="Scheduling tabs">
          {[
            { key: "schedule", label: "Schedule" },
            { key: "builder", label: "Builder" },
            { key: "coverage", label: "Coverage" },
            { key: "homes", label: "Homes & Teams" },
          ].map((t) => (
            <Link
              key={t.key}
              to="/dashboard/scheduling"
              search={{ tab: t.key as SchedulingTab }}
              replace
              className={`whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
                active === t.key
                  ? "border-[#137182] text-[#137182]"
                  : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
              }`}
            >
              {t.label}
            </Link>
          ))}
        </nav>
      </div>
      {active === "homes" ? <HomesTeamsBoard />
        : active === "coverage" ? <CoverageViews />
        : active === "builder" ? <ScheduleBuilder />
        : <SchedulingPage />}
    </div>
  );
}

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

type StaffMember = { id: string; full_name: string | null; email: string | null };
type Client = {
  id: string;
  first_name: string;
  last_name: string;
  physical_address: string | null;
  job_code: string[] | null;
  team_id: string | null;
};
type ViewMode = "staff" | "client";
type ShiftFilter = "all" | "published" | "unpublished" | "accepted" | "pending" | "declined";

const STATUS_STYLES: Record<
  string,
  { bg: string; text: string; border: string; label: string }
> = {
  accepted: {
    bg: "bg-emerald-100 dark:bg-emerald-950/40",
    text: "text-emerald-800 dark:text-emerald-200",
    border: "border-l-emerald-500",
    label: "Accepted",
  },
  pending: {
    bg: "bg-amber-100 dark:bg-amber-950/40",
    text: "text-amber-800 dark:text-amber-200",
    border: "border-l-amber-500",
    label: "Pending",
  },
  declined: {
    bg: "bg-rose-100 dark:bg-rose-950/40",
    text: "text-rose-800 dark:text-rose-200",
    border: "border-l-rose-500",
    label: "Declined",
  },
  published: {
    bg: "bg-blue-100 dark:bg-blue-950/40",
    text: "text-blue-800 dark:text-blue-200",
    border: "border-l-blue-500",
    label: "Published",
  },
  draft: {
    bg: "bg-slate-100 dark:bg-slate-800/40",
    text: "text-slate-700 dark:text-slate-300",
    border: "border-l-slate-400",
    label: "Draft",
  },
};

const SHIFT_TYPES = [
  { value: "hourly", label: "Hourly / EVV" },
  { value: "daily_host_home", label: "Host Home Daily" },
  { value: "community", label: "Community Integration" },
  { value: "respite", label: "Respite" },
  { value: "transportation", label: "Transportation" },
];

const RECURRENCE_OPTIONS = [
  { value: "none", label: "Does not repeat" },
  { value: "daily", label: "Every day" },
  { value: "weekly", label: "Every week" },
  { value: "biweekly", label: "Every 2 weeks" },
  { value: "monthly", label: "Every month" },
];

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function isoDate(d: Date) {
  return d.toISOString().split("T")[0];
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function duration(s: string, e: string) {
  const h = (new Date(e).getTime() - new Date(s).getTime()) / 3_600_000;
  return `${h % 1 === 0 ? h : h.toFixed(1)}h`;
}
function localDT(iso?: string) {
  const d = iso ? new Date(iso) : new Date();
  if (!iso) d.setMinutes(0, 0, 0);
  return d.toISOString().slice(0, 16);
}
function statusKey(s: Shift) {
  return s.status === "accepted"
    ? "accepted"
    : s.status === "declined"
    ? "declined"
    : s.published
    ? "published"
    : "draft";
}

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
  const [staffId, setStaffId] = useState<string>(initial?.staff_id ?? "");
  const [clientId, setClientId] = useState<string>(initial?.client_id ?? "");
  const [shiftType, setShiftType] = useState<string>(initial?.shift_type ?? "hourly");
  const [serviceCode, setServiceCode] = useState<string>(initial?.job_code ?? "");
  const [startsAt, setStartsAt] = useState<string>(localDT(initial?.starts_at));
  const [endsAt, setEndsAt] = useState<string>(localDT(initial?.ends_at));
  const [notes, setNotes] = useState<string>(initial?.notes ?? "");
  const [recurrence, setRecurrence] = useState<string>(initial?.recurrence_rule ?? "none");
  const [recurrenceEnd, setRecurrenceEnd] = useState<string>(
    initial?.recurrence_end_date?.split("T")[0] ?? ""
  );
  const [busy, setBusy] = useState(false);
  const [busyAction, setBusyAction] = useState<"draft" | "publish" | null>(null);
  const selectedClient = clients.find((c) => c.id === clientId);
  const authorizedCodes = selectedClient?.job_code ?? [];

  // Reset code when client changes and current code is not authorized
  if (clientId && serviceCode && !authorizedCodes.includes(serviceCode)) {
    setServiceCode("");
  }

  async function save(publish: boolean) {
    if (!staffId || !clientId || !startsAt || !endsAt) {
      toast.error("Fill in all required fields.");
      return;
    }
    if (!serviceCode) {
      toast.error("Select an authorized billing code for this client.");
      return;
    }
    if (!authorizedCodes.includes(serviceCode)) {
      toast.error("Selected code is not authorized for this client.");
      return;
    }
    if (new Date(endsAt) <= new Date(startsAt)) {
      toast.error("End must be after start.");
      return;
    }
    setBusy(true);
    setBusyAction(publish ? "publish" : "draft");
    try {
      const payload: Record<string, unknown> = {
        organization_id: orgId,
        staff_id: staffId,
        client_id: clientId,
        job_code: serviceCode,
        shift_type: shiftType,
        starts_at: new Date(startsAt).toISOString(),
        ends_at: new Date(endsAt).toISOString(),
        notes: notes.trim() || null,
        is_recurring: recurrence !== "none",
        recurrence_rule: recurrence !== "none" ? recurrence : null,
        recurrence_end_date:
          recurrence !== "none" && recurrenceEnd
            ? new Date(recurrenceEnd).toISOString()
            : null,
        status: initial?.status ?? "pending",
        published: publish,
        created_by: userId,
      };
      if (isEdit) {
        const { error } = await (supabase as any)
          .from("scheduled_shifts")
          .update(payload)
          .eq("id", initial!.id);
        if (error) throw error;
        toast.success(publish ? "Shift published." : "Draft saved.");
      } else {
        const { error } = await (supabase as any).from("scheduled_shifts").insert(payload);
        if (error) throw error;
        toast.success(publish ? "Shift published." : "Draft saved.");
      }
      onSaved();
      onClose();
    } catch (e) {
      toast.error((e as Error).message || "Could not save shift.");
    } finally {
      setBusy(false);
      setBusyAction(null);
    }
  }


  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o && !busy) onClose();
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Shift" : "Add New Shift"}</DialogTitle>
          <DialogDescription>All starred fields are required.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2 overflow-y-auto max-h-[60vh] pr-1">
          <div className="grid gap-1.5">
            <Label className="text-xs">Caregiver *</Label>
            <Select value={staffId} onValueChange={setStaffId}>
              <SelectTrigger className="text-sm">
                <SelectValue placeholder="Select caregiver" />
              </SelectTrigger>
              <SelectContent>
                {staff.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.full_name ?? s.email ?? s.id.slice(0, 8)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5">
            <Label className="text-xs">Client *</Label>
            <Select value={clientId} onValueChange={setClientId}>
              <SelectTrigger className="text-sm">
                <SelectValue placeholder="Select client" />
              </SelectTrigger>
              <SelectContent>
                {clients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.first_name} {c.last_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5">
            <Label className="text-xs">Authorized Billing Code *</Label>
            <Select
              value={serviceCode}
              onValueChange={setServiceCode}
              disabled={!clientId || authorizedCodes.length === 0}
            >
              <SelectTrigger className="text-sm">
                <SelectValue
                  placeholder={
                    !clientId
                      ? "Select a client first"
                      : authorizedCodes.length === 0
                      ? "No authorized codes"
                      : "Select billing code"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {authorizedCodes.map((code) => (
                  <SelectItem key={code} value={code}>
                    <span className="font-mono text-xs mr-2">{code}</span>
                    {evvServiceLabel(code).replace(`${code} — `, "")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {clientId && authorizedCodes.length === 0 ? (
              <p className="flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>
                  No authorized billing codes found for this client. Please update the Client
                  Profile first.
                </span>
              </p>
            ) : clientId && serviceCode ? (
              <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Lock className="h-3 w-3" />
                Staff will be locked to <span className="font-mono">{serviceCode}</span> at clock-in.
              </p>
            ) : null}
          </div>


          <div className="grid gap-1.5">
            <Label className="text-xs">Service Type *</Label>
            <Select value={shiftType} onValueChange={setShiftType}>
              <SelectTrigger className="text-sm">
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                {SHIFT_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label className="text-xs">Start *</Label>
              <Input
                type="datetime-local"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                className="text-sm"
              />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">End *</Label>
              <Input
                type="datetime-local"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
                className="text-sm"
              />
            </div>
          </div>

          {startsAt && endsAt && new Date(endsAt) > new Date(startsAt) && (
            <p className="text-xs text-muted-foreground">
              Duration:{" "}
              {duration(new Date(startsAt).toISOString(), new Date(endsAt).toISOString())}
            </p>
          )}

          {selectedClient?.physical_address && (
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin className="h-3 w-3" />
              {selectedClient.physical_address}
            </p>
          )}

          <div className="grid gap-1.5">
            <Label className="text-xs">Repeat</Label>
            <Select value={recurrence} onValueChange={setRecurrence}>
              <SelectTrigger className="text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RECURRENCE_OPTIONS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {recurrence !== "none" && (
            <div className="grid gap-1.5">
              <Label className="text-xs">Repeat Until (optional)</Label>
              <Input
                type="date"
                value={recurrenceEnd}
                onChange={(e) => setRecurrenceEnd(e.target.value)}
                className="text-sm"
              />
            </div>
          )}

          <div className="grid gap-1.5">
            <Label className="text-xs">Notes</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Special instructions or care notes..."
              className="text-sm"
            />
          </div>
        </div>
        <DialogFooter className="gap-2 flex-col sm:flex-row">
          <Button variant="outline" onClick={onClose} disabled={busy} className="sm:mr-auto">
            Cancel
          </Button>
          <Button variant="secondary" onClick={() => save(false)} disabled={busy}>
            {busyAction === "draft" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Draft
          </Button>
          <Button onClick={() => save(true)} disabled={busy}>
            {busyAction === "publish" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEdit ? "Save & Publish" : "Publish"}
          </Button>
        </DialogFooter>

      </DialogContent>
    </Dialog>
  );
}

function SchedulingPage() {
  const { data: org, isLoading } = useCurrentOrg();
  if (isLoading)
    return (
      <div className="grid place-items-center py-24 text-sm text-muted-foreground">
        <Loader2 className="mb-2 h-6 w-6 animate-spin" />
        Loading...
      </div>
    );
  if (!org)
    return (
      <div className="grid place-items-center py-24 text-sm text-muted-foreground">
        Access denied.
      </div>
    );
  return <SchedulerInner orgId={org.organization_id} role={org.role} />;
}

type Scope =
  | { type: "all" }
  | { type: "team"; id: string }
  | { type: "home"; address: string };

type TeamRow = {
  id: string;
  team_name: string;
  manager_id: string | null;
  manager_name?: string | null;
};

function SchedulerInner({ orgId, role }: { orgId: string; role: string | null }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [cursor, setCursor] = useState(() => new Date());
  const [viewMode, setViewMode] = useState<ViewMode>("staff");
  const [filter, setFilter] = useState<ShiftFilter>("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editShift, setEditShift] = useState<Partial<Shift> | null>(null);
  const [publishBusy, setPublishBusy] = useState(false);
  const [selStaff, setSelStaff] = useState("all");
  const [selClient, setSelClient] = useState("all");
  const [scope, setScope] = useState<Scope>({ type: "all" });
  const [autoOpen, setAutoOpen] = useState(false);

  const isAdmin = role === "admin" || role === "super_admin";

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 0, 23, 59, 59);
  const monthLabel = cursor.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
  const today = isoDate(new Date());

  const calendarDays = useMemo(() => {
    const days: Date[] = [];
    const s = new Date(monthStart);
    s.setDate(s.getDate() - s.getDay());
    for (let i = 0; i < 42; i++) {
      days.push(new Date(s));
      s.setDate(s.getDate() + 1);
    }
    return days;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month]);

  const { data: shifts = [], isLoading } = useQuery({
    enabled: !!orgId,
    queryKey: ["shifts", orgId, year, month],
    queryFn: async (): Promise<Shift[]> => {
      const { data, error } = await (supabase as any)
        .from("scheduled_shifts")
        .select(
          `id, organization_id, staff_id, client_id, job_code, shift_type,
          starts_at, ends_at, notes, status, is_recurring, recurrence_rule,
          recurrence_end_date, published, created_at,
          clients:client_id(first_name, last_name, physical_address),
          profiles:staff_id(full_name, email)`
        )
        .eq("organization_id", orgId)
        .gte("starts_at", monthStart.toISOString())
        .lte("starts_at", monthEnd.toISOString())
        .order("starts_at");
      if (error) throw error;
      return (data ?? []) as Shift[];
    },
  });

  const { data: staffList = [] } = useQuery({
    enabled: !!orgId,
    queryKey: ["sched-staff", orgId],
    queryFn: async (): Promise<StaffMember[]> => {
      const { data: members, error } = await (supabase as any)
        .from("organization_members")
        .select("user_id, active")
        .eq("organization_id", orgId);
      if (error) throw error;
      const userIds = ((members ?? []) as any[])
        .filter((m) => m.active !== false)
        .map((m) => m.user_id)
        .filter(Boolean);
      if (userIds.length === 0) return [];
      const { data: profs, error: pErr } = await (supabase as any)
        .from("org_member_directory")
        .select("id, full_name, email")
        .in("id", userIds);
      if (pErr) throw pErr;
      return ((profs ?? []) as any[])
        .filter((p) => !!p?.id)
        .sort((a, b) =>
          (a.full_name ?? a.email ?? "").localeCompare(b.full_name ?? b.email ?? "")
        );
    },
  });


  const { data: clientList = [] } = useQuery({
    enabled: !!orgId,
    queryKey: ["sched-clients", orgId],
    queryFn: async (): Promise<Client[]> => {
      const { data, error } = await (supabase as any)
        .from("clients")
        .select("id, first_name, last_name, physical_address, job_code, team_id")
        .eq("organization_id", orgId)
        .eq("account_status", "active");
      if (error) throw error;
      return (data ?? []) as Client[];
    },
  });

  const { data: teamList = [] } = useQuery({
    enabled: !!orgId,
    queryKey: ["sched-teams", orgId],
    queryFn: async (): Promise<TeamRow[]> => {
      const { data, error } = await (supabase as any)
        .from("teams")
        .select("id, team_name, manager_id")
        .eq("organization_id", orgId)
        .order("team_name");
      if (error) throw error;
      const teams = (data ?? []) as TeamRow[];
      const mgrIds = Array.from(new Set(teams.map((t) => t.manager_id).filter(Boolean) as string[]));
      if (mgrIds.length) {
        const { data: profs } = await (supabase as any)
          .from("org_member_directory").select("id, full_name, email").in("id", mgrIds);
        const map = new Map<string, { full_name: string | null; email: string | null }>(
          ((profs ?? []) as any[]).map((p) => [p.id, p]),
        );
        teams.forEach((t) => {
          const p = t.manager_id ? map.get(t.manager_id) : null;
          t.manager_name = p?.full_name ?? p?.email ?? null;
        });
      }
      return teams;
    },
  });

  const { data: homeHosts = [] } = useQuery({
    enabled: !!orgId,
    queryKey: ["sched-home-hosts", orgId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("staff_assignments")
        .select("staff_id, client_id, is_group_home_assignment")
        .eq("organization_id", orgId)
        .eq("is_group_home_assignment", true);
      if (error) throw error;
      return (data ?? []) as Array<{ staff_id: string; client_id: string }>;
    },
  });

  // Group-home addresses derived from clients with shared physical_address.
  const homeAddresses = useMemo(() => {
    const counts = new Map<string, number>();
    clientList.forEach((c) => {
      const a = (c.physical_address ?? "").trim();
      if (!a) return;
      counts.set(a, (counts.get(a) ?? 0) + 1);
    });
    return Array.from(counts.entries())
      .filter(([, n]) => n >= 2)
      .map(([address]) => address)
      .sort();
  }, [clientList]);

  // Clients in current scope.
  const scopedClients = useMemo(() => {
    if (scope.type === "all") return clientList;
    if (scope.type === "team") return clientList.filter((c) => c.team_id === scope.id);
    return clientList.filter((c) => (c.physical_address ?? "").trim() === scope.address);
  }, [clientList, scope]);

  // Who is the assigned scheduler for the current scope, and can the current user edit?
  const { assignedLabel, canEdit } = useMemo(() => {
    if (scope.type === "all") {
      return { assignedLabel: isAdmin ? "Company Admin oversight" : null, canEdit: isAdmin };
    }
    if (scope.type === "team") {
      const t = teamList.find((x) => x.id === scope.id);
      const mgrName = t?.manager_name ?? "Unassigned";
      const mine = !!t?.manager_id && t.manager_id === user?.id;
      return {
        assignedLabel: `Manager: ${mgrName}`,
        canEdit: isAdmin || mine,
      };
    }
    // home scope: any staff with is_group_home_assignment at this address is a host
    const clientIdsAtHome = new Set(
      clientList
        .filter((c) => (c.physical_address ?? "").trim() === scope.address)
        .map((c) => c.id),
    );
    const hostStaffIds = Array.from(
      new Set(
        homeHosts
          .filter((h) => clientIdsAtHome.has(h.client_id))
          .map((h) => h.staff_id),
      ),
    );
    const isHost = !!user?.id && hostStaffIds.includes(user.id);
    return {
      assignedLabel: `Hosts: ${hostStaffIds.length} assigned`,
      canEdit: isAdmin || isHost,
    };
  }, [scope, teamList, clientList, homeHosts, user?.id, isAdmin]);

  const scopeLabel =
    scope.type === "all"
      ? "All teams & homes"
      : scope.type === "team"
      ? `Team: ${teamList.find((t) => t.id === scope.id)?.team_name ?? "—"}`
      : `Host Home: ${scope.address}`;

  const scopedClientIds = useMemo(() => new Set(scopedClients.map((c) => c.id)), [scopedClients]);

  const filtered = useMemo(
    () =>
      shifts.filter((s) => {
        if (scope.type !== "all" && !scopedClientIds.has(s.client_id)) return false;
        if (selStaff !== "all" && s.staff_id !== selStaff) return false;
        if (selClient !== "all" && s.client_id !== selClient) return false;
        if (filter === "published" && !s.published) return false;
        if (filter === "unpublished" && s.published) return false;
        if (filter === "accepted" && s.status !== "accepted") return false;
        if (filter === "pending" && s.status !== "pending") return false;
        if (filter === "declined" && s.status !== "declined") return false;
        return true;
      }),
    [shifts, filter, selStaff, selClient, scope, scopedClientIds]
  );

  const byDate = useMemo(() => {
    const m = new Map<string, Shift[]>();
    filtered.forEach((s) => {
      const k = isoDate(new Date(s.starts_at));
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(s);
    });
    return m;
  }, [filtered]);

  const stats = useMemo(
    () => ({
      total: shifts.length,
      published: shifts.filter((s) => s.published).length,
      accepted: shifts.filter((s) => s.status === "accepted").length,
      pending: shifts.filter((s) => s.status === "pending").length,
      declined: shifts.filter((s) => s.status === "declined").length,
    }),
    [shifts]
  );

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from("scheduled_shifts")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Shift deleted.");
      qc.invalidateQueries({ queryKey: ["shifts", orgId, year, month] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function publishAll() {
    const ids = shifts.filter((s) => !s.published).map((s) => s.id);
    if (!ids.length) {
      toast.info("All shifts already published.");
      return;
    }
    setPublishBusy(true);
    try {
      const { error } = await (supabase as any)
        .from("scheduled_shifts")
        .update({ published: true })
        .in("id", ids);
      if (error) throw error;
      toast.success(`${ids.length} shift${ids.length > 1 ? "s" : ""} published.`);
      qc.invalidateQueries({ queryKey: ["shifts", orgId, year, month] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPublishBusy(false);
    }
  }

  function duplicate(s: Shift) {
    setEditShift({
      staff_id: s.staff_id,
      client_id: s.client_id,
      shift_type: s.shift_type,
      starts_at: s.starts_at,
      ends_at: s.ends_at,
      notes: s.notes,
      is_recurring: s.is_recurring,
      recurrence_rule: s.recurrence_rule,
      recurrence_end_date: s.recurrence_end_date,
    });
    setFormOpen(true);
  }

  return (
    <div className="space-y-5">
      <NectarGuidanceStrip
        title="Scheduling guidance"
        message={
          canEdit ? (
            <>
              You can edit shifts in <span className="font-medium text-foreground">{scopeLabel}</span>.
              Use NECTAR Auto-assign to draft shifts from staff assignments — every proposal is validated before anything is written.
            </>
          ) : (
            <>
              View-only access to <span className="font-medium text-foreground">{scopeLabel}</span>.
              {assignedLabel ? <> {assignedLabel} is the assigned scheduler.</> : null}
            </>
          )
        }
        highlight={stats.total - stats.published > 0 ? `${stats.total - stats.published} draft shifts` : undefined}
        actionLabel={canEdit && scope.type !== "all" ? "NECTAR Auto-assign" : undefined}
        onAction={canEdit && scope.type !== "all" ? () => setAutoOpen(true) : undefined}
      />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">Scheduling</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Manage caregiver shifts, publish schedules, and track status.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={scope.type === "all" ? "all" : scope.type === "team" ? `team:${scope.id}` : `home:${scope.address}`}
              onValueChange={(v) => {
                if (v === "all") setScope({ type: "all" });
                else if (v.startsWith("team:")) setScope({ type: "team", id: v.slice(5) });
                else if (v.startsWith("home:")) setScope({ type: "home", address: v.slice(5) });
              }}
            >
              <SelectTrigger className="h-8 w-[280px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All teams & homes (Admin view)</SelectItem>
                {teamList.length > 0 && (
                  <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Teams</div>
                )}
                {teamList.map((t) => (
                  <SelectItem key={t.id} value={`team:${t.id}`}>
                    {t.team_name}
                    {t.manager_name ? ` — ${t.manager_name}` : ""}
                  </SelectItem>
                ))}
                {homeAddresses.length > 0 && (
                  <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Host homes</div>
                )}
                {homeAddresses.map((a) => (
                  <SelectItem key={a} value={`home:${a}`}>{a}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {assignedLabel && (
              <Badge variant="secondary" className="gap-1 text-[10px]">
                <ShieldCheck className="h-3 w-3" /> {assignedLabel}
              </Badge>
            )}
            {!canEdit && (
              <Badge className="gap-1 border-amber-500/40 bg-amber-500/10 text-amber-700 text-[10px] dark:text-amber-300">
                <Eye className="h-3 w-3" /> View only
              </Badge>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {canEdit && scope.type !== "all" && (
            <Button
              onClick={() => setAutoOpen(true)}
              variant="outline"
              className="gap-2 border-primary/30 text-primary hover:bg-primary/10"
            >
              <Sparkles className="h-4 w-4" />
              NECTAR Auto-assign
            </Button>
          )}
          <Button
            onClick={publishAll}
            disabled={!canEdit || publishBusy || stats.published === stats.total}
            className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {publishBusy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            Publish All Shifts
            {stats.total - stats.published > 0 && (
              <Badge className="bg-white/20 text-white text-[10px]">
                {stats.total - stats.published} draft
              </Badge>
            )}
          </Button>
          <Button
            onClick={() => {
              setEditShift(null);
              setFormOpen(true);
            }}
            disabled={!canEdit}
            className="gap-2"
          >
            <Plus className="h-4 w-4" /> Add Shift
          </Button>
        </div>
      </div>


      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {[
          { label: "Total", value: stats.total, color: "text-foreground" },
          { label: "Published", value: stats.published, color: "text-blue-600" },
          { label: "Accepted", value: stats.accepted, color: "text-emerald-600" },
          { label: "Pending", value: stats.pending, color: "text-amber-600" },
          { label: "Declined", value: stats.declined, color: "text-rose-600" },
        ].map((s) => (
          <Card key={s.label} className="p-3 text-center">
            <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-[11px] text-muted-foreground">{s.label}</p>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg border border-border bg-muted/30 p-0.5">
          {(["staff", "client"] as ViewMode[]).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setViewMode(v)}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition ${
                viewMode === v
                  ? "bg-background shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {v === "staff" ? (
                <Users className="h-3.5 w-3.5" />
              ) : (
                <Contact2 className="h-3.5 w-3.5" />
              )}
              {v === "staff" ? "Staff" : "Client"}
            </button>
          ))}
        </div>
        <Select value={selStaff} onValueChange={setSelStaff}>
          <SelectTrigger className="h-8 w-44 text-xs">
            <SelectValue placeholder="All Staff" />
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
        <Select value={selClient} onValueChange={setSelClient}>
          <SelectTrigger className="h-8 w-44 text-xs">
            <SelectValue placeholder="All Clients" />
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
        <div className="flex gap-1 flex-wrap">
          {(
            ["all", "published", "unpublished", "accepted", "pending", "declined"] as ShiftFilter[]
          ).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition capitalize ${
                filter === f
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {f === "all" ? "All" : f}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setCursor(new Date(year, month - 1, 1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-[140px] text-center text-sm font-semibold">{monthLabel}</span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setCursor(new Date(year, month + 1, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 text-xs"
            onClick={() => setCursor(new Date())}
          >
            Today
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-[11px]">
        {(
          [
            ["border-l-emerald-500", "bg-emerald-100", "Accepted"],
            ["border-l-amber-500", "bg-amber-100", "Pending"],
            ["border-l-rose-500", "bg-rose-100", "Declined"],
            ["border-l-blue-500", "bg-blue-100", "Published"],
            ["border-l-slate-400", "bg-slate-100", "Draft"],
          ] as [string, string, string][]
        ).map(([border, bg, label]) => (
          <span key={label} className="flex items-center gap-1.5">
            <span className={`h-3 w-3 rounded-sm border-l-2 ${border} ${bg}`} />
            {label}
          </span>
        ))}
      </div>

      {isLoading ? (
        <div className="grid place-items-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border">
          <div className="grid grid-cols-7 border-b border-border bg-muted/40">
            {DAYS.map((d) => (
              <div
                key={d}
                className="py-2 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
              >
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {calendarDays.map((day, idx) => {
              const key = isoDate(day);
              const dayShifts = byDate.get(key) ?? [];
              const isCurrent = day.getMonth() === month;
              const isToday = key === today;
              return (
                <div
                  key={idx}
                  className={`group/day min-h-[120px] border-b border-r border-border p-1.5 ${
                    !isCurrent ? "bg-muted/20" : "bg-background"
                  } ${idx % 7 === 6 ? "border-r-0" : ""}`}
                >
                  <div className="mb-1 flex items-center justify-between">
                    <span
                      className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${
                        isToday
                          ? "bg-primary text-primary-foreground"
                          : isCurrent
                          ? "text-foreground"
                          : "text-muted-foreground/40"
                      }`}
                    >
                      {day.getDate()}
                    </span>
                    {isCurrent && (
                      <button
                        type="button"
                        onClick={() => {
                          const s = new Date(day);
                          s.setHours(9, 0, 0, 0);
                          const e = new Date(day);
                          e.setHours(17, 0, 0, 0);
                          setEditShift({
                            starts_at: s.toISOString(),
                            ends_at: e.toISOString(),
                          });
                          setFormOpen(true);
                        }}
                        className="rounded p-0.5 text-muted-foreground/40 opacity-0 hover:bg-accent hover:text-foreground transition group-hover/day:opacity-100"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                  <div className="space-y-1">
                    {dayShifts.slice(0, 3).map((s) => {
                      const sk = statusKey(s);
                      const st = STATUS_STYLES[sk];
                      const name =
                        viewMode === "staff"
                          ? s.clients
                            ? `${s.clients.first_name} ${s.clients.last_name}`
                            : "—"
                          : s.profiles?.full_name ?? s.profiles?.email ?? "—";
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => {
                            setEditShift(s);
                            setFormOpen(true);
                          }}
                          className={`w-full rounded border-l-2 ${st.border} ${st.bg} px-1.5 py-0.5 text-left text-[10px] font-medium ${st.text} truncate hover:opacity-80 transition`}
                        >
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

      {filtered.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            All Shifts This Month
            <Badge variant="secondary">{filtered.length}</Badge>
          </h3>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filtered.map((s) => {
              const sk = statusKey(s);
              const st = STATUS_STYLES[sk];
              const clientName = s.clients
                ? `${s.clients.first_name} ${s.clients.last_name}`
                : "—";
              const staffName = s.profiles?.full_name ?? s.profiles?.email ?? "—";
              return (
                <div
                  key={s.id}
                  className={`group relative flex flex-col rounded-xl border border-border border-l-4 ${st.border} ${st.bg} p-3 shadow-sm transition hover:shadow-md`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">
                        {viewMode === "staff" ? clientName : staffName}
                      </p>
                      <p className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {fmtTime(s.starts_at)} – {fmtTime(s.ends_at)}
                        <span className="ml-1 text-[10px]">
                          ({duration(s.starts_at, s.ends_at)})
                        </span>
                      </p>
                    </div>
                    <Badge className={`shrink-0 text-[10px] ${st.bg} ${st.text} border-0`}>
                      {st.label}
                    </Badge>
                  </div>
                  <div className="mt-1.5 space-y-0.5">
                    {s.shift_type && (
                      <p className="text-[11px] text-muted-foreground">
                        {SHIFT_TYPES.find((t) => t.value === s.shift_type)?.label ??
                          s.shift_type}
                      </p>
                    )}
                    {s.clients?.physical_address && (
                      <p className="flex items-center gap-1 text-[11px] text-muted-foreground truncate">
                        <MapPin className="h-2.5 w-2.5 shrink-0" />
                        {s.clients.physical_address}
                      </p>
                    )}
                    {s.is_recurring && (
                      <p className="flex items-center gap-1 text-[11px] text-primary">
                        <RefreshCw className="h-2.5 w-2.5" /> Recurring
                      </p>
                    )}
                  </div>
                  <div className="mt-2 flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
                    <button
                      type="button"
                      onClick={() => {
                        setEditShift(s);
                        setFormOpen(true);
                      }}
                      className="rounded px-2 py-1 text-[11px] font-medium text-primary hover:bg-primary/10 transition"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => duplicate(s)}
                      className="rounded px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent transition"
                    >
                      <Copy className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteMut.mutate(s.id)}
                      className="rounded px-2 py-1 text-[11px] text-rose-600 hover:bg-rose-50 transition dark:hover:bg-rose-950/30"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {filtered.length === 0 && !isLoading && (
        <Card className="p-12 text-center">
          <CalendarDays className="mx-auto mb-3 h-10 w-10 text-muted-foreground/30" />
          <p className="font-semibold">No shifts this month</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Click Add Shift to schedule a caregiver.
          </p>
        </Card>
      )}

      <ShiftFormDialog
        open={formOpen}
        initial={editShift}
        staff={staffList}
        clients={clientList}
        orgId={orgId}
        userId={user?.id ?? ""}
        onClose={() => {
          setFormOpen(false);
          setEditShift(null);
        }}
        onSaved={() =>
          qc.invalidateQueries({ queryKey: ["shifts", orgId, year, month] })
        }
      />

      <NectarAutoAssignDialog
        open={autoOpen}
        onClose={() => setAutoOpen(false)}
        orgId={orgId}
        userId={user?.id ?? ""}
        clientsInScope={scopedClients}
        scopeLabel={scopeLabel}
      />
    </div>
  );
}

