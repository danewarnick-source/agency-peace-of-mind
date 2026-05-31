/**
 * Faint hexagon-outline pattern + soft amber glow.
 * Use ONLY on dark hero / spotlight bands — never behind body content.
 */
export function HexBackdrop({
  glow = true,
  opacity = 0.05,
}: { glow?: boolean; opacity?: number }) {
  return (
    <>
      <svg
        aria-hidden
        className="pointer-events-none absolute inset-0 h-full w-full"
        style={{ opacity }}
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <pattern id="hex-bg" width="80" height="92" patternUnits="userSpaceOnUse" patternTransform="scale(1.4)">
            <polygon
              points="40,2 78,24 78,68 40,90 2,68 2,24"
              fill="none"
              stroke="#ffffff"
              strokeWidth="1"
            />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#hex-bg)" />
      </svg>
      {glow && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-[-20%] h-[60%]"
          style={{
            background:
              "radial-gradient(900px 420px at 75% 80%, rgba(244,169,58,0.22), transparent 60%)",
          }}
        />
      )}
    </>
  );
}
