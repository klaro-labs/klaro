# Operator runbooks

Every runbook follows the same eight-section schema so operators can move between them under pressure without re-learning the format:

1. **Trigger** — the exact condition that fires the runbook
2. **Severity** — sev1 / sev2 / sev3 + paging behaviour
3. **User-facing status copy** — verbatim text for the status page and email templates
4. **Required evidence** — what the operator must collect before any action
5. **Allowed operator actions** — the only actions the operator may take
6. **Automatic actions** — what Klaro infrastructure does without operator input
7. **Escalation owner** — who pages whom when the incident drags
8. **Final user message** — what we send to affected users on resolution

## The runbooks

- [`cashout-stuck.md`](./cashout-stuck.md) — LP claimed but no payout proof submitted
- [`dispute-overdue.md`](./dispute-overdue.md) — dispute past its 24-hour SLA
- [`lp-slash.md`](./lp-slash.md) — LP misconduct requiring stake slash
- [`vendor-kyb-revoke.md`](./vendor-kyb-revoke.md) — vendor KYB compromised
- [`agent-flag.md`](./agent-flag.md) — agent screening hook failed
- [`emergency-pause.md`](./emergency-pause.md) — coordinated pause across all Pausable contracts
- [`refund-issue.md`](./refund-issue.md) — refund authorisation countersign
- [`corridor-outage.md`](./corridor-outage.md) — partner cashout corridor down
- [`contract-upgrade.md`](./contract-upgrade.md) — coordinated upgrade window

Each runbook step writes a structured audit-log entry via [`apps/web/lib/auditLog.ts`](../../apps/web/lib/auditLog.ts) — same schema as on-chain reason codes.
