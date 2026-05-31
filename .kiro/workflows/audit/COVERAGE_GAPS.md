# Klaro — Coverage Gaps & Missing Pieces (2026-05-31)

What's untested and what's incomplete, after the base-product build-out.
Detail: `COVERAGE_web.md`, `COVERAGE_daemon.md`, `COVERAGE_contracts.md`,
`MISSING_pieces.md`. Gate count today: 520 forge / 105 web / 17 daemon.

## The one-line truth
The gates are green, but green means little here: **almost nothing is tested at
the layer where it can actually break.** Every web repo test runs in mock mode,
the daemon's money-movers have zero tests, and two "coverage" claims in the
README are stubs that revert.

---

## 1. Test coverage — the big gap

### Web (1 of 19 repos has a test, and it mocks the DB)
- **Zero repos exercise the live Supabase branch** — every test forces `tryDb→null`.
  So column names, joins, RLS, and the atomic preconditions I added are never
  actually run against a DB. The 4 newest repos (delegations, fxQuotes,
  retainerStreams, lp) + team/webhooks/agentJobs have **no test at all**.
- **22 of 24 server actions** and **20 of 26 API routes** untested — incl.
  WebAuthn/passkey login, magic-link redirect, admin pause, cashout quote-hash.

### Daemon (0% worker logic covered)
- 15 workers, 3 test files — and those 3 only test Redis primitives + one pure
  routing function. **Every money-mover is untested:** `cashoutAdvancer`,
  `screenAndSettle`, `disputeResolver`, `receiptGenerate`, and the
  `arcSubscriber` InvoicePaid / Decided / JobCompleted handlers. A bug here
  strands USDC or makes the UI say "settled" while funds never moved — and
  nothing would catch it before mainnet.

### Contracts (520 tests, but real holes)
- **Echidna + Halmos harnesses are STUBS that `revert`** — yet the README +
  THREAT_MODEL claim "coverage runs against Foundry, Echidna, and Halmos." That
  is an overclaim to fix.
- `CashoutOrderProcessor.resolveDispute` **RELEASE_TO_CLAIMANT** (pays the
  vendor) — fund-moving branch, **zero tests**.
- `WrongDisputeContext` cross-context-replay guard — **0 tests** on all 3 escrows.
- Only **5 fuzz tests total**; 7 fund-moving contracts have none.
- **15 of 17** `setOperator(0)` guards I added are untested (only RetainerStream).
- 5 of 10 Pausable contracts have no pause-guard test (InvoiceEscrow has 10
  `whenNotPaused` functions).

---

## 2. Missing / incomplete flows (honestly labeled, but not done)

These **throw labeled `_not_yet_` errors** in live mode — good (no faking), but
the flows aren't usable end-to-end on testnet yet:

- **P0 Cashout can't be started live** — `createCashoutAction` throws
  `cashout_submission_not_yet_live` (vendor-signing flow = M11). The on-chain
  legs + daemon advancer are real, but the vendor entry point is a stub.
  (cashout/actions.ts:51)
- **P0 Disputes can't be decided via the product** — admin `decide` / `requestEvidence`
  throw in live (`dispute_decide_not_yet_wired`): web can't hold the operator
  key, and there's no operator tooling/UI to call `DisputeManager.decide()` on
  chain. The daemon fan-out (disputeResolver) only fires *after* a Decided event
  that nothing currently emits through the product. (admin/disputes/actions.ts:56)
- **P0 Webhook `/api/v1` route** still uses a dead in-memory Map while the wired
  repo + migration 0035 sit unused — the vendor-UI path was migrated, the API
  path was not. (verify + switch to the repo)
- **P0** `RETAINER_STREAM_ADDRESS` missing from daemon `.env.example` → stream
  dispute resolutions silently skip.
- **P1** LP preferences (no table), StableFX adapter (no-op), ERP (planned),
  agent-call API (stub), admin pause (refuses on-chain).

## 3. Overclaims to correct (README / THREAT_MODEL)
- "Coverage runs against Foundry, Echidna, and Halmos" — Echidna/Halmos are stubs.
- "screened end to end" — screening is simulated.
- Stale counts: tests (520 vs 500), tables (44 vs 37), contracts.
- `database.types.ts` not regenerated for the 3 newest tables (0040–0042).

---

## Recommended priority (what to test / finish next)
1. **Daemon money-mover tests** — cashoutAdvancer, screenAndSettle, disputeResolver,
   receiptGenerate, arcSubscriber handlers. Highest risk-to-coverage ratio.
2. **At least one live-branch repo test harness** — so the dual-mode repos are
   verified against a real (or testcontainer) Postgres with RLS, not just mocks.
3. **Contract fund-branch + guard tests** — resolveDispute RELEASE path,
   WrongDisputeContext, the 15 setOperator guards, pause guards; wire or delete
   the Echidna/Halmos stubs.
4. **Finish the M11 stubs** — cashout vendor-signing, operator dispute-decide path.
5. **Correct the README/THREAT_MODEL overclaims** (cheap, high-integrity).
