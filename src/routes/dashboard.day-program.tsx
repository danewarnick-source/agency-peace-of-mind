import { createFileRoute, redirect } from "@tanstack/react-router";

// Day Program is accessed via the Scheduler's "Day Program" tab, not a standalone route.
// Redirect any stray links here so users land somewhere useful.
export const Route = createFileRoute("/dashboard/day-program")({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  loader: () => { throw redirect({ to: "/dashboard/scheduler", replace: true } as any); },
  component: () => null,
});
