import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useCurrentOrg } from "@/hooks/use-org";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { History, ArrowLeft } from "lucide-react";
import { listRoleChangeAuditLog } from "@/lib/team-access.functions";

export const Route = createFileRoute("/dashboard/settings/role-audit")({
  head: () => ({ meta: [{ title: "Role history — HIVE" }] }),
  component: RoleAuditPage,
});

const METHOD_LABEL: Record<string, string> = {
  setMemberGrants: "Manual change",
  invitation: "Invitation",
  createEmployee: "Staff creation",
  deactivation: "Deactivation",
  unauthorized_attempt: "Blocked attempt",
};

function RoleAuditPage() {
  const { data: org } = useCurrentOrg();
  const canView = org?.role === "admin";
  const [page, setPage] = useState(0);
  const listFn = useServerFn(listRoleChangeAuditLog);

  const { data, isLoading } = useQuery({
    enabled: !!org && canView,
    queryKey: ["role-change-audit-log", org?.organization_id, page],
    queryFn: () => listFn({ data: { organization_id: org!.organization_id, page } }),
  });

  if (!canView) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
        You do not have permission to view role history.
      </div>
    );
  }

  const rows = data?.rows ?? [];

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
        <Link
          to="/dashboard/settings/team-access"
          className="mb-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" /> Back to Team Access
        </Link>
        <div className="flex items-center gap-2">
          <History className="h-5 w-5 text-primary" />
          <h2 className="text-base font-semibold">Role history</h2>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Every role change in {org?.organization_name ?? "your organization"} — manual changes,
          invitations, staff creation, and deactivations. Read-only.
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-card shadow-[var(--shadow-card)]">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date &amp; time</TableHead>
              <TableHead>Changed by</TableHead>
              <TableHead>Target user</TableHead>
              <TableHead>Previous role</TableHead>
              <TableHead>New role</TableHead>
              <TableHead>Method</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Loading…</TableCell></TableRow>
            )}
            {!isLoading && rows.length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No role changes recorded yet.</TableCell></TableRow>
            )}
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                  {new Date(r.created_at).toLocaleString()}
                </TableCell>
                <TableCell>{r.changed_by_name}</TableCell>
                <TableCell>{r.target_user_name}</TableCell>
                <TableCell className="text-muted-foreground">{r.previous_role}</TableCell>
                <TableCell><Badge variant="secondary">{r.new_role}</Badge></TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {METHOD_LABEL[r.change_method] ?? r.change_method}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <div className="flex items-center justify-between border-t border-border p-3">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 0 || isLoading}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            Previous
          </Button>
          <span className="text-xs text-muted-foreground">Page {page + 1}</span>
          <Button
            variant="outline"
            size="sm"
            disabled={!data?.hasMore || isLoading}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
