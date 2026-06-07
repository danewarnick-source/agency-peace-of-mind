import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { HubShell } from "@/components/admin-hubs/hub-shell";
import { RequirePermission } from "@/components/rbac-guard";
import { EmployeesPage } from "./dashboard.employees.index";
import { HrAdminPage } from "./dashboard.hr-admin";

const search = z.object({ tab: z.enum(["roster", "compliance"]).optional() });

export const Route = createFileRoute("/dashboard/hub/employees")({
  head: () => ({ meta: [{ title: "Employees — HIVE" }] }),
  validateSearch: (s) => search.parse(s),
  component: () => (
    <HubShell
      title="Employees"
      basePath="/dashboard/hub/employees"
      tabs={[
        { key: "roster", label: "Roster", render: () => <EmployeesPage /> },
        {
          key: "compliance",
          label: "Compliance",
          render: () => (
            <RequirePermission perm="manage_users">
              <HrAdminPage />
            </RequirePermission>
          ),
        },
      ]}
    />
  ),
});
