import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { HubShell } from "@/components/admin-hubs/hub-shell";
import { ComplianceDeskWrapped } from "./dashboard.compliance-desk";
import { HostHomeControl } from "./dashboard.host-home-control";
import { FormsIndex } from "./dashboard.forms.index";
import { InternalAuditPage } from "./dashboard.internal-audit";
import { AuditPage } from "./dashboard.audit";
import { AuditZone } from "@/components/audit-zone/audit-zone";
import { HrcPage } from "./dashboard.hrc";

const search = z.object({
  tab: z.enum(["evv", "host-home", "forms", "audit-readiness", "evidence", "hrc"]).optional(),
});

export const Route = createFileRoute("/dashboard/hub/documentation")({
  head: () => ({ meta: [{ title: "Documentation — HIVE" }] }),
  validateSearch: (s) => search.parse(s),
  component: () => (
    <HubShell
      title="Documentation"
      basePath="/dashboard/hub/documentation"
      tabs={[
        { key: "evv", label: "EVV & timesheets", render: () => <ComplianceDeskWrapped /> },
        { key: "host-home", label: "Host home", render: () => <HostHomeControl /> },
        { key: "forms", label: "Forms", render: () => <FormsIndex /> },
        { key: "audit-readiness", label: "Audit readiness", render: () => <InternalAuditPage /> },
        {
          key: "evidence",
          label: "Evidence / audit zone",
          render: () => (
            <div className="space-y-10">
              <section>
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Audit packets</h3>
                <AuditPage />
              </section>
              <section>
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Audit Zone</h3>
                <AuditZone />
              </section>
            </div>
          ),
        },
        { key: "hrc", label: "Human Rights Committee", render: () => <HrcPage /> },
      ]}
    />
  ),
});
