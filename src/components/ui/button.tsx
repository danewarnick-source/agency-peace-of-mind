import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-semibold cursor-pointer transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg]:size-[18px] [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // Primary CTA across the site: amber gradient + dark navy text
        default:
          "bg-[image:var(--gradient-amber)] text-[color:var(--navy-900)] shadow-[0_8px_20px_-10px_rgba(244,169,58,0.65)] hover:brightness-[1.04] hover:shadow-[0_10px_22px_-10px_rgba(244,169,58,0.75)]",
        cta:
          "bg-[image:var(--gradient-amber)] text-[color:var(--navy-900)] shadow-[0_8px_20px_-10px_rgba(244,169,58,0.65)] hover:brightness-[1.04] hover:shadow-[0_10px_22px_-10px_rgba(244,169,58,0.75)]",
        // Secondary on light surfaces: navy outline
        secondary:
          "bg-white text-[color:var(--navy-900)] border border-[color:var(--border-light)] hover:bg-[color:var(--surface-2)] hover:border-[color:var(--navy-700)]",
        // White / ghost variant for dark hero sections
        ghostOnDark:
          "bg-white/[0.04] text-white border border-white/15 backdrop-blur hover:bg-white/10 hover:border-white/25",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline:
          "border border-[color:var(--border-light)] bg-white text-[color:var(--navy-900)] hover:bg-[color:var(--surface-2)] hover:border-[color:var(--navy-700)]",
        ghost: "hover:bg-[color:var(--surface-2)] hover:text-foreground",
        link: "text-[color:var(--amber-600)] underline-offset-4 hover:underline",
        life: "bg-[image:var(--gradient-amber)] text-[color:var(--navy-900)] hover:brightness-[1.04]",
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
