# BUILD LOG

## M3 — Pre-launch hardening

- ✅ Cashout vendor-signing — confirmed wired + honest-label fix (COVERAGE_GAPS #2
  P0, re-scoped): the gap doc flagged `createCashoutAction` as the stubbed vendor
  entry point, but the **real live path is already wired** —
  `CashoutRequestForm` renders `RequestCashoutOnChain` (vendor signs `approve` +
  `requestAndLock` → `recordCashoutRequestedAction` verifies on-chain LOCKED →
  daemon advances to RELEASED) for any vendor with a provisioned payout wallet;
  the on-chain lock + daemon legs are proven by `qa-cashout-daemon-legs.ts`
  (3-wallet). `createCashoutAction` is only the SIMULATED DB-only fallback for
  no-wallet sessions, correctly refused in live mode. Fixed its stale/misleading
  refusal message ("vendor-signing flow lands M11" — it already landed) to point
  at the on-chain path, preserving the `_not_yet_*`→503 SDK classifier token.
  Remaining: a browser injected-wallet E2E (funded USDC) to click approve→lock→
  release — the underlying on-chain calls are already proven (HUMAN_ACTIONS).

- ✅ Operator dispute-decide path wired (COVERAGE_GAPS #2 P0): the admin
  `decideDisputeAction` threw `dispute_decide_not_yet_wired` in live mode (the web
  can't hold the operator key, so nothing emitted `Decided` through the product —
  the disputeResolver loop had no trigger). Now live-mode decide **enqueues** to a
  new daemon worker `disputeDecide` which signs `DisputeManager.decide(caseId,
  outcome, reasonHash, evidenceHash)` from the operator wallet; the resulting
  `Decided` event drives the DB mirror (arcSubscriber) + the escrow resolution
  (disputeResolver) — proof beats claims, the DB never leads the chain. Outcome→
  ordinal mapped to the on-chain enum (RELEASE=1…MUTUAL=5); idempotent (`isDecided`
  short-circuit) + fail-safe (simulate-then-write: a revert is a non-retryable
  skip, transient errors retry). **Verified:** 7 unit tests (mapping, idempotency,
  simulate-skip, bad-outcome-throws-before-chain); live integration smoke
  (`qa-dispute-decide-route.ts`) drives the real DisputeManager + simulate-skips
  (`DISPUTE_DECIDE_SMOKE_OK`); 55 daemon tests + build green. NOT yet proven: a
  real decision landing, which needs an opened case on a funded escrow (the same
  funded-lifecycle dependency as the resolve leg — documented in HUMAN_ACTIONS).

- ✅ Test-coverage pass A+B (COVERAGE_GAPS.md #1+#2 — the highest risk-to-coverage
  gaps). **A — daemon money-movers (0→31 tests):** new `test/helpers/fakeInfra.ts`
  harness (chainable Supabase fake + queue/worker capture + arc client) drives the
  previously-untested workers — `cashoutAdvancer` (idempotent claimByLP/recordProof/
  operatorConfirmReceived, canonical on-chain amounts, **simulated-proof-never-advances**,
  DB RELEASED only *after* the confirm tx), `disputeResolver` (routing+args,
  chain-derived payToAgent, simulate-skip never writes, transient rethrows, SLASH→admin),
  `screenAndSettle` (**simulated screening NEVER settles**), `receiptGenerate` (mint
  Anchor + DB↔chain hash agreement, fail-loud on missing vendor), and the
  `arcSubscriber` InvoicePaid/Decided/JobCompleted handlers (extracted those 3 inline
  event bodies into exported named fns — no behavior change). 48 daemon tests, build
  green. **B — live-branch repo harness (14 tests, 7 repos):** `test/helpers/liveDb.ts`
  points a repo's `tryDb()` at a real client authenticated AS the test vendor (RLS),
  so the live SQL the mock tests skip — real columns, joins, klaro_role/lp_status
  enums, and the `advanceCashout`/`advanceJob` compare-and-swap preconditions — runs
  against live Supabase. Covers cashouts/agentJobs/disputes/team + delegations/fxQuotes/
  retainerStreams. Surfaced real schema constraints mock mode hides (e.g.
  `cashout_orders.lp_id` FK). Opt-in via `KLARO_LIVE_DB_TESTS=1` (network + shared DB,
  not part of the hermetic gate); default `pnpm test` = 105 pass + 14 skipped. Also
  fixed `RETAINER_STREAM_ADDRESS` missing from the daemon `.env.example` (drift-guard
  catch — COVERAGE_GAPS #2 P0).

- ✅ Contract test-coverage pass (forge 525 green): one comprehensive test asserts all 17 operator-gated contracts reject `setOperator(0)`; covered `CashoutOrderProcessor.resolveDispute` RELEASE_TO_CLAIMANT fund branch + slash-not-allowed-on-release; InvoiceEscrow pause-guard (blocks create, owner-only). Investigated `WrongDisputeContext` — unreachable in the single-escrow flow (an escrow's `openDispute` sets context+status atomically; a colliding id reverts at `dm.open`), so it's belt-and-suspenders; no contrived test written. Verified the contracts `THREAT_MODEL` audit checklist is honest (Echidna/Halmos/Slither/Mythril are unchecked M12 TODO, not claims).
- ✅ README corrected to reality: test count 500→523, tables 37→42, removed the false "Coverage runs against Foundry, Echidna, and Halmos" (now states 523 Foundry tests; harnesses scaffolded-not-wired), and the "screened end to end" claim now says screening runs in simulation until a provider key is added.

- ✅ Contract safety pass COMPLETE (sandbox, forge-verified 519 green): `setOperator(0)` zero-guard now on ALL 17 operator-gated contracts (added `ZeroOperatorAddress()` to the 15 that lacked it + DisputeManager earlier; CounterpartyRegistry already guarded) +test; LP `slashAmount` bounded to the disputed order value +test; `RetainerStream.pause/unpause` → owner-only +test. Investigated + left as intentional (non-bugs): `AgentEscrow.createJob` hook-revert-blocks-create (tested invariant, no funds at create); `RetainerStream` cross-stream "drain" (false positive, conservation test added); `FeeSplitter` dust-to-last-payee (the documented conservation mechanism).
- ⏸️ NOT done — needs cross-layer coordination, not a sandbox contract-only fix: `InvoiceEscrow` link-auth cap. `LinkInvoiceAuthorization` is a permissive relayer credential bounded only by `authDeadline`; a per-link `maxUses` cap requires adding a field to the EIP-712 struct, which would break the web signer + 15 apps/web files (linkPublish.ts, abi.ts, link actions, QA scripts) and the reusable-link model. Must be done as one contract+web change with live re-test. Impact is bounded (vendor always payee; spurious invoices inert until a buyer pays).

- ✅ Daemon dispute→escrow fan-out (Task 4): the `DisputeManager.Decided` handler
  previously mirrored the DB row + alerted an admin but **never released escrow** —
  a decided dispute left funds locked. New daemon worker `disputeResolver.ts`
  (+ pure, unit-tested `disputeRouting.ts`) fans out: the listener enqueues
  `dispute-resolve`; the worker reads the dispute, routes by context, and signs
  the right escrow's `resolveDispute` with the operator wallet so funds move —
  `agent`→`AgentEscrow.resolveDispute(jobId, payToAgent)` (payToAgent derived
  authoritatively from chain: `getCase().claimant == jobs().agent`),
  `cashout`→`CashoutOrderProcessor.resolveDispute(id, 0, reasonHash)`,
  `stream`→`RetainerStream.resolveDispute(id)`. Only the **deterministic** outcomes
  (RELEASE_TO_CLAIMANT / REFUND_TO_RESPONDENT) auto-resolve — each escrow
  re-derives them from DisputeManager so the daemon supplies no number it could
  get wrong; `SLASH_LP`/`PENALIZE_VENDOR` need an operator-set amount (none stored
  in `disputes`) → route to admin; `MUTUAL_RESOLVED`/invoice → skip. Idempotent +
  fail-safe via simulate-then-write: a contract revert (already resolved, wrong
  state, or `OutcomeMismatch`) is classified as a non-retryable skip — **never
  moves funds on a wrong derivation**; transient errors rethrow for BullMQ retry.
  Added `RETAINER_STREAM_ADDRESS` to the daemon env. **Verified:** routing policy
  (`disputeRouting.test.ts`, 6 cases — incl. "slash/penalize never auto-sign");
  17 daemon tests + build green; **live integration smoke** (`qa-dispute-resolve-route.ts`)
  drives the real worker against the **live CashoutOrderProcessor** — routes →
  encodes `resolveDispute` → simulates → safely skips on the on-chain revert (no
  funds, no throw), proving the ABI/address/routing plumbing end-to-end
  (`DISPUTE_ROUTE_SMOKE_OK`). NOT yet proven: a real fund release, which needs a
  funded dispute lifecycle (escrow funded → openDispute → DisputeManager.decide →
  resolve) — recipe documented in HUMAN_ACTIONS.

- ✅ Cashout fiat-leg honest labeling (Task 3): verified the on-chain legs are
  real + DB-mirrored — `recordCashoutRequestedAction` reads `getOrder` and
  requires on-chain `status==LOCKED` + vendor/amount/quoteHash match before
  writing the row (LF-3, proof-beats-claims), and the daemon `cashoutAdvancer`
  signs `claimByLP`/`recordProof`/`operatorConfirmReceived` on Arc then mirrors
  the DB (and already refuses to anchor a `payout_proofs.simulated` proof
  on-chain). The gap was the UI: in on-chain-live mode (`session.simulated=false`)
  the detail page presented the **fiat** (local-currency) payout leg as real,
  but no licensed money-transmitter exists on testnet. Added a `cashoutFiatLive()`
  env flag (`CASHOUT_FIAT_PARTNER`, defaults false — none wired) and an honest
  banner on `/vendor/cashout/[id]`: "Local-currency payout is partner-pending —
  the USDC lock + release on Arc are real, but the INR leg is simulated (licensed
  partner is mainnet-only)"; the UTR note now reads "simulated reference — no real
  payout sent". **Verified like a real user** (`pb-cashout-fiat.ts`: service-role
  provisions a PROOF_SUBMITTED order, vendor views it live, asserts the banner +
  UTR caveat render while on-chain framing stays "real") — `CASHOUT_FIAT_E2E_OK`.
  Documented the new env in `.env.example` (drift-guard test). Lint + 105 web
  tests + typecheck green.

- ✅ LP-profile persistence (T1 honest-mode #4 — final T1 surface): the LP write
  actions (invite / apply / submit-docs / approve / **stake** / **rotate payout
  wallet**) wrote to `mockData` only — every LP mutation vanished on a cold start
  in live mode. New `lib/repo/lp.ts` dual-mode wrapper persists to `lp_profiles`;
  all six actions (`app/lp/actions.ts` + `app/lp/settings/actions.ts`) route
  through it. **Reconciled the app↔DB status divergence** that had deferred this:
  the app's `LPApplicationStatus` carries `DRAFT/DOCS_UPLOADED/REJECTED` but the
  DB `lp_status` enum uses `APPLIED` etc. — added a bidirectional map (e.g.
  `DOCS_UPLOADED↔APPLIED`) so writes never hit an invalid-enum error and reads
  never surface an unknown status; `lpRowToApplication` now lives in the repo and
  is shared with the membership read path. `staked_usdc` is stored in whole-USDC
  dollars (the app carries micro-USDC) — divide on write, multiply on read.
  Honest relabel: the stake page claimed "Live mode: pulls USDC via
  `LPStaking.register()`" — the action only persists the record, so it now reads
  "no USDC is pulled or locked on-chain yet" (on-chain custody partner-pending);
  the LP-settings rotate hint dropped its false "48h cooldown + confirmation ping"
  for "recorded immediately (production adds the cooldown)". A real **webpack
  `node:crypto` build break** surfaced only because the page actually rendered in
  the browser test (lp.ts is in the `lib/auth` import chain, bundled for edge) —
  switched to edge-safe Web Crypto. **Verified like a real user** (`pb-lp.ts`,
  magic-link on :3100, service-role provisions an APPROVED LP whose
  `supabase_user_id` = the vendor's auth uid so RLS passes): rotate payout wallet
  → `lp_profiles.wallet` updates; stake $100 → `staked_usdc=100`, `tier=1`,
  `status=STAKED` (enum-mapped) (`LP_E2E_OK`). Lint + 105 web tests + typecheck
  green. **T1 honest-mode gap fully closed** (delegations + retainer + FX + LP).

- ✅ FX-quote persistence (T1 honest-mode #3): the `/fx` quote + "Execute swap"
  paths wrote to `mockData` only — an issued quote and its settlement vanished on
  a cold start in live mode. New `lib/repo/fxQuotes.ts` dual-mode wrapper persists
  to `fx_quotes` (**0042**, vendor-scoped RLS, numeric(78,0) micro-USDC); page +
  both actions read/write the repo. The FX labels were already honest (5-tone
  simulated / live testnet / access pending / quote expired / demo completed,
  "Demo only · a future live mode would call StableFXAdapterRegistry.swap()"), so
  this was persistence-only — Circle StableFX (FxEscrow + Permit2) access stays
  partner-pending and "settlement complete" remains the demo terminal state, not
  an on-chain swap. **Verified like a real user** (`pb-fx.ts`, magic-link on
  :3100): request a USDC→USYC quote → `fx_quotes` row persists (simulated, not
  settled) → Execute swap → `status` = settlement complete + `settled_at` set,
  badge flips to "Demo completed" (`FX_E2E_OK`). Lint + 105 web tests + typecheck
  green.

- ✅ Retainer-stream persistence (T1 honest-mode #2): create/withdraw/cancel
  wrote to `mockData` only — a created stream vanished on a cold start in live
  mode, and the form falsely claimed "Funds lock immediately on accept" /
  "RetainerStream.createStream()" as if USDC moved on-chain. New
  `lib/repo/retainerStreams.ts` dual-mode wrapper persists the stream + its
  vesting accounting to `retainer_streams` (**0041**, vendor-scoped RLS,
  numeric(78,0) micro-USDC round-tripped through BigInt); the page reads from the
  repo. Honest relabel: the on-chain funding leg needs the **client** (payer) to
  sign an approve+fund tx through an accept flow (no payer wallet in the
  single-vendor dashboard), so vesting is labeled a local **simulation** with a
  "no USDC is locked or moved on-chain" banner; the active badge dropped its
  green "live" tone for "Vesting (simulated)". Also fixed a `LiveCounter`
  hydration mismatch (per-second value now seeded from a server `nowMs` prop).
  **Verified like a real user** (`pb-retainer.ts`, magic-link on :3100): create →
  `retainer_streams` row persists → (service-role backdates `start_at` to
  simulate elapsed time) → Withdraw → `withdrawn_usdc` moves to the vested half →
  Cancel → `cancelled_at` + `cancelled_vested` frozen, badge flips
  (`RETAINER_E2E_OK`). Lint + 105 web tests + typecheck green.

- ✅ Delegations persistence (T1 honest-mode #1): session-key issue/revoke wrote
  to `mockData` only — keys looked issued but vanished on a cold start in live
  mode. New `lib/repo/delegations.ts` dual-mode wrapper persists to a new
  `session_keys` table (**0040**, RLS-scoped to the owning vendor); the page now
  reads from the repo and gained a real **Revoke** button (`RevokeSessionKeyButton`,
  ownership-checked in the action). Also fixed an honesty bug — the badge claimed
  "Circle Modular Wallets" whenever `NEXT_PUBLIC_CIRCLE_CLIENT_KEY` was merely
  present, implying live ERC-6900 enforcement that isn't built; it now always
  reads "Recorded · Circle enforcement pending" with a "not yet an enforced grant"
  note (enforcement is genuinely partner-pending). **Verified like a real user**
  (`pb-delegations.ts`, magic-link login on :3100): issue a `CASHOUT_REQUEST` key →
  asserted the `session_keys` row persists (`revoked_at` null) → reload shows it →
  Revoke → asserted `revoked_at` set + drops off the active list (`DELEGATIONS_E2E_OK`).
  Web typecheck green.

- ✅ Contract safety pass (sandbox, forge-verified 519 green): bounded LP `slashAmount` to the disputed order value (+test); `RetainerStream.pause/unpause` → owner-only (was hot operator key, +test update); `DisputeManager.setOperator(0)` guard. Investigated + DISPROVEN as non-bugs: `AgentEscrow.createJob` hook-revert-blocks-create is intentional (no funds escrowed at create; tested invariant) — left as-is with a doc note. REMAINING contract items (handed to follow-up, not rushed): `setOperator(0)` guard on the other 15 contracts (mechanical MEDIUM — each needs a ZeroAddress error added); `InvoiceEscrow` link-auth nonce/cap (HIGH, signature-scheme change). Coordination: contract work is isolated to packages/contracts; the other agent owns apps/web live-feature work in parallel.

- ✅ Agents live UI + verified like a user (base gap #2 follow-through): removed
  the page-level `supabaseLive()` M11 gate that hid the now-persisted `agent_jobs`
  lifecycle behind a placeholder, and replaced the false "Live mode calls
  AgentEscrow.fundJob()" button labels with honest "on-chain escrow
  partner-pending · no USDC moves" labels + a banner. **Verified like a real
  user** (`pb-agents.ts`, magic-link login on :3100): hire → Fund → Agent starts
  → Submit deliverable → Accept+release, asserting `agent_jobs.status` + each
  stage timestamp in the LIVE Supabase DB at every transition + the deliverable
  hash anchored (`AGENTS_E2E_OK`). Applied **0033** to the live DB (was missing —
  PGRST204 on `agent_label`). On-chain AgentEscrow custody stays partner-pending:
  the mock agent registry has no agent wallets / ERC-8004 identity to escrow
  against, and `startJob`/`submitDeliverable` need the agent to sign; the daemon
  `JobCompleted`→CLOSED mirror handler already exists for when real agents
  onboard. Lint + web typecheck green.

- ✅ Company audit complete (13/13 departments, 20 agents) + fix pass. Fixed gate-verified: RLS write gaps (0036), agent-advance TOCTOU, live agent dispute-ownership, MUTUAL_RESOLVED map (0037), Decided notify ordering, middleware CSP allowlist, timing-safe cron, distinct LP/retainer audit codes, DisputeManager zero-operator guard. CRITICAL RetainerStream "drain" disproven with a regression test (518 forge green). Deferred (documented in HUMAN_ACTIONS): T1 systemic mock-only write paths, daemon dispute→escrow fan-out, remaining contract HIGHs, README overclaims.

- ✅ Agent on-chain payments (base gap #5): daemon `JobCompleted` handler now flips the `agent_jobs` row to CLOSED from on-chain truth (proof-beats-claims), parallel to the disputes `Decided` handler. Daemon typecheck + 11 tests green. (Web→on-chain `createJob` remains the M11 client-signing piece, live-untested.)
- ✅ RLS write-policy fix (migration 0036): added the INSERT/UPDATE policies for `vendor_team_members`, `disputes` (UPDATE), and `webhook_deliveries` (INSERT). **These were a real bug in this session's own disputes/team/webhooks repos** — the writes go through the RLS-scoped client but the policies were missing, so they silently failed live while mock-mode tests passed. Surfaced by the company-level audit (D6/D7 converged). Live-untested (pooler blocked).
- ✅ Company-level codebase audit: 16-agent org-structured fleet (4 batches of ≤4), 8/13 departments (all high/critical-risk). Artifacts + `MASTER_AUDIT.md` in `.kiro/workflows/audit/`. Headline findings: CRITICAL RetainerStream cross-stream refund drain; systemic honest-mode breach (many write paths are mock-only and silently fail live); operator hot-key blast radius. 5 lower-risk departments queued.

- ✅ Webhook persistence (base gap #4): `lib/repo/webhooks.ts` dual-mode; create/list/get/test-ping now persist to `webhooks` (+ best-effort `webhook_deliveries`). Per-endpoint secret generated + `pgp_sym_encrypt`-ed with the `WEBHOOK_ENC_KEY` vault secret via the `webhook_create` security-definer RPC (0035), revealed once; ownership enforced against `vendors.supabase_user_id = auth.uid()`. Delivery still signs with the global `WEBHOOK_HMAC_SECRET` (per-endpoint routing is M11). Gate-verified green (105 web tests). **Live-untested: the RPC/vault/pgcrypto path needs 0035 applied + one pooler run to confirm.**

- ✅ Team persistence (base gap #3): `lib/repo/team.ts` dual-mode; invite/role/remove + team page now persist to `vendor_team_members` (klaro_role case-mapped; status from accepted_at/removed_at); migration 0034 makes `supabase_user_id` nullable for pending invites. Gate-verified green (105 web tests).

- ✅ Agents persistence (base gap #2): `lib/repo/agentJobs.ts` dual-mode; `createJobAction`/`advanceJobAction` + agent read pages now persist to `agent_jobs` (dropped `agents_not_yet_persistent` gates); state-machine guards retained; schema aligned (0033). Gate-verified green (105 web tests).

- ✅ Disputes persistence (base gap #1): dual-mode `lib/repo/disputes.ts`; vendor/LP/admin/API open + evidence now persist to Supabase (dropped `disputes_not_yet_persistent` gates); all read paths live; daemon flips the row to DECIDED from the on-chain `Decided` event (proof-beats-claims); schema aligned (0032) + repo round-trip test. Gate-verified green; live multi-wallet E2E pending env (see HUMAN_ACTIONS_NEEDED).

- ✅ Suite green at `efa5b91`+: fixed 7 stale web tests (agent state-machine now behind the `supabaseLive()` M11 gate → forced sim mode; invoice-PII route hardened to vendor-auth → mocked matching session). 517 forge / 103 web / 11 daemon all green. `1e3ada5`

## M2 — Lovable Port

- ✅ Step 1: Foundation primitives (PageHero, FeatureCard, MockBrowserChrome, CTAPair, StatTile, MegaMenu) + tile tokens
- ✅ Step 2: Nav rewrite (5 items, mega-menu on Product + Resources) + Footer link update (Build, Resources sections)
- ✅ Step 3: /product overview rewrite — 5 surface cards, PageHero, TrustStrip, FinalCta
- ✅ Step 4: Product sub-pages — /product/invoicing, /product/receipts, /product/cashout, /product/stablefx, /product/reputation
- ✅ Step 5: /pricing rewrite — 3-tier cards, FAQ, honest values (Free / 1.0% / Custom)
- ✅ Step 6: /build page created + 301 redirect from /developers
- ✅ Step 7: /resources hub + /resources/flows (8 canonical flows with state machines)
- ✅ Step 8: /brand-kit alias (/resources/brand → /brand-kit redirect)
- ✅ Step 9: /company/contact page with form + email directory
- ✅ Step 10: /signin quiet rewrite — reduced glow, passkey CTA, fixed hover + error copy
- ✅ Step 11: /onboarding — 4-step flow (business, wallet, verification, first invoice)
- ✅ Step 12: AppShell — VendorNav (5 items), MobileShell (Lucide icons + safe-area) already adopted in PREMIUM_FIX_PLAN; vendor pages use consistent layout

## M4 — Launch-readiness hardening (2026-06-01)

Code-fixable bucket from the full launch-readiness audit. Each batch tested + verified green before commit.

- ✅ Money-correctness (`f764d15`): retainer-stream withdraw is now an optimistic CAS (no double-withdraw under concurrency); cashout payout + FX dst-amount are pure-bigint (no float drift); LP stake→tier adds the previously-missing T4 (≥$10k). Extracted `lib/lpTiers.ts` + `lib/slugs.ts`.
- ✅ Honest fee labeling (`73aa05b`): cashout form marks Klaro fee + LP spread "· indicative" — on testnet the full USDC is released; on-chain withholding ships with the mainnet contract. No implied cut today.
- ✅ Daemon reconciler + chain-first release idempotency (`dfaa8e6`): release branch reads chain state before signing (an already-RELEASED order is mirrored, not re-signed → no revert/DLQ/strand); a 5-min reconcile sweep repairs any DB row lagging a RELEASED on-chain order via atomic CAS + drift alert. Read-only on-chain.
- ✅ Latent build fix (`8f7757e`): committed `lib/slugs.ts` — HEAD imported it but it was untracked, so a clean clone failed typecheck. Wired `isValidSlug` into `/pay/[slug]` as a pre-DB format filter; unit-covered.
- ✅ Deployment preflight + prod boot gate (`f00b046`): `assertBootConfig()` refuses to start prod if money-critical config is missing (no-network, can't flap); `pnpm preflight` actively probes RPC chain-id, contract bytecode, operator gas, Redis, Supabase. Verified live GO.
- ✅ FeeSplitter conservation invariant (`91a17dc`): live Foundry stateful-fuzz for THREAT_MODEL I3 (256 runs × 128k calls, 0 reverts) — replaces the unwired Echidna stub for I3. I1/I2 remain honest stubs.
- ✅ Invoice orphan-prevention (`5fea6b8`): a line-items insert failure now compensating-deletes the invoice + throws (both errors surfaced if cleanup fails) instead of stranding a header-only invoice. True atomic RPC deferred to mainnet.
- ✓ Verified ALREADY-done (no work needed): webhook SSRF (store + DNS-rebind fetch guard), idempotency tenant-isolation, audit-log durable Sentry sink, listener cursor durability (Redis persist+resume+reorg-overlap) + claimOnce dedup, RLS write-policy gaps (0036).

Suite after M4: 526 forge / 121 web (3 new) / 65 daemon (6 new) — all green; web + daemon typecheck clean.
