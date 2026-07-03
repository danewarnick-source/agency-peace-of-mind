import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { HubShell } from "@/components/admin-hubs/hub-shell";
import { FormsIndex } from "./dashboard.forms.index";
import { InternalAuditPage } from "./dashboard.internal-audit";
import { AuditPage } from "./dashboard.audit";
import { AuditZone } from "@/components/audit-zone/audit-zone";
import { HrcPage } from "./dashboard.hrc";
import { AdminIncidentsSection } from "@/components/incidents/admin-incidents-section";
import { RecordsTab } from "@/components/records/records-tab";
import { NectarFocusBanner } from "@/components/nectar/nectar-focus-banner";

const search = z.object({
  tab: z.enum(["records", "incidents", "forms", "audit", "hrc"]).catch("records").optional(),
  client: z.string().optional(),
  focus: z.string().optional(),
});

export const Route = createFileRoute("/dashboard/hub/documentation")({
  head: () => ({ meta: [{ title: "Documentation — HIVE" }] }),
  validateSearch: (s) => search.parse(s),

  component: DocumentationHub,
});

function DocumentationHub() {
  const { client } = Route.useSearch();
  return (
    <>
      <NectarFocusBanner />
      <HubShell
        title="Documentation"
        basePath="/dashboard/hub/documentation"
      tabs={[
        { key: "records", label: "Records", render: () => <RecordsTab /> },
        {
          key: "incidents",
          label: "Incidents",
          render: () => (
            <AdminIncidentsSection
              initialClientId={client ?? null}
              initialView={client ? "log" : "queue"}
            />
          ),
        },
        { key: "forms", label: "Forms", render: () => <FormsIndex /> },
        {
          key: "audit",
          label: "Audit",
          feature: "state_audit",
          render: () => (
            <div className="space-y-6">
              <section>
                <header className="mb-3">
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-[#0B1126]">
                    Readiness check
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    NECTAR self-audit: DSPD-style sample, scope filters, readiness score, critical gaps.
                  </p>
                </header>
                <InternalAuditPage />
              </section>
              <details className="group rounded-lg border border-border bg-card">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-[#0B1126]">
                  <span>Evidence pull — packets &amp; auditor sharing</span>
                  <span className="text-xs font-normal text-muted-foreground group-open:hidden">Show</span>
                  <span className="hidden text-xs font-normal text-muted-foreground group-open:inline">Hide</span>
                </summary>
                <div className="space-y-8 border-t border-border px-4 py-4">
                  <AuditPage />
                  <AuditZone />
                </div>
              </details>
            </div>
          ),
        },
        { key: "hrc", label: "Human Rights Committee", render: () => <HrcPage /> },
      ]}
      />
    </>
  );
}
