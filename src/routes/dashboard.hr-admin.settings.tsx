import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useCurrentOrg } from "@/hooks/use-org";
import { Button } from "@/components/ui/button";
import { RequirePermission } from "@/components/rbac-guard";
import { StaffTypesProposal } from "@/components/hr/staff-types-proposal";

export const Route = createFileRoute("/dashboard/hr-admin/settings")({
  head: () => ({ meta: [{ title: "HR Settings — HIVE" }] }),
  component: () => (
    <RequirePermission perm="manage_users">
      <HrSettingsPage />
    </RequirePermission>
  ),
});

function HrSettingsPage() {
  const { data: org } = useCurrentOrg();
  const orgId = org?.organization_id;
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/dashboard/hr-admin">
            <ArrowLeft className="mr-1 h-4 w-4" /> HR Admin
          </Link>
        </Button>
        <div>
          <h1 className="text-xl font-semibold">HR Settings</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Configure staff types and per-requirement applicability. Changes here drive what
            renders as N/A in the matrix and staff HR tab.
          </p>
        </div>
      </div>
      {orgId && <StaffTypesProposal organizationId={orgId} />}
    </div>
  );
}
