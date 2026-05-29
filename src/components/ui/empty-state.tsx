import * as React from "react";
import { cn } from "@/lib/utils";

interface EmptyStateProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
}

/**
 * Warm, on-brand empty state. Replaces "no data" gray boxes everywhere.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  ...props
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-surface-warm px-6 py-10 text-center",
        className,
      )}
      {...props}
    >
      {icon && (
        <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-life text-white shadow-soft">
          {icon}
        </span>
      )}
      <div className="max-w-md">
        <h3 className="font-display text-base font-semibold tracking-tight">{title}</h3>
        {description && (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
