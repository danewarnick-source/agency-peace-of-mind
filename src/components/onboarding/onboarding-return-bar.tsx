import { Link, useSearch } from "@tanstack/react-router";
import { ArrowLeft, Sparkles } from "lucide-react";
import { useOnboardingProgress } from "@/hooks/use-onboarding-progress";

/**
 * Persistent slim bar shown on every destination page reached from the
 * NECTAR onboarding flow. Visible when the org still has incomplete
 * onboarding steps OR when ?from=onboarding is in the URL. Hidden once
 * onboarding is fully complete or dismissed.
 */
export function OnboardingReturnBar() {
  const { onboardingActive, completedCount, totalSteps } = useOnboardingProgress();
  // Reading search this loosely lets the bar render on any route without
  // needing a per-route validateSearch.
  const search = useSearch({ strict: false }) as { from?: string } | undefined;
  const fromOnboarding = search?.from === "onboarding";

  if (!onboardingActive && !fromOnboarding) return null;

  return (
    <div className="sticky top-0 z-40 -mx-4 mb-3 border-b border-amber-300/40 bg-[#0b1733]/95 px-4 py-2 text-amber-50 shadow-sm backdrop-blur sm:-mx-6 sm:px-6">
      <Link
        to="/dashboard"
        search={{ welcome: true } as never}
        className="flex items-center justify-between gap-3 text-sm"
      >
        <span className="inline-flex items-center gap-2">
          <ArrowLeft className="h-4 w-4 text-[color:var(--amber-400,#f4a93a)]" />
          <span className="font-medium">Back to setup</span>
        </span>
        <span className="inline-flex items-center gap-2 text-xs text-amber-100/90">
          <Sparkles className="h-3.5 w-3.5 text-[color:var(--amber-400,#f4a93a)]" />
          <span className="tabular-nums">
            {completedCount} of {totalSteps} steps complete
          </span>
        </span>
      </Link>
    </div>
  );
}
