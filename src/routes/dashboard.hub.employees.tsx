import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { HubShell, type HubTab } from "@/components/admin-hubs/hub-shell";
import { RequirePermission } from "@/components/rbac-guard";
import { usePermissions } from "@/hooks/use-permissions";
import { EmployeesPage } from "./dashboard.employees.index";
import { HrAdminPage } from "./dashboard.hr-admin";
import { HostsPage } from "@/components/hosts/hosts-page";

const search = z.object({
  tab: z.enum(["roster", "hosts", "hr-admin"]).optional(),
});

function EmployeesHub() {
  const { can } = usePermissions();
  const tabs: HubTab[] = [
    { key: "roster", label: "Roster", render: () => <EmployeesPage /> },
  ];
  if (can("view_referrals") || can("manage_referrals") || can("manage_clients")) {
    tabs.push({
      key: "hosts",
      label: "Hosts",
      render: () => <HostsPage />,
    });
  }
  tabs.push({
    key: "hr-admin",
    label: "HR Admin",
    render: () => (
      <RequirePermission perm="manage_users">
        <HrAdminPage />
      </RequirePermission>
    ),
  });
  return <HubShell title="Employees" basePath="/dashboard/hub/employees" tabs={tabs} />;
}

export const Route = createFileRoute("/dashboard/hub/employees")({
  head: () => ({ meta: [{ title: "Employees — HIVE" }] }),
  validateSearch: (s) => search.parse(s),
  component: EmployeesHub,
});
