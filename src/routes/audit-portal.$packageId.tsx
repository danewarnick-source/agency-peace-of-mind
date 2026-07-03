import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { AuditPortalShell } from "@/components/audit-portal/audit-portal-shell";
import { AuditorPackagePreview } from "@/components/audit-portal/auditor-package-preview";

export const Route = createFileRoute("/audit-portal/$packageId")({
  head: () => ({
    meta: [
      { title: "Audit Package — HIVE State Audit Portal" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: AuditorPackageView,
});

function AuditorPackageView() {
  const { packageId } = Route.useParams();
  return (
    <AuditPortalShell>
      {() => (
        <div className="space-y-3">
          <Link
            to="/audit-portal"
            className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-[#0f1b3d]"
          >
            <ArrowLeft className="h-3 w-3" /> All packages
          </Link>
          <AuditorPackagePreview packageId={packageId} mode="auditor" />
        </div>
      )}
    </AuditPortalShell>
  );
}
