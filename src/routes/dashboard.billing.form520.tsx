import { createFileRoute } from "@tanstack/react-router";
export { Route as _Route } from "./dashboard.billing-520";
import Billing520 from "./dashboard.billing-520";

export const Route = createFileRoute("/dashboard/billing/form520")({
  head: () => ({ meta: [{ title: "520 Billing — HIVE" }] }),
  // Reuse the existing Billing520 page component (already role-gated).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  component: (Billing520 as any),
});
