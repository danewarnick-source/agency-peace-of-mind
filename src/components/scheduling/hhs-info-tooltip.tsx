import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { HHS_VISIT_TOOLTIP } from "@/lib/scheduling/hhs-visit";
import { cn } from "@/lib/utils";

/**
 * The ⓘ affordance shown on every HHS visit card and in the creation flow's
 * code step. Explains that the host family provides daily care and never
 * clocks in — the staff member is here for a timed support/respite visit.
 */
export function HhsInfoTooltip({ className }: { className?: string }) {
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label="What is an HHS visit?"
            onClick={(e) => { e.stopPropagation(); e.preventDefault(); }}
            className={cn(
              "inline-grid h-5 w-5 shrink-0 place-items-center rounded-full text-current opacity-70 hover:opacity-100",
              className,
            )}
          >
            <Info className="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs text-xs leading-snug">
          {HHS_VISIT_TOOLTIP}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
