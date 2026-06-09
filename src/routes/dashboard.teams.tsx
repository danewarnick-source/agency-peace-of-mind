import { createFileRoute, Navigate, redirect } from "@tanstack/react-router";

// Legacy route — Homes & Teams now lives under Scheduling. Both SSR
// (loader) and client-side renders redirect to the new tab.
export const Route = createFileRoute("/dashboard/teams")({
  head: () => ({ meta: [{ title: "Homes & Teams — HIVE" }] }),
  loader: () => {
    throw redirect({
      to: "/dashboard/scheduling",
      search: { tab: "homes" },
      replace: true,
    });
  },
  component: () => (
    <Navigate to="/dashboard/scheduling" search={{ tab: "homes" }} replace />
  ),
});

// Backwards-compat: hub.clients still imports TeamsPage. Render the same
// redirect so the old Clients › Teams & homes tab funnels to the new home.
export function TeamsPage() {
  return (
    <Navigate to="/dashboard/scheduling" search={{ tab: "homes" }} replace />
  );
}
