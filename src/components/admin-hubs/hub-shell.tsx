import { type ReactNode, useState } from "react";
import { Link, useSearch } from "@tanstack/react-router";
import { Lock } from "lucide-react";
import { UpgradeGate, FeatureLockedRoute } from "@/components/upgrade-gate";
import { useOrgFeatures } from "@/hooks/use-feature-enabled";

export type HubTab = {
  key: string;
  label: string;
  render: () => ReactNode;
  feature?: string;
};

type Props = {
  title: string;
  subtitle?: string;
  tabs: HubTab[];
  /** Route path the tabs link to (e.g. "/dashboard/hub/employees"). */
  basePath: string;
};

/**
 * Thin shell: a horizontal tab bar (URL-driven via ?tab=) above the active tab's
 * existing page component. Does not modify any wrapped page's behavior.
 */
export function HubShell({ title, subtitle, tabs, basePath }: Props) {
  const search = useSearch({ strict: false }) as { tab?: string };
  const { isEnabled } = useOrgFeatures();
  const [upgradeFeatureKey, setUpgradeFeatureKey] = useState<string | null>(null);
  const activeKey = tabs.find((t) => t.key === search.tab)?.key ?? tabs[0].key;
  const active = tabs.find((t) => t.key === activeKey)!;
  const activeLocked = active.feature ? !isEnabled(active.feature) : false;

  return (
    <div className="flex min-h-full flex-col">
      <div className="mb-4">
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
        {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
      </div>

      {tabs.length > 1 && (
        <div className="mb-4 border-b border-border">
          <nav className="-mb-px flex flex-wrap gap-1" aria-label="Tabs">
            {tabs.map((t) => {
              const isActive = t.key === activeKey;
              const locked = t.feature ? !isEnabled(t.feature) : false;
              if (locked) {
                return (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => t.feature && setUpgradeFeatureKey(t.feature)}
                    className={`inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
                      isActive
                        ? "border-[#137182] text-muted-foreground"
                        : "border-transparent text-muted-foreground/60 hover:border-border hover:text-muted-foreground"
                    }`}
                  >
                    {t.label}
                    <Lock className="h-3 w-3" />
                  </button>
                );
              }
              return (
                <Link
                  key={t.key}
                  to={basePath}
                  search={{ tab: t.key }}
                  replace
                  className={`whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
                    isActive
                      ? "border-[#137182] text-[#137182]"
                      : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
                  }`}
                >
                  {t.label}
                </Link>
              );
            })}
          </nav>
        </div>
      )}

      <div className="min-w-0 flex-1">
        {activeLocked && active.feature ? <FeatureLockedRoute featureKey={active.feature} /> : active.render()}
      </div>
      {upgradeFeatureKey && (
        <UpgradeGate
          featureKey={upgradeFeatureKey}
          open={!!upgradeFeatureKey}
          onOpenChange={(o) => { if (!o) setUpgradeFeatureKey(null); }}
        />
      )}
    </div>
  );
}
