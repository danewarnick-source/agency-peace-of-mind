import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/dashboard/policies")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard/hive-training", search: { tab: "internal" } });
  },
  component: () => null,
});
