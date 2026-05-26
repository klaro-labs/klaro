# Runbook: emergency-pause

**Trigger:** Confirmed exploit, regulatory action, or upstream Arc/Circle
outage. v2 §33.

**Severity:** sev0. **Page everyone.** Owner must confirm pause in writing
via signed message.

**User-facing status copy:**

> Klaro is paused while we investigate {one-line reason}. No funds are at
> risk. New activity is on hold until the all-clear. Status updates every 30
> minutes at status.klaro.so.

**Required evidence:**

- Two-owner signed pause authorization (multisig in M12)
- Incident type: EXPLOIT / REGULATORY / UPSTREAM_OUTAGE / SAFETY_DRILL
- Estimated time-to-resolution

**Allowed operator actions:**

- `InvoiceEscrow.pause()`
- `CashoutOrderProcessor.pause()`
- `AgentEscrow.pause()`
- `RetainerStream` is non-pausable by design (it streams already-committed
  funds) — flag for off-chain communication only

**Automatic actions:** None. Pause is always an explicit owner call.

**Escalation owner:** CEO + CTO co-sign. Legal counsel on retainer.

**Final user message:**

> Klaro is back online. Resumed at {timestamp}. Root cause: {plain-language}.
> Detailed post-mortem published at /trust within 48h.

**Audit-log fields:** runbook_id, paused_contracts[], pause_reason,
authorizers[], resumed_at, post_mortem_url.
