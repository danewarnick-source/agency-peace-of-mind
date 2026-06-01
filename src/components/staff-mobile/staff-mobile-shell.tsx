import type { ReactNode } from "react";
import { StaffTopBar } from "./staff-top-bar";
import { StaffBottomTabs } from "./staff-bottom-tabs";

/**
 * Mobile-only chrome for the staff portal. Renders the sticky top app bar,
 * page content, and the fixed bottom tab bar. All three are hidden at md+
 * via internal `md:hidden` classes so the existing desktop sidebar layout
 * remains in charge on larger viewports.
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
        className="md:hidden"
        style={{
          paddingBottom: "calc(env(safe-area-inset-bottom) + 72px)",
        }}
      >
        {children}
      </div>
      <StaffBottomTabs />
    </>
  );
}
