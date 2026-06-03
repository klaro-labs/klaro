import type { InvoiceStatus } from "@/lib/types";

/**
 * Shared token-based status-dot color for invoice rows. Both the vendor
 * dashboard recent-activity list and the invoices list (mobile) computed this
 * inline with raw Tailwind hues (`bg-emerald-500`/`bg-amber-400`), so the same
 * status rendered slightly different colors per surface. This is the single
 * source of truth, backed by the design tokens:
 *  - paid / settled  → --color-success
 *  - accepted        → --color-brand
 *  - everything else → --color-warning (awaiting buyer)
 */
export function statusDotClass(status: InvoiceStatus): string {
  if (status === "PAID" || status === "SETTLED") {
    return "bg-[var(--color-success)]";
  }
  if (status === "ACCEPTED") {
    return "bg-[var(--color-brand)]";
  }
  return "bg-[var(--color-warning)]";
}
