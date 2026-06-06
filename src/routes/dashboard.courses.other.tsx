/**
 * Staff "Other Trainings" page — lists ad-hoc admin/NECTAR assignments.
 * Staff can mark items in_progress / complete (unless requires_admin_confirmation).
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listMyOtherAssignments,
  updateMyAssignmentStatus,
  type OtherAssignment,
} from "@/lib/other-assignments.functions";
import { StaffPageHeader } from "@/components/staff-mobile/staff-page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  Clock,
  ShieldAlert,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/courses/other")({
  component: OtherTrainingsPage,
});

function OtherTrainingsPage() {
  const fetchList = useServerFn(listMyOtherAssignments);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["my-other-assignments"],
    queryFn: () => fetchList(),
  });

  const updateFn = useServerFn(updateMyAssignmentStatus);
  const mutation = useMutation({
    mutationFn: (args: { id: string; status: OtherAssignment["status"] }) =>
      updateFn({ data: { assignment_id: args.id, status: args.status } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-other-assignments"] });
      qc.invalidateQueries({ queryKey: ["my-other-assignments-summary"] });
      toast.success("Updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = data ?? [];
  const open = rows.filter((r) => r.status !== "completed");
  const done = rows.filter((r) => r.status === "completed");

  return (
    <div className="space-y-4 pb-2">
      <StaffPageHeader
        eyebrow="Assigned to Me"
        eyebrowIcon={BookOpen}
        title="Other Trainings"
        subtitle="Additional trainings, tasks, and requirements assigned to you."
      />
      <Link
        to="/dashboard/courses"
        className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> My Trainings
      </Link>

      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}

      {!isLoading && !rows.length && (
        <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
          You have no additional assignments. 🎉
        </div>
      )}

      {open.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Outstanding ({open.length})
          </h2>
          <ul className="space-y-2">
            {open.map((r) => (
              <Item key={r.id} row={r} onUpdate={(s) => mutation.mutate({ id: r.id, status: s })} />
            ))}
          </ul>
        </section>
      )}

      {done.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Completed ({done.length})
          </h2>
          <ul className="space-y-2">
            {done.map((r) => (
              <Item key={r.id} row={r} onUpdate={() => {}} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Item({
  row,
  onUpdate,
}: {
  row: OtherAssignment;
  onUpdate: (s: OtherAssignment["status"]) => void;
}) {
  const isOpen = row.status !== "completed";
  const overdue =
    isOpen && row.due_date && new Date(row.due_date) < new Date();

  return (
    <li
      className={`rounded-xl border p-3 ${
        row.is_safety_critical && isOpen
          ? "border-destructive/50 bg-destructive/5"
          : "border-border bg-card"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-semibold">{row.title}</span>
            <Badge variant="outline" className="h-5 px-1.5 text-[10px] uppercase">
              {row.assignment_type}
            </Badge>
            {row.is_safety_critical && (
              <Badge
                variant="destructive"
                className="h-5 gap-1 px-1.5 text-[10px] uppercase"
              >
                <ShieldAlert className="h-2.5 w-2.5" /> Safety-critical
              </Badge>
            )}
            {row.status === "in_progress" && (
              <Badge className="h-5 gap-1 bg-sky-500/15 px-1.5 text-[10px] uppercase text-sky-700 hover:bg-sky-500/20">
                <Clock className="h-2.5 w-2.5" /> In progress
              </Badge>
            )}
            {row.status === "completed" && (
              <Badge className="h-5 gap-1 bg-emerald-500/15 px-1.5 text-[10px] uppercase text-emerald-700 hover:bg-emerald-500/20">
                <CheckCircle2 className="h-2.5 w-2.5" /> Complete
              </Badge>
            )}
          </div>
          {row.is_safety_critical && isOpen && (
            <p className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-destructive">
              <AlertTriangle className="h-3 w-3" />
              Required before working alone with a client.
            </p>
          )}
          {row.description && (
            <p className="mt-1 text-xs text-muted-foreground">{row.description}</p>
          )}
          <div className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-muted-foreground">
            {row.due_date && (
              <span className={overdue ? "font-semibold text-destructive" : ""}>
                Due {new Date(row.due_date).toLocaleDateString()}
                {overdue ? " · overdue" : ""}
              </span>
            )}
            {row.completed_at && (
              <span>
                Completed {new Date(row.completed_at).toLocaleDateString()}
              </span>
            )}
          </div>
        </div>
        {isOpen && (
          <div className="flex shrink-0 flex-col gap-1">
            {row.status === "not_started" && (
              <Button size="sm" variant="outline" onClick={() => onUpdate("in_progress")}>
                Start
              </Button>
            )}
            {!row.requires_admin_confirmation && (
              <Button size="sm" onClick={() => onUpdate("completed")}>
                Mark complete
              </Button>
            )}
            {row.requires_admin_confirmation && (
              <span className="text-[10px] text-muted-foreground">
                Admin confirms completion
              </span>
            )}
          </div>
        )}
      </div>
    </li>
  );
}
