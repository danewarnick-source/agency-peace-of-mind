import { createFileRoute } from "@tanstack/react-router";
import { SuperAdminEntry } from "@/lib/role-entry";

export const Route = createFileRoute("/super-admin")({
  head: () => ({ meta: [{ title: "Super Admin — HIVE" }] }),
  component: SuperAdminEntry,
});
