import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { Hexagon, Sparkles } from "lucide-react";

/**
 * Restrained hexagon burst for NECTAR celebrations. ~600ms animation,
 * falls back to a static badge under prefers-reduced-motion.
 */
export function HexBurst({ size = 96 }: { size?: number }) {
  const reduced = useReducedMotion();
  if (reduced) {
    return (
      <span
        aria-hidden
        className="relative inline-flex items-center justify-center rounded-full bg-[#0d112b] text-[#f4a93a] ring-2 ring-[#f4a93a]/40"
        style={{ width: size, height: size }}
      >
        <Hexagon className="h-1/2 w-1/2" fill="currentColor" strokeWidth={1.25} />
        <Sparkles className="absolute h-4 w-4 -right-1 -top-1 text-[#f4a93a]" strokeWidth={2.5} />
      </span>
    );
  }

  const petals = Array.from({ length: 8 }, (_, i) => i);
  return (
    <span
      aria-hidden
      className="relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      {petals.map((i) => {
        const angle = (i / petals.length) * 360;
        return (
          <span
            key={i}
            className="absolute inline-flex items-center justify-center text-[#f4a93a]"
            style={{
              animation: `hex-burst 700ms cubic-bezier(.2,.7,.3,1) forwards`,
              animationDelay: `${i * 22}ms`,
              transform: `rotate(${angle}deg) translateY(-6px)`,
            }}
          >
            <Hexagon className="h-3 w-3" fill="currentColor" strokeWidth={1.25} />
          </span>
        );
      })}
      <span className="relative inline-flex items-center justify-center rounded-full bg-[#0d112b] text-[#f4a93a] ring-2 ring-[#f4a93a]/60 shadow-glow"
        style={{ width: size * 0.65, height: size * 0.65 }}
      >
        <Hexagon className="h-1/2 w-1/2" fill="currentColor" strokeWidth={1.25} />
        <Sparkles className="absolute h-4 w-4 -right-1 -top-1 text-[#f4a93a]" strokeWidth={2.5} />
      </span>
      <style>{`@keyframes hex-burst {
        0%   { opacity: 0; transform: rotate(var(--a,0)) translateY(0) scale(.4); }
        60%  { opacity: 1; }
        100% { opacity: 0; transform: rotate(var(--a,0)) translateY(-${size * 0.55}px) scale(1.05); }
      }`}</style>
    </span>
  );
}
