# Runbook: refund-issue

**Trigger:** Vendor signed a refund authorization via `RefundProtocol`;
operator must countersign to execute.

**Severity:** sev3 unless amount > $1k (sev2).

**User-facing status copy:** No banner — refunds are normal flow. Vendor
sees status on their invoice detail page.

**Required evidence:**

- Vendor's EIP-712 refund authorization (already on-chain via signature)
- Reason for refund (vendor's note, not on-chain)
- Buyer notification queued via lib/email.ts

**Allowed operator actions:**

- `refundProtocol.executeRefund(...)` — happy path
- Refuse + log if refund looks fraudulent (vendor refunding to themselves)
- Escalate to disputes if refund + dispute overlap

**Automatic actions:** post-execution, daemon fires
`reputation.record(...REFUND_ISSUED, -3)` + email buyer with receipt.

**Escalation owner:** support lead → BD for amounts > $1k.

**Final user message (buyer):**

> {Vendor} refunded {amount} USDC for invoice {id}. Funds return to your
> wallet automatically. Receipt: {refundTxHash}.

**Audit-log fields:** runbook_id, invoice_id, refund_amount, vendor_sig_hash,
operator_countersign_id, buyer_address.
