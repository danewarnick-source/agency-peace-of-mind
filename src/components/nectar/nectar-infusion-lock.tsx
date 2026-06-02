import { ReactNode } from "react";
import { AddonLock } from "@/components/nectar/addon-lock";

/**
 * Thin compatibility wrapper around the universal AddonLock for the
 * NECTAR Infusion add-on. Prefer `AddonLock` directly for new code so the
 * `addon` is explicit.
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
  return (
    <AddonLock
      addon="nectar_infusion"
      featureName={featureName}
      benefit={benefit}
      kicker="NECTAR Infusion"
      className={className}
    >
      {children}
    </AddonLock>
  );
}
