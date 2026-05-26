# Runbook: cashout-stuck

**Trigger:** Cashout in `CLAIMED` state with no `recordProof` call after 30
minutes. Detector: operator daemon `cashoutStuckWatcher` polls every 5m.

**Severity:** sev3 (vendor-impacting, not platform-down). Pages the on-call
in business hours; queues until next business day after-hours.

**User-facing status copy:**

> Your cashout is taking longer than expected. The Klaro partner is verifying
> your payout — we'll send a confirmation as soon as it's complete. No action
> needed from you. Track at /vendor/cashout/[id].

**Required evidence:**

- LP id + the LP's claim timestamp
- LP's last comms in the operator inbox
- Vendor's confirmation/dispute history

**Allowed operator actions:**

- `proc.expireUnconfirmed(cashoutId)` if past 24h CONFIRM_WINDOW + LP unreachable
- Reach out to LP via the recorded ops channel (NOT in-Klaro DM)
- Escalate to dispute manager if LP claims proof exists but won't share

**Automatic actions:** none — this runbook is operator-driven on purpose.
Automating premature expiry would slash an LP unfairly.

**Escalation owner:** corridor lead → BD director → CEO (4h, 12h, 24h).

**Final user message:**

> Your cashout completed at {timestamp}. Receipt: {receiptHash}. Thanks for
> your patience.

**Audit-log fields:** runbook_id, cashout_id, lp_id, operator_id,
action_taken, reason_hash (ReasonCodes.HOLD_SUSPICIOUS or
ReasonCodes.SLASH_LP_TIMEOUT), notes_md.
