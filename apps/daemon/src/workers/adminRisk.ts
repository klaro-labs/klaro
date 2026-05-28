/**
 * Admin/risk escalator. Hourly cron:
 * - finds disputes past the 24h SLA → bumps to "admin-attention" queue
 * - finds cashouts STUCK in PROOF_SUBMITTED beyond 2h → flags for ops
 * - finds invoices PAID without screening within 30m → re-enqueues
 */
import { startWorker, queue } from "../queue.js";
import { sb } from "../db.js";
import { log } from "../log.js";

export function startAdminRisk() {
  startWorker<{ cycle: string }>(
    "admin-risk",
    async (_job) => {
      const now = Date.now();
      const sla24h = new Date(now - 24 * 60 * 60 * 1000).toISOString();
      const sla2h = new Date(now - 2 * 60 * 60 * 1000).toISOString();
      const sla30m = new Date(now - 30 * 60 * 1000).toISOString();

      // all three queries used
      // to skip the soft-delete filter. A voided invoice/cashout/
      // dispute kept showing up in the 15-min scan forever — exact
      // re-enqueue-bomb shape closed in lifecycleReminders.
      // `.is("deleted_at", null)` on every read.
      // previously destructured `data` only and used
      // `data ?? []` later, swallowing read errors. A transient
      // PostgREST failure rendered "overdue: 0, stuck: 0" → silent
      // empty scan. Throw on error so BullMQ retries + DLQ surfaces.
      const [overdue, stuck, unscreened] = await Promise.all([
        sb()
          .from("disputes")
          .select("id,case_id")
          .lte("opened_at", sla24h)
          .neq("status", "DECIDED")
          .neq("status", "CLOSED")
          .is("deleted_at", null),
        sb()
          .from("cashout_orders")
          .select("id")
          .eq("status", "PROOF_SUBMITTED")
          .lte("updated_at", sla2h)
          .is("deleted_at", null),
        // (re-enqueue bomb, 2026-05-25): pull the real columns
        // and skip rows that already have a screening_results entry, so we
        // don't pollute the table with junk garbage rows every 15 min.
        sb()
          .from("invoices")
          .select(
            "id, accepted_by, amount, paid_tx_hash, screening_results!left(id)",
          )
          .eq("status", "PAID")
          .lte("updated_at", sla30m)
          .is("screening_results.id", null)
          .is("deleted_at", null),
      ]);
      if (overdue.error) throw overdue.error;
      if (stuck.error) throw stuck.error;
      if (unscreened.error) throw unscreened.error;

      for (const d of overdue.data ?? [])
        await queue("notify-admin").add(
          `dispute:${d.case_id}`,
          { caseId: d.case_id, kind: "sla.overdue" },
          { jobId: `notify-admin_dispute_${d.case_id}` },
        );

      for (const o of stuck.data ?? [])
        await queue("notify-admin").add(
          `cashout:${o.id}`,
          { orderId: o.id, kind: "cashout.stuck" },
          { jobId: `notify-admin_cashout_${o.id}` },
        );

      for (const i of unscreened.data ?? []) {
        // Only re-enqueue when we have real buyer + paid_tx data; otherwise
        // wait for the next cycle. Dedupe via deterministic jobId so retries
        // collapse instead of multiplying.
        const row = i as {
          id: string;
          accepted_by?: string;
          amount?: string;
          paid_tx_hash?: string;
        };
        if (!row.accepted_by || !row.paid_tx_hash) continue;
        await queue("screen-and-settle").add(
          row.id,
          {
            invoiceId: row.id,
            buyerAddress: row.accepted_by,
            amount: row.amount ?? "0",
            paidTxHash: row.paid_tx_hash,
          },
          { jobId: `screen-and-settle_${row.id}` },
        );
      }

      log.info("admin.risk.scan", {
        overdue: overdue.data?.length ?? 0,
        stuck: stuck.data?.length ?? 0,
        unscreened: unscreened.data?.length ?? 0,
      });
    },
    1,
  );
}
