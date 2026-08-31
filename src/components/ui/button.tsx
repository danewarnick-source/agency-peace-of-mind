import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-semibold cursor-pointer transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg]:size-[18px] [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-[var(--hive-gold)] text-[var(--hive-on-gold)] hover:bg-[var(--hive-gold-hover)]",
        cta:
          "bg-[var(--hive-gold)] text-[var(--hive-on-gold)] hover:bg-[var(--hive-gold-hover)]",
        secondary:
          "bg-[var(--hive-surface)] text-[var(--hive-text)] border border-[var(--hive-border)] hover:bg-[var(--hive-canvas)]",
        ghostOnDark:
          "bg-transparent text-[var(--hive-chrome-text)] border border-[color-mix(in_srgb,white_22%,transparent)] hover:bg-[color-mix(in_srgb,white_10%,transparent)]",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline:
          "border border-[var(--hive-border)] bg-[var(--hive-surface)] text-[var(--hive-text)] hover:bg-[var(--hive-canvas)]",
        ghost: "text-[var(--hive-text)] hover:bg-[#eef1f4] hover:text-[var(--hive-text)]",
        link: "text-[var(--hive-text)] underline-offset-4 hover:underline",
        life: "bg-[var(--hive-gold)] text-[var(--hive-on-gold)] hover:bg-[var(--hive-gold-hover)]",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3 text-xs",
        lg: "h-11 rounded-lg px-5 text-[15px]",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
