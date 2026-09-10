import { createFileRoute, Link } from "@tanstack/react-router";
import { Settings as SettingsIcon } from "lucide-react";
import { useCurrentOrg } from "@/hooks/use-org";
import { Button } from "@/components/ui/button";
import { RequirePermission } from "@/components/rbac-guard";
import { OtherAssignmentsRollup } from "@/components/training/other-assignments-rollup";
import { EmployeeLoansPanel } from "@/components/employee-loans/EmployeeLoansPanel";

export const Route = createFileRoute("/dashboard/hr-admin")({
  head: () => ({ meta: [{ title: "HR Admin — Provider Interface" }] }),
  component: () => (
    <RequirePermission perm="view_staff_records">
      <HrAdminPage />
    </RequirePermission>
  ),
});

export function HrAdminPage() {
  const { data: org } = useCurrentOrg();
  const orgId = org?.organization_id;
  if (!orgId) return null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">HR Admin</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Other trainings and HR settings. File status for every staffer lives on{" "}
            <Link to="/dashboard/personnel-file" className="font-medium text-[var(--hive-ink)] underline">
              Personnel file
            </Link>
            .
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link to="/dashboard/personnel-file">Open Personnel file</Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link to="/dashboard/hr-admin/settings">
              <SettingsIcon className="mr-1 h-3.5 w-3.5" /> HR Settings
            </Link>
          </Button>
        </div>
      </div>

      <OtherAssignmentsRollup organizationId={orgId} />
    </div>
  );
}

export function EmployeeLoansPage() {
  const { data: org } = useCurrentOrg();
  const orgId = org?.organization_id;
  if (!orgId) return null;
  return <EmployeeLoansPanel organizationId={orgId} lenderName={org?.organization_name ?? "Employer"} />;
}
