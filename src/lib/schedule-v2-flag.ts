/**
 * Schedule V2 feature flag.
 *
 * Default: OFF. The legacy /dashboard/scheduling page stays primary until
 * recurring-shift creation is ported into the new editor (next step).
 *
 * Resolution order:
 *   1. localStorage override `hive.scheduleV2` = "on" | "off" (per-user, persists)
 *   2. import.meta.env.VITE_SCHEDULE_V2 === "true"
 *   3. default OFF
 *
 * Rollback: clear localStorage key or set VITE_SCHEDULE_V2=false.
 */
import { useEffect, useState } from "react";

const LS_KEY = "hive.scheduleV2";

export function readScheduleV2Flag(): boolean {
  if (typeof window === "undefined") {
    // SSR / prerender — honor env only.
    return import.meta.env.VITE_SCHEDULE_V2 === "true";
  }
  try {
    const ls = window.localStorage.getItem(LS_KEY);
    if (ls === "on") return true;
    if (ls === "off") return false;
  } catch {/* ignore */}
  return import.meta.env.VITE_SCHEDULE_V2 === "true";
}

export function setScheduleV2Flag(v: boolean | null) {
  if (typeof window === "undefined") return;
  try {
    if (v === null) window.localStorage.removeItem(LS_KEY);
    else window.localStorage.setItem(LS_KEY, v ? "on" : "off");
    window.dispatchEvent(new Event("hive-schedule-v2-change"));
  } catch {/* ignore */}
}

/** Client-side hook. Returns false on the very first SSR/hydration pass,
 *  then the real value after mount — safe for redirect gating. */
export function useScheduleV2(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    setOn(readScheduleV2Flag());
    const h = () => setOn(readScheduleV2Flag());
    window.addEventListener("hive-schedule-v2-change", h);
    window.addEventListener("storage", h);
    return () => {
      window.removeEventListener("hive-schedule-v2-change", h);
      window.removeEventListener("storage", h);
    };
  }, []);
  return on;
}
