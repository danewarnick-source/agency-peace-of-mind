import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import { BookOpenCheck } from "lucide-react";
import { useCurrentOrg } from "@/hooks/use-org";
import { RequireRole } from "@/components/rbac-guard";
import { OnboardingReturnBar } from "@/components/onboarding/onboarding-return-bar";
import { OnboardingGuidanceBanner } from "@/components/onboarding/onboarding-guidance-banner";
import { ServiceCodeRegistryView } from "@/components/settings/service-code-registry-view";
import { ServiceCatalogView } from "@/components/settings/service-catalog-view";

const search = z.object({
  view: z.enum(["reference", "config"]).catch("reference").optional(),
});

export const Route = createFileRoute("/dashboard/settings/service-codes")({
  head: () => ({ meta: [{ title: "Service Codes — Settings" }] }),
  validateSearch: (s) => search.parse(s),
  component: () => (
    <RequireRole roles={["admin", "manager", "super_admin"]}>
      <ServiceCodesPage />
    </RequireRole>
  ),
});

function ServiceCodesPage() {
  const { view } = Route.useSearch();
  const { data: org } = useCurrentOrg();
  const activeView = view ?? "reference";
  const canConfig = org?.role === "admin" || org?.role === "super_admin";

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <OnboardingReturnBar />
      <OnboardingGuidanceBanner step={5} />

      <header>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <BookOpenCheck className="h-6 w-6 text-primary" /> Service codes
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          One place for every service code. <strong>Reference</strong> shows the
          read-only regulatory data (EVV, rates, cadence, caps).{" "}
          <strong>Configuration</strong> is the editable scheduling/billing catalog the
          scheduler and billing engine read from.
        </p>
      </header>

      <div className="border-b border-border">
        <nav className="-mb-px flex flex-wrap gap-1" aria-label="Service code views">
          <TabLink label="Reference" viewKey="reference" active={activeView === "reference"} />
          {canConfig ? (
            <TabLink label="Configuration" viewKey="config" active={activeView === "config"} />
          ) : (
            <span
              className="cursor-not-allowed border-b-2 border-transparent px-4 py-2 text-sm font-medium text-muted-foreground/60"
              title="Admin-only"
            >
              Configuration (admin-only)
            </span>
          )}
        </nav>
      </div>

      {activeView === "config" ? (
        canConfig ? (
          <ServiceCatalogView />
        ) : (
          <p className="rounded-xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
            The editable configuration is admin-only. Ask an admin to make changes here.
          </p>
        )
      ) : (
        <ServiceCodeRegistryView />
      )}
    </div>
  );
}

function TabLink({
  label,
  viewKey,
  active,
}: {
  label: string;
  viewKey: "reference" | "config";
  active: boolean;
}) {
  return (
    <Link
      to="/dashboard/settings/service-codes"
      search={{ view: viewKey }}
      replace
      className={`whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
        active
          ? "border-[#137182] text-[#137182]"
          : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
      }`}
    >
      {label}
    </Link>
  );
}
