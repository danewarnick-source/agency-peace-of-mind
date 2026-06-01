import { ReactNode } from "react";
import { Lock, Sparkles } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useNectarInfusion } from "@/hooks/use-nectar-infusion";

/**
 * Reusable visible-but-locked wrapper for any NECTAR add-on / infusion.
 * - When the tenant has NECTAR Infusion entitlement, renders `children` as-is.
 * - When locked, renders `children` dimmed and non-interactive, with an
 *   amber "Upgrade" chip; clicking opens a value-forward upsell popover.
 *
 * Use anywhere a NECTAR-accelerated control lives next to a manual baseline
 * (the manual baseline must keep working on its own — NECTAR is the
 * accelerant, never a dependency).
 */
export interface NectarInfusionLockProps {
  featureName: string;
  benefit: string;
  children: ReactNode;
  className?: string;
}

export function NectarInfusionLock({
  featureName,
  benefit,
  children,
  className,
}: NectarInfusionLockProps) {
  const { enabled } = useNectarInfusion();

  if (enabled) return <>{children}</>;

  return (
    <div className={cn("relative", className)}>
      <div
        aria-hidden
        className="pointer-events-none select-none opacity-55 grayscale-[0.2]"
      >
        {children}
      </div>

      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="absolute inset-0 z-10 flex items-center justify-end gap-2 rounded-md pr-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--amber-500)]"
            aria-label={`${featureName} — upgrade to use`}
          >
            <span className="inline-flex items-center gap-1 rounded-full border border-[color:var(--amber-400)] bg-[color:var(--amber-50)]/95 px-2.5 py-1 text-[11px] font-semibold text-[color:var(--navy-900)] shadow-sm backdrop-blur">
              <Lock className="h-3 w-3 text-[color:var(--amber-600)]" />
              Upgrade to use
            </span>
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          className="w-80 border-[color:var(--border-light)] bg-white/85 p-0 shadow-xl backdrop-blur-md"
        >
          <div className="rounded-t-md bg-gradient-to-br from-[color:var(--amber-50)] to-white p-4">
            <div className="flex items-center gap-2">
              <span
                className="inline-flex h-7 w-7 items-center justify-center text-[color:var(--amber-600)]"
                style={{
                  clipPath:
                    "polygon(50% 0, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%)",
                  background:
                    "linear-gradient(135deg, var(--amber-100), var(--amber-200))",
                }}
              >
                <Sparkles className="h-3.5 w-3.5" />
              </span>
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-[color:var(--amber-700)]">
                  NECTAR Infusion
                </div>
                <div className="text-sm font-semibold text-[color:var(--navy-900)]">
                  {featureName}
                </div>
              </div>
            </div>
          </div>
          <div className="space-y-3 p-4 pt-3">
            <p className="text-sm leading-relaxed text-foreground">{benefit}</p>
            <p className="text-xs text-muted-foreground">
              The manual controls keep working on every plan — NECTAR is the
              accelerant, not a replacement.
            </p>
            <div className="flex items-center justify-end gap-2 pt-1">
              <Button size="sm" variant="cta" asChild>
                <a href="/pricing">See plans</a>
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
