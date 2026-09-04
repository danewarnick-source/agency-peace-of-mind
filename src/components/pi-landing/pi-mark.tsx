import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { PI_PRODUCT_NAME, PI_PRODUCT_SHORT, PI_WORDMARK } from "@/lib/pi-landing";

/**
 * Cream straight-bar π. Equal-length verticals and a flat top bar
 * that extends slightly past both legs. Not a squiggly mathematical pi.
 * Not a honeycomb. Never pair this mark with a NECTAR wordmark in chrome.
 */
export function PiMark({
  className,
  title,
}: {
  className?: string;
  title?: string;
}) {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
      className={cn("text-current", className)}
    >
      {title ? <title>{title}</title> : null}
      <path d="M6 10H42" stroke="currentColor" strokeWidth="2.2" strokeLinecap="square" />
      <path d="M15 10V40" stroke="currentColor" strokeWidth="2.2" strokeLinecap="square" />
      <path d="M33 10V40" stroke="currentColor" strokeWidth="2.2" strokeLinecap="square" />
    </svg>
  );
}

export function PiWordmark({
  className,
  compact = false,
  short = false,
  to,
  tone = "chrome",
  markClassName,
  wordClassName,
}: {
  className?: string;
  compact?: boolean;
  /** Compact chrome: π + PI. Full marketing: π + PROVIDER INTERFACE. */
  short?: boolean;
  to?: "/";
  /** chrome = cream on dusk; canvas = cream on dusk public pages. */
  tone?: "chrome" | "canvas";
  markClassName?: string;
  wordClassName?: string;
}) {
  const label = short ? PI_PRODUCT_SHORT : PI_WORDMARK;
  const inner = (
    <span
      className={cn(
        "inline-flex items-center gap-3",
        tone === "canvas" ? "text-[#f3efe6]" : "text-[#f3efe6]",
        className,
      )}
    >
      <PiMark
        className={cn(compact || short ? "h-7 w-7" : "h-8 w-8", "shrink-0", markClassName)}
        title={PI_PRODUCT_NAME}
      />
      <span
        className={cn(
          "font-sans font-medium uppercase tracking-[0.22em] text-[#f3efe6]",
          compact || short ? "text-[11px]" : "text-[12px] sm:text-[13px]",
          wordClassName,
        )}
      >
        {label}
      </span>
    </span>
  );

  if (to) {
    return (
      <Link to={to} className="inline-flex items-center" aria-label={PI_PRODUCT_NAME}>
        {inner}
      </Link>
    );
  }

  return inner;
}
