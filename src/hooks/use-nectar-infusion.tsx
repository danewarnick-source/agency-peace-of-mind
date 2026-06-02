import { useEntitlements } from "@/hooks/use-entitlements";

/**
 * NECTAR Infusion entitlement — thin wrapper around the shared
 * `useEntitlements` hook. Kept for backward compatibility with existing
 * call sites; new code should call `useEntitlements().hasAddon(...)`
 * directly so the add-on being checked is explicit.
 */
export function useNectarInfusion() {
  const { hasAddon, loading } = useEntitlements();
  return { enabled: hasAddon("nectar_infusion"), loading };
}
