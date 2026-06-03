import type { BadgeProps } from "@/components/ui/Badge";
import type { DisputeStatus } from "@/lib/mockData";

type BadgeTone = NonNullable<BadgeProps["tone"]>;

/**
 * Single source of truth for how a dispute status renders across the admin
 * surfaces (case-management + disputes queues). Previously each page declared
 * its own map and they drifted — case-management even keyed `EVIDENCE`, which
 * never matched the real `EVIDENCE_REQUESTED`/`EVIDENCE_SUBMITTED` union, so
 * evidence-stage cases silently fell through to neutral grey.
 */
export const DISPUTE_STATUS_TONE: Record<DisputeStatus, BadgeTone> = {
  OPENED: "info",
  EVIDENCE_REQUESTED: "info",
  EVIDENCE_SUBMITTED: "info",
  UNDER_REVIEW: "sim",
  DECIDED: "live",
};

/** Human-readable label — turns the raw enum (`EVIDENCE_REQUESTED`) into a
 * sentence-case chip label (`Evidence requested`) so operators never see
 * SCREAMING_SNAKE_CASE leaking into the UI. */
export function disputeStatusLabel(status: DisputeStatus): string {
  const lower = status.toLowerCase().replace(/_/g, " ");
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}
