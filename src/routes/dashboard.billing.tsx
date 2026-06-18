import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { RequireRole } from "@/components/rbac-guard";
import { Receipt, Users, FileSpreadsheet, Upload, Sparkles } from "lucide-react";
import { NectarBillingReadinessBar } from "@/components/billing/nectar-billing-readiness-bar";
import { NectarFocusBanner } from "@/components/nectar/nectar-focus-banner";
import { usePermissions } from "@/hooks/use-permissions";
import type { Permission } from "@/lib/rbac";


function BillingError({ error }: { error: Error; reset: () => void }) {
  return (
    <div className="flex items-start justify-center p-8">
      <div className="max-w-md rounded-lg border border-destructive/40 bg-destructive/5 p-6 text-center">
        <h2 className="text-base font-semibold">Something went wrong in Billing</h2>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
        <div className="mt-4 flex justify-center gap-3">
          <button
            onClick={() => window.location.reload()}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >Reload</button>
          <a href="/dashboard" className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground">Dashboard home</a>
        </div>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/dashboard/billing")({
  head: () => ({ meta: [{ title: "Billing — HIVE" }] }),
  validateSearch: (s: Record<string, unknown>) => ({
    focus: typeof s.focus === "string" ? s.focus : undefined,
  }),
  component: () => (
    <RequireRole roles={["admin", "manager", "super_admin"]}>
      <BillingLayout />
    </RequireRole>
  ),
  errorComponent: BillingError,
});

const TABS: Array<{ to: string; label: string; icon: typeof Users; exact?: boolean; perm?: Permission }> = [
  { to: "/dashboard/billing", label: "Overview", icon: Users, exact: true },
  { to: "/dashboard/billing/nectar", label: "NECTAR", icon: Sparkles },
  { to: "/dashboard/billing/form520", label: "520 Form", icon: FileSpreadsheet },
  { to: "/dashboard/billing/imports", label: "Imports / Authorizations", icon: Upload },
];

function BillingLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { can } = usePermissions();
  const visibleTabs = TABS.filter((t) => !t.perm || can(t.perm));

  return (
    <div className="finance-dense space-y-4">
      <NectarFocusBanner />
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
