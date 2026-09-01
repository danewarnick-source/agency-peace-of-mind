import { cn } from "@/lib/utils";
import { PI_WORDMARK } from "@/lib/pi-landing";

/**
 * Cream straight-bar π. Left leg shorter than the right.
 * Not a squiggly mathematical pi. Not gold.
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
      className={cn("text-[#f3efe6]", className)}
    >
      {title ? <title>{title}</title> : null}
      <path d="M6 10H42" stroke="currentColor" strokeWidth="2.2" strokeLinecap="square" />
      <path d="M15 10V28" stroke="currentColor" strokeWidth="2.2" strokeLinecap="square" />
      <path d="M33 10V40" stroke="currentColor" strokeWidth="2.2" strokeLinecap="square" />
    </svg>
  );
}

export function PiWordmark({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  return (
    <span className={cn("inline-flex items-center gap-3 text-[#f3efe6]", className)}>
      <PiMark className={compact ? "h-7 w-7" : "h-8 w-8"} title={PI_WORDMARK} />
      <span
        className={cn(
          "font-sans font-medium uppercase tracking-[0.22em] text-[#f3efe6]",
          compact ? "text-[11px]" : "text-[12px] sm:text-[13px]",
        )}
      >
        {PI_WORDMARK}
      </span>
    </span>
  );
}
