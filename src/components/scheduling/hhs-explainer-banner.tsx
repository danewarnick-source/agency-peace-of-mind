import { X, Home } from "lucide-react";
import { useUiDismissal } from "@/hooks/use-ui-dismissal";
import { HHS_EXPLAINER_BANNER, HHS_EXPLAINER_PREF_KEY } from "@/lib/scheduling/hhs-visit";

/**
 * One-time, per-user explainer shown the first time someone encounters a host
 * home (a host-home row on the scheduler, or an assigned HHS visit on the
 * agenda). Dismissal persists in the DB (localStorage-free) and is shared
 * across every surface, so it shows once per user and stays gone.
 *
 * Render this only when host-home context is actually present; it self-hides
 * once dismissed or while the dismissal state is still loading.
 */
export function HhsExplainerBanner({ className }: { className?: string }) {
  const { ready, dismissed, dismiss } = useUiDismissal(HHS_EXPLAINER_PREF_KEY);
  if (!ready || dismissed) return null;

  return (
    <div
      className={`flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-amber-900 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-100 ${className ?? ""}`}
      role="note"
    >
      <Home className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold">How host homes (HHS) work</p>
        <p className="mt-0.5 text-xs leading-snug">{HHS_EXPLAINER_BANNER}</p>
      </div>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={dismiss}
        className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-amber-700 hover:bg-amber-100 dark:hover:bg-amber-900/40"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
