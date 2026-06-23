import { createFileRoute } from "@tanstack/react-router";
import { RequirePermission } from "@/components/rbac-guard";
import { ClientsPage } from "./dashboard.clients";

export const Route = createFileRoute("/dashboard/clients/")({
  head: () => ({ meta: [{ title: "Client Directory — HIVE" }] }),
  component: () => (
    <RequirePermission perm="manage_users">
      <ClientsPage />
    </RequirePermission>
  ),
});
