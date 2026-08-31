import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/dashboard/programs/$programId")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard/my-obligations" });
  },
  component: () => null,
});
