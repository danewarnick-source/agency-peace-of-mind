import { createFileRoute, Navigate, redirect } from "@tanstack/react-router";

// Legacy route — Homes & Teams now lives at /dashboard/homes (promoted out
// of the Scheduling page's tab so it stays reachable regardless of the
// Schedule V2 cut-over flag). Both SSR and client renders redirect.
export const Route = createFileRoute("/dashboard/teams")({
  head: () => ({ meta: [{ title: "Homes & Teams — HIVE" }] }),
  loader: () => {
    throw redirect({ to: "/dashboard/homes", replace: true });
  },
  component: () => <Navigate to="/dashboard/homes" replace />,
});

// Backwards-compat: hub.clients still imports TeamsPage. Same redirect.
export function TeamsPage() {
  return <Navigate to="/dashboard/homes" replace />;
}
