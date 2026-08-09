import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";

/**
 * Records Desk has been re-homed into the Documentation hub.
 * Keep the route alive (no 404) — redirect to the new surface, mapping the
 * old tab keys to the equivalent hub tab where possible.
 */
const recordsDeskSearch = z.object({
  tab: z
    .enum([
      "command-center",
      "evv-timesheets",
      "host-home",
      "audit-zone",
      "training-records",
      "training-content",
      "forms",
    ])
    .optional(),
  cc: z.enum(["urgent", "pending", "approved", "analytics", "nectar"]).optional(),
});

type HubTab = "records" | "incidents" | "forms" | "audit" | "hrc";

const TAB_MAP: Record<string, HubTab> = {
  "evv-timesheets": "records",
  "host-home": "records",
  "audit-zone": "audit",
  forms: "forms",
  "command-center": "records",
  "training-records": "records",
  "training-content": "records",
};

export const Route = createFileRoute("/dashboard/records-desk")({
  head: () => ({ meta: [{ title: "Records Desk — HIVE" }] }),
  validateSearch: recordsDeskSearch,
  beforeLoad: ({ search }) => {
    const next: HubTab = search.tab ? TAB_MAP[search.tab] ?? "records" : "records";
    throw redirect({
      to: "/dashboard/hub/documentation",
      search: { tab: next },
      replace: true,
    });
  },
  component: () => null,
});
