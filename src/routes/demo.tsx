import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/demo")({
  component: DemoLayout,
});

function DemoLayout() {
  return <Outlet />;
}
