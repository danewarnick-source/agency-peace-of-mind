import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { HubShell, type HubTab } from "@/components/admin-hubs/hub-shell";
import { RequirePermission } from "@/components/rbac-guard";
import { RequireRole } from "@/components/rbac-guard";
import { usePermissions } from "@/hooks/use-permissions";
import { ClientsPage } from "./dashboard.clients";
import { TeamsPage } from "./dashboard.teams";
import { PbaLedgerPage } from "./dashboard.pba-ledger";
import { ClientLoansPage } from "./dashboard.client-loans";
import { ReferralsPage } from "@/components/referrals/referrals-page";
import { ClientWhiteboardTab } from "@/components/clients/whiteboard-tab";

const search = z.object({
  tab: z.enum(["directory", "whiteboard", "referrals", "teams", "funds"]).optional(),
});


function ClientsHub() {
  const { can } = usePermissions();
  const tabs: HubTab[] = [
    { key: "directory", label: "Directory", render: () => <ClientsPage /> },
  ];
  if (can("view_referrals") || can("manage_referrals")) {
    tabs.push({
      key: "whiteboard",
      label: "Whiteboard",
      render: () => (
        <RequirePermission perm="view_referrals">
          <ClientWhiteboardTab />
        </RequirePermission>
      ),
    });
    tabs.push({
      key: "referrals",
      label: "Referrals",
      render: () => (
        <RequirePermission perm="view_referrals">
          <ReferralsPage />
        </RequirePermission>
      ),
    });
  }
  tabs.push(

    {
      key: "teams",
      label: "Teams & homes",
      render: () => (
        <RequirePermission perm="manage_users">
          <TeamsPage />
        </RequirePermission>
      ),
    },
    {
      key: "funds",
      label: "Funds",
      render: () => (
        <div className="space-y-10">
          <section>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              PBA Trust Ledger
            </h3>
            <RequirePermission perm="manage_users">
              <PbaLedgerPage />
            </RequirePermission>
          </section>
          <section>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Client Loan Ledger
            </h3>
            <RequireRole roles={["admin", "super_admin"]}>
              <ClientLoansPage />
            </RequireRole>
          </section>
        </div>
      ),
    },
  );
  return <HubShell title="Clients" basePath="/dashboard/hub/clients" tabs={tabs} />;
}

export const Route = createFileRoute("/dashboard/hub/clients")({
  head: () => ({ meta: [{ title: "Clients — HIVE" }] }),
  validateSearch: (s) => search.parse(s),
  component: ClientsHub,
});
