/**
 * Ledger ↔ chain reconciler. A money worker can sign a tx on Arc and then fail
 * the mirroring DB write (RPC blip, 5xx) — leaving the chain RELEASED while the
 * DB still says CONFIRMED/PROOF_SUBMITTED/CLAIMED. The cashoutAdvancer release
 * branch now self-heals on retry (chain-first idempotency precheck), but a job
 * that exhausted retries or never re-ran would strand the divergence silently.
 *
 * This standing reconcile loop reads CHAIN TRUTH for every non-terminal cashout
 * and, when the chain is RELEASED but the DB isn't, repairs the DB toward chain
 * (atomic compare-and-swap so it can't clobber a concurrent worker) and raises a
 * notify-admin `reconcile.drift` alert. It is READ-ONLY on-chain — it never
 * signs, never moves funds, never reverses chain truth; chain is the source of
 * truth and the DB is the mirror.
 */
import { startWorker, queue } from "../queue.js";
import { sb } from "../db.js";
import { log } from "../log.js";
import { env } from "../env.js";
import { onChainOrder, ON_CHAIN_STATUS } from "./cashoutAdvancer.js";

// Non-terminal DB states whose on-chain order could already be RELEASED.
const NON_TERMINAL = ["CLAIMED", "PROOF_SUBMITTED", "CONFIRMED"];

export interface ReconcileJob {
  tick?: string;
}

/** One reconcile pass over recent non-terminal cashouts. Bounded by `limit` so
 * it never hammers the RPC. Returns counts for observability. */
export async function reconcileCashouts(
  limit = 100,
): Promise<{ checked: number; repaired: number }> {
  const addr = env.CASHOUT_ORDER_PROCESSOR_ADDRESS;
  if (!addr) {
    log.warn("reconcile.cashout.no_address");
    return { checked: 0, repaired: 0 };
  }
  const { data, error } = await sb()
    .from("cashout_orders")
    .select("id, status")
    .in("status", NON_TERMINAL)
    .order("updated_at", { ascending: true })
    .limit(limit);
  if (error) throw error;
  const rows = data ?? [];
  let repaired = 0;
  for (const row of rows) {
    let oc;
    try {
      oc = await onChainOrder(addr, (row as { id: string }).id);
    } catch (e) {
      // A stale/down RPC must not let the reconciler act on bad truth — skip
      // this row this pass; the next tick retries.
      log.warn("reconcile.read_failed", {
        id: (row as { id: string }).id,
        err: (e as Error).message,
      });
      continue;
    }
    const dbStatus = (row as { status: string }).status;
    if (
      Number(oc.status) === ON_CHAIN_STATUS.RELEASED &&
      dbStatus !== "RELEASED"
    ) {
      // CAS on the exact status we read — a concurrent worker that already
      // advanced this row makes the update match 0 rows (no clobber).
      const up = await sb()
        .from("cashout_orders")
        .update({ status: "RELEASED", resolved_at: new Date().toISOString() })
        .eq("id", (row as { id: string }).id)
        .eq("status", dbStatus);
      if (up.error) {
        log.error("reconcile.repair_failed", {
          id: (row as { id: string }).id,
          err: up.error.message,
        });
        continue;
      }
      repaired++;
      log.warn("reconcile.drift_repaired", {
        id: (row as { id: string }).id,
        from: dbStatus,
        to: "RELEASED",
      });
      await queue("notify-admin").add(
        (row as { id: string }).id,
        {
          kind: "reconcile.drift",
          detail: {
            orderId: (row as { id: string }).id,
            from: dbStatus,
            chain: "RELEASED",
          },
        },
        { jobId: `notify-admin_reconcile_${(row as { id: string }).id}` },
      );
    }
  }
  return { checked: rows.length, repaired };
}

export function startReconciler() {
  startWorker<ReconcileJob>(
    "reconcile",
    async () => {
      const r = await reconcileCashouts();
      // Drift is abnormal — surface it at warn so it shows in ops dashboards.
      if (r.repaired > 0) log.warn("reconcile.summary", r);
      else log.info("reconcile.summary", r);
    },
    1,
  );
}
