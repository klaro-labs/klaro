# Runbook: corridor-outage

**Trigger:** Partner cashout corridor down (LP unreachable, banking rail
maintenance, regulatory hold).

**Severity:** sev2.

**User-facing status copy:**

> {Corridor} cashouts are temporarily paused while our partner completes
> maintenance. Existing in-flight cashouts continue to settle. We'll resume
> new requests at {ETA}.

**Required evidence:**

- Partner-side incident report (email or status page)
- ETA in writing
- ReasonCodes hash (PAUSE_PARTNER_OUTAGE)

**Allowed operator actions:**

- `policy.pauseCorridor(corridor, ReasonCodes.PAUSE_PARTNER_OUTAGE)` —
  blocks new requests; in-flight orders unaffected
- Reassign open orders to backup LPs in same corridor (if available)
- Set GrowthBook flag `cashout_inr_pilot_live = false` if cascading

**Automatic actions:** Once paused, the cashout UI surfaces the corridor
with status `Paused · partner outage` per the existing 11-corridor registry.

**Escalation owner:** corridor lead → BD director.

**Final user message:**

> {Corridor} cashouts are live again. Resumed at {timestamp}. If your
> request was affected, you'll see the updated status in your dashboard.

**Audit-log fields:** runbook_id, corridor, paused_at, resumed_at,
partner_incident_id, affected_order_ids[].
