import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, CalendarDays, ClipboardCheck, GraduationCap, Sparkles } from "lucide-react";

const TABS = [
  { to: "/dashboard", label: "Caseload", icon: LayoutDashboard, exact: true, code: "caseload" },
  // Schedule replaces the old Time Clock tab. The General Time Clock (non-client
  // admin/training time) is nested below the schedule inside that screen.
  { to: "/dashboard/schedule", label: "Schedule", icon: CalendarDays, exact: false, code: "schedule" },
  { to: "/dashboard/daily-logs", label: "Daily Logs", icon: ClipboardCheck, exact: false, code: "logs" },
  { to: "/dashboard/ask-nectar", label: "Ask NECTAR", icon: Sparkles, exact: false, code: "nectar" },
  { to: "/dashboard/courses", label: "Trainings", icon: GraduationCap, exact: false, code: "courses" },
] as const;

export function StaffBottomTabs({ framed = false }: { framed?: boolean }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const tabs = TABS;

  const positioning = framed
    ? "absolute inset-x-0 bottom-0 z-40"
    : "fixed inset-x-0 bottom-0 z-40 md:hidden";

  return (
    <nav
      aria-label="Primary"
      className={`${positioning} border-t border-white/10 text-white shadow-[0_-8px_24px_-12px_rgba(0,0,0,0.45)]`}
      style={{
        backgroundImage: "var(--gradient-navy)",
        ...(framed ? {} : { paddingBottom: "env(safe-area-inset-bottom)" }),
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
              <Link
                to={t.to}
                className={`relative flex min-h-[56px] flex-col items-center justify-center gap-0.5 px-1 py-2 text-[11px] font-medium tracking-tight transition-all duration-150 active:scale-[0.95] ${
                  active ? "text-[oklch(var(--accent-2))]" : "text-white/65 hover:text-white"
                }`}
              >
                <Icon className="h-5 w-5" strokeWidth={active ? 2.5 : 2} />
                <span className="truncate">{t.label}</span>
                {active && (
                  <span
                    className="absolute top-0 h-0.5 w-8 rounded-full"
                    style={{ backgroundImage: "var(--gradient-amber)" }}
                  />
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
