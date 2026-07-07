import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/dashboard/settings/service-catalog")({
  beforeLoad: () => {
    throw redirect({
      to: "/dashboard/settings/service-codes",
      search: { view: "config" },
      replace: true,
    });
  },
});
