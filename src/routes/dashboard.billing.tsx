import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { RequireRole } from "@/components/rbac-guard";
import { Receipt, Users, FileSpreadsheet, Upload, CreditCard, Sparkles, Grid3x3, Home, HardHat, TableProperties } from "lucide-react";
import { NectarBillingReadinessBar } from "@/components/billing/nectar-billing-readiness-bar";
import { usePermissions } from "@/hooks/use-permissions";
import type { Permission } from "@/lib/rbac";

export const Route = createFileRoute("/dashboard/billing")({
  head: () => ({ meta: [{ title: "Billing — HIVE" }] }),
  component: () => (
    <RequireRole roles={["admin", "manager", "super_admin"]}>
      <BillingLayout />
    </RequireRole>
  ),
});

const TABS: Array<{ to: string; label: string; icon: typeof Users; exact?: boolean; perm?: Permission }> = [
  { to: "/dashboard/billing", label: "Overview", icon: Users, exact: true },
  { to: "/dashboard/billing/monthly-grid", label: "Monthly Grid", icon: Grid3x3 },
  { to: "/dashboard/billing/host-home", label: "Host Home", icon: Home },
  { to: "/dashboard/billing/contractors", label: "Contractors", icon: HardHat },
  { to: "/dashboard/billing/totals", label: "Totals", icon: TableProperties },
  { to: "/dashboard/billing/nectar", label: "NECTAR", icon: Sparkles },
  { to: "/dashboard/billing/form520", label: "520 Form", icon: FileSpreadsheet },
  { to: "/dashboard/billing/imports", label: "Imports / Authorizations", icon: Upload },
  // HIVE Subscription is managed by the Company Admin (manage_billing) — managers
  // can see the rest of Billing but not the subscription tab. The route enforces
  // the same permission, so the tab is only shown to those who can open it.
  { to: "/dashboard/billing/subscription", label: "HIVE Subscription", icon: CreditCard, perm: "manage_billing" },
];

function BillingLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { can } = usePermissions();
  const visibleTabs = TABS.filter((t) => !t.perm || can(t.perm));

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Receipt className="h-4 w-4" />
            <span>Admin · Client Billing</span>
          </div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Billing</h1>
          <p className="text-sm text-muted-foreground">
            Authorizations, 520 generation, live unit ledger, and per-client budget. Admin-only — never visible to staff.
          </p>
        </div>
      </header>
      <NectarBillingReadinessBar />

      <nav className="flex flex-wrap gap-1 rounded-xl border border-border bg-card p-1 shadow-sm">

        {visibleTabs.map((t) => {
          const active = t.exact ? pathname === t.to : pathname.startsWith(t.to);
          const Icon = t.icon;
          return (
            <Link
              key={t.to}
              to={t.to}
              className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                active
                  ? "bg-[image:var(--gradient-brand)] text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <Icon className="h-4 w-4" /> {t.label}
            </Link>
          );
        })}
      </nav>

      <Outlet />
    </div>
  );
}
