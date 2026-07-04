import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Shield, ShieldAlert, LayoutDashboard } from "lucide-react";
import { RequireHiveExecutive } from "@/components/hive-executive-guard";
import { EXEC_DOMAINS, COMMAND_CENTER_ITEM } from "@/lib/exec-nav";
import { getPendingUpgradeRequestCount } from "@/lib/org-features.functions";
import { useExecCapabilities } from "@/hooks/use-exec-capability";

export const Route = createFileRoute("/dashboard/hive-exec")({
  head: () => ({ meta: [{ title: "Executive Command Center — HIVE" }] }),
  component: () => (
    <RequireHiveExecutive>
      <ExecCommandCenterLayout />
    </RequireHiveExecutive>
  ),
});

function ExecCommandCenterLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const countFn = useServerFn(getPendingUpgradeRequestCount);
  const pendingQ = useQuery({
    queryKey: ["hive-exec-upgrade-pending-count"],
    queryFn: () => countFn(),
    refetchInterval: 30_000,
  });
  const badges: Record<string, number> = {
    upgrade_requests_pending: pendingQ.data?.count ?? 0,
  };
  const { capabilities } = useExecCapabilities();

  const visibleDomains = EXEC_DOMAINS.map((d) => ({
    ...d,
    items: d.items.filter((i) => capabilities.includes(i.capability)),
  })).filter((d) => d.items.length > 0);

  return (
    <div className="space-y-4">
      <header className="rounded-xl border border-[#fed7aa] bg-gradient-to-r from-[#0f1b3d] to-[#1a2a5a] p-4 text-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-[#d97a1c] text-white">
              <Shield className="h-5 w-5" />
            </span>
            <div>
              <div className="text-xs uppercase tracking-wider text-[#fed7aa]">
                HIVE Platform · Executive Command Center
              </div>
              <h1 className="font-display text-xl font-bold tracking-tight">Platform operations</h1>
            </div>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-[#fed7aa] bg-[#0f1b3d] px-3 py-1.5 text-xs font-medium text-[#fed7aa]">
            <ShieldAlert className="h-3.5 w-3.5" />
            Account &amp; billing only — no client records or PHI
          </div>
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-[220px_1fr]">
        <nav className="space-y-3 rounded-xl border border-border bg-card p-3 shadow-sm md:sticky md:top-4 md:self-start">
          <Link
            to={COMMAND_CENTER_ITEM.to}
            className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              pathname === COMMAND_CENTER_ITEM.to
                ? "bg-[#0f1b3d] text-white"
                : "text-foreground hover:bg-muted"
            }`}
          >
            <LayoutDashboard className="h-4 w-4" /> {COMMAND_CENTER_ITEM.label}
          </Link>

          {visibleDomains.map((d) => (
            <div key={d.id}>
              <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {d.label}
              </div>
              <div className="space-y-0.5">
                {d.items.map((t) => {
                  const active = t.exact ? pathname === t.to : pathname.startsWith(t.to);
                  const Icon = t.icon;
                  const badgeCount = t.badgeKey ? badges[t.badgeKey] ?? 0 : 0;
                  return (
                    <Link
                      key={t.to}
                      to={t.to}
                      className={`flex items-center justify-between gap-2 rounded-md px-3 py-1.5 text-sm transition-colors ${
                        active ? "bg-[#0f1b3d] text-white" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      }`}
                    >
                      <span className="inline-flex items-center gap-2">
                        <Icon className="h-4 w-4" /> {t.label}
                      </span>
                      {badgeCount > 0 && (
                        <span className={`inline-flex min-w-[20px] items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-bold ${active ? "bg-white text-[#0f1b3d]" : "bg-[#d97a1c] text-white"}`}>
                          {badgeCount}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="min-w-0">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
