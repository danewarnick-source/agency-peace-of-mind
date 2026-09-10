import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCurrentOrg } from "@/hooks/use-org";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AgencyDocumentsCards } from "@/components/agency-documents/agency-documents-cards";
import { CompanyPoliciesTab } from "@/components/agency-documents/company-policies-tab";
import { ROLE_RANK } from "@/lib/rbac";

type AgencyDocumentsSearch = {
  tab?: "documents" | "company-policies";
};

function parseAgencyDocumentsSearch(s: Record<string, unknown>): AgencyDocumentsSearch {
  const tabRaw = typeof s.tab === "string" ? s.tab.trim() : "";
  if (tabRaw === "company-policies" || tabRaw === "policies" || tabRaw === "policy-library") {
    return { tab: "company-policies" };
  }
  return {};
}

export const Route = createFileRoute("/dashboard/agency-documents")({
  head: () => ({ meta: [{ title: "Agency documents — Provider Interface" }] }),
  validateSearch: parseAgencyDocumentsSearch,
  component: AgencyDocumentsPage,
});

function AgencyDocumentsPage() {
  const navigate = useNavigate({ from: "/dashboard/agency-documents" });
  const { data: org, isLoading } = useCurrentOrg();
  const { tab } = Route.useSearch();

  if (isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  }
  if (!org) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
        Select an organization to open agency documents.
      </div>
    );
  }

  const canAccess = ROLE_RANK[org.role] >= ROLE_RANK.manager;
  if (!canAccess) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
        You do not have permission to view agency documents.
      </div>
    );
  }

  const value = tab === "company-policies" ? "company-policies" : "documents";

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-[var(--hive-gold)]/30 bg-gradient-to-br from-[#fff7ed] via-white to-white p-5 shadow-[var(--shadow-card)]">
        <h1 className="font-display text-xl font-bold tracking-tight text-[var(--hive-text)]">
          Agency documents
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Org-wide standing flags and encoded DSPD / Practice Audit policies. One card per
          duty; renew files the same card. Company policies are a separate internal binder.
          Practice audit reuses Internal Audit — this is not a fourth audit product.
        </p>
      </div>
      <Tabs
        value={value}
        onValueChange={(v) => {
          void navigate({
            search: {
              tab: v === "company-policies" ? "company-policies" : undefined,
            },
          });
        }}
      >
        <TabsList className="h-auto">
          <TabsTrigger value="documents">Agency documents</TabsTrigger>
          <TabsTrigger value="company-policies">Company policies</TabsTrigger>
        </TabsList>
        <TabsContent value="documents" className="mt-4">
          <AgencyDocumentsCards organizationId={org.organization_id} />
        </TabsContent>
        <TabsContent value="company-policies" className="mt-4">
          <CompanyPoliciesTab orgId={org.organization_id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
