import { useCallback, type ReactNode } from "react";
import { StaffTopBar } from "./staff-top-bar";
import { StaffBottomTabs } from "./staff-bottom-tabs";
import { ActiveShiftBar } from "./active-shift-bar";
import { CapThresholdModal } from "./cap-threshold-modal";
import { MobileShellProvider, useMobileShellContainer } from "./mobile-shell-context";

/**
 * Mobile-only chrome for the staff portal. The shell is a fixed-viewport
 * `position: relative; overflow: hidden` container that acts as the
 * positioning context for every overlay (bottom sheets, confirm dialogs,
 * paperwork pop-ups). All overlays mount into this subtree via portal so
 * they stay bounded by the screen.
 */
export function StaffMobileShell({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <MobileShellProvider>
      <ShellInner title={title}>{children}</ShellInner>
    </MobileShellProvider>
  );
}

function ShellInner({ title, children }: { title: string; children: ReactNode }) {
  const { setContainer } = useMobileShellContainer();
  // Stable callback ref — only updates on mount/unmount.
  const ref = useCallback(
    (el: HTMLDivElement | null) => setContainer(el),
    [setContainer],
  );
  return (
    <div
      ref={ref}
      className="md:hidden fixed inset-0 z-30 flex flex-col overflow-hidden bg-[#f7f8fb]"
    >
      <StaffTopBar title={title} framed />
      <main className="flex-1 overflow-y-auto overscroll-contain px-3 py-4">
        {children}
      </main>
      <ActiveShiftBar framed />
      <StaffBottomTabs framed />
      <CapThresholdModal />
    </div>
  );
}
