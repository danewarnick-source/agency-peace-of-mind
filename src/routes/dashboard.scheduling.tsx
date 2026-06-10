import { createFileRoute, Navigate, redirect } from "@tanstack/react-router";

// Legacy route — the scheduler now lives at /dashboard/schedule-preview.
// Redirect SSR and client renders so any old links keep working.
export const Route = createFileRoute("/dashboard/scheduling")({
  head: () => ({ meta: [{ title: "Schedule — HIVE" }] }),
  loader: () => {
    throw redirect({ to: "/dashboard/schedule-preview", replace: true });
  },
  component: () => <Navigate to="/dashboard/schedule-preview" replace />,
});
