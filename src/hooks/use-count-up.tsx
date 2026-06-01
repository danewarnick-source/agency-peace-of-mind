import { useEffect, useRef, useState } from "react";

/**
 * Animates a numeric value from 0 (or a prior `to`) up to the current `to`
 * over `durationMs` using ease-out cubic. Useful for the NECTAR hours/pay
 * count-up on first paint and whenever the figure changes.
 */
export function useCountUp(to: number, durationMs = 900) {
  const [value, setValue] = useState(0);
  const fromRef = useRef(0);
  const startRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isFinite(to)) {
      setValue(0);
      return;
    }
    fromRef.current = value;
    startRef.current = null;
    const tick = (ts: number) => {
      if (startRef.current === null) startRef.current = ts;
      const t = Math.min(1, (ts - startRef.current) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(fromRef.current + (to - fromRef.current) * eased);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [to, durationMs]);

  return value;
}
