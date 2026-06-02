import { ReactNode } from "react";
import { Lock, Sparkles } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useEntitlements } from "@/hooks/use-entitlements";
import { ADDON_CATALOG, type AddonId } from "@/lib/hive-tiers";

/**
 * Universal visible-but-locked wrapper for any tier-gated add-on.
 *
 * - When the company's tier includes `addon`, renders `children` as-is.
 * - When locked, renders `children` dimmed and non-interactive with an
 *   amber "Upgrade to use" chip and a value-forward upsell popover.
 *
 * Server functions backing the same capability MUST independently call
 * `assertAddon` (see `entitlements.server.ts`) — locking can't be a
 * UI-only concern. Baseline (non-tiered) controls living next to a locked
 * add-on must keep working — NECTAR is the accelerant, not a replacement.
 */
export interface AddonLockProps {
  addon: AddonId;
  /** Display name of the specific surface (e.g. "Internal Audit"). */
  featureName: string;
  /** One-sentence value prop shown inside the upsell popover. */
  benefit: string;
  /** Optional override for the kicker (defaults to the addon's catalog name). */
  kicker?: string;
  children: ReactNode;
  className?: string;
}

export function AddonLock({
  addon,
  featureName,
  benefit,
  kicker,
  children,
  className,
}: AddonLockProps) {
  const { hasAddon } = useEntitlements();
  if (hasAddon(addon)) return <>{children}</>;

  const catalogName = ADDON_CATALOG[addon]?.name ?? "Add-on";
  const tag = kicker ?? catalogName;

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
                  {tag}
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
