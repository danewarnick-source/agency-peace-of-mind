import { createFileRoute, Link } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/unauthorized")({
  head: () => ({ meta: [{ title: "Unauthorized — HIVE" }] }),
  component: UnauthorizedPage,
});

function UnauthorizedPage() {
  return (
    <div className="grid min-h-screen place-items-center bg-secondary/40 px-6">
      <div className="max-w-md rounded-2xl border border-border bg-card p-10 text-center shadow-[var(--shadow-card)]">
        <span className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <ShieldAlert className="h-6 w-6" />
        </span>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">Access denied</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          You don't have permission to view this page. If you believe this is a mistake, contact your organization admin.
        </p>
        <Button asChild className="mt-6"><Link to="/dashboard">Back to your dashboard</Link></Button>
      </div>
    </div>
  );
}
