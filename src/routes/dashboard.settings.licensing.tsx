import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, BadgeCheck } from "lucide-react";
import { useOrgActiveServiceCodes } from "@/hooks/use-org-service-codes";
import { OrgComplianceDocumentsSection } from "@/components/settings/org-compliance-documents-section";

export const Route = createFileRoute("/dashboard/settings/licensing")({
  head: () => ({ meta: [{ title: "Provider Licenses & Certifications — HIVE" }] }),
  component: LicensingSettingsPage,
});

function LicensingSettingsPage() {
  const { codes, isLoading } = useOrgActiveServiceCodes();
  const hasAnyLicense = codes.has("RHS") || codes.has("DSG") || codes.has("DSP")
    || codes.has("EPR") || codes.has("SEI") || codes.has("SJD");

  return (
    <div className="max-w-4xl space-y-6">
      <Link to="/dashboard/settings" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="mr-1 h-4 w-4" /> Settings
      </Link>

      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          <BadgeCheck className="h-5 w-5" /> Provider Licenses & Certifications
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Office of Licensing credentials required by your active service codes. This is the
          single home for organization-level licenses — not staff credentials, not client
          documents. Scoped to your provider, not to any individual person.
        </p>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : !hasAnyLicense ? (
        <p className="text-sm text-muted-foreground">
          No license or certification is currently required — none of your active service codes
          (Settings → Service codes) call for one.
        </p>
      ) : (
        <OrgComplianceDocumentsSection />
      )}
    </div>
  );
}
