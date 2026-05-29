import * as React from "react";
import { cn } from "@/lib/utils";

interface InfoTileProps extends React.HTMLAttributes<HTMLDivElement> {
  label: React.ReactNode;
  value: React.ReactNode;
  sublabel?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: "default" | "success" | "warning" | "danger" | "life";
  trend?: React.ReactNode;
}

const toneStyles: Record<NonNullable<InfoTileProps["tone"]>, { iconBg: string; ring: string }> = {
  default: { iconBg: "bg-accent/12 text-accent", ring: "" },
  success: { iconBg: "bg-success/15 text-success", ring: "" },
  warning: { iconBg: "bg-warning/15 text-warning-foreground", ring: "" },
  danger:  { iconBg: "bg-destructive/12 text-destructive", ring: "" },
  life:    { iconBg: "bg-gradient-life text-white shadow-soft", ring: "ring-life" },
};

/**
 * Canonical metric/stat "bubble" used across dashboards & workspace.
 * Always rounded-2xl, soft border, warm shadow — drop-in for every tab.
 */
export function InfoTile({
  label,
  value,
  sublabel,
  icon,
  tone = "default",
  trend,
  className,
  ...props
}: InfoTileProps) {
  const t = toneStyles[tone];
  return (
    <div
      className={cn(
        "group relative flex items-start gap-3 rounded-2xl border border-border bg-card p-4 shadow-card transition-all duration-150 hover:shadow-glow hover:-translate-y-px",
        t.ring,
        className,
      )}
      {...props}
    >
      {icon && (
        <span
          className={cn(
            "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
            t.iconBg,
          )}
          aria-hidden="true"
        >
          {icon}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <p className="mt-0.5 font-display text-2xl font-semibold tracking-tight tabular-nums">
          {value}
        </p>
        {sublabel && <p className="mt-0.5 text-xs text-muted-foreground">{sublabel}</p>}
      </div>
      {trend && <div className="shrink-0 text-xs font-medium">{trend}</div>}
    </div>
  );
}
