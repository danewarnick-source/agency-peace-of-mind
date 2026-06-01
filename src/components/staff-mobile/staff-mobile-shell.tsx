import type { ReactNode } from "react";
import { StaffTopBar } from "./staff-top-bar";
import { StaffBottomTabs } from "./staff-bottom-tabs";
import { ActiveShiftBar } from "./active-shift-bar";

/**
 * Mobile-only chrome for the staff portal. Renders the sticky top app bar,
 * page content, the persistent clocked-in status bar (when active), and the
 * fixed bottom tab bar. All are hidden at md+ via internal `md:hidden`
 * classes so the existing desktop sidebar layout remains in charge on
 * larger viewports.
 */
export function StaffMobileShell({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <>
      <StaffTopBar title={title} />
      <div
        className="md:hidden min-h-[calc(100dvh-3.5rem)] bg-[#f7f8fb]"
        style={{
          // Reserve room for bottom tabs (~56px) + active shift bar (~52px)
          // + safe-area inset so the active shift bar never overlaps content.
          paddingBottom: "calc(env(safe-area-inset-bottom) + 128px)",
        }}
      >
        {children}
      </div>
      <ActiveShiftBar />
      <StaffBottomTabs />
    </>
  );
}
