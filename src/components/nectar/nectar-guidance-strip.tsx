import { Hexagon, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

/**
 * Subtle frosted guidance strip used at the top of any tab where NECTAR
 * surfaces "what this is for / what needs attention" copy. Amber is reserved
 * for actionable highlights (e.g. counts that demand review).
 */
export function NectarGuidanceStrip({
  title,
  message,
  highlight,
  actionLabel,
  onAction,
  className,
}: {
  title: string;
  message: ReactNode;
  /** Short amber-accented call-out (e.g. "3 unassigned shifts"). */
  highlight?: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative flex flex-col gap-2 rounded-xl border border-border/60 bg-card/40 px-4 py-3 backdrop-blur-md supports-[backdrop-filter]:bg-card/30",
        "sm:flex-row sm:items-center sm:gap-4",
        className,
      )}
    >
      <div className="flex shrink-0 items-center gap-2">
        <span className="relative grid h-9 w-9 place-items-center">
          <Hexagon
            className="absolute inset-0 h-9 w-9 text-primary/30"
            strokeWidth={1.25}
          />
          <Sparkles className="relative h-4 w-4 text-primary" />
        </span>
        <div className="flex flex-col leading-tight">
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            NECTAR
          </span>
          <span className="text-sm font-semibold text-foreground">{title}</span>
        </div>
      </div>

      <div className="min-w-0 flex-1 text-xs text-muted-foreground sm:text-[13px]">
        {message}
      </div>

      {highlight && (
        <span
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-[11px] font-semibold text-amber-700 dark:text-amber-300"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
          {highlight}
        </span>
      )}

      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="inline-flex min-h-[36px] shrink-0 items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-700 transition hover:bg-amber-500/20 dark:text-amber-300"
        >
          <Sparkles className="h-3.5 w-3.5" />
          {actionLabel}
        </button>
      )}
    </div>
  );
}
