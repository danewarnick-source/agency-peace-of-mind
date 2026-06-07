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

const TAB_MAP: Record<string, string> = {
  "evv-timesheets": "evv",
  "host-home": "host-home",
  "audit-zone": "audit",
  forms: "forms",
  "command-center": "review",
  "training-records": "review",
  "training-content": "review",
};

export const Route = createFileRoute("/dashboard/records-desk")({
  head: () => ({ meta: [{ title: "Records Desk — HIVE" }] }),
  validateSearch: recordsDeskSearch,
  beforeLoad: ({ search }) => {
    const next = search.tab ? TAB_MAP[search.tab] ?? "review" : "review";
    throw redirect({
      to: "/dashboard/hub/documentation",
      search: { tab: next as "review" | "evv" | "host-home" | "forms" | "audit" | "hrc" },
      replace: true,
    });
  },
  component: () => null,
});
