import { createFileRoute } from "@tanstack/react-router";
import { RequireHiveExecutive } from "@/components/hive-executive-guard";
import { CommandCenterLanding } from "@/components/hive-exec/command/command-landing";

export const Route = createFileRoute("/dashboard/hive-exec/command")({
  head: () => ({ meta: [{ title: "Executive Command Center — HIVE" }] }),
  component: () => (
    <RequireHiveExecutive>
      <CommandCenterLanding />
    </RequireHiveExecutive>
  ),
});
