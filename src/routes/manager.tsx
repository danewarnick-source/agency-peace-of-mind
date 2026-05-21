import { createFileRoute } from "@tanstack/react-router";
import { ManagerEntry } from "@/lib/role-entry";

export const Route = createFileRoute("/manager")({
  head: () => ({ meta: [{ title: "Manager — Care Academy" }] }),
  component: ManagerEntry,
});
