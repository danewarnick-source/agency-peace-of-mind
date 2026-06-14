import { createFileRoute } from "@tanstack/react-router";
import { EvvArchivePage } from "@/components/evv/approved-evv-archive";

export const Route = createFileRoute("/dashboard/evv-archive")({
  head: () => ({ meta: [{ title: "Approved EVV Archive — HIVE" }] }),
  component: EvvArchivePage,
});
