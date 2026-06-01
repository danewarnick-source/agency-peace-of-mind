import { useCallback, useEffect, useState } from "react";

// Free-form so it accepts both built-in (Training/Admin/Travel/Meeting/Other)
// and any custom categories an admin adds in Time & Pay settings.
export type GeneralCategory = string;

export type GeneralShift = {
  category: GeneralCategory;
  note: string;
  start_iso: string;
};

const KEY = "hive-general-shift";
const EVT = "hive-general-shift-change";

function read(): GeneralShift | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as GeneralShift;
  } catch {
    return null;
  }
}

/**
 * Tracks an active non-client (general) work shift in localStorage so the
 * persistent green clocked-in bar and the General Time Clock UI share one
 * source. Distinct from EVV client shifts — those live in `evv_timesheets`
 * via `useActiveShift`.
 */
export function useGeneralShift() {
  const [shift, setShift] = useState<GeneralShift | null>(null);

  useEffect(() => {
    setShift(read());
    const h = () => setShift(read());
    window.addEventListener(EVT, h);
    window.addEventListener("storage", h);
    return () => {
      window.removeEventListener(EVT, h);
      window.removeEventListener("storage", h);
    };
  }, []);

  const start = useCallback((s: Omit<GeneralShift, "start_iso">) => {
    const next: GeneralShift = { ...s, start_iso: new Date().toISOString() };
    window.localStorage.setItem(KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(EVT));
    setShift(next);
  }, []);

  const stop = useCallback(() => {
    window.localStorage.removeItem(KEY);
    window.dispatchEvent(new Event(EVT));
    setShift(null);
  }, []);

  return { shift, start, stop };
}
