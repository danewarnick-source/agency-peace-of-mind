import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/classes")({
  beforeLoad: () => {
    throw redirect({ to: "/training", replace: true });
  },
  component: () => null,
});
