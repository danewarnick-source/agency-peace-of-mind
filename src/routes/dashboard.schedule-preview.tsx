import { createFileRoute, redirect } from "@tanstack/react-router";

// Legacy route — the scheduler now lives at /dashboard/scheduler.
// Preserve ?focus= so NECTAR deep-links from Home still land on the banner.
export const Route = createFileRoute("/dashboard/schedule-preview")({
  head: () => ({ meta: [{ title: "Scheduler — HIVE" }] }),
  validateSearch: (s: Record<string, unknown>): { focus?: string } =>
    typeof s.focus === "string" ? { focus: s.focus } : {},
  beforeLoad: ({ search }) => {
    throw redirect({
      to: "/dashboard/scheduler",
      search: search.focus ? { focus: search.focus } : {},
      replace: true,
    });
  },
});
