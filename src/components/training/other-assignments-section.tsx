/**
 * "Other Trainings" admin section — used on staff HR tab + HR Admin rollup.
 *
 * - Admin/Manager: assign new items, confirm NECTAR proposals, mark complete, delete.
 * - Read-only summary list with safety-critical highlighting.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listStaffOtherAssignments,
  assignOtherItem,
  confirmProposedAssignment,
  rejectProposedAssignment,
  deleteOtherAssignment,
  adminCompleteAssignment,
  type OtherAssignment,
} from "@/lib/other-assignments.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Plus,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

export function OtherAssignmentsAdminSection({
  organizationId,
  staffId,
}: {
  organizationId: string;
  staffId: string;
}) {
  const qc = useQueryClient();
  const fetchList = useServerFn(listStaffOtherAssignments);
  const { data: rows, isLoading } = useQuery({
    queryKey: ["other-assignments", organizationId, staffId],
    queryFn: () =>
      fetchList({ data: { organization_id: organizationId, staff_id: staffId } }),
  });

  const [open, setOpen] = useState(false);

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["other-assignments", organizationId, staffId] });

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold tracking-tight">Other Trainings & Tasks</h3>
          <p className="text-xs text-muted-foreground">
            Per-staff assignments beyond the core checklist. Safety-critical items are flagged.
          </p>
        </div>
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="mr-1 h-3.5 w-3.5" /> Assign
        </Button>
      </div>

      <div className="mt-3 space-y-2">
        {isLoading && (
          <p className="text-xs text-muted-foreground">Loading…</p>
        )}
        {!isLoading && !rows?.length && (
          <p className="text-xs text-muted-foreground">No additional assignments.</p>
        )}
        {rows?.map((r) => (
          <AssignmentRow
            key={r.id}
            row={r}
            organizationId={organizationId}
            onChanged={invalidate}
          />
        ))}
      </div>

      <AssignDialog
        open={open}
        onOpenChange={setOpen}
        organizationId={organizationId}
        staffId={staffId}
        onAssigned={invalidate}
      />
    </div>
  );
}

function AssignmentRow({
  row,
  organizationId,
  onChanged,
}: {
  row: OtherAssignment;
  organizationId: string;
  onChanged: () => void;
}) {
  const confirmFn = useServerFn(confirmProposedAssignment);
  const rejectFn = useServerFn(rejectProposedAssignment);
  const deleteFn = useServerFn(deleteOtherAssignment);
  const completeFn = useServerFn(adminCompleteAssignment);

  const isOpen = row.status !== "completed";
  const overdue =
    isOpen && row.due_date && new Date(row.due_date) < new Date();

  return (
    <div
      className={`rounded-lg border px-3 py-2 ${
        row.is_safety_critical && isOpen
          ? "border-destructive/50 bg-destructive/5"
          : "border-border bg-background"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-medium">{row.title}</span>
            <Badge variant="outline" className="h-5 px-1.5 text-[10px] uppercase">
              {row.assignment_type}
            </Badge>
            {row.is_safety_critical && (
              <Badge
                variant="destructive"
                className="h-5 gap-1 px-1.5 text-[10px] uppercase"
              >
                <AlertTriangle className="h-2.5 w-2.5" /> Safety-critical
              </Badge>
            )}
            {!row.confirmed && (
              <Badge className="h-5 gap-1 bg-amber-500/15 px-1.5 text-[10px] uppercase text-amber-700 hover:bg-amber-500/20">
                <Sparkles className="h-2.5 w-2.5" /> NECTAR proposal
              </Badge>
            )}
            <StatusBadge status={row.status} />
          </div>
          {row.description && (
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{row.description}</p>
          )}
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
            {row.due_date && (
              <span className={overdue ? "font-semibold text-destructive" : ""}>
                Due {new Date(row.due_date).toLocaleDateString()}
                {overdue ? " · overdue" : ""}
              </span>
            )}
            {row.completed_at && (
              <span>
                Completed {new Date(row.completed_at).toLocaleDateString()}
                {row.completion_source ? ` (${row.completion_source})` : ""}
              </span>
            )}
            {row.proposal_rationale && (
              <span className="italic">"{row.proposal_rationale}"</span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {!row.confirmed && (
            <div className="flex gap-1">
              <Button
                size="sm"
                variant="default"
                className="h-7 px-2"
                onClick={async () => {
                  await confirmFn({
                    data: { organization_id: organizationId, assignment_id: row.id },
                  });
                  toast.success("Assignment confirmed");
                  onChanged();
                }}
              >
                Confirm
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2"
                onClick={async () => {
                  await rejectFn({
                    data: { organization_id: organizationId, assignment_id: row.id },
                  });
                  toast.success("Proposal rejected");
                  onChanged();
                }}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
          {row.confirmed && isOpen && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2"
              onClick={async () => {
                await completeFn({
                  data: { organization_id: organizationId, assignment_id: row.id },
                });
                toast.success("Marked complete");
                onChanged();
              }}
            >
              <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Mark complete
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-muted-foreground hover:text-destructive"
            onClick={async () => {
              if (!confirm("Delete this assignment?")) return;
              await deleteFn({
                data: { organization_id: organizationId, assignment_id: row.id },
              });
              toast.success("Deleted");
              onChanged();
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: OtherAssignment["status"] }) {
  if (status === "completed")
    return (
      <Badge className="h-5 gap-1 bg-emerald-500/15 px-1.5 text-[10px] uppercase text-emerald-700 hover:bg-emerald-500/20">
        <CheckCircle2 className="h-2.5 w-2.5" /> Complete
      </Badge>
    );
  if (status === "in_progress")
    return (
      <Badge className="h-5 gap-1 bg-sky-500/15 px-1.5 text-[10px] uppercase text-sky-700 hover:bg-sky-500/20">
        <Clock className="h-2.5 w-2.5" /> In progress
      </Badge>
    );
  return (
    <Badge variant="outline" className="h-5 px-1.5 text-[10px] uppercase">
      Not started
    </Badge>
  );
}

function AssignDialog({
  open,
  onOpenChange,
  organizationId,
  staffId,
  onAssigned,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  organizationId: string;
  staffId: string;
  onAssigned: () => void;
}) {
  const assignFn = useServerFn(assignOtherItem);
  const [form, setForm] = useState({
    assignment_type: "training" as "training" | "task" | "requirement",
    title: "",
    description: "",
    due_date: "",
    is_safety_critical: false,
    requires_admin_confirmation: false,
  });

  const mutation = useMutation({
    mutationFn: async () => {
      if (!form.title.trim()) throw new Error("Title required");
      return assignFn({
        data: {
          organization_id: organizationId,
          staff_id: staffId,
          assignment_type: form.assignment_type,
          title: form.title.trim(),
          description: form.description.trim() || null,
          due_date: form.due_date || null,
          is_safety_critical: form.is_safety_critical,
          requires_admin_confirmation: form.requires_admin_confirmation,
        },
      });
    },
    onSuccess: () => {
      toast.success("Assigned");
      onOpenChange(false);
      onAssigned();
      setForm({
        assignment_type: "training",
        title: "",
        description: "",
        due_date: "",
        is_safety_critical: false,
        requires_admin_confirmation: false,
      });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign training, task, or requirement</DialogTitle>
          <DialogDescription>
            This is added to the staffer's "Other Trainings" list.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Type</Label>
            <Select
              value={form.assignment_type}
              onValueChange={(v) =>
                setForm((f) => ({
                  ...f,
                  assignment_type: v as typeof f.assignment_type,
                }))
              }
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="training">Training</SelectItem>
                <SelectItem value="task">Task</SelectItem>
                <SelectItem value="requirement">Requirement</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Title</Label>
            <Input
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="e.g. CPR / First Aid recert"
            />
          </div>
          <div>
            <Label>Description (optional)</Label>
            <Textarea
              rows={3}
              value={form.description}
              onChange={(e) =>
                setForm((f) => ({ ...f, description: e.target.value }))
              }
            />
          </div>
          <div>
            <Label>Due date (optional)</Label>
            <Input
              type="date"
              value={form.due_date}
              onChange={(e) =>
                setForm((f) => ({ ...f, due_date: e.target.value }))
              }
            />
          </div>
          <label className="flex items-start gap-2 text-sm">
            <Checkbox
              checked={form.is_safety_critical}
              onCheckedChange={(c) =>
                setForm((f) => ({ ...f, is_safety_critical: !!c }))
              }
            />
            <span>
              <span className="font-medium">Safety-critical</span> — required before
              working alone with a client. Will appear with prominent reminders.
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm">
            <Checkbox
              checked={form.requires_admin_confirmation}
              onCheckedChange={(c) =>
                setForm((f) => ({ ...f, requires_admin_confirmation: !!c }))
              }
            />
            <span>
              Requires admin confirmation to mark complete (for tasks needing verification).
            </span>
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? "Assigning…" : "Assign"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
