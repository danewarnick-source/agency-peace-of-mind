import { useCallback, useEffect, useState } from "react";

// Free-form so it accepts both built-in (Training/Admin/Travel/Meeting/Other)
// and any custom categories an admin adds in Time & Pay settings.
export type GeneralCategory = string;

export type GeneralShift = {
  category: GeneralCategory;
  note: string;
  start_iso: string;
};

export type CompletedGeneralShift = GeneralShift & {
  end_iso: string;
  hours: number;
};

const KEY = "hive-general-shift";
const LOG_KEY = "hive-general-shifts-log";
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

function readLog(): CompletedGeneralShift[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LOG_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as CompletedGeneralShift[]) : [];
  } catch {
    return [];
  }
}

function writeLog(entries: CompletedGeneralShift[]) {
  // Trim to last 365 days to keep storage small.
  const cutoff = Date.now() - 365 * 24 * 60 * 60 * 1000;
  const kept = entries.filter((e) => new Date(e.end_iso).getTime() >= cutoff);
  window.localStorage.setItem(LOG_KEY, JSON.stringify(kept));
}

/**
 * Tracks an active non-client (general) work shift in localStorage so the
 * persistent green clocked-in bar and the General Time Clock UI share one
 * source. Distinct from EVV client shifts — those live in `evv_timesheets`
 * via `useActiveShift`.
 *
 * Completed shifts are appended to a per-device log so the NECTAR pay-period
 * summary can include Training/Admin/Travel/Meeting time alongside client
 * services.
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

  const stop = useCallback((opts?: { note?: string }) => {
    const current = read();
    if (current) {
      const end_iso = new Date().toISOString();
      const hours = Math.max(
        0,
        (new Date(end_iso).getTime() - new Date(current.start_iso).getTime()) /
          3_600_000,
      );
      const finalNote = opts?.note?.trim() ?? current.note;
      const log = readLog();
      log.push({ ...current, note: finalNote, end_iso, hours });
      writeLog(log);
    }
    window.localStorage.removeItem(KEY);
    window.dispatchEvent(new Event(EVT));
    setShift(null);
  }, []);

  const updateNote = useCallback((note: string) => {
    const current = read();
    if (!current) return;
    const next = { ...current, note };
    window.localStorage.setItem(KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(EVT));
    setShift(next);
  }, []);


  return { shift, start, stop, updateNote };
}


/**
 * Read-only access to the persisted completed-general-shift log. Re-reads
 * whenever a general shift starts/stops so consumers (pay-period summary)
 * stay current.
 */
export function useGeneralShiftLog(): CompletedGeneralShift[] {
  const [log, setLog] = useState<CompletedGeneralShift[]>([]);
  useEffect(() => {
    setLog(readLog());
    const h = () => setLog(readLog());
    window.addEventListener(EVT, h);
    window.addEventListener("storage", h);
    return () => {
      window.removeEventListener(EVT, h);
      window.removeEventListener("storage", h);
    };
  }, []);
  return log;
}
