import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

/** Gold hex outline. Never fill this as a honeycomb or put a letter H inside. */
export function HiveMark({
  className,
  title,
}: {
  className?: string;
  title?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
      className={cn("text-[var(--hive-gold)]", className)}
    >
      {title ? <title>{title}</title> : null}
      <polygon
        points="12,2.2 21.2,7.5 21.2,16.5 12,21.8 2.8,16.5 2.8,7.5"
        stroke="currentColor"
        strokeWidth="1.55"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function HiveWordmark({
  className,
  markClassName,
  wordClassName,
  to,
  tone = "chrome",
}: {
  className?: string;
  markClassName?: string;
  wordClassName?: string;
  to?: "/";
  /** chrome = cream word on steel sidebar; canvas = navy-steel word on light pages. */
  tone?: "chrome" | "canvas";
}) {
  const inner = (
    <>
      <HiveMark className={cn("h-8 w-8 shrink-0", markClassName)} />
      <span
        className={cn(
          "font-display text-[1.45rem] font-semibold tracking-tight",
          tone === "chrome" ? "text-[var(--hive-chrome-text)]" : "text-[var(--hive-text)]",
          wordClassName,
        )}
      >
        Hive
      </span>
    </>
  );

  if (to) {
    return (
      <Link to={to} className={cn("inline-flex items-center gap-2.5", className)}>
        {inner}
      </Link>
    );
  }

  return <span className={cn("inline-flex items-center gap-2.5", className)}>{inner}</span>;
}
