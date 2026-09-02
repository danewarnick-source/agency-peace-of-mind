import { createFileRoute, redirect } from "@tanstack/react-router";

// Legacy route — the scheduler now lives at /dashboard/scheduler.
export const Route = createFileRoute("/dashboard/scheduling")({
  head: () => ({ meta: [{ title: "Scheduler — Provider Interface" }] }),
  beforeLoad: () => {
    throw redirect({ to: "/dashboard/scheduler", replace: true });
  },
});
