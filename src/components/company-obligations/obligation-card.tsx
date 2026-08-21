// Reusable card for one Company Obligation on the admin obligations page.
// Shows cadence/evidence badges, assignment chips, current-instance status,
// and always-visible per-name completion detail for the current instance.
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { AlertTriangle, CheckCircle2, ChevronDown, Circle, Lock, MoreHorizontal } from "lucide-react";
import {
  confirmFailedObligationCompletion,
  countObligationAssigneesMissingHireDate,
  deleteCompanyObligation,
  listObligationAssignees,
  logObligationEvent,
  toggleObligationActive,
  type CompanyObligationRow,
  type ObligationInstanceRow,
  type ObligationRollup,
} from "@/lib/company-obligations.functions";
import { ObligationHistorySheet } from "./obligation-history-sheet";
import { ManualCompletionDrawer } from "./manual-completion-drawer";
import { ObligationCardActions } from "./obligation-card-actions";
import { CatalogBadges, RollupStatus, catalogFor } from "./obligation-meta";
import { ObligationCatalogNote } from "./obligation-catalog-note";

export type ObligationWithInstance = CompanyObligationRow & {
  current_instance: ObligationInstanceRow | null;
  rollup?: ObligationRollup;
};

function formatDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function cadenceLabel(ob: CompanyObligationRow): string {
  const cfg = (ob.due_day_config ?? {}) as Record<string, unknown>;
  switch (ob.cadence) {
    case "weekly": {
      const wd = Number(cfg.weekday);
      return `Weekly · ${WEEKDAYS[wd] ?? "?"}s`;
    }
    case "monthly": {
      const d = cfg.day_of_month;
      return `Monthly · ${d === "last" ? "Last day" : ordinal(Number(d))} of month`;
    }
    case "quarterly": {
      return "Quarterly · 1st of quarter";
    }
    case "annually": {
      // every_n_months and anniversary_based obligations are stored with
      // cadence='annually' but compute their interval from a per-staffer
      // cert/hire date, not a shared calendar month/day — check these first.
      if (cfg.days_after_hire !== undefined && cfg.every_n_months !== undefined) {
        const days = Number(cfg.days_after_hire);
        const months = Number(cfg.every_n_months);
        const from = cfg.from === "cert_expiration" ? "cert expiration" : "completion";
        const renewalPart = months === 24 ? "2 years" : `${months} months`;
        return `Due ${days} days after hire · renews every ${renewalPart} from ${from}`;
      }
      if (cfg.every_n_months !== undefined) {
        const n = Number(cfg.every_n_months);
        const from = cfg.from === "cert_expiration" ? "cert expiration" : "completion";
        return n === 24 ? `Every 2 years · from ${from}`
             : n === 12 ? `Annually · from ${from}`
             : `Every ${n} months · from ${from}`;
      }
      if (cfg.anniversary_based === true) {
        return "Annually · from hire date";
      }
      const m = Number(cfg.month);
      const d = cfg.day_of_month;
      return `Annually · ${MONTHS[m - 1] ?? "?"} ${d === "last" ? "Last" : ordinal(Number(d))}`;
    }
    case "per_event":
      return "Per event";
    case "one_time": {
      if (cfg.days_after_assignment !== undefined) {
        return `Due ${Number(cfg.days_after_assignment)} days after client assignment`;
      }
      if (cfg.days_after_hire !== undefined) {
        return `One-time · due ${Number(cfg.days_after_hire)} days after hire`;
      }
      const dateStr = typeof cfg.date === "string" ? cfg.date : "";
      return `One-time · ${dateStr ? formatDate(`${dateStr}T00:00:00Z`) : "date TBD"}`;
    }
    default:
      return ob.cadence;
  }
}

function evidenceLabel(t: CompanyObligationRow["evidence_type"]): string {
  switch (t) {
    case "attestation": return "Attestation";
    case "upload": return "Upload";
    case "upload_and_attestation": return "Upload + Attestation";
    case "form": return "Form";
    default: return t;
  }
}

/** Shared "Due in N days" / "Overdue — N days" phrasing for a single due_at,
 *  used by both the per-name and per-client not-yet-submitted rows. */
function dueStatusText(dueAt: string | null): { text: string; overdue: boolean } {
  if (!dueAt) return { text: "not yet submitted", overdue: false };
  const due = new Date(dueAt);
  const now = new Date();
  if (due < now) {
    const days = Math.max(1, Math.ceil((now.getTime() - due.getTime()) / 86_400_000));
    return { text: `Overdue — ${days} day${days === 1 ? "" : "s"}`, overdue: true };
  }
  const daysUntil = Math.ceil((due.getTime() - now.getTime()) / 86_400_000);
  if (daysUntil === 0) return { text: "Due today", overdue: false };
  if (daysUntil === 1) return { text: "Due tomorrow", overdue: false };
  return { text: `Due in ${daysUntil} days`, overdue: false };
}

function InstanceStatusLine({ instance }: { instance: ObligationInstanceRow | null }) {
  if (!instance) {
    return <p className="text-sm text-muted-foreground">No instance yet</p>;
  }
  if (instance.status === "completed") {
    return (
      <p className="text-sm font-medium text-success">
        Satisfied {formatDate(instance.completed_at)}
      </p>
    );
  }
  if (instance.status === "waived") {
    return <p className="text-sm font-medium text-muted-foreground">Waived — {instance.waive_reason}</p>;
  }
  if (instance.status === "overdue") {
    const days = Math.max(1, Math.floor((Date.now() - new Date(instance.due_at).getTime()) / 86_400_000));
    return <p className="text-sm font-medium text-destructive">Overdue — {days} day{days === 1 ? "" : "s"}</p>;
  }
  return <p className="text-sm font-medium text-warning-foreground">Due {formatDate(instance.due_at)}</p>;
}

type AssigneeRow = { staff_id: string; staff_name: string };
type CompletionRow = {
  id: string;
  staff_id: string;
  staff_name: string;
  completed_at: string | null;
  nectar_validation_status: string | null;
  nectar_validation_reasons: string[] | null;
  nectar_extracted_cert_type: string | null;
};

function ConfirmNectarOverrideButton({
  orgId,
  instanceId,
  completionId,
  staffName,
}: {
  orgId: string;
  instanceId: string;
  completionId: string;
  staffName: string;
}) {
  const qc = useQueryClient();
  const confirmFn = useServerFn(confirmFailedObligationCompletion);
  const confirm = useMutation({
    mutationFn: () => confirmFn({ data: { organizationId: orgId, instanceId, completionId } }),
    onSuccess: () => {
      toast.success(`Confirmed ${staffName}'s upload`);
      qc.invalidateQueries({ queryKey: ["obligation-instance-detail", instanceId] });
      qc.invalidateQueries({ queryKey: ["company-obligations", orgId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Button size="sm" variant="outline" className="h-6 px-2 text-xs" disabled={confirm.isPending} onClick={() => confirm.mutate()}>
      Confirm
    </Button>
  );
}

function PerNameCompletion({
  orgId,
  obligation,
}: {
  orgId: string;
  obligation: ObligationWithInstance;
}) {
  const [expanded, setExpanded] = useState(false);
  const instanceId = obligation.current_instance?.id;
  const listAssigneesFn = useServerFn(listObligationAssignees);
  const { data } = useQuery({
    queryKey: ["obligation-instance-detail", instanceId, obligation.id],
    enabled: !!instanceId,
    queryFn: async () => {
      // Per-person obligations create one instance per staff member, so
      // completions must be gathered across EVERY instance of the obligation
      // — not just the card's current instance.
      const { data: instRows, error: iErr } = await supabase
        .from("company_obligation_instances")
        .select("id, due_at, assignee_staff_id, status")
        .eq("obligation_id", obligation.id);
      if (iErr) throw new Error(iErr.message);
      const instanceIds = ((instRows ?? []) as Array<{ id: string }>).map((r) => r.id);

      const [assignees, { data: completions, error: cErr }] = await Promise.all([
        listAssigneesFn({ data: { organizationId: orgId, obligationId: obligation.id } }),
        supabase
          .from("company_obligation_completions")
          .select("id, staff_id, staff_name, completed_at, nectar_validation_status, nectar_validation_reasons, nectar_extracted_cert_type")
          .in("instance_id", instanceIds.length ? instanceIds : [instanceId as string]),
      ]);
      if (cErr) throw new Error(cErr.message);
      const dueByStaff = new Map<string, string>();
      for (const row of (instRows ?? []) as Array<{ assignee_staff_id: string | null; due_at: string; status: string }>) {
        if (!row.assignee_staff_id) continue;
        if (row.status !== "pending" && row.status !== "overdue") continue;
        const prev = dueByStaff.get(row.assignee_staff_id);
        if (!prev || new Date(row.due_at).getTime() < new Date(prev).getTime()) {
          dueByStaff.set(row.assignee_staff_id, row.due_at);
        }
      }
      return {
        // Full resolved group roster, not just staff snapshotted onto this
        // one instance — so staff added to the group later still appear.
        assignees: assignees.map((a) => ({ staff_id: a.staff_id, staff_name: a.staff_name })) as AssigneeRow[],
        completions: (completions ?? []) as CompletionRow[],
        dueByStaff,
      };
    },
  });

  if (!obligation.current_instance) {
    return <p className="text-xs text-muted-foreground">No active instance.</p>;
  }
  if (!data) return null;

  const { assignees, completions, dueByStaff } = data;
  const completedIds = new Set(completions.map((c) => c.staff_id));
  const notSubmitted = assignees.filter((a) => !completedIds.has(a.staff_id));
  const isClosed = obligation.current_instance.status === "completed" || obligation.current_instance.status === "waived";

  if (isClosed && !obligation.requires_individual_completion) {
    const by = obligation.current_instance.completed_by_name ?? completions[0]?.staff_name ?? "someone";
    return (
      <p className="text-xs text-muted-foreground">
        Satisfied by {by} — any one submission closes this obligation.
        {assignees.length > 0 && (
          <span className="block">All assigned: {assignees.map((a) => a.staff_name).join(", ")}</span>
        )}
      </p>
    );
  }

  const listBody = (
    <div className="grid gap-1.5 text-xs sm:grid-cols-2">
      <div>
        <p className="font-medium text-muted-foreground">Completed:</p>
        {completions.length === 0 ? (
          <p className="text-muted-foreground">None yet</p>
        ) : (
          <ul className="space-y-0.5">
            {completions.map((c) => {
              const failed = c.nectar_validation_status === "failed";
              return (
                <li key={c.staff_id} className={failed ? "text-amber-600 dark:text-amber-400" : "text-success"}>
                  <div className="flex items-center gap-1">
                    {failed ? <AlertTriangle className="h-3 w-3 shrink-0" /> : <CheckCircle2 className="h-3 w-3 shrink-0" />}
                    <span className="truncate">
                      {c.staff_name} — {failed ? "NECTAR could not verify" : formatDate(c.completed_at)}
                    </span>
                    {failed && instanceId && (
                      <ConfirmNectarOverrideButton orgId={orgId} instanceId={instanceId} completionId={c.id} staffName={c.staff_name} />
                    )}
                  </div>
                  {failed && (c.nectar_validation_reasons?.length ?? 0) > 0 && (
                    <p className="ml-4 text-[11px] text-muted-foreground">{c.nectar_validation_reasons!.join("; ")}</p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <div>
        <p className="font-medium text-muted-foreground">Not yet submitted:</p>
        {notSubmitted.length === 0 ? (
          <p className="text-muted-foreground">None</p>
        ) : (
          <ul className="space-y-0.5">
            {notSubmitted.map((a) => {
              const { text, overdue } = dueStatusText(dueByStaff.get(a.staff_id) ?? obligation.current_instance?.due_at ?? null);
              return (
                <li key={a.staff_id} className={`flex items-center gap-1 ${overdue ? "text-destructive" : "text-muted-foreground"}`}>
                  {overdue ? <AlertTriangle className="h-3 w-3 shrink-0" /> : <Circle className="h-3 w-3 shrink-0" />}
                  <span className="truncate">{a.staff_name} — {text}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );

  const totalAssigned = assignees.length;
  const completedCount = completions.length;

  return (
    <div className="space-y-1.5">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-1 text-xs font-medium text-muted-foreground md:pointer-events-none"
      >
        {completedCount} of {totalAssigned} completed
        <ChevronDown className={`h-3 w-3 shrink-0 transition-transform md:hidden ${expanded ? "rotate-180" : ""}`} />
      </button>
      <div className={`${expanded ? "block" : "hidden"} md:block`}>{listBody}</div>
    </div>
  );
}

type PerClientInstanceRow = {
  id: string;
  status: string;
  due_at: string;
  completed_at: string | null;
  client_id: string | null;
  client_name: string | null;
};
type PerClientAssigneeRow = { instance_id: string; staff_id: string; staff_name: string };
type PerClientCompletionRow = { instance_id: string; staff_id: string; staff_name: string; completed_at: string | null };

/** scope='staff_per_client' obligations have many concurrent open instances
 *  (one per staff+client pair) instead of a single current_instance, so this
 *  lists every instance's staff/client pairing with its own status line —
 *  format: "✓ Jordan M. (for Marcus W.) — Aug 11, 4:32 PM". */
function PerClientCompletion({ obligation }: { obligation: ObligationWithInstance }) {
  const [expanded, setExpanded] = useState(false);
  const { data } = useQuery({
    queryKey: ["obligation-per-client-detail", obligation.id],
    queryFn: async () => {
      const { data: instances, error: iErr } = await supabase
        .from("company_obligation_instances")
        .select("id, status, due_at, completed_at, client_id, client_name")
        .eq("obligation_id", obligation.id)
        .order("due_at", { ascending: true });
      if (iErr) throw new Error(iErr.message);
      const instanceIds = (instances ?? []).map((i: { id: string }) => i.id);
      const [{ data: assignees, error: aErr }, { data: completions, error: cErr }] = instanceIds.length
        ? await Promise.all([
            supabase.from("company_obligation_instance_assignees")
              .select("instance_id, staff_id, staff_name").in("instance_id", instanceIds),
            supabase.from("company_obligation_completions")
              .select("instance_id, staff_id, staff_name, completed_at").in("instance_id", instanceIds),
          ])
        : [{ data: [], error: null }, { data: [], error: null }];
      if (aErr) throw new Error(aErr.message);
      if (cErr) throw new Error(cErr.message);
      return {
        instances: (instances ?? []) as PerClientInstanceRow[],
        assignees: (assignees ?? []) as PerClientAssigneeRow[],
        completions: (completions ?? []) as PerClientCompletionRow[],
      };
    },
  });

  if (!data) return null;
  const { instances, assignees, completions } = data;
  if (!instances.length) return <p className="text-xs text-muted-foreground">No active staff+client assignments yet.</p>;

  const assigneeByInstance = new Map(assignees.map((a) => [a.instance_id, a]));
  const completionByInstance = new Map(completions.map((c) => [c.instance_id, c]));
  const doneCount = instances.filter((inst) => inst.status === "completed" || completionByInstance.has(inst.id)).length;
  const overdueCount = instances.filter((inst) => inst.status === "overdue").length;

  return (
    <div className="space-y-1.5">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-1 text-xs font-medium text-muted-foreground md:pointer-events-none"
      >
        {doneCount} of {instances.length} completed
        {overdueCount > 0 && <span className="text-destructive"> · {overdueCount} overdue</span>}
        <ChevronDown className={`h-3 w-3 shrink-0 transition-transform md:hidden ${expanded ? "rotate-180" : ""}`} />
      </button>
      <ul className={`space-y-1 text-xs ${expanded ? "block" : "hidden"} md:block`}>
        {instances.map((inst) => {
          const assignee = assigneeByInstance.get(inst.id);
          const completion = completionByInstance.get(inst.id);
          const done = inst.status === "completed" || !!completion;
          const staffName = assignee?.staff_name ?? "Unknown staff";
          const clientName = inst.client_name ?? "Unknown client";
          const { text, overdue } = done ? { text: formatDate(completion?.completed_at ?? inst.completed_at), overdue: false } : dueStatusText(inst.due_at);
          return (
            <li
              key={inst.id}
              className={`flex items-center gap-1 ${done ? "text-success" : overdue ? "text-destructive" : "text-muted-foreground"}`}
            >
              {done ? (
                <CheckCircle2 className="h-3 w-3 shrink-0" />
              ) : overdue ? (
                <AlertTriangle className="h-3 w-3 shrink-0" />
              ) : (
                <Circle className="h-3 w-3 shrink-0" />
              )}
              <span className="truncate">
                {staffName} (for {clientName}) — {text}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function LogEventDialog({
  open,
  onOpenChange,
  orgId,
  obligation,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  orgId: string;
  obligation: CompanyObligationRow;
}) {
  const qc = useQueryClient();
  const logFn = useServerFn(logObligationEvent);
  const [description, setDescription] = useState("");
  const [eventDate, setEventDate] = useState(() => new Date().toISOString().slice(0, 10));

  const daysAfter = Number((obligation.due_day_config as Record<string, unknown> | null)?.days_after_trigger ?? 0);
  const computedDue = useMemo(() => {
    const d = new Date(`${eventDate}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + daysAfter);
    return formatDate(d.toISOString());
  }, [eventDate, daysAfter]);

  const create = useMutation({
    mutationFn: () =>
      logFn({
        data: {
          organizationId: orgId,
          obligationId: obligation.id,
          eventDescription: description.trim(),
          eventDate,
        },
      }),
    onSuccess: () => {
      toast.success("Event logged, instance created");
      onOpenChange(false);
      setDescription("");
      qc.invalidateQueries({ queryKey: ["company-obligations", orgId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Log event — {obligation.title}</DialogTitle>
          <DialogDescription>Creates a new due-dated instance for this event.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid gap-1.5">
            <Label>Event description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} required />
          </div>
          <div className="grid gap-1.5">
            <Label>Event date</Label>
            <Input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
          </div>
          <p className="text-sm text-muted-foreground">Due by {computedDue}</p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={() => create.mutate()}
            disabled={!description.trim() || create.isPending}
          >
            Create instance
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function HireDateWarning({ orgId, obligation }: { orgId: string; obligation: CompanyObligationRow }) {
  const cfg = (obligation.due_day_config ?? {}) as Record<string, unknown>;
  const usesHireDate = cfg.days_after_hire !== undefined || cfg.anniversary_based === true;
  const countFn = useServerFn(countObligationAssigneesMissingHireDate);
  const { data } = useQuery({
    queryKey: ["obligation-missing-hire-date", obligation.id],
    enabled: obligation.scope === "staff" && usesHireDate,
    queryFn: () => countFn({ data: { organizationId: orgId, obligationId: obligation.id } }),
  });

  if (obligation.scope !== "staff" || !usesHireDate || !data?.missing) return null;

  return (
    <div className="mt-2 flex items-start gap-2 rounded-md border border-amber-300/60 bg-amber-500/10 p-2.5 text-xs text-amber-900 dark:text-amber-200">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>
        {data.missing} staff member{data.missing === 1 ? "" : "s"} {data.missing === 1 ? "has" : "have"} no hire date —
        due dates cannot be calculated for {data.missing === 1 ? "them" : "them"}.{" "}

        <a href="/dashboard/employees/hire-dates" className="underline underline-offset-2">Set hire dates →</a>
      </span>
    </div>
  );
}

export function ObligationCard({
  orgId,
  obligation,
  groupNamesById,
  userNamesById,
  publishedFormIds,
  onEdit,
}: {
  orgId: string;
  obligation: ObligationWithInstance;
  groupNamesById: Map<string, { name: string; member_count: number }>;
  userNamesById: Map<string, string>;
  publishedFormIds: Set<string>;
  onEdit: (ob: ObligationWithInstance) => void;
}) {
  const qc = useQueryClient();
  const toggleFn = useServerFn(toggleObligationActive);
  const deleteFn = useServerFn(deleteCompanyObligation);

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [logEventOpen, setLogEventOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const toggleActive = useMutation({
    mutationFn: () => toggleFn({ data: { organizationId: orgId, obligationId: obligation.id, active: !obligation.active } }),
    onSuccess: () => {
      toast.success(obligation.active ? "Obligation paused" : "Obligation resumed");
      qc.invalidateQueries({ queryKey: ["company-obligations", orgId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: () => deleteFn({ data: { organizationId: orgId, obligationId: obligation.id } }),
    onSuccess: () => {
      toast.success("Obligation deleted");
      setConfirmDelete(false);
      qc.invalidateQueries({ queryKey: ["company-obligations", orgId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const formArchived = obligation.evidence_type === "form" && obligation.linked_form_id
    ? !publishedFormIds.has(obligation.linked_form_id)
    : false;

  return (
    <div className="w-full rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between md:gap-3">
        <div className="min-w-0 flex-1">
          <h4 className="font-semibold">{obligation.title}</h4>
          {obligation.source_policy_section && (
            <p className="text-sm text-muted-foreground">{obligation.source_policy_section}</p>
          )}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0 self-end md:self-auto">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {obligation.is_locked ? (
              <>
                <DropdownMenuItem onSelect={() => setHistoryOpen(true)}>View history</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setManualOpen(true)}>Add manual completion</DropdownMenuItem>
                <DropdownMenuSeparator />
                <div className="px-2 py-1.5 text-xs text-muted-foreground">
                  State-required — cannot be modified.
                </div>
              </>
            ) : (
              <>
                <DropdownMenuItem onSelect={() => onEdit(obligation)}>Edit</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setHistoryOpen(true)}>View history</DropdownMenuItem>
                {obligation.cadence === "per_event" && (
                  <DropdownMenuItem onSelect={() => setLogEventOpen(true)}>Log event</DropdownMenuItem>
                )}
                <DropdownMenuItem onSelect={() => setManualOpen(true)}>Add manual completion</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => toggleActive.mutate()}>
                  {obligation.active ? "Pause" : "Resume"}
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onSelect={() => setConfirmDelete(true)}
                >
                  Delete
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {obligation.source === "sow" && (
          <Badge className="max-w-full gap-1 border-transparent bg-blue-600 text-white hover:bg-blue-600">
            <Lock className="h-3 w-3 shrink-0" />
            <span className="truncate">SOW — DHHS91172</span>
          </Badge>
        )}
        <CatalogBadges ob={obligation} />
        <Badge variant="outline">{cadenceLabel(obligation)}</Badge>
        <Badge variant="outline">{evidenceLabel(obligation.evidence_type)}</Badge>
        <Badge variant="outline">
          {obligation.scope === "org" ? "Org-level" : obligation.scope === "staff_per_client" ? "Per staff+client" : "Per staff"}
        </Badge>
        <Badge variant="secondary">
          {obligation.requires_individual_completion ? "Everyone individually" : "Any one person"}
        </Badge>
        {!obligation.active && <Badge variant="outline" className="text-muted-foreground">Paused</Badge>}
      </div>

      <ObligationCatalogNote obligation={obligation} />

      {formArchived ? (
        <div className="mt-3 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-2.5 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Linked form has been archived. Edit this obligation to assign a different form.</span>
        </div>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-1.5 text-sm">
            <span className="text-muted-foreground">Assigned to:</span>
            {obligation.scope === "org" ? (
              <span className="text-sm text-muted-foreground">Whole organization</span>
            ) : obligation.scope === "staff_per_client" ? (
              <span className="text-sm text-muted-foreground">All active staff+client assignments</span>
            ) : (obligation.assigned_to_groups?.length || obligation.assigned_to_users?.length) ? (
              <>
                {(obligation.assigned_to_groups ?? []).map((gid) => {
                  const g = groupNamesById.get(gid);
                  return (
                    <Badge key={gid} variant="secondary">
                      {g ? `${g.name} (${g.member_count} members)` : "Unknown group"}
                    </Badge>
                  );
                })}
                {(obligation.assigned_to_users ?? []).map((uid) => (
                  <Badge key={uid} variant="secondary">{userNamesById.get(uid) ?? "Unknown"}</Badge>
                ))}
              </>
            ) : (
              <span className="text-sm text-muted-foreground italic">No group assigned</span>
            )}
          </div>

          <HireDateWarning orgId={orgId} obligation={obligation} />

          <div className="mt-3">
            {obligation.rollup ? (
              <RollupStatus rollup={obligation.rollup} reminderOnly={catalogFor(obligation)?.calendar_is_reminder_only} />
            ) : (
              <InstanceStatusLine instance={obligation.current_instance} />
            )}
          </div>

          {obligation.scope === "org" ? null : (
            <div className="mt-2">
              {obligation.scope === "staff_per_client" ? (
                <PerClientCompletion obligation={obligation} />
              ) : (
                <PerNameCompletion orgId={orgId} obligation={obligation} />
              )}
            </div>
          )}

          <ObligationCardActions
            orgId={orgId}
            obligation={obligation}
            onManualOpen={() => setManualOpen(true)}
            onLogEvent={() => setLogEventOpen(true)}
          />
        </>
      )}

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{obligation.title}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This deletes the obligation and its instance history. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => del.mutate()}
              disabled={del.isPending}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <LogEventDialog open={logEventOpen} onOpenChange={setLogEventOpen} orgId={orgId} obligation={obligation} />
      <ManualCompletionDrawer
        open={manualOpen}
        onOpenChange={setManualOpen}
        orgId={orgId}
        instanceId={obligation.current_instance?.id ?? null}
        obligationId={obligation.id}
        attestationText={obligation.attestation_text}
        evidenceType={obligation.evidence_type}
      />
      <ObligationHistorySheet
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        orgId={orgId}
        obligation={obligation}
      />
    </div>
  );
}
