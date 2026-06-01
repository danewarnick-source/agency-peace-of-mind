import { useEffect, useState } from "react";

/**
 * NECTAR Infusion entitlement. NECTAR add-ons (Infusion in pulls, Guided Mode,
 * plain-language answers, etc.) are a paid upgrade and ship visible-but-locked
 * for tiers that don't include them.
 *
 * For now we read a local override (`hive.nectar.infusion = "on"`) so the
 * gating UI can be demoed end-to-end before billing tiers wire up. Replace
 * with a real entitlement read when the billing tiering lands.
 */
export function useNectarInfusion() {
  const [enabled, setEnabled] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("hive.nectar.infusion") === "on";
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onStorage = (e: StorageEvent) => {
      if (e.key === "hive.nectar.infusion") {
        setEnabled(e.newValue === "on");
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return { enabled };
}
