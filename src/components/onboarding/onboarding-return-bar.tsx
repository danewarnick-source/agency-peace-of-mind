import { Link, useSearch } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useFirstLoginSetup } from "@/hooks/use-first-login-setup";
import { firstLoginProgressLabel } from "@/lib/first-login-setup";
import { PI_CREAM, PI_NAVY } from "@/lib/pi-landing";

/**
 * Slim bar on destination pages reached from the first-login checklist.
 * Visible while the three setup steps are incomplete, or when ?from=onboarding
 * is in the URL. Hidden once the office is set up.
 */
export function OnboardingReturnBar() {
  const { allComplete, completedCount, countsReady } = useFirstLoginSetup();
  const search = useSearch({ strict: false }) as { from?: string } | undefined;
  const fromOnboarding = search?.from === "onboarding";
  const setupActive = countsReady && !allComplete;

  if (!setupActive && !fromOnboarding) return null;

  return (
    <div
      className="sticky top-0 z-40 -mx-4 mb-3 border-b border-white/10 px-4 py-2.5 text-[#f3efe6] shadow-sm sm:-mx-6 sm:px-6"
      style={{ background: PI_NAVY, color: PI_CREAM }}
    >
      <Link
        to="/dashboard"
        className="flex items-center justify-between gap-3 text-sm"
      >
        <span className="inline-flex items-center gap-2">
          <ArrowLeft className="h-4 w-4 text-[#f3efe6]/70" />
          <span className="font-medium">Back to setup</span>
        </span>
        <span className="text-xs tabular-nums text-[#f3efe6]/70">
          {firstLoginProgressLabel(completedCount)}
        </span>
      </Link>
    </div>
  );
}
