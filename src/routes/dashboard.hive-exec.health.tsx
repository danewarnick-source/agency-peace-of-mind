import { createFileRoute } from "@tanstack/react-router";
import { RequireHiveExecutive } from "@/components/hive-executive-guard";
import { Activity } from "lucide-react";

export const Route = createFileRoute("/dashboard/hive-exec/health")({
  head: () => ({ meta: [{ title: "Account Health — HIVE Executive" }] }),
  component: () => (
    <RequireHiveExecutive>
      <AccountHealth />
    </RequireHiveExecutive>
  ),
});

function AccountHealth() {
  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
      <div className="flex items-center gap-3">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-[#0f1b3d] text-white">
          <Activity className="h-5 w-5" />
        </span>
        <div>
          <h2 className="font-display text-lg font-semibold">Account Health</h2>
          <p className="text-sm text-muted-foreground">
            Churn risk, login activity, and adoption signals across customer companies.
          </p>
        </div>
      </div>
      <p className="mt-4 text-sm text-muted-foreground">
        Health scoring, at-risk accounts, and engagement trends will appear here.
      </p>
    </div>
  );
}
