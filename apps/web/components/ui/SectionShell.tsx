import { cn } from "@/lib/cn";

/**
 * Container that matches the Klaro reference: 1280px max width with
 * responsive horizontal padding clamp(20px, 4vw, 56px), generous vertical
 * rhythm clamp(80px, 12vw, 160px).
 *
 * Use `tone` to switch the section's background between the four base
 * surfaces (paper, warm, cool, dark). Background lives on the SECTION,
 * not the container — so a dark section bleeds edge to edge while the
 * content stays inside the 1280 grid.
 */
export function SectionShell({
  tone = "paper",
  id,
  className,
  innerClassName,
  children,
}: {
  tone?: "paper" | "warm" | "cool" | "dark";
  id?: string;
  className?: string;
  innerClassName?: string;
  children: React.ReactNode;
}) {
  const BG = {
    paper: "bg-[var(--color-bg)] text-[var(--color-ink)]",
    warm: "bg-[var(--color-bg-warm)] text-[var(--color-ink)]",
    cool: "bg-[var(--color-bg-cool)] text-[var(--color-ink)]",
    dark: "bg-[var(--color-bg-dark)] text-white",
  } as const;
  return (
    <section
      id={id}
      className={cn(
        BG[tone],
        "py-[clamp(80px,12vw,160px)]",
        className,
      )}
    >
      <div
        className={cn(
          "mx-auto w-full max-w-[1280px] px-[clamp(20px,4vw,56px)]",
          innerClassName,
        )}
      >
        {children}
      </div>
    </section>
  );
}
