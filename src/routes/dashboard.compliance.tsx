import { createFileRoute } from "@tanstack/react-router";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StaffFilePanel } from "@/components/compliance/staff-file-panel";
import { ClientFilePanel } from "@/components/compliance/client-file-panel";
import { AgencyFilePanel } from "@/components/compliance/agency-file-panel";
import { RequirePermission } from "@/components/rbac-guard";
import {
  complianceSearchForAgencySubTab,
  complianceSearchForFileTab,
  parseComplianceSearch,
  resolveAgencyFileSubTab,
  resolveComplianceFileTab,
  type ComplianceFileTab,
} from "@/lib/compliance-nav";

export const Route = createFileRoute("/dashboard/compliance")({
  head: () => ({ meta: [{ title: "Compliance — Provider Interface" }] }),
  validateSearch: parseComplianceSearch,
  component: CompliancePage,
});

function CompliancePage() {
  const navigate = Route.useNavigate();
  const { tab } = Route.useSearch();
  const fileTab = resolveComplianceFileTab(tab);
  const agencyTab = resolveAgencyFileSubTab(tab);

  const onFileTabChange = (value: string) => {
    const next: ComplianceFileTab =
      value === "client" || value === "agency" || value === "staff" ? value : "staff";
    void navigate({ search: complianceSearchForFileTab(next) });
  };

  return (
    <div className="space-y-4">
      <Tabs value={fileTab} onValueChange={onFileTabChange}>
        <TabsList className="h-auto">
          <TabsTrigger value="staff">Staff file</TabsTrigger>
          <TabsTrigger value="client">Client file</TabsTrigger>
          <TabsTrigger value="agency">Agency file</TabsTrigger>
        </TabsList>
        <TabsContent value="staff" className="mt-4">
          {fileTab === "staff" ? (
            <RequirePermission perm="view_staff_records">
              <StaffFilePanel />
            </RequirePermission>
          ) : null}
        </TabsContent>
        <TabsContent value="client" className="mt-4">
          {fileTab === "client" ? (
            <RequirePermission perm="view_clients">
              <ClientFilePanel />
            </RequirePermission>
          ) : null}
        </TabsContent>
        <TabsContent value="agency" className="mt-4">
          {fileTab === "agency" ? (
            <AgencyFilePanel
              agencyTab={agencyTab}
              onAgencyTabChange={(sub) => {
                void navigate({ search: complianceSearchForAgencySubTab(sub) });
              }}
            />
          ) : null}
        </TabsContent>
      </Tabs>
    </div>
  );
}
