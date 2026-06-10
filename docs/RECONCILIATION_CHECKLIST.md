# Reconciliation checklist

How to confirm that off-chain rows (Supabase) and on-chain state (Arc
testnet) agree for each money object. The daemon's `reconciler` worker runs
the cashout portion of this automatically every 5 minutes and emits
`reconcile.drift` alerts; this checklist is the manual pass for support
cases, post-incident review, and pre-release sanity checks.

**Ground rule:** the chain is the source of truth for money state; the DB is
the source of truth for off-chain metadata (emails, labels, evidence). When
they disagree, repair the DB toward the chain — never the reverse.

## Invoices

| Check | DB side | Chain side |
| --- | --- | --- |
| Published invoice exists on chain | `invoices.published_tx_hash` set | `InvoiceEscrow.getInvoice(id)` returns the struct |
| Status agrees | `invoices.status` | escrow status field for the same id |
| Amount agrees (6-decimal ERC-20 USDC) | `invoices.amount` | escrow `amount` |
| Paid invoice has a payment event | `payments` row | `InvoicePaid` log for the id |

Repair path: the invoice detail page already calls
`reconcileInvoicePublished` to backfill a missing `published_tx_hash` from
chain logs. For status drift, replay the missed event through the daemon
(idempotency keys make replays safe).

## Receipts

| Check | DB side | Chain side |
| --- | --- | --- |
| Receipt hash matches mint | `receipts.receipt_hash` | `AuditReceipt.verify(hash)` returns true |
| Every settled invoice has a receipt | `invoices.status = settled` ⇒ `receipts` row | `ReceiptMinted` log exists |

Repair path: re-enqueue `receipt-generate` for the invoice; the worker
persists the contract-returned hash, so `/receipt/[hash]` verifies.

## Cashout orders

| Check | DB side | Chain side |
| --- | --- | --- |
| Non-terminal orders match chain | `cashout_orders.status` | `CashoutOrderProcessor` order state |
| Released order paid the LP | status `RELEASED` | `OrderReleased` log + USDC transfer |
| Locked amount agrees | order amount | escrow-locked amount |

Repair path: automatic — the `reconciler` worker reads chain truth for every
non-terminal order and CAS-updates the DB toward `RELEASED` chain state. If
`reconcile.drift` alerts repeat for the same order, treat it as an incident
(`docs/runbooks/cashout-stuck.md`).

## Disputes

| Check | DB side | Chain side |
| --- | --- | --- |
| Open case exists on chain | `disputes` row | `DisputeManager` `CaseOpened` log |
| Decision recorded matches | `disputes.outcome` | `Decided` log outcome |
| Escrow followed the decision | linked order/invoice status | escrow `resolveDispute` effects |

Repair path: deterministic outcomes (release / refund) are auto-routed by
`disputeResolver`; `SLASH_LP` and `PENALIZE_VENDOR` always require a human —
check the admin queue, not the DB, if one looks stuck.

## When numbers don't add up

1. Confirm you are comparing 6-decimal ERC-20 USDC values on both sides —
   never the 18-decimal native gas representation (see `CLAUDE.md` hard
   rules).
2. Check `dead_letter_jobs` for the object's id — a DLQ'd job is the most
   common cause of one-sided state.
3. Check `inbound_webhook_events` / event idempotency keys for a replay that
   was correctly dropped.
4. If drift survives a manual replay, freeze the affected flow
   (`docs/runbooks/emergency-pause.md`) and escalate; do not hand-edit money
   states without an audit-log entry.
