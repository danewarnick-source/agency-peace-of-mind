import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/dashboard/client/$clientId")({
  component: LegacyClientDetailRedirect,
});

function LegacyClientDetailRedirect() {
  const { clientId } = Route.useParams();

  return <Navigate to="/dashboard/workspace/$clientId" params={{ clientId }} replace />;
}