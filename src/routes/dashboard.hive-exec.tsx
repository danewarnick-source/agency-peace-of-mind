import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useMemo } from "react";
import { Shield, ShieldAlert, LayoutDashboard, HelpCircle, ChevronDown } from "lucide-react";
import { RequireHiveExecutive } from "@/components/hive-executive-guard";
import { EXEC_DOMAINS, COMMAND_CENTER_ITEM, EXEC_NAV } from "@/lib/exec-nav";
import { getPendingUpgradeRequestCount } from "@/lib/org-features.functions";
import { useExecCapabilities, useCapability } from "@/hooks/use-exec-capability";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SteveDockPanel } from "@/components/hive-exec/command/steve-panel";

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

  // Match current path to a nav entry to bias Steve's retrieval.
  const currentNav = useMemo(
    () => EXEC_NAV.find((i) => (i.exact ? pathname === i.to : pathname.startsWith(i.to))) ?? null,
    [pathname],
  );
  const { allowed: steveAllowed } = useCapability("steve.use");
  const [guideOpen, setGuideOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const toggleDomain = (id: string) => setCollapsed((c) => ({ ...c, [id]: !c[id] }));

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
          <div className="flex flex-wrap items-center gap-2">
            {steveAllowed && (
              <Button
                size="sm"
                variant="secondary"
                className="bg-[#d97a1c] text-white hover:bg-[#b8641a]"
                onClick={() => setGuideOpen(true)}
              >
                <HelpCircle className="mr-1 h-3.5 w-3.5" /> Guide me
              </Button>
            )}
            <div className="inline-flex items-center gap-2 rounded-full border border-[#fed7aa] bg-[#0f1b3d] px-3 py-1.5 text-xs font-medium text-[#fed7aa]">
              <ShieldAlert className="h-3.5 w-3.5" />
              Account &amp; billing only — no client records or PHI
            </div>
          </div>
        </div>
      </header>

      <Dialog open={guideOpen} onOpenChange={setGuideOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>
              Guide me{currentNav ? ` · ${currentNav.label}` : ""}
            </DialogTitle>
          </DialogHeader>
          <SteveDockPanel
            routeContext={currentNav?.to ?? pathname}
            featureKeyContext={currentNav?.capability ?? null}
            expanded
          />
        </DialogContent>
      </Dialog>


      <div className="min-w-0">
        <Outlet />
      </div>
    </div>
  );
}
