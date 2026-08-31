import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/dashboard/training/catalog")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard/hive-training", search: {} });
  },
  component: () => null,
});
