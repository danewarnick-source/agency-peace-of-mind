import { createFileRoute, Navigate, redirect } from "@tanstack/react-router";

// Legacy route — the scheduler now lives at /dashboard/scheduler.
export const Route = createFileRoute("/dashboard/scheduling")({
  head: () => ({ meta: [{ title: "Scheduler — HIVE" }] }),
  loader: () => {
    throw redirect({ to: "/dashboard/scheduler", replace: true });
  },
  component: () => <Navigate to="/dashboard/scheduler" replace />,
});

