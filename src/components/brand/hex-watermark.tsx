import { Hexagon } from "lucide-react";

/**
 * Faint hexagon watermark for dark surfaces (NECTAR card, section headers).
 * Decorative only — does not receive pointer events or screen-reader focus.
 */
export function HexWatermark({
  size = 140,
  className = "",
  opacity = 0.08,
}: {
  size?: number;
  className?: string;
  opacity?: number;
}) {
  return (
    <Hexagon
      aria-hidden
      strokeWidth={1.25}
      className={`pointer-events-none absolute select-none text-[#f4a93a] ${className}`}
      style={{ width: size, height: size, opacity }}
    />
  );
}
