import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, CalendarDays, ClipboardCheck, Sparkles, Lock, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { UpgradeGate } from "@/components/upgrade-gate";
import { useOrgFeatures } from "@/hooks/use-feature-enabled";

type StaffTab = {
  to: string;
  label: string;
  icon: LucideIcon;
  exact: boolean;
  code: string;
  feature?: string;
};

const TABS: StaffTab[] = [
  { to: "/dashboard", label: "Caseload", icon: LayoutDashboard, exact: true, code: "caseload" },
  // Schedule replaces the old Time Clock tab. The General Time Clock (non-client
  // admin/training time) is nested below the schedule inside that screen.
  { to: "/dashboard/schedule", label: "Schedule", icon: CalendarDays, exact: false, code: "schedule", feature: "evv_timesheets" },
  { to: "/dashboard/daily-logs", label: "Daily Logs", icon: ClipboardCheck, exact: false, code: "logs" },
  { to: "/dashboard/ask-nectar", label: "Ask NECTAR", icon: Sparkles, exact: false, code: "nectar", feature: "nectar" },
  { to: "/dashboard/my-obligations", label: "Obligations", icon: ClipboardCheck, exact: false, code: "obligations" },
];

export function StaffBottomTabs({ framed = false }: { framed?: boolean }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { isEnabled } = useOrgFeatures();
  const [upgradeFeatureKey, setUpgradeFeatureKey] = useState<string | null>(null);

  const tabs = TABS;

  const positioning = framed
    ? "absolute inset-x-0 bottom-0 z-40"
    : "fixed inset-x-0 bottom-0 z-40 md:hidden";

  return (
    <nav
      aria-label="Primary"
      className={`${positioning} border-t border-[color-mix(in_srgb,white_14%,var(--hive-sidebar))] bg-[var(--hive-sidebar)] text-[var(--hive-chrome-text)]`}
      style={{
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      <ul
        className="grid"
        style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
      >
        {tabs.map((t) => {
          const active = t.exact ? pathname === t.to : pathname.startsWith(t.to);
          const Icon = t.icon;
          return (
            <li key={t.to}>
              {t.feature && !isEnabled(t.feature) ? (
                <button
                  type="button"
                  onClick={() => setUpgradeFeatureKey(t.feature!)}
                  className="relative flex min-h-[56px] w-full flex-col items-center justify-center gap-0.5 px-1 py-2 text-[11px] font-medium tracking-tight text-[var(--hive-chrome-text)]/35 transition-all duration-150 active:scale-[0.95]"
                  aria-label={`${t.label} — locked. Click to request upgrade.`}
                >
                  <Icon className="h-5 w-5" strokeWidth={2} />
                  <span className="truncate">{t.label}</span>
                  <Lock className="absolute right-2 top-2 h-3 w-3" />
                </button>
              ) : (
                <Link
                  to={t.to}
                  data-tour={`nav.${t.to.replace(/^\/dashboard\/?/, "") || "home"}`}
                  className={`relative flex min-h-[56px] flex-col items-center justify-center gap-0.5 px-1 py-2 text-[11px] font-medium tracking-tight transition-all duration-150 active:scale-[0.95] ${
                    active
                      ? "text-[var(--hive-gold)]"
                      : "text-[var(--hive-chrome-text)]/65 hover:text-[var(--hive-chrome-text)]"
                  }`}
                >
                  <Icon className="h-5 w-5" strokeWidth={active ? 2.5 : 2} />
                  <span className="truncate">{t.label}</span>
                  {active && (
                    <span className="absolute top-0 h-0.5 w-8 rounded-full bg-[var(--hive-gold)]" />
                  )}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
      {upgradeFeatureKey && (
        <UpgradeGate
          featureKey={upgradeFeatureKey}
          open={!!upgradeFeatureKey}
          onOpenChange={(o) => { if (!o) setUpgradeFeatureKey(null); }}
        />
      )}
    </nav>
  );
}
