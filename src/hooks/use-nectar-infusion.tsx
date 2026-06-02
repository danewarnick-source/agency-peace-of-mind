import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyEntitlements } from "@/lib/entitlements.functions";
import { useAuth } from "@/hooks/use-auth";

/**
 * NECTAR Infusion entitlement.
 *
 * Source of truth: the current org's subscription tier (set by HIVE Executive
 * in Plans & Billing). A local override (`hive.nectar.infusion = "on"`) lets
 * HIVE Executives demo gating end-to-end regardless of tier.
 */
export function useNectarInfusion() {
  const { session } = useAuth();
  const fn = useServerFn(getMyEntitlements);

  const q = useQuery({
    queryKey: ["my-entitlements", session?.user?.id ?? "anon"],
    enabled: !!session?.user?.id,
    queryFn: () => fn(),
    staleTime: 60_000,
  });

  const [override, setOverride] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("hive.nectar.infusion") === "on";
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onStorage = (e: StorageEvent) => {
      if (e.key === "hive.nectar.infusion") setOverride(e.newValue === "on");
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const fromTier = !!q.data?.addons?.includes("nectar_infusion");
  return { enabled: override || fromTier };
}
