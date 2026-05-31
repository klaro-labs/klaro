# Human Actions Needed

Things outside code that gate full verification or launch.

## 🔴 P0 — credentials / partners that block the remaining base gaps

These five base-product gaps remain. Two are pure code (I can finish them);
three are blocked on something only you can provide.

| Gap | Status | What I need from you |
|---|---|---|
| Webhook endpoint persistence | **code done · live-untested** | ✅ You created the `WEBHOOK_ENC_KEY` vault secret. Code is wired (RPC `webhook_create` encrypts the per-endpoint secret with it). I cannot reach the pooler from the sandbox, so: **apply migration `0035` to the live DB** and **create one webhook from the UI** to confirm the RPC reads the vault key, encrypts, and the row persists. Also before mainnet: replace the test key value with a long random string. |
| Cashout fiat-leg (real payout) | **blocked · now labeled honestly** | A signed/licensed payout LP for at least one corridor (INR). On-chain lock + daemon advance are already real + DB-mirrored (LF-3 + `cashoutAdvancer`). The fiat leg stays simulated and the UI now **says so even in on-chain-live mode** (partner-pending banner + "simulated reference" UTR note, `pb-cashout-fiat.ts`). **You need to provide:** the licensed money-transmitter partner, then set `CASHOUT_FIAT_PARTNER` so `cashoutFiatLive()` flips on and the fiat leg presents as real. |
| Real screening provider | **blocked** | Chainalysis / TRM / Sumsub API credentials. Settlement currently fail-closes to manual review (correct). Wire a provider key to enable auto-screening. |
| Team membership persistence | **code, schema wrinkle** | No credential needed — I can finish it. `vendor_team_members.supabase_user_id` is NOT NULL, but an invited teammate has no user id until they accept; needs a small migration to make it nullable for pending invites. Next code increment. |
| Agents on-chain fund flow (AgentEscrow) | **persistence live-verified · escrow partner-pending** | Job lifecycle now persists + is UI-E2E-verified live (`pb-agents.ts`: hire→fund→start→deliver→close, every status + timestamp checked in the live DB). On-chain custody needs real agent **ERC-8004 identity + payout wallet** — production agents have none today (mock registry), and `startJob`/`submitDeliverable` must be signed by the agent. The daemon `JobCompleted`→CLOSED mirror handler is ready for when real agents onboard. **You need to provide:** the agent-onboarding rail (real ERC-8004 registrations with wallets) before on-chain escrow can be wired end-to-end. |

## 🟡 P1 — verification env for live multi-wallet E2E

Disputes persistence is wired + gate-verified (typecheck/lint/105 web tests/11 daemon tests/517 forge). The §9 "verified like a real user" step — drive open → evidence → on-chain `decide` → daemon flips the Supabase row, asserting BOTH on-chain state AND the DB row — needs the live stack the sandbox blocks:

- Web dev server on `:3100`, local Redis (`klaro-redis`), daemon with `KLARO_RUN_QUEUE_WORKER=1`
- Arc testnet RPC reachable, Supabase pooler reachable
- The 3 test wallets funded (operator / vendor / LP)

Run `apps/web/scripts/qa-dispute-drive.mjs` (extend it to assert the `disputes` Supabase row mirrors the on-chain DECIDED outcome) on a machine with that access. Same applies to the agents flow once AgentEscrow is wired. Until then these ship gate-verified, E2E-pending.


---

## 🔬 Company-level audit (2026-05-31) — what's done and what's left

A 13-department, 20-agent audit ran over the whole codebase. Full report:
`.kiro/workflows/audit/MASTER_AUDIT.md`.

### ✅ Fixed + gate-verified this session (518 forge · 105 web · 11 daemon)
RLS write gaps (0036), agent-advance TOCTOU, live agent dispute-ownership,
MUTUAL_RESOLVED mapping (0037), Decided notify ordering, middleware CSP,
timing-safe cron, audit-action codes, DisputeManager zero-operator guard. The
flagged CRITICAL (RetainerStream drain) was disproven with a regression test.

### 👉 You must do (DB migrations — sandbox can't reach the pooler)
Apply **0035, 0036, 0037** to the live database, then smoke-test: add a webhook,
invite a teammate, advance an agent job, add dispute evidence. Confirm each
persists (these were silently failing live before 0036).

### 🟠 Deferred — needs dedicated, careful work (do NOT rush; I can do these next)
1. **T1 honest-mode — ✅ DONE (all four surfaces persisted + live-verified).**
   The write paths that used to vanish in live mode now persist through dual-mode
   `lib/repo` wrappers, each UI-verified on :3100 against live DB rows:
   - ✅ **Delegations** — `lib/repo/delegations.ts` + `session_keys` (0040),
     issue/revoke (`pb-delegations.ts`); Circle ERC-6900 enforcement
     partner-pending (labeled honestly, not faked).
   - ✅ **Retainer streams** — `lib/repo/retainerStreams.ts` + `retainer_streams`
     (0041), create/withdraw/cancel (`pb-retainer.ts`); on-chain funding
     partner-pending (vesting labeled simulated).
   - ✅ **FX corridors** — `lib/repo/fxQuotes.ts` + `fx_quotes` (0042),
     quote/settle (`pb-fx.ts`); StableFX access partner-pending.
   - ✅ **LP profiles** — `lib/repo/lp.ts` (writes to `lp_profiles`),
     invite/apply/docs/approve/stake/rotate-wallet; app↔DB `lp_status` enum
     reconciled (DOCS_UPLOADED↔APPLIED). Rotate-wallet + stake UI-verified
     (`pb-lp.ts`); on-chain `LPStaking` custody partner-pending (labeled). NOTE:
     LP notification/corridor prefs still need an `lp_preferences` table — those
     toggles already refuse honestly ("Coming soon"), so no mock leak.
2. **Daemon dispute→escrow fan-out — ✅ built; fund-release E2E pending.** The
   `disputeResolver` worker now auto-signs `resolveDispute` on the right escrow
   from the `Decided` event for the deterministic outcomes (RELEASE/REFUND);
   SLASH_LP/PENALIZE route to admin (need an operator-set amount). Routing is
   unit-tested + a live integration smoke (`qa-dispute-resolve-route.ts`) proves
   it drives the real CashoutOrderProcessor + simulate-skips safely. **You need
   to do (to prove funds actually release):** run a funded dispute lifecycle on
   testnet — fund an escrow (AgentEscrow job / RetainerStream deposit / cashout
   LOCKED order) → `openDispute` → `DisputeManager.decide(caseId, RELEASE/REFUND)`
   → confirm the daemon's `dispute-resolve` job moves the USDC + flips the escrow
   state. Also set `RETAINER_STREAM_ADDRESS` in the daemon env for stream cases
   (currently unset, so stream fan-out is a no-op-with-loud-error until wired).
3. **Contract HIGHs (future redeploys):** bound LP slashAmount; wrap
   AgentEscrow.createJob hook; zero-operator guard on the other 16 contracts;
   RetainerStream.pause→owner (needs a test update); link-auth nonce/cap. Each
   needs Foundry tests.
4. **README overclaims:** "screened end to end" and Echidna/Halmos "coverage"
   aren't real yet — wire them or correct the copy before mainnet.
5. MED/LOW: missing `revalidatePath` after some mutations, plaintext
   `invoices.customer_email`, MultiChainRouter Pausable, a11y (MegaMenu
   keyboard nav, skip-link, inline form validation), CI lint gate, Dockerfile
   pin. Full list in the department files.
