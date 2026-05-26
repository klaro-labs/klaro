# Runbook: lp-slash

**Trigger:** LP misconduct (timeout, bad proof, dispute loss, KYB revoked).

**Severity:** sev2. Slash is irreversible — operator gets sign-off in writing.

**User-facing status copy:** None directly to the LP via Klaro UI — LP receives
an out-of-band notice via the operator inbox + suspension reason on /lp.

**Required evidence:**

- DisputeManager case file (if dispute-driven)
- Proof packet from ProofRegistry showing bad UTR / wrong account
- Two-operator countersign for slashes ≥ 25% of stake

**Allowed operator actions:**

- `proc.resolveDispute(cashoutId, slashAmount, reasonHash)` — slash via cashout
- `registry.suspend(lpId, ReasonCodes.SLASH_LP_*)` — non-dispute slash path
- `registry.revoke(lpId, ReasonCodes.KILL_FRAUD)` — terminal kick

**Automatic actions:** post-slash, registry status flips to SUSPENDED.
`reputation.record(...SLASH_PENALTY, -50)` fires.

**Escalation owner:** corridor lead → BD → legal (for amounts > $1k slash).

**Final user message (LP):**

> Your Klaro LP account has been {suspended|revoked}. Reason: {reason}.
> Stake remaining: {amount}. Cool-down: 30 days for review or 7 years if
> KYB-revoked. Email lp-disputes@klaro.so to contest.

**Audit-log fields:** runbook_id, lp_id, slash_amount, reason_hash,
countersign_operator_ids (≥ 2 for big slashes), evidence_packet_hash.
