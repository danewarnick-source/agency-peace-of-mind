import { createFileRoute } from "@tanstack/react-router";
import { RequireHiveExecutive } from "@/components/hive-executive-guard";
import { CreditCard } from "lucide-react";

export const Route = createFileRoute("/dashboard/hive-exec/plans")({
  head: () => ({ meta: [{ title: "Plans & Billing — HIVE Executive" }] }),
  component: () => (
    <RequireHiveExecutive>
      <PlansAndBilling />
    </RequireHiveExecutive>
  ),
});

function PlansAndBilling() {
  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
      <div className="flex items-center gap-3">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-[#0f1b3d] text-white">
          <CreditCard className="h-5 w-5" />
        </span>
        <div>
          <h2 className="font-display text-lg font-semibold">Plans &amp; Billing</h2>
          <p className="text-sm text-muted-foreground">
            Manage HIVE subscription tiers, pricing, and customer invoices.
          </p>
        </div>
      </div>
      <p className="mt-4 text-sm text-muted-foreground">
        Plan catalog, MRR roll-up, and invoice management surfaces will appear here.
      </p>
    </div>
  );
}
