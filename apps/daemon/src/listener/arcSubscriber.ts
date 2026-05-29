/**
 * Arc event listener — subscribes to relevant contract events via viem
 * `watchContractEvent`. Each event is idempotency-keyed by (event,txHash,logIndex)
 * in Redis before enqueueing the downstream worker job.
 * Subscribed events:
 * InvoiceEscrow.InvoicePaid → screen-and-settle
 * InvoiceEscrow.InvoiceSettled → receipt-generate + notify-vendor
 * InvoiceEscrow.InvoiceRefunded → notify-vendor + notify-buyer
 * CashoutOrderProcessor.OrderClaimed → cashout-advance:match-lp (assigned already, just notify)
 * CashoutOrderProcessor.ProofSubmitted → cashout-advance:proof-verify
 * CashoutOrderProcessor.OrderReleased → notify-lp
 * DisputeManager.CaseOpened → notify-admin
 * DisputeManager.Decided → notify-admin (fan-out to cashout/agent advancer is
 *   F8-pending — outcome-enum-driven business logic + advancer wiring not yet
 *   in scope; admin manually advances based on the notify-admin payload)
 * AgentEscrow.JobCompleted → notify-vendor + notify-agent
 * AuditReceipt.ReceiptMinted → notify-vendor (receipt available)
 */
import {
  parseAbiItem,
  decodeFunctionData,
  parseAbi,
  keccak256,
  type Log,
  type AbiEvent,
} from "viem";
import { arcPublic } from "../arc.js";
import { env } from "../env.js";
import {
  claimOnce,
  releaseClaimBounded,
  clearRetryCounter,
  redis,
} from "../redis.js";
import { sb } from "../db.js";
import { queue } from "../queue.js";
import { log } from "../log.js";

// Minimal event ABIs — full ABIs land in packages/core when extracted.
const INVOICE_PAID_EVENT = parseAbiItem(
  // QA-027 fix: contract emits InvoicePaid WITHOUT metadataHash. Viem
  // derives the event topic from this signature; an extra param meant
  // we were polling for a non-existent topic — listener silently
  // matched zero logs while looking "healthy."
  "event InvoicePaid(bytes32 indexed invoiceId, address indexed buyer, uint256 amount)",
);
const ORDER_CLAIMED_EVENT = parseAbiItem(
  // QA-030: contract emits OrderClaimed(bytes32,bytes32) — listener had
  // an extra `address indexed lp` so the derived topic never matched any
  // real event. Cashout claim flow silently never fired.
  "event OrderClaimed(bytes32 indexed cashoutId, bytes32 indexed lpId)",
);
const PROOF_SUBMITTED_EVENT = parseAbiItem(
  // QA-031: contract event name is ProofSubmittedFor (not ProofSubmitted)
  // — wrong name = wrong topic = silent fail on LP proof submissions.
  "event ProofSubmittedFor(bytes32 indexed cashoutId, bytes32 indexed proofHash)",
);
const CASE_OPENED_EVENT = parseAbiItem(
  // QA-041: real contract emits a 5th bytes32 (reasonHash) — missing it
  // changes the topic + silently never matches. Verified against
  // packages/contracts/abis/v1.0/DisputeManager.json.
  "event CaseOpened(bytes32 indexed caseId, address indexed claimant, address indexed respondent, bytes32 evidenceHash, bytes32 reasonHash)",
);
const DECIDED_EVENT = parseAbiItem(
  // QA-041: real contract is (indexed bytes32 caseId, uint8 outcome,
  // indexed bytes32 reasonHash, bytes32 evidenceHash). Listener had
  // 3 params; canonical has 4 + different indexed split. Verified
  // against packages/contracts/abis/v1.0/DisputeManager.json.
  "event Decided(bytes32 indexed caseId, uint8 outcome, bytes32 indexed reasonHash, bytes32 evidenceHash)",
);
// listener was subscribing to 5 of 10
// documented events. Adding the remaining 5 so vendors get notified when
// settlement happens, refunds land, the LP gets paid, agent jobs complete,
// and the on-chain receipt mints.
const INVOICE_SETTLED_EVENT = parseAbiItem(
  "event InvoiceSettled(bytes32 indexed invoiceId, address indexed vendor, uint256 amount)",
);
const INVOICE_REFUNDED_EVENT = parseAbiItem(
  "event InvoiceRefunded(bytes32 indexed invoiceId, address indexed buyer, uint256 amount)",
);
const ORDER_RELEASED_EVENT = parseAbiItem(
  "event OrderReleased(bytes32 indexed cashoutId, bytes32 indexed lpId, uint256 usdcAmount)",
);
const JOB_COMPLETED_EVENT = parseAbiItem(
  "event JobCompleted(bytes32 indexed jobId, uint256 amountUsdc, uint256 feeUsdc)",
);
const RECEIPT_MINTED_EVENT = parseAbiItem(
  // QA-032: contract emits ReceiptMinted(uint256 indexed tokenId, bytes32 indexed receiptHash,
  // bytes32 indexed invoiceId, address vendor). Listener had wrong param ORDER (invoiceId first)
  // and missing the `address vendor` tail — so the derived topic never matched any real mint.
  "event ReceiptMinted(uint256 indexed tokenId, bytes32 indexed receiptHash, bytes32 indexed invoiceId, address vendor)",
);

/**
 * helpers: every `client.watchEvent` previously omitted
 * `onError`, so a transport hiccup or RPC 5xx silently killed the
 * subscription — every downstream worker stopped firing with no log,
 * no DLQ, no PagerDuty signal until the daemon was bounced (operators
 * learned via vendor support tickets). Additionally, an exception
 * thrown inside `onLogs` mid-batch caused viem to advance past the
 * remaining events; `claimOnce` dedup means a daemon bounce can't
 * recover them either (`watch` resumes from `latest`). These two
 * wrappers close both gaps:
 * - `listenerError(event)` logs transport errors with the event name
 * so ops sees which subscription died.
 * - `safeEvent(event, key, fn)` wraps each per-event handler so a
 * failure on one event in the batch doesn't drop the rest.
 */
function listenerError(event: string) {
  return (err: unknown) =>
    log.error("listener.error", {
      event,
      err: (err as Error).message,
    });
}

async function safeEvent(
  event: string,
  key: string,
  fn: () => Promise<void>,
): Promise<void> {
  // register the promise so `stopArcListener` can drain
  // in-flight handlers before `closeAll()` runs. Auto-removes when
  // the body settles either way.
  const handlerPromise = _runSafeEvent(event, key, fn);
  _inflight.add(handlerPromise);
  try {
    await handlerPromise;
  } finally {
    _inflight.delete(handlerPromise);
  }
}

async function _runSafeEvent(
  event: string,
  key: string,
  fn: () => Promise<void>,
): Promise<void> {
  try {
    await fn();
    // successful handler clears the per-key retry counter
    // so a future retry-cycle on a different key isn't tainted by
    // stale counts (defensive — keys include txHash:logIndex so
    // re-firing the same key is rare).
    await clearRetryCounter(key).catch(() => {});
  } catch (e) {
    log.error("listener.onLogs.failed", {
      event,
      key,
      err: (e as Error).message,
    });
    // + : claim was already recorded. Unconditional
    // release caused a retry storm during sustained dependency outages
    // (4s poll × 1h outage = 900 attempts against the failing service).
    // Bounded release: counts attempts, holds the claim after 5 fails
    // so the event stops re-firing, enqueues notify-admin so a human
    // can replay once the dependency recovers.
    try {
      const { released, retryCount } = await releaseClaimBounded(key);
      if (!released) {
        log.error("listener.retryExhausted.heldForReplay", {
          event,
          key,
          retryCount,
        });
        // (daemon audit): per-key BullMQ jobId dedup only
        // collapses retries OF THE SAME event — a 1h outage with 100
        // events produces 100 unique keys + 100 admin pages. Collapse
        // via a Redis-backed per-event-TYPE cooldown (mirrors the
        // PagerDuty cooldown pattern in _dlq.ts) so a storm produces
        // at most one admin page per event type per 30 min. The page
        // payload still names the most-recent key so the operator can
        // replay manually.
        try {
          const cooldownKey = `klaro:adminPage:listener-retry:${event}`;
          const gotLock = await redis().set(
            cooldownKey,
            "1",
            "EX",
            30 * 60,
            "NX",
          );
          if (gotLock === "OK") {
            // (daemon audit): drop Date.now() from the
            // jobId. The Redis cooldown lock is the cooldown arbiter;
            // BullMQ jobId dedup is the second line of defense
            // (matches the /80/82 pattern used everywhere else).
            // With a timestamp, every call gets a unique jobId and the
            // BullMQ dedup is defeated — a future caller adding a
            // retry inside the catch would double-enqueue.
            await queue("notify-admin").add(
              `listener-retry-exhausted:${event}`,
              {
                kind: "listener.retry_exhausted",
                detail: { event, key, retryCount },
              },
              { jobId: `notify-admin_listener-retry_${event}` },
            );
          } else {
            log.warn("listener.adminEscalation.suppressedByCooldown", {
              event,
              key,
              retryCount,
            });
          }
        } catch (escErr) {
          log.error("listener.adminEscalation.failed", {
            event,
            key,
            err: (escErr as Error).message,
          });
          // (daemon audit): when the admin enqueue itself
          // fails (likely the SAME Redis flap that exhausted retries),
          // fall back to writing directly to dead_letter_jobs. Bypasses
          // BullMQ + the cooldown lock + Redis. Operator triages via
          // the DLQ admin UI; the event is no longer silently lost.
          try {
            const { error: dlqErr } = await sb()
              .from("dead_letter_jobs")
              .insert({
                queue_name: "listener-retry-exhausted",
                job_id: key,
                failed_reason: `retry_exhausted_after_${retryCount}_attempts`,
                attempts_made: retryCount,
                payload: { event, key, retryCount },
              });
            if (dlqErr) throw dlqErr;
            log.warn("listener.adminEscalation.fellThroughToDLQ", {
              event,
              key,
            });
          } catch (dlqErr) {
            log.error("listener.adminEscalation.dlqFallbackFailed", {
              event,
              key,
              err: (dlqErr as Error).message,
            });
          }
        }
      }
    } catch (relErr) {
      log.error("listener.releaseClaim.failed", {
        event,
        key,
        err: (relErr as Error).message,
      });
    }
  }
}

// viem `client.watchEvent({...})` returns an unwatch
// function — all 11 returns were previously discarded. On SIGTERM
// `closeAll()` drained workers/queues but viem kept polling RPC; any
// in-flight log fired `claimOnce` (against a closing Redis) and
// `queue(...).add` (against a closing Queue), racing the shutdown.
// Worst case: a job enqueued after the worker was gone left a claim
// held with no consumer — same drop-an-event class as D88-3.
// Collect every unwatcher; `stopArcListener()` is called from
// `index.ts` shutdown before `closeAll()`.
const _unwatchers: Array<() => void> = [];

// (daemon audit): track in-flight safeEvent handler
// promises so `stopArcListener` can drain them before `closeAll()`
// closes the Queue + Redis. Otherwise an in-flight onLogs handler's
// queue.add()/claimOnce throws ECONNRESET → safeEvent catch logs →
// inner releaseClaimBounded also throws → outer catch logs → event
// silently dropped (claim held, no enqueue, no DLQ row, no admin
// notify). Same drop-an-event class D89-3 was meant to close, just
// shifted from the unwatch side to the in-flight side.
const _inflight = new Set<Promise<void>>();

export async function stopArcListener(): Promise<void> {
  for (const u of _unwatchers) {
    try {
      u();
    } catch (e) {
      log.error("listener.unwatch.failed", { err: (e as Error).message });
    }
  }
  _unwatchers.length = 0;
  // Drain any in-flight handlers with a 5s cap so shutdown isn't held
  // by a hung handler. allSettled so one throw doesn't poison the wait.
  // (daemon audit): clear the setTimeout handle after the
  // race settles, otherwise the unref'd timer keeps the event loop
  // alive 5s past process.exit (cosmetic in prod, fatal flake in tests).
  if (_inflight.size > 0) {
    let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<void>((resolve) => {
      deadlineTimer = setTimeout(resolve, 5_000);
    });
    try {
      await Promise.race([
        Promise.allSettled([..._inflight]).then(() => undefined),
        deadline,
      ]);
    } finally {
      if (deadlineTimer) clearTimeout(deadlineTimer);
    }
  }
  _inflight.clear();
}

export function startArcListener() {
  const client = arcPublic();
  // wrap every watchEvent registration so the unwatch
  // function is collected. `stopArcListener()` calls them all on
  // SIGTERM before `closeAll()` drains the queues.
  //
  // QA-053 fix (v2 — the v1 `poll: true` cast was silently ignored by
  // viem@2.50.4; filter mode kept being used + the daemon kept hitting
  // 'filter not found' against Arc RPC every ~5 min). This wrapper
  // bypasses viem.watchEvent's filter machinery entirely:
  //
  // - Maintain a fromBlock cursor per registration (start at 'latest').
  // - Every POLL_INTERVAL_MS, call client.getLogs({event, address,
  //   fromBlock: cursor + 1, toBlock: 'latest'}) — pure eth_getLogs, no
  //   filter id, no filter to expire.
  // - Hand each new log to onLogs(...) just like watchEvent would, then
  //   advance the cursor.
  // - Errors are reported via opts.onError (preserving the existing
  //   listenerError() handler in this file).
  //
  // Trade-off: minor extra RPC load (one getLogs per pollingInterval per
  // subscription) vs the previous filter-based approach. Arc has
  // sub-second finality + we already poll at 500ms, so the load delta is
  // trivial. The reliability win is enormous — listener stays alive
  // indefinitely instead of dying silently.
  const POLL_INTERVAL_MS = 1500;
  // QA-072: trailing re-scan depth (blocks) to absorb eth_getLogs
  // read-after-write indexing lag on Arc. ~25 sub-second blocks ≈ 10-25s of
  // lag tolerance; claimOnce dedups the overlap so it's free of double-fires.
  const REORG_OVERLAP = 25n;
  // Generic to preserve typed `ev.args` at each callsite. Log<...,
  // strict=true, abiEvent> gives a typed `args` field per viem.
  type TypedLog<E extends AbiEvent> = Log<bigint, number, false, E, true>;
  type WatchOpts<E extends AbiEvent> = {
    address: `0x${string}`;
    event: E;
    onLogs: (logs: readonly TypedLog<E>[]) => void | Promise<void>;
    onError?: (err: unknown) => void;
  };
  const watch = <E extends AbiEvent>(opts: WatchOpts<E>): (() => void) => {
    let cursor: bigint | null = null;
    let seed: bigint | null = null;
    let stopped = false;
    const tick = async () => {
      if (stopped) return;
      try {
        const latest = await client.getBlockNumber();
        if (cursor === null) {
          // First tick — seed cursor at current latest so we don't replay
          // every historic event at startup.
          cursor = latest;
          seed = latest;
          return;
        }
        if (latest <= cursor) return;
        // QA-072: re-scan a trailing window instead of jumping the cursor
        // straight to `latest`. Arc's eth_getLogs is read-after-write lagged
        // — a log mined at block N isn't index-visible for a few hundred ms.
        // The old code advanced the cursor to `latest` immediately, so a log
        // not yet indexed when its block was first scanned got skipped
        // forever (silent: the poll succeeded, just returned []). Overlapping
        // by REORG_OVERLAP blocks lets a late-indexed log surface on a later
        // tick; claimOnce dedups the re-scan so nothing fires twice. Never
        // scan before the boot seed (keeps the no-historic-replay intent).
        let fromBlock = cursor + 1n - REORG_OVERLAP;
        const floor = (seed ?? 0n) + 1n;
        if (fromBlock < floor) fromBlock = floor;
        if (fromBlock < 0n) fromBlock = 0n;
        const logs = await client.getLogs({
          address: opts.address,
          event: opts.event,
          fromBlock,
          toBlock: latest,
        });
        cursor = latest;
        if (logs.length > 0)
          await opts.onLogs(logs as unknown as readonly TypedLog<E>[]);
      } catch (err) {
        if (opts.onError) opts.onError(err);
      }
    };
    const handle = setInterval(tick, POLL_INTERVAL_MS);
    const unwatch = () => {
      stopped = true;
      clearInterval(handle);
    };
    _unwatchers.push(unwatch);
    // Fire once immediately so the cursor seeds without waiting for the
    // first interval tick.
    void tick();
    return unwatch;
  };

  if (env.INVOICE_ESCROW_ADDRESS) {
    const escrow = env.INVOICE_ESCROW_ADDRESS as `0x${string}`;

    watch({
      address: escrow,
      event: INVOICE_PAID_EVENT,
      onLogs: async (logs) => {
        for (const ev of logs) {
          const key = `invoice-paid:${ev.transactionHash}:${ev.logIndex}`;
          if (!(await claimOnce(key))) continue;
          await safeEvent("InvoicePaid", key, async () => {
            // QA-034 fix: capture buyer's EIP-712 signature from the
            // acceptAndPay calldata so the receipt's acceptance_hash
            // anchor is populated (instead of rendering "—" on
            // /receipt/[hash]). Decoded async and non-fatal — if the
            // tx fetch fails we still flip the row to PAID with a null
            // signature (better than blocking the screen job).
            let acceptanceSig: string | null = null;
            try {
              const tx = await client.getTransaction({
                hash: ev.transactionHash,
              });
              const { args } = decodeFunctionData({
                abi: parseAbi([
                  "function acceptAndPay(bytes32 invoiceId, bytes buyerSignature, address buyer)",
                ]),
                data: tx.input,
              });
              acceptanceSig = keccak256(args[1] as `0x${string}`);
            } catch (e) {
              log.error("event.InvoicePaid.sigCapture.failed", {
                id: ev.args.invoiceId,
                err: (e as Error)?.message,
              });
            }

            // QA-028 fix: sync DB before fanning out the screen job. Without
            // this the world sees a PAID invoice on chain + screening_results
            // rows in Supabase, but invoices.status stays 'CREATED' forever
            // → vendor dashboard never reflects payment. Use a conservative
            // update that only flips CREATED→PAID (don't clobber a row that
            // somehow moved further, e.g. operator already settled).
            const dbUpd = await sb()
              .from("invoices")
              .update({
                status: "PAID",
                accepted_by: ev.args.buyer,
                accepted_at: new Date().toISOString(),
                paid_tx_hash: ev.transactionHash,
                ...(acceptanceSig ? { acceptance_sig: acceptanceSig } : {}),
              })
              .eq("id", ev.args.invoiceId)
              .in("status", ["CREATED", "ACCEPTED"]);
            if (dbUpd.error) {
              log.error("event.InvoicePaid.dbSync.failed", {
                id: ev.args.invoiceId,
                err: dbUpd.error.message,
              });
              // Don't bail — keep enqueueing the screen job. The DB sync
              // is best-effort defensive (a later reconciler could fix it
              // from on-chain state).
            }

            await queue("screen-and-settle").add(
              ev.args.invoiceId ?? "",
              {
                invoiceId: ev.args.invoiceId,
                buyerAddress: ev.args.buyer,
                amount: ev.args.amount?.toString() ?? "0",
                paidTxHash: ev.transactionHash,
              },
              { jobId: `screen-and-settle_${ev.args.invoiceId}` },
            );
            log.info("event.InvoicePaid", { id: ev.args.invoiceId });
          });
        }
      },
      onError: listenerError("InvoicePaid"),
    });

    watch({
      address: escrow,
      event: INVOICE_SETTLED_EVENT,
      onLogs: async (logs) => {
        for (const ev of logs) {
          const key = `invoice-settled:${ev.transactionHash}:${ev.logIndex}`;
          if (!(await claimOnce(key))) continue;
          await safeEvent("InvoiceSettled", key, async () => {
            // QA-029 fix: mirror QA-028 — sync invoices.status + settled_tx_hash
            // to DB on InvoiceSettled. Without this the row stays at PAID
            // forever and the vendor UI shows "Paid · settling" instead of
            // "Settled" even after the on-chain settle landed.
            // On-chain SETTLED is ground truth (the contract enforces
            // CREATED→PAID→SETTLED), so reconcile from CREATED too — otherwise a
            // missed InvoicePaid (daemon downtime) leaves the row stuck at
            // CREATED forever while on-chain is settled + the receipt is minted.
            // Still excludes terminal REFUNDED/CANCELLED so we never resurrect them.
            const dbUpd = await sb()
              .from("invoices")
              .update({
                status: "SETTLED",
                settled_tx_hash: ev.transactionHash,
              })
              .eq("id", ev.args.invoiceId)
              .in("status", ["PAID", "ACCEPTED", "CREATED"]);
            if (dbUpd.error) {
              log.error("event.InvoiceSettled.dbSync.failed", {
                id: ev.args.invoiceId,
                err: dbUpd.error.message,
              });
            }

            // wiring: settlementTx is what receipt hash depends on.
            // deterministic jobId so screenAndSettle's
            // worker-side enqueue + this listener-side enqueue collapse
            // into one BullMQ job per (invoiceId, kind).
            await queue("receipt-generate").add(
              ev.args.invoiceId ?? "",
              {
                invoiceId: ev.args.invoiceId,
                settlementTx: ev.transactionHash,
              },
              { jobId: `receipt-generate_${ev.args.invoiceId}` },
            );
            await queue("notify-vendor").add(
              ev.args.invoiceId ?? "",
              { invoiceId: ev.args.invoiceId, kind: "invoice.settled" },
              { jobId: `notify-vendor_settled_${ev.args.invoiceId}` },
            );
          });
        }
      },
      onError: listenerError("InvoiceSettled"),
    });

    watch({
      address: escrow,
      event: INVOICE_REFUNDED_EVENT,
      onLogs: async (logs) => {
        for (const ev of logs) {
          const key = `invoice-refunded:${ev.transactionHash}:${ev.logIndex}`;
          if (!(await claimOnce(key))) continue;
          await safeEvent("InvoiceRefunded", key, async () => {
            // Sync DB status — on-chain REFUNDED is ground truth (refund()
            // requires PAID on-chain). Without this the row stays PAID forever
            // and the UI shows "Paid" instead of "Refunded" after the on-chain
            // refund. Mirrors the InvoiceSettled/InvoicePaid DB sync.
            const dbUpd = await sb()
              .from("invoices")
              .update({ status: "REFUNDED" })
              .eq("id", ev.args.invoiceId)
              .in("status", ["PAID", "ACCEPTED"]);
            if (dbUpd.error) {
              log.error("event.InvoiceRefunded.dbSync.failed", {
                id: ev.args.invoiceId,
                err: dbUpd.error.message,
              });
            }
            await queue("notify-vendor").add(ev.args.invoiceId ?? "", {
              invoiceId: ev.args.invoiceId,
              kind: "invoice.refunded",
            });
            await queue("notify-buyer").add(ev.args.invoiceId ?? "", {
              invoiceId: ev.args.invoiceId,
              kind: "invoice.refunded",
            });
          });
        }
      },
      onError: listenerError("InvoiceRefunded"),
    });
  }

  if (env.CASHOUT_ORDER_PROCESSOR_ADDRESS) {
    watch({
      address: env.CASHOUT_ORDER_PROCESSOR_ADDRESS as `0x${string}`,
      event: ORDER_CLAIMED_EVENT,
      onLogs: async (logs) => {
        for (const ev of logs) {
          const key = `order-claimed:${ev.transactionHash}:${ev.logIndex}`;
          if (!(await claimOnce(key))) continue;
          await safeEvent("OrderClaimed", key, async () => {
            // deterministic jobId dedups with the
            // advancer-side enqueue.
            await queue("notify-vendor").add(
              ev.args.cashoutId ?? "",
              { orderId: ev.args.cashoutId, kind: "cashout.lp_assigned" },
              { jobId: `notify-vendor_lp_assigned_${ev.args.cashoutId}` },
            );
          });
        }
      },
      onError: listenerError("OrderClaimed"),
    });
    watch({
      address: env.CASHOUT_ORDER_PROCESSOR_ADDRESS as `0x${string}`,
      event: PROOF_SUBMITTED_EVENT,
      onLogs: async (logs) => {
        for (const ev of logs) {
          const key = `proof-submitted:${ev.transactionHash}:${ev.logIndex}`;
          if (!(await claimOnce(key))) continue;
          await safeEvent("ProofSubmitted", key, async () => {
            await queue("proof-verify").add(ev.args.cashoutId ?? "", {
              orderId: ev.args.cashoutId,
              proofHash: ev.args.proofHash,
            });
          });
        }
      },
      onError: listenerError("ProofSubmitted"),
    });

    watch({
      address: env.CASHOUT_ORDER_PROCESSOR_ADDRESS as `0x${string}`,
      event: ORDER_RELEASED_EVENT,
      onLogs: async (logs) => {
        for (const ev of logs) {
          const key = `order-released:${ev.transactionHash}:${ev.logIndex}`;
          if (!(await claimOnce(key))) continue;
          await safeEvent("OrderReleased", key, async () => {
            // jobId dedup with cashoutAdvancer release.
            // field renamed `usdcAmount` → `amountUsdc`.
            await queue("notify-lp").add(
              ev.args.cashoutId ?? "",
              {
                orderId: ev.args.cashoutId,
                kind: "cashout.released",
                amountUsdc: ev.args.usdcAmount?.toString(),
              },
              { jobId: `notify-lp_released_${ev.args.cashoutId}` },
            );
          });
        }
      },
      onError: listenerError("OrderReleased"),
    });
  }

  if (env.AGENT_ESCROW_ADDRESS) {
    watch({
      address: env.AGENT_ESCROW_ADDRESS as `0x${string}`,
      event: JOB_COMPLETED_EVENT,
      onLogs: async (logs) => {
        for (const ev of logs) {
          const key = `job-completed:${ev.transactionHash}:${ev.logIndex}`;
          if (!(await claimOnce(key))) continue;
          await safeEvent("JobCompleted", key, async () => {
            await queue("notify-vendor").add(ev.args.jobId ?? "", {
              jobId: ev.args.jobId,
              kind: "agent.job.completed",
            });
          });
        }
      },
      onError: listenerError("JobCompleted"),
    });
  }

  if (env.AUDIT_RECEIPT_ADDRESS) {
    watch({
      address: env.AUDIT_RECEIPT_ADDRESS as `0x${string}`,
      event: RECEIPT_MINTED_EVENT,
      onLogs: async (logs) => {
        for (const ev of logs) {
          const key = `receipt-minted:${ev.transactionHash}:${ev.logIndex}`;
          if (!(await claimOnce(key))) continue;
          await safeEvent("ReceiptMinted", key, async () => {
            await queue("notify-vendor").add(ev.args.invoiceId ?? "", {
              invoiceId: ev.args.invoiceId,
              receiptHash: ev.args.receiptHash,
              kind: "receipt.minted",
            });
          });
        }
      },
      onError: listenerError("ReceiptMinted"),
    });
  }

  if (env.DISPUTE_MANAGER_ADDRESS) {
    watch({
      address: env.DISPUTE_MANAGER_ADDRESS as `0x${string}`,
      event: CASE_OPENED_EVENT,
      onLogs: async (logs) => {
        for (const ev of logs) {
          const key = `dispute-opened:${ev.transactionHash}:${ev.logIndex}`;
          if (!(await claimOnce(key))) continue;
          await safeEvent("CaseOpened", key, async () => {
            await queue("notify-admin").add(ev.args.caseId ?? "", {
              kind: "dispute.opened",
              detail: { caseId: ev.args.caseId },
            });
          });
        }
      },
      onError: listenerError("CaseOpened"),
    });
    watch({
      address: env.DISPUTE_MANAGER_ADDRESS as `0x${string}`,
      event: DECIDED_EVENT,
      onLogs: async (logs) => {
        for (const ev of logs) {
          const key = `decided:${ev.transactionHash}:${ev.logIndex}`;
          if (!(await claimOnce(key))) continue;
          await safeEvent("Decided", key, async () => {
            await queue("notify-admin").add(ev.args.caseId ?? "", {
              kind: "dispute.decided",
              detail: { caseId: ev.args.caseId, outcome: ev.args.outcome },
            });
          });
        }
      },
      onError: listenerError("Decided"),
    });
  }

  log.info("listener.started", {
    invoice: Boolean(env.INVOICE_ESCROW_ADDRESS),
    cashout: Boolean(env.CASHOUT_ORDER_PROCESSOR_ADDRESS),
    disputes: Boolean(env.DISPUTE_MANAGER_ADDRESS),
    agents: Boolean(env.AGENT_ESCROW_ADDRESS),
    receipts: Boolean(env.AUDIT_RECEIPT_ADDRESS),
  });
}
