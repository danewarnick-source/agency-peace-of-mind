/**
 * HR Admin rollup: all "Other Trainings" assignments across the org.
 * Safety-critical + overdue items sort to the top.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import {
  listOrgOtherAssignments,
  type OtherAssignment,
} from "@/lib/other-assignments.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle2, Clock, Sparkles } from "lucide-react";

export function OtherAssignmentsRollup({ organizationId }: { organizationId: string }) {
  const fetchList = useServerFn(listOrgOtherAssignments);
  const { data, isLoading } = useQuery({
    queryKey: ["org-other-assignments", organizationId],
    queryFn: () => fetchList({ data: { organization_id: organizationId } }),
  });

  const rows = data ?? [];
  const stats = useMemo(() => {
    const open = rows.filter((r) => r.confirmed && r.status !== "completed");
    const safetyCritical = open.filter((r) => r.is_safety_critical);
    const proposals = rows.filter((r) => !r.confirmed);
    return {
      total: rows.length,
      open: open.length,
      safetyCritical: safetyCritical.length,
      proposals: proposals.length,
      completed: rows.filter((r) => r.status === "completed").length,
    };
  }, [rows]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between gap-3 text-base">
          <span>Other Trainings & Tasks (rollup)</span>
          <span className="flex gap-1.5 text-[11px] font-medium">
            {stats.safetyCritical > 0 && (
              <Badge variant="destructive" className="gap-1">
                <AlertTriangle className="h-3 w-3" /> {stats.safetyCritical} safety-critical
              </Badge>
            )}
            {stats.proposals > 0 && (
              <Badge className="gap-1 bg-amber-500/15 text-amber-700 hover:bg-amber-500/20">
                <Sparkles className="h-3 w-3" /> {stats.proposals} NECTAR proposals
              </Badge>
            )}
            <Badge variant="outline">{stats.open} open</Badge>
            <Badge variant="outline">{stats.completed} done</Badge>
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading && <p className="text-xs text-muted-foreground">Loading…</p>}
        {!isLoading && !rows.length && (
          <p className="text-xs text-muted-foreground">No assignments yet.</p>
        )}
        {!!rows.length && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-2">Staff</th>
                  <th className="py-2 pr-2">Item</th>
                  <th className="py-2 pr-2">Type</th>
                  <th className="py-2 pr-2">Due</th>
                  <th className="py-2 pr-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <RollupRow key={r.id} row={r} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RollupRow({ row }: { row: OtherAssignment }) {
  const overdue =
    row.status !== "completed" && row.due_date && new Date(row.due_date) < new Date();
  return (
    <tr className="border-b last:border-0">
      <td className="py-2 pr-2">
        <Link
          to="/dashboard/employees/$staffId"
          params={{ staffId: row.staff_id }}
          className="font-medium hover:underline"
        >
          {row.staff_name ?? "—"}
        </Link>
      </td>
      <td className="py-2 pr-2">
        <div className="flex flex-wrap items-center gap-1">
          <span>{row.title}</span>
          {row.is_safety_critical && (
            <Badge variant="destructive" className="h-4 px-1 text-[9px] uppercase">
              Safety
            </Badge>
          )}
          {!row.confirmed && (
            <Badge className="h-4 bg-amber-500/15 px-1 text-[9px] uppercase text-amber-700 hover:bg-amber-500/20">
              Proposal
            </Badge>
          )}
        </div>
      </td>
      <td className="py-2 pr-2 text-xs text-muted-foreground">{row.assignment_type}</td>
      <td className="py-2 pr-2 text-xs">
        {row.due_date ? (
          <span className={overdue ? "font-semibold text-destructive" : ""}>
            {new Date(row.due_date).toLocaleDateString()}
            {overdue ? " · overdue" : ""}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
      <td className="py-2 pr-2">
        {row.status === "completed" ? (
          <Badge className="gap-1 bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/20">
            <CheckCircle2 className="h-3 w-3" /> Complete
          </Badge>
        ) : row.status === "in_progress" ? (
          <Badge className="gap-1 bg-sky-500/15 text-sky-700 hover:bg-sky-500/20">
            <Clock className="h-3 w-3" /> In progress
          </Badge>
        ) : (
          <Badge variant="outline">Not started</Badge>
        )}
      </td>
    </tr>
  );
}
