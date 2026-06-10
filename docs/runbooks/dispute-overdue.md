# Runbook: dispute-overdue

**Trigger:** `DisputeManager.Case.openedAt + 24h < now` AND status !=
DECIDED. Detector: `disputeSlaWatcher` cron every 1h.

**Severity:** sev2. Pages the on-call panel within 1h.

**User-facing status copy:**

> Your dispute is in our queue. Our review panel will respond within 24 hours
> of opening. If you have new evidence, add it at /vendor/disputes/[case].

**Required evidence:**

- Full case file from DisputeManager
- Cross-reference reputation history of both parties
- Off-chain comms from either side via prateek@myklaro.app

**Allowed operator actions:**

- `disputes.requestEvidence(caseId)` — if either party hasn't responded
- `disputes.assignToReview(caseId)` — pull into panel queue
- `disputes.decide(caseId, outcome, reasonHash, evidenceHash)` — 5 outcomes
- Escalate to senior reviewer for amounts > $5,000 USDC

**Automatic actions:** at +48h, alert escalates to BD director. At +72h
auto-decides REFUND_TO_RESPONDENT (vendor-protective default) + flags case
for post-incident review.

**Escalation owner:** dispute lead → BD → CEO.

**Final user message:** see DisputeManager.Decided event → outcome-specific
template via lib/email.ts.

**Audit-log fields:** runbook_id, case_id, claimant, respondent, age_hours,
outcome, reason_hash, panel_member_ids, decision_notes_hash.
