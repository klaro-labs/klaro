import { forwardRef } from "react";
import { cn } from "@/lib/cn";

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

/**
 * Klaro Input — consistent border, radius, focus ring across all forms.
 * Replaces the repeated `rounded border border-[var(--color-line)] outline-none
 * focus:border-[var(--color-brand)]` pattern with a proper focus-visible ring
 * that satisfies WCAG 2.4.7.
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, error, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "h-11 w-full rounded-lg border bg-[var(--color-bg-elevated)] px-3 text-sm transition-colors placeholder:text-[var(--color-ink-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)] focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50",
        error
          ? "border-[var(--color-danger)]"
          : "border-[var(--color-line)]",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";
