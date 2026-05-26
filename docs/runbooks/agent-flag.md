# Runbook: agent-flag

**Trigger:** `IACPHook.beforeAction` reverts on an `AgentEscrow` transition,
or `screeningPassed = false` on the orchestrator's risk check.

**Severity:** sev3 (single-agent scope). Pages in business hours.

**User-facing status copy:**

> An agent linked to your job ({agentName}) was flagged by our screening
> system. Your funds are safe — escrowed and refundable. Klaro is reviewing
> the agent + will resume or refund within 24 hours.

**Required evidence:**

- ACPHook revert reason
- Recent agent reputation events
- Owner contact info from AgentRegistry

**Allowed operator actions:**

- `registry.deactivate(agentId, ReasonCodes.HOLD_SUSPICIOUS)` — pause
- Refund all FUNDED jobs via `agentEsc.cancel(jobId)` on principal-prompt
- `registry.reactivate(agentId)` after owner satisfies remediation

**Automatic actions:** ACPHook revert already blocks the transition. No
auto-refund — operator decides per-job.

**Escalation owner:** agent-economy lead → compliance.

**Final user message:**

> Your job {jobId} was {resumed|refunded}. Reason: {reason}. Receipt or
> refund tx: {hash}.

**Audit-log fields:** runbook_id, agent_id, hook_revert_reason, jobs_paused,
jobs_refunded, total_usdc_movement.
