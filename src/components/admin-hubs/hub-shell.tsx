import { type ReactNode } from "react";
import { Link, useSearch, useRouterState } from "@tanstack/react-router";

export type HubTab = {
  key: string;
  label: string;
  render: () => ReactNode;
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
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const activeKey = tabs.find((t) => t.key === search.tab)?.key ?? tabs[0].key;
  const active = tabs.find((t) => t.key === activeKey)!;

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
              return (
                <Link
                  key={t.key}
                  to={pathname}
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

      <div className="min-w-0 flex-1">{active.render()}</div>
    </div>
  );
}
