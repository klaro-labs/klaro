# Runbook: contract-upgrade

**Trigger:** Planned coordinated upgrade of a Klaro contract (fix, gas
optimization, feature addition that requires migration).

**Severity:** sev1 — high-visibility, low-frequency. Always pre-announced.

**User-facing status copy (pre-window):**

> Klaro will deploy contract {ContractName} v{new} on {date} between
> {window_start}-{window_end} UTC. Active flows complete normally; new
> activity pauses for ~{duration} minutes. Status updates at www.myklaro.app/status.

**Required evidence:**

- Diff against current deployed bytecode
- Audit pass on the new version (Slither + Mythril + Echidna)
- Migration plan (state transfer or proxy upgrade)
- Two-owner approval

**Allowed operator actions:**

- Pause current contract via owner-only `pause()`
- Deploy new contract via `forge script script/Deploy.s.sol`
- Update `KlaroConfig` addresses (or proxy implementation slot)
- Set `setOperator` / `setTrustedCaller` wiring for new contract
- Unpause

**Automatic actions:** None — every step is explicit. Daemon stops writing
to the old contract once the address env var flips.

**Escalation owner:** CTO leads the window. CEO + legal on standby.

**Final user message:**

> Klaro contract {ContractName} upgraded to v{new}. New address:
> {newAddr}. Resumed at {timestamp}. Post-mortem (if needed) at /trust.

**Audit-log fields:** runbook_id, contract_name, old_addr, new_addr,
audit_report_hash, deployer_tx, downtime_minutes.

**Rollback (if the new contract misbehaves inside the window):**

1. `pause()` the new contract immediately — stops new state, existing state
   is unaffected.
2. Flip the contract address env vars (web + daemon) back to the previous
   release recorded in `DEPLOYMENT.md`, restart both.
3. In-flight items on the new contract are drained case by case: invoices
   via `RefundProtocol`, cashout orders via dispute resolution or operator
   refund. Nothing migrates automatically.
4. Re-run the post-deploy verification checklist (`DEPLOYMENT.md`) against
   the restored addresses before unpausing public traffic.
5. Record the same audit-log fields with `rollback: true`; post-mortem goes
   to /trust.

See `DEPLOYMENT.md` → "Rollback" for the full procedure.
