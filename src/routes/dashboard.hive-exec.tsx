import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { Shield, ShieldAlert } from "lucide-react";
import { RequireHiveExecutive } from "@/components/hive-executive-guard";
import { EXEC_NAV } from "@/lib/exec-nav";

export const Route = createFileRoute("/dashboard/hive-exec")({
  head: () => ({ meta: [{ title: "HIVE Executive — Platform Oversight" }] }),
  component: () => (
    <RequireHiveExecutive>
      <HiveExecLayout />
    </RequireHiveExecutive>
  ),
});

function HiveExecLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
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
                HIVE Platform Operations
              </div>
              <h1 className="font-display text-xl font-bold tracking-tight">HIVE Executive</h1>
            </div>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-[#fed7aa] bg-[#0f1b3d] px-3 py-1.5 text-xs font-medium text-[#fed7aa]">
            <ShieldAlert className="h-3.5 w-3.5" />
            Account &amp; billing only — no client records or PHI
          </div>
        </div>
      </header>

      <nav className="flex flex-wrap gap-1 rounded-xl border border-border bg-card p-1 shadow-sm">
        {EXEC_NAV.map((t) => {
          const active = t.exact ? pathname === t.to : pathname.startsWith(t.to);
          const Icon = t.icon;
          return (
            <Link
              key={t.to}
              to={t.to}
              className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                active
                  ? "bg-[#0f1b3d] text-white shadow-sm"
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
