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
import { AlertTriangle, CheckCircle2, Circle, MoreHorizontal } from "lucide-react";
import {
  deleteCompanyObligation,
  logObligationEvent,
  toggleObligationActive,
  type CompanyObligationRow,
  type ObligationInstanceRow,
} from "@/lib/company-obligations.functions";
import { ObligationHistorySheet } from "./obligation-history-sheet";
import { ManualCompletionDrawer } from "./manual-completion-drawer";

export type ObligationWithInstance = CompanyObligationRow & { current_instance: ObligationInstanceRow | null };

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
      const m = Number(cfg.month);
      const d = cfg.day_of_month;
      return `Annually · ${MONTHS[m - 1] ?? "?"} ${d === "last" ? "Last" : ordinal(Number(d))}`;
    }
    case "per_event":
      return "Per event";
    case "one_time": {
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
type CompletionRow = { staff_id: string; staff_name: string; completed_at: string | null };

function PerNameCompletion({
  orgId,
  obligation,
}: {
  orgId: string;
  obligation: ObligationWithInstance;
}) {
  const instanceId = obligation.current_instance?.id;
  const { data } = useQuery({
    queryKey: ["obligation-instance-detail", instanceId],
    enabled: !!instanceId,
    queryFn: async () => {
      const [{ data: assignees, error: aErr }, { data: completions, error: cErr }] = await Promise.all([
        supabase
          .from("company_obligation_instance_assignees")
          .select("staff_id, staff_name")
          .eq("instance_id", instanceId as string),
        supabase
          .from("company_obligation_completions")
          .select("staff_id, staff_name, completed_at")
          .eq("instance_id", instanceId as string),
      ]);
      if (aErr) throw new Error(aErr.message);
      if (cErr) throw new Error(cErr.message);
      return {
        assignees: (assignees ?? []) as AssigneeRow[],
        completions: (completions ?? []) as CompletionRow[],
      };
    },
  });

  if (!obligation.current_instance) {
    return <p className="text-xs text-muted-foreground">No active instance.</p>;
  }
  if (!data) return null;

  const { assignees, completions } = data;
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

  return (
    <div className="grid gap-1.5 text-xs sm:grid-cols-2">
      <div>
        <p className="font-medium text-muted-foreground">Completed:</p>
        {completions.length === 0 ? (
          <p className="text-muted-foreground">None yet</p>
        ) : (
          <ul className="space-y-0.5">
            {completions.map((c) => (
              <li key={c.staff_id} className="flex items-center gap-1 text-success">
                <CheckCircle2 className="h-3 w-3 shrink-0" />
                <span className="truncate">{c.staff_name} — {formatDate(c.completed_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <p className="font-medium text-muted-foreground">Not yet submitted:</p>
        {notSubmitted.length === 0 ? (
          <p className="text-muted-foreground">None</p>
        ) : (
          <ul className="space-y-0.5">
            {notSubmitted.map((a) => (
              <li key={a.staff_id} className="flex items-center gap-1 text-muted-foreground">
                <Circle className="h-3 w-3 shrink-0" />
                <span className="truncate">{a.staff_name}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
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
    <div className="rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="font-semibold">{obligation.title}</h4>
          {obligation.source_policy_section && (
            <p className="text-sm text-muted-foreground">{obligation.source_policy_section}</p>
          )}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
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
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        <Badge variant="outline">{cadenceLabel(obligation)}</Badge>
        <Badge variant="outline">{evidenceLabel(obligation.evidence_type)}</Badge>
        <Badge variant="secondary">
          {obligation.requires_individual_completion ? "Everyone individually" : "Any one person"}
        </Badge>
        {!obligation.active && <Badge variant="outline" className="text-muted-foreground">Paused</Badge>}
      </div>

      {formArchived ? (
        <div className="mt-3 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-2.5 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Linked form has been archived. Edit this obligation to assign a different form.</span>
        </div>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-1.5 text-sm">
            <span className="text-muted-foreground">Assigned to:</span>
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
            {(obligation.assigned_to_groups ?? []).length === 0 && (obligation.assigned_to_users ?? []).length === 0 && (
              <span className="text-muted-foreground">Nobody assigned</span>
            )}
          </div>

          <div className="mt-3">
            <InstanceStatusLine instance={obligation.current_instance} />
          </div>

          <div className="mt-2">
            <PerNameCompletion orgId={orgId} obligation={obligation} />
          </div>
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
        attestationText={obligation.attestation_text}
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
