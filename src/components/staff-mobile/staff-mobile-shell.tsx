import { useCallback, type ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";
import { StaffTopBar } from "./staff-top-bar";
import { StaffBottomTabs } from "./staff-bottom-tabs";
import { ActiveShiftBar } from "./active-shift-bar";
import { CapThresholdModal } from "./cap-threshold-modal";
import { MobileShellProvider, useMobileShellContainer } from "./mobile-shell-context";
import { useActiveShiftBarVisible } from "@/hooks/use-active-shift-bar";

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
  const barVisible = useActiveShiftBarVisible();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isAskNectar = pathname.startsWith("/dashboard/ask-nectar");
  // Stable callback ref — only updates on mount/unmount.
  const ref = useCallback(
    (el: HTMLDivElement | null) => setContainer(el),
    [setContainer],
  );
  return (
    <div
      ref={ref}
      className="md:hidden fixed left-0 top-0 z-30 h-[100dvh] w-[100dvw] flex flex-col overflow-hidden bg-background"
    >
      <StaffTopBar title={title} framed />
      {/*
        Global layout rule: when the "Clocked in" bar is visible it sits
        absolute above the bottom tabs (~52px tall). Add equivalent bottom
        padding to the scroll area so page content (Save buttons, signature
        fields, chat composers) never hides behind it. When the bar is gone,
        the space is reclaimed automatically.
      */}
      <main
        className={
          isAskNectar
            ? "flex-1 overflow-hidden overscroll-none"
            : `flex-1 overflow-y-auto overscroll-contain px-4 py-5 ${barVisible ? "pb-[calc(1.25rem+56px)]" : ""}`
        }
      >
        {children}
      </main>
      <ActiveShiftBar framed />
      <StaffBottomTabs framed />
      <CapThresholdModal />
    </div>
  );
}
