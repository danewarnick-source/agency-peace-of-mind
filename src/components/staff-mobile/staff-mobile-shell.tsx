import { useCallback, useLayoutEffect, useRef, type ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";
import { StaffTopBar } from "./staff-top-bar";
import { StaffBottomTabs } from "./staff-bottom-tabs";
import { ActiveShiftBar } from "./active-shift-bar";
import { CapThresholdModal } from "./cap-threshold-modal";
import { MobileShellProvider, useMobileShellContainer } from "./mobile-shell-context";
import { useActiveShiftBarVisible } from "@/hooks/use-active-shift-bar";
import { resetStaffPhoneScroll } from "@/lib/staff-phone-chrome";

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
  const mainRef = useRef<HTMLElement>(null);
  // Stable callback ref — only updates on mount/unmount.
  const ref = useCallback(
    (el: HTMLDivElement | null) => setContainer(el),
    [setContainer],
  );
  // Tab switches reuse this <main>. Instant top — no mid-page land, no library.
  useLayoutEffect(() => {
    resetStaffPhoneScroll(mainRef.current);
  }, [pathname]);
  return (
    <div
      ref={ref}
      className="md:hidden fixed left-0 top-0 z-30 flex h-[100dvh] w-[100dvw] max-w-[100dvw] flex-col overflow-hidden bg-background"
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
        ref={mainRef}
        data-staff-phone-scroller
        className={
          isAskNectar
            ? "flex-1 overflow-hidden overscroll-none"
            : `flex-1 overflow-y-auto overscroll-contain px-4 py-5 ${
                barVisible
                  ? "pb-[calc(1.25rem+7rem+env(safe-area-inset-bottom,0px))]"
                  : "pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))]"
              }`
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
