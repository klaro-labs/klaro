# Runbook: vendor-kyb-revoke

**Trigger:** KYB documents fail re-verification, vendor on a sanctions list,
or material fraud signal.

**Severity:** sev1. Halt all vendor flows within 1h.

**User-facing status copy:**

> Your Klaro account is on hold pending KYB review. Active invoices remain
> claimable by buyers; cashouts are paused. Reply to this email with current
> KYB documents to expedite review.

**Required evidence:**

- Updated KYB packet OR sanctions hit report
- Legal-team approval for revoke (mandatory)
- Off-chain comms attempt to vendor (≥ 1 reply window)

**Allowed operator actions:**

- Pause vendor's outgoing cashouts via API-level RBAC flag
- `reputation.record(...KYB_REVOKED, -75)` for permanent action
- Refer to legal for terminal kill

**Automatic actions:** Once flagged, daemon halts new `createInvoice` calls
from this vendor address + freezes pending cashouts.

**Escalation owner:** compliance lead → legal → CEO.

**Final user message:** legal-template only. Operators do NOT compose
ad-hoc copy for KYB revocations.

**Audit-log fields:** runbook_id, vendor_id, sanctions_source, legal_signoff_id,
revoke_reason_hash, retention_window_days (FATF default 7y).
