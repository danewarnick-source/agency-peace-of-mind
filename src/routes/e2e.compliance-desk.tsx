import { createFileRoute } from "@tanstack/react-router";
import { ComplianceDeskPage } from "./dashboard.compliance-desk";

/**
 * Local Playwright harness for EVV & Timesheet Control.
 * Renders the real admin compliance page with mocked org/auth/query data.
 * Production / Lovable preview never sets VITE_E2E_HARNESS, so this path
 * shows a 404 shell and never loads timesheets.
 */
export const Route = createFileRoute("/e2e/compliance-desk")({
  head: () => ({ meta: [{ title: "E2E — EVV & Timesheet Control" }] }),
  component: E2eComplianceDeskHarness,
});

function E2eComplianceDeskHarness() {
  if (import.meta.env.VITE_E2E_HARNESS !== "1") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="max-w-md text-center">
          <h1 className="text-7xl font-bold">404</h1>
          <p className="mt-4 text-muted-foreground">This page doesn't exist.</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen bg-background p-4 md:p-8"
      data-testid="e2e-compliance-desk-harness"
    >
      <p className="mb-3 text-xs text-muted-foreground" data-testid="e2e-admin-context">
        E2E harness · Admin View · permission approve_timesheets · Staff punch pad is out of
        scope
      </p>
      {/* Inner page (not RequirePermission). The production route still
          wraps this in perm="approve_timesheets"; the harness supplies an
          admin session + fixture org so the desk itself can be exercised. */}
      <ComplianceDeskPage />
    </div>
  );
}
