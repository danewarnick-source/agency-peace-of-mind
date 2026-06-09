import { createFileRoute, Link } from "@tanstack/react-router";
import { RequirePermission } from "@/components/rbac-guard";
import { ArrowLeft, Construction } from "lucide-react";

export const Route = createFileRoute("/dashboard/smart-import/$jobId/review")({
  head: () => ({ meta: [{ title: "Smart Import Review — NECTAR" }] }),
  component: () => (
    <RequirePermission perm="manage_users">
      <ReviewStub />
    </RequirePermission>
  ),
});

function ReviewStub() {
  const { jobId } = Route.useParams();
  return (
    <div className="space-y-6">
      <Link to="/dashboard/smart-import" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to Smart Import
      </Link>
      <div className="rounded-2xl border border-border bg-card p-8 text-center shadow-[var(--shadow-card)]">
        <Construction className="mx-auto h-8 w-8 text-muted-foreground" />
        <h1 className="mt-3 text-lg font-semibold">Review placement</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Job <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{jobId}</code> is staged and ready
          to review. The review experience will be built in the next step.
        </p>
      </div>
    </div>
  );
}
