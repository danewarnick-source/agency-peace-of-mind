import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/dashboard/forms")({
  head: () => ({ meta: [{ title: "Forms — HIVE" }] }),
  component: () => <Outlet />,
});
