import { Hexagon, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Crisp page header for staff app pages — matches the admin-side
 * eyebrow + title + subhead pattern (Plus Jakarta Sans, hex motif,
 * restrained amber accent).
 *
 * Mobile-first: title scales from text-xl → text-2xl at sm.
 */
export function StaffPageHeader({
  eyebrow,
  eyebrowIcon: EyebrowIcon = Hexagon,
  title,
  subtitle,
  actions,
  variant = "default",
}: {
  eyebrow: string;
  eyebrowIcon?: LucideIcon;
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  /** "nectar" tints the eyebrow with the NECTAR violet/amber treatment. */
  variant?: "default" | "nectar";
}) {
  const eyebrowColor =
    variant === "nectar"
      ? "text-[oklch(var(--accent-3))]"
      : "text-accent";

  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0 flex-1">
        <div
          className={`flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] ${eyebrowColor}`}
        >
          <EyebrowIcon className="h-3.5 w-3.5" strokeWidth={2.5} />
          <span className="truncate">{eyebrow}</span>
        </div>
        <h1 className="mt-1.5 text-xl font-semibold leading-tight tracking-tight text-foreground sm:text-2xl">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            {subtitle}
          </p>
        )}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </header>
  );
}
