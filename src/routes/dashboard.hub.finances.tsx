import { createFileRoute, Link } from "@tanstack/react-router";
import { Receipt, TrendingUp } from "lucide-react";

/**
 * Finances hub landing. Billing and Financial each own their own nested
 * route trees with internal tab layouts, so this hub is intentionally a
 * thin chooser — it does not re-mount or duplicate those pages.
 */
export const Route = createFileRoute("/dashboard/hub/finances")({
  head: () => ({ meta: [{ title: "Finances — HIVE" }] }),
  component: FinancesHub,
});

function FinancesHub() {
  return (
    <div className="flex min-h-full flex-col">
      <div className="mb-6">
        <h2 className="text-xl font-semibold tracking-tight">Finances</h2>
        <p className="text-sm text-muted-foreground">Billing and financial overview.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Link
          to="/dashboard/billing"
          className="group rounded-xl border border-border bg-card p-6 shadow-sm transition-colors hover:border-[#137182]"
        >
          <Receipt className="h-6 w-6 text-[#137182]" />
          <div className="mt-3 text-base font-semibold">Billing</div>
          <p className="mt-1 text-sm text-muted-foreground">
            Authorizations, 520 generation, claims, and per-client budgets.
          </p>
        </Link>
        <Link
          to="/dashboard/financial"
          className="group rounded-xl border border-border bg-card p-6 shadow-sm transition-colors hover:border-[#137182]"
        >
          <TrendingUp className="h-6 w-6 text-[#137182]" />
          <div className="mt-3 text-base font-semibold">Financial</div>
          <p className="mt-1 text-sm text-muted-foreground">
            Revenue tracking and accounting overview.
          </p>
        </Link>
      </div>
    </div>
  );
}
