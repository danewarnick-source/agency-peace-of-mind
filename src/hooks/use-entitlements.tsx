import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyEntitlements } from "@/lib/entitlements.functions";
import { useAuth } from "@/hooks/use-auth";
import type { AddonId, TierId } from "@/lib/hive-tiers";

/**
 * Single source of truth for tier + add-on entitlements in the UI.
 *
 * Drives the visible-but-locked pattern across HIVE: components ask
 * `hasAddon("internal_audit")` and render the AddonLock when it's false.
 * Server functions must independently enforce the same check
 * (see `assertAddon` in `entitlements.server.ts`) — the UI lock and the
 * server check must agree.
 *
 * A HIVE-Executive demo override (`hive.nectar.infusion = "on"` in
 * localStorage) force-enables the NECTAR Infusion add-on regardless of tier,
 * so platform staff can preview NECTAR-accelerated controls end-to-end.
 */
export function useEntitlements() {
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

  const baseAddons = (q.data?.addons ?? []) as AddonId[];
  const addons: AddonId[] = override && !baseAddons.includes("nectar_infusion")
    ? [...baseAddons, "nectar_infusion"]
    : baseAddons;

  const tier = (q.data?.tier ?? "starter") as TierId;

  return {
    tier,
    status: q.data?.status ?? "trial",
    addons,
    loading: q.isLoading,
    hasAddon: (id: AddonId) => addons.includes(id),
  };
}
