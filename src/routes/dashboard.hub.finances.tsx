import { createFileRoute, Outlet, useRouterState, Link } from "@tanstack/react-router";

/**
 * Finances hub. Both Billing and Financial own their own nested routes
 * (with their own internal layouts), so this hub renders a thin tab bar
 * that links to those existing routes and lets each route's own <Outlet/>
 * render below. We don't remount the page components themselves.
 */
export const Route = createFileRoute("/dashboard/hub/finances")({
  head: () => ({ meta: [{ title: "Finances — HIVE" }] }),
  component: FinancesHub,
});

function FinancesHub() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const tabs = [
    { to: "/dashboard/billing", label: "Billing", match: "/dashboard/billing" },
    { to: "/dashboard/financial", label: "Financial", match: "/dashboard/financial" },
  ] as const;
  const active = tabs.find((t) => pathname.startsWith(t.match))?.to ?? tabs[0].to;
  return (
    <div className="flex min-h-full flex-col">
      <div className="mb-4">
        <h2 className="text-xl font-semibold tracking-tight">Finances</h2>
      </div>
      <div className="mb-4 border-b border-border">
        <nav className="-mb-px flex flex-wrap gap-1" aria-label="Tabs">
          {tabs.map((t) => {
            const isActive = active === t.to;
            return (
              <Link
                key={t.to}
                to={t.to}
                className={`whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
                  isActive ? "border-[#137182] text-[#137182]" : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
                }`}
              >
                {t.label}
              </Link>
            );
          })}
        </nav>
      </div>
      <div className="min-w-0 flex-1"><Outlet /></div>
    </div>
  );
}
