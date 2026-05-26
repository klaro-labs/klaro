/**
 * Lifecycle reminder cron — replaces the in-app cron at /api/cron/lifecycle.
 * Runs every hour; finds invoices crossing 14d/7d/3d before due or 1d/7d after
 * and enqueues notify-buyer + (for vendor) notify-vendor jobs.
 */
import { startWorker, queue } from "../queue.js";
import { sb } from "../db.js";

const WINDOWS: { window: string; minDaysOut: number; maxDaysOut: number }[] = [
  { window: "due_14d", minDaysOut: 13, maxDaysOut: 14 },
  { window: "due_7d", minDaysOut: 6, maxDaysOut: 7 },
  { window: "due_3d", minDaysOut: 2, maxDaysOut: 3 },
  { window: "overdue_1d", minDaysOut: -2, maxDaysOut: -1 },
  { window: "overdue_7d", minDaysOut: -8, maxDaysOut: -7 },
];

export function startLifecycleReminders() {
  startWorker<{ tick: string }>(
    "lifecycle-reminders",
    async (_job) => {
      const now = Date.now();
      // missing soft-delete filter.
      // Voided invoices (vendor calls cancelInvoice → status flips to
      // CANCELLED, but if soft-delete via `deleted_at` is also in play
      // the row stayed in the in-list-status query) kept firing
      // reminders forever. Add `.is("deleted_at", null)` so deleted
      // rows never re-enqueue.
      // previously discarded `error`. A transient
      // PostgREST failure rendered invoices = undefined, the for-loop
      // ran 0 iterations, and the entire hourly tick was a silent
      // skip with no DLQ. Throw so BullMQ retries surface to ops.
      const { data: invoices, error: invErr } = await sb()
        .from("invoices")
        .select("id,vendor_id,customer_email,due_at,status")
        .in("status", ["CREATED", "ACCEPTED"])
        .is("deleted_at", null);
      if (invErr) throw invErr;
      for (const inv of invoices ?? []) {
        const daysOut = Math.round((+new Date(inv.due_at) - now) / 86_400_000);
        const hit = WINDOWS.find(
          (w) => daysOut >= w.minDaysOut && daysOut <= w.maxDaysOut,
        );
        if (!hit) continue;
        await queue("notify-buyer").add(
          `${inv.id}:${hit.window}`,
          {
            invoiceId: inv.id,
            kind: `lifecycle.${hit.window}`,
          },
          { jobId: `${inv.id}:${hit.window}` /* dedupe per window */ },
        );
      }
    },
    1,
  );
}
