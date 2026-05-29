import { createFileRoute } from "@tanstack/react-router";
import { EmployeeEntry } from "@/lib/role-entry";

export const Route = createFileRoute("/employee")({
  head: () => ({ meta: [{ title: "Employee — HIVE" }] }),
  component: EmployeeEntry,
});
