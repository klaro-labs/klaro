import type { BadgeProps } from "@/components/ui/Badge";

type BadgeTone = NonNullable<BadgeProps["tone"]>;

/** Queue-item severity as emitted by mockData (`AdminQueueItem.severity`). */
export type Severity = "low" | "med" | "high" | "critical";

/**
 * Single source of truth for severity → Badge tone on the operator console.
 * Previously re-declared in admin/page.tsx and manual-review/page.tsx with
 * `high`/`critical` both collapsed to grey `sim` — so a critical risk item
 * rendered identically to a low one. Critical now escalates to red.
 */
export const SEVERITY_TONE: Record<Severity, BadgeTone> = {
  low: "info",
  med: "info",
  high: "warning",
  critical: "danger",
};
