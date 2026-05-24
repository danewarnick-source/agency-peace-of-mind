import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/dashboard/client/$clientId")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/dashboard/workspace/$clientId",
      params: { clientId: params.clientId },
      replace: true,
    });
  },
  component: () => null,
});