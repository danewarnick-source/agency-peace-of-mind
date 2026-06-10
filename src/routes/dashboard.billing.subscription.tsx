import { createFileRoute } from "@tanstack/react-router";
import { CreditCard, Mail } from "lucide-react";
import { RequirePermission } from "@/components/rbac-guard";

export const Route = createFileRoute("/dashboard/billing/subscription")({
  head: () => ({ meta: [{ title: "HIVE Subscription — HIVE" }] }),
  component: () => (
    <RequirePermission perm="manage_billing">
      <HiveSubscriptionPage />
    </RequirePermission>
  ),
});

// Interim placeholder. The tab used to point at a route that didn't exist (a 404).
// This is NOT a billing system — it's a clean, clearly-labeled holding page until
// the real subscription/plan management screen is built (tracked separately).
function HiveSubscriptionPage() {
  return (
    <div className="mx-auto max-w-xl">
      <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center shadow-[var(--shadow-card)]">
        <span className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-xl bg-accent/10 text-accent">
          <CreditCard className="h-6 w-6" />
        </span>
        <h2 className="mt-4 text-lg font-semibold tracking-tight">HIVE Subscription</h2>
        <p className="mt-1 inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Coming soon
        </p>
        <p className="mx-auto mt-4 max-w-md text-sm text-muted-foreground">
          Self-service plan and subscription management isn't available here yet.
          Your HIVE plan is currently managed by our team — reach out and we'll
          take care of any changes to your plan or billing details.
        </p>
        <a
          href="mailto:support@hive.example"
          className="mt-5 inline-flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-muted"
        >
          <Mail className="h-4 w-4" /> Contact HIVE support
        </a>
      </div>
    </div>
  );
}
