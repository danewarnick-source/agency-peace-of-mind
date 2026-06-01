import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, Clock, ClipboardCheck, GraduationCap } from "lucide-react";

const TABS = [
  { to: "/dashboard", label: "Caseload", icon: LayoutDashboard, exact: true },
  { to: "/dashboard/timeclock", label: "Time Clock", icon: Clock },
  { to: "/dashboard/daily-logs", label: "Daily Logs", icon: ClipboardCheck },
  { to: "/dashboard/courses", label: "Trainings", icon: GraduationCap },
] as const;

export function StaffBottomTabs() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-[#0d112b] text-white md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="grid grid-cols-4">
        {TABS.map((t) => {
          const active = t.exact ? pathname === t.to : pathname.startsWith(t.to);
          const Icon = t.icon;
          return (
            <li key={t.to}>
              <Link
                to={t.to}
                className={`flex min-h-[56px] flex-col items-center justify-center gap-0.5 px-1 py-2 text-[11px] font-medium transition-colors active:scale-[0.97] ${
                  active ? "text-[#f4a93a]" : "text-white/55 hover:text-white/80"
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
