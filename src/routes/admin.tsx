import { createFileRoute } from "@tanstack/react-router";
import { AdminEntry } from "@/lib/role-entry";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Admin — Care Academy" }] }),
  component: AdminEntry,
});
