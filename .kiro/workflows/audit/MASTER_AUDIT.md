# Klaro — Master Audit (company-level fleet)

Date: 2026-05-31 · Scope: ~473 source files / ~58.6k LOC.
Coverage: **13 of 13 departments executed** by a 20-agent fleet across 5 batches.

Per-department detail: `D1`–`D13` `.md` files in this folder.

## ✅ Fixed this session (gate-verified: 518 forge · 105 web · 11 daemon · typecheck · lint)
- **C2** RLS write gaps → migration `0036` (team/disputes/webhook_deliveries policies). *Live-untested (pooler).*
- **C1** RetainerStream "cross-stream drain" → **investigated, false positive**; added a regression test proving value conservation + no drain in the exact feared scenario (also fills the untested-path gap D2/D10 flagged).
- Agent-advance **TOCTOU** → atomic `fromStatus` precondition.
- Agent/stream **dispute ownership now uses the live repo** (was mock → always failed live).
- Daemon **`MUTUAL_RESOLVED` (outcome 5)** mapping → migration `0037` adds the enum value; Decided handler.
- Daemon **Decided notify ordering** → DB-sync failure no longer blocks the admin notify.
- **CSP** `connect-src` wildcard in middleware → tightened to the next.config allowlist.
- **Timing-safe** CRON auth compare.
- **Audit-action codes** → distinct codes for LP onboarding + retainer ops (was all `lp.admit`).
- **DisputeManager.setOperator(0)** guard (HIGH-1 brick).

## D10–D13 additions (this batch)
- **D10 QA:** Echidna + Halmos harnesses are **stubs that revert** — README claims formal verification it doesn't run. Daemon workers that move USDC are largely untested; team/webhooks repos untested.
- **D13 Compliance:** README "screened end to end" but all screening providers are simulated stubs (overclaim); on-chain counterparty gate is fail-open (`counterpartyStrict=false`); AgentRegistry stores `displayName` on-chain (vs "no PII on-chain").
- **D11 Design:** MegaMenu is hover-only (keyboard-inaccessible), no skip-link, forms lack inline validation, brand-token files ship pre-fix failing-contrast values.
- **D12 DevOps:** CI doesn't gate lint/format; Dockerfile uses unpinned `pnpm@latest`; no rollback/DLQ-replay runbook.



---

## The two systemic themes (read these first)

**T1 — Live-mode write paths that silently fail or vanish (honest-mode breach).**
Klaro's promise is "never fake a result." But a whole class of write paths look
functional in the UI and do nothing (or error) on the live path:

- **No repo at all** (write goes straight to `mockData`, lost on refresh):
  LP stake/apply/approve/invite, retainer streams, FX corridor quote/settle,
  delegation session-keys, vendor settings read, LP settings payout wallet,
  agent-registry reads. (`D9` P0/P1)
- **Repo exists but the RLS policy was missing** (write denied live):
  `vendor_team_members`, `disputes` UPDATE, `webhook_deliveries` INSERT.
  → **FIXED this session in migration `0036`.** (`D6a/D6b/D7a/D7b` converged)
- **Ownership check reads mock in live mode** → opening a dispute against an
  agent job or stream *always fails* in production. (`D5` P1, `D8c`)

Root cause: the `lib/repo/*.ts` dual-mode wrapper was only applied to invoices,
cashouts, links, and (this session) disputes/agents/team/webhooks. Every other
feature still imports `mockData` directly. **The tests run in mock mode, so none
of this is visible in CI** — only a live Supabase + chain exercise surfaces it.

**T2 — Operator hot-key blast radius.** Several fund-affecting powers sit behind
the operator (hot) key with no bound or cold-key gate: unbounded LP
`slashAmount`, `RetainerStream.pause` on operator not owner, `setOperator(0)`
bricks resolution. A single operator-key compromise is high-impact. (`D3b`, `D8b`)

---

## CRITICAL

| # | Finding | File | Dept | Status |
|---|---|---|---|---|
| C1 | `RetainerStream.resolveDispute` refund can exceed the stream's balance — recipient drains vested funds between dispute-open and decide; payer-won refund then pulls from *other* streams' deposits | `RetainerStream.sol` | D8c | open |
| C2 | RLS write policies missing → team/disputes/webhook writes silently fail live | `migrations` | D6/D7 | **fixed 0036** |
| C3 | Systemic mock-only write paths vanish/no-op live (LP, streams, FX, delegations, settings) — honest-mode breach | `app/lp/*`, `retainer/*`, `fx/*`, `delegations/*` | D9 | open |

## HIGH (selected — full list in department files)

**Contracts / money**
- `AgentEscrow` principal-supplied IACPHook gas-griefing: try/catch doesn't catch OOG → agent lifecycle txs revert → **escrowed USDC permanently locked**. (`D3a/D3d/D2`)
- `CashoutOrderProcessor` unbounded `slashAmount` → compromised/erroneous operator drains an LP's entire stake unrelated to order value. (`D3b/D8b`)
- `FeeSplitter` dust accrual: vendor controls payee ordering, positions self last to harvest rounding dust across many invoices — violates value-conservation invariant. (`D3d/D8a`)
- `DisputeManager.setOperator(address(0))` permanently bricks dispute resolution across AgentEscrow/Cashout/Retainer → stranded funds. (`D3b`)
- `RetainerStream.pause()` gated by `onlyOperator` (hot) not `onlyOwner` (cold) — contradicts every other fund contract. (`D3b`)
- `InvoiceEscrow.createInvoiceFor` `LinkInvoiceAuthorization` is a bearer credential — no nonce, no per-link cap → anyone holding the sig spams invoices to deadline. (`D3c`)
- `AuditReceipt` `tokenId==0` bypasses `verify()` + `AlreadyMinted` guard (architecturally unsound; low probability). (`D8a`)

**Daemon / data**
- Daemon `Decided` handler does **not** fan out to `AgentEscrow`/`RetainerStream.resolveDispute` → funds frozen until manual operator action. (`D8c`)
- `DB_OUTCOME` map missing `MUTUAL_RESOLVED` (outcome=5) → permanent DB↔chain split on ad-hoc disputes. (`D8c`)
- `agentJobs.advanceJob` has no atomic status precondition → TOCTOU allows illegal transition. (`D8c`)
- Payment-link `paid_count` read-then-write lost-update race on concurrent settlements. (`D4/D8a`)
- `Decided` handler throw blocks the `notify-admin` enqueue. (`D4`)
- Dispute ownership check for agent/stream contexts uses `mockGetAgentJob`/`mockGetStream` in live → open-dispute always fails live. (`D5/D8c`)

**Web / appsec**
- CSP `connect-src` wildcard in `middleware.ts` (vs strict allowlist in next.config) — middleware-minted responses allow XSS exfiltration to any HTTPS host. (`D7b`)
- LP settings payout-wallet update is mock-only — never persists. (`D9`)
- `CashoutOrderProcessor` expiry anchored to `requestedAt` not `proofSubmittedAt` → LP unfairly expired. (`D8b`)

## MEDIUM / LOW
~35 findings across `D2/D3/D4/D5/D6/D7/D8/D9` — enum/CHECK-constraint gaps,
missing `revalidatePath` after mutations (stale UI), copy-paste audit-action
codes (`lp.admit` everywhere), missing `loading.tsx`/`error.tsx`, sequential
data-fetch waterfalls, `AgentBudgetWallet` tumbling-window 2× burst, plaintext
`invoices.customer_email`, `MultiChainRouter` missing Pausable, dead
`Status.ACCEPTED`, non-timing-safe `CRON_SECRET` compare. See department files.

---

## Cross-check vs the stale `KLARO_FULL_AUDIT_2026-05-30.md`
- The big prior money-divergence bugs (settle without chain tx; DB flip without
  on-chain truth) are **confirmed closed** (D4 verified). 
- The `respondent_id::uuid` / `lp_id::uuid` cast-trap class is **still live** in
  several LP policies (D6a #3–5) — prior audit flagged it; not fully fixed.
- New issues here (RetainerStream drain, systemic mock-only writes, CSP
  wildcard) are **not** in the stale audit.

---

## Fix backlog (priority order)
1. **C1** RetainerStream per-stream balance accounting on resolveDispute (contract + test). 
2. **C3 / T1** Add `lib/repo/*` dual-mode wrappers (or live guards with honest labels) to LP, streams, FX, delegations, settings; fix dispute ownership checks to use repos. Highest honest-mode value.
3. **HIGH contracts**: bound `slashAmount`; wrap `createJob` hook; `setOperator(0)` guard (13 contracts); `RetainerStream.pause`→owner; link-auth nonce+cap.
4. **HIGH daemon**: dispute→escrow fan-out; `MUTUAL_RESOLVED` mapping; `advanceJob` atomic precondition; `paid_count` atomic increment.
5. **C2** ✅ done (0036) — **verify on the live pooler**.
6. CSP allowlist in middleware; MEDIUM/LOW cleanups.

> Note: every contract/daemon/RLS finding here is from source review. None were
> exercised live (sandbox blocks the pooler + RPC). Confirm C1/HIGH-contract
> items against the Foundry suite and the others on a live stack.
