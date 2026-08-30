import { createFileRoute } from "@tanstack/react-router";
import { HhsClientHub } from "./dashboard.hhs-hub.$clientId";

/**
 * Local Playwright harness for HHS host-home daily notes + attendance.
 * Renders the real HHS hub without the dashboard shell (no Hive Executive
 * gate, no Compass). Production never sets VITE_E2E_HARNESS, so this path
 * is a 404 and never loads client notes.
 */
export const Route = createFileRoute("/e2e/hhs-hub/$clientId")({
  head: () => ({ meta: [{ title: "E2E — HHS Host Home Hub" }] }),
  validateSearch: (s: Record<string, unknown>): { tab?: string; open?: string } => {
    const tab = typeof s.tab === "string" ? s.tab : undefined;
    const open = typeof s.open === "string" ? s.open : undefined;
    return { ...(tab ? { tab } : {}), ...(open ? { open } : {}) };
  },
  component: E2eHhsHubHarness,
});

function E2eHhsHubHarness() {
  const { clientId } = Route.useParams();

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
    <div className="min-h-screen bg-background p-4 md:p-8" data-testid="e2e-hhs-hub-harness">
      <p className="mb-3 text-xs text-muted-foreground" data-testid="e2e-hhs-context">
        E2E harness · HHS host home · hosts never clock · Staff Compass is out of scope
      </p>
      <HhsClientHub clientId={clientId} />
    </div>
  );
}
