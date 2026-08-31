import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium leading-none tracking-tight transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-[var(--hive-gold-soft)] text-[var(--hive-on-gold)]",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive:
          "border-transparent bg-[var(--hive-danger-soft)] text-[var(--hive-danger-fg)]",
        outline: "border-border text-foreground bg-card",
        success: "border-transparent bg-[var(--hive-ok-soft)] text-[var(--hive-ok-fg)]",
        warning: "border-transparent bg-[var(--hive-gold-soft)] text-[var(--hive-on-gold)]",
        accent: "border-transparent bg-[var(--hive-gold-soft)] text-[var(--hive-on-gold)]",
        life: "border-transparent bg-[var(--hive-gold-soft)] text-[var(--hive-on-gold)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
