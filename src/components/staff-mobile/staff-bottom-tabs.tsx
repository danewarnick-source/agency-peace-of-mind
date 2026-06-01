import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, Clock, ClipboardCheck, GraduationCap } from "lucide-react";
import { useTimePaySettings } from "@/hooks/use-time-pay-settings";

const TABS = [
  { to: "/dashboard", label: "Caseload", icon: LayoutDashboard, exact: true, code: "caseload" },
  { to: "/dashboard/timeclock", label: "Time Clock", icon: Clock, exact: false, code: "timeclock" },
  { to: "/dashboard/daily-logs", label: "Daily Logs", icon: ClipboardCheck, exact: false, code: "logs" },
  { to: "/dashboard/courses", label: "Trainings", icon: GraduationCap, exact: false, code: "courses" },
] as const;

export function StaffBottomTabs({ framed = false }: { framed?: boolean }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { settings } = useTimePaySettings();

  const tabs = TABS.filter(
    (t) => t.code !== "timeclock" || settings.allow_non_client_clockins,
  );

  const positioning = framed
    ? "absolute inset-x-0 bottom-0 z-40"
    : "fixed inset-x-0 bottom-0 z-40 md:hidden";

  return (
    <nav
      aria-label="Primary"
      className={`${positioning} border-t border-white/10 bg-[#0d112b] text-white`}
      style={framed ? undefined : { paddingBottom: "env(safe-area-inset-bottom)" }}
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
                className={`flex min-h-[56px] flex-col items-center justify-center gap-0.5 px-1 py-2 text-[11px] font-medium transition-all duration-150 active:scale-[0.95] ${
                  active ? "text-[#f4a93a]" : "text-white/70 hover:text-white"
                }`}
              >
                <Icon className="h-5 w-5" strokeWidth={active ? 2.5 : 2} />
                <span className="truncate">{t.label}</span>
                {active && <span className="mt-0.5 h-0.5 w-6 rounded-full bg-[#f4a93a]" />}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
