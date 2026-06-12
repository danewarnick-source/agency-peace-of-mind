import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { RequireRole } from "@/components/rbac-guard";
import { TrendingUp, Grid3x3, Home, HardHat, TableProperties, BarChart3, PieChart, LineChart } from "lucide-react";
import { usePermissions } from "@/hooks/use-permissions";
import type { Permission } from "@/lib/rbac";

export const Route = createFileRoute("/dashboard/financial")({
  head: () => ({ meta: [{ title: "Financial — HIVE" }] }),
  component: () => (
    <RequireRole roles={["admin", "manager", "super_admin"]}>
      <FinancialLayout />
    </RequireRole>
  ),
});

const TABS: Array<{ to: string; label: string; icon: typeof Grid3x3; disabled?: boolean; perm?: Permission }> = [
  { to: "/dashboard/financial/revenue", label: "Revenue", icon: LineChart },
  { to: "/dashboard/financial/monthly-grid", label: "Monthly Grid", icon: Grid3x3 },
  { to: "/dashboard/financial/host-home", label: "Host Home", icon: Home },
  { to: "/dashboard/financial/contractors", label: "Contractors", icon: HardHat },
  { to: "/dashboard/financial/totals", label: "Totals", icon: TableProperties },
  { to: "/dashboard/financial/gross", label: "TNS Gross", icon: BarChart3, perm: "view_financial_tns_gross" },
  { to: "/dashboard/financial/distributions", label: "Distributions", icon: PieChart },
  // Placeholders — not built yet (see prompt: View 1 only)
  { to: "#", label: "Profitability", icon: LineChart, disabled: true },
  { to: "#", label: "Cash Flow", icon: LineChart, disabled: true },
];


function FinancialLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { can } = usePermissions();
  const visibleTabs = TABS.filter((t) => !t.perm || can(t.perm));

  return (
    <div className="space-y-4">

      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <TrendingUp className="h-4 w-4" />
            <span>Admin · Financial</span>
          </div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Financial</h1>
          <p className="text-sm text-muted-foreground">
            Accounting overview — tracking, not a replacement for your accountant.
          </p>
        </div>
      </header>

      <nav className="flex flex-wrap gap-1 rounded-xl border border-border bg-card p-1 shadow-sm">
        {visibleTabs.map((t) => {
          const active = !t.disabled && pathname.startsWith(t.to);
          const Icon = t.icon;
          if (t.disabled) {
            return (
              <span
                key={t.label}
                className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground/60"
                title="Coming soon"
              >
                <Icon className="h-4 w-4" /> {t.label}
                <span className="ml-1 rounded-full border border-border bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
                  Soon
                </span>
              </span>
            );
          }
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
