import * as React from "react";
import { cn } from "@/lib/utils";

interface SectionHeaderProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  badge?: React.ReactNode;
  actions?: React.ReactNode;
  tone?: "default" | "life";
}

/**
 * Canonical section header used across staff & admin views.
 * Consistent icon chip, title, optional badge & actions row.
 */
export function SectionHeader({
  icon,
  title,
  description,
  badge,
  actions,
  tone = "default",
  className,
  ...props
}: SectionHeaderProps) {
  return (
    <div
      className={cn(
        "mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between",
        className,
      )}
      {...props}
    >
      <div className="flex items-start gap-3 min-w-0">
        {icon && (
          <span
            className={cn(
              "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-accent-foreground",
              tone === "life"
                ? "bg-gradient-life text-white shadow-soft"
                : "bg-accent/12 text-accent",
            )}
            aria-hidden="true"
          >
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="font-display text-lg font-semibold tracking-tight truncate">
              {title}
            </h2>
            {badge}
          </div>
          {description && (
            <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
          )}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}
