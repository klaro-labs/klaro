import { forwardRef } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

/**
 * Klaro Button — three variants matching the designer's landing CTAs.
 * - primary : black filled, white text, used for the main action per screen
 * - secondary: ghost with subtle ring, used for "See a real receipt"
 * - ghost : text-only, for tertiary nav links
 * : every action needs a next step — buttons accept children that
 * always read as an action verb ("Create your first invoice", not "Submit").
 */
export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-pill font-medium transition-all duration-150 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)]",
  {
    variants: {
      variant: {
        primary:
          "bg-[var(--color-ink)] text-white hover:bg-[var(--color-ink-2)]",
        secondary:
          "bg-transparent text-[var(--color-ink)] ring-1 ring-inset ring-[var(--color-line)] hover:bg-[var(--color-bg-elevated)]",
        ghost:
          "bg-transparent text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]",
      },
      size: {
        sm: "h-9 px-4 text-sm",
        md: "h-11 px-5 text-sm",
        lg: "h-12 px-6 text-base",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

export interface ButtonProps
  extends
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  ),
);
Button.displayName = "Button";
