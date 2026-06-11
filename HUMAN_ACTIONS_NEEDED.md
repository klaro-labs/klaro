# Human Actions Needed

Things outside code that gate full verification or launch.

## 🔴 P0 — credentials / partners that block the remaining base gaps

These five base-product gaps remain. Two are pure code (I can finish them);
three are blocked on something only you can provide.

| Gap | Status | What I need from you |
|---|---|---|
| Webhook endpoint persistence | **code done · live-untested** | ✅ You created the `WEBHOOK_ENC_KEY` vault secret. Code is wired (RPC `webhook_create` encrypts the per-endpoint secret with it). I cannot reach the pooler from the sandbox, so: **apply migration `0035` to the live DB** and **create one webhook from the UI** to confirm the RPC reads the vault key, encrypts, and the row persists. Also before mainnet: replace the test key value with a long random string. |
| Cashout fiat-leg (real payout) | **blocked · now labeled honestly** | A signed/licensed payout LP for at least one corridor (INR). On-chain lock + daemon advance are already real + DB-mirrored (LF-3 + `cashoutAdvancer`). The fiat leg stays simulated and the UI now **says so even in on-chain-live mode** (partner-pending banner + "simulated reference" UTR note, `pb-cashout-fiat.ts`). **You need to provide:** the licensed money-transmitter partner, then set `CASHOUT_FIAT_PARTNER` so `cashoutFiatLive()` flips on and the fiat leg presents as real. |
| Real screening provider | **✅ LIVE (2026-06-05)** | Done. **Sanctions** = OFAC SDN crypto-address list (free, no account — `daemon/src/ofac.ts`); **KYB** = Sumsub sandbox (`lib/sumsub.ts` + WebSDK card on `/vendor/settings`, daemon `sumsub.ts`); behavioral = honest testnet heuristic. Clean + OFAC-clear + KYB-verified → auto-settles; sanctioned buyer / RED-flagged vendor → blocked. **Remaining from you:** set `SUMSUB_APP_TOKEN`/`SUMSUB_SECRET_KEY`/`SUMSUB_LEVEL_NAME` on the **daemon host** so the daemon-side KYB gate is live in prod (web already has them on Vercel). Full Chainalysis KYT / TRM = enterprise contract (the free OFAC oracle covers the sanctions requirement). |
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
2. **Dispute decide→resolve loop — ✅ fully wired; funded-lifecycle E2E pending.**
   The whole product path now exists: admin decide (live) → daemon `disputeDecide`
   signs `DisputeManager.decide` → `Decided` event → arcSubscriber mirrors the DB +
   enqueues → `disputeResolver` signs `resolveDispute` on the right escrow
   (deterministic RELEASE/REFUND; SLASH/PENALIZE → admin for an operator-set
   amount). Both legs unit-tested + live-contract smokes
   (`qa-dispute-decide-route.ts`, `qa-dispute-resolve-route.ts`). **You need to do
   (to prove funds actually move):** run ONE funded lifecycle on testnet — fund an
   escrow (AgentEscrow job / RetainerStream deposit / cashout LOCKED order) →
   `openDispute` → decide via the admin UI → confirm the daemon moves the USDC +
   flips escrow state. Also set `RETAINER_STREAM_ADDRESS` in the daemon env for
   stream-context cases (now in `.env.example`; still needs the deployed address).
3. **Cashout vendor on-chain start — ✅ already wired; injected-wallet E2E pending.**
   `RequestCashoutOnChain` (rendered by `CashoutRequestForm` whenever the vendor
   has a provisioned payout wallet) drives the real LF-3 flow: vendor signs
   `approve` + `requestAndLock` → `recordCashoutRequestedAction` verifies the
   on-chain LOCKED state before writing the row; the daemon advances to RELEASED.
   The on-chain lock + daemon legs are proven by `qa-cashout-daemon-legs.ts`
   (3-wallet). The simulated DB-only `createCashoutAction` is correctly refused in
   live mode (no-wallet sessions). **You need to do:** a browser injected-wallet
   E2E with a funded vendor wallet + USDC to click through approve→lock→release
   end-to-end (the underlying on-chain calls are already proven).
4. **Contract HIGHs (future redeploys):** bound LP slashAmount; wrap
   AgentEscrow.createJob hook; zero-operator guard on the other 16 contracts;
   RetainerStream.pause→owner (needs a test update); link-auth nonce/cap. Each
   needs Foundry tests.
5. **README overclaims:** "screened end to end" and Echidna/Halmos "coverage"
   aren't real yet — wire them or correct the copy before mainnet.
6. MED/LOW: missing `revalidatePath` after some mutations, plaintext
   `invoices.customer_email`, MultiChainRouter Pausable, a11y (MegaMenu
   keyboard nav, skip-link, inline form validation), CI lint gate, Dockerfile
   pin. Full list in the department files.

---

## 🚀 Launch-readiness (2026-06-10, session: cross-chain + auth + branding)

Closed in code this session (committed + deployed): vendor branding renders on
`/i`; onboarding hands its draft to a prefilled invoice; magic-link login
verified end-to-end (real email click → session); webhooks + QuickBooks verified
live; **cross-chain pay-in (CCTP V2 Base Sepolia → Arc) is now REAL** — proven
end to end against a live daemon: buyer burns on Base → `POST /api/cctp/payin` →
BullMQ → daemon attests (Iris) + mints on Arc + credits the invoice (multiple
real settlements, e.g. invoices `0x1112…`, `0x138f…`).

Three things still need **you** before a clean public launch:

### 🔴 P0 — operator daemon must run with a valid `REDIS_URL`
The local `apps/*/.env` `REDIS_URL` is **invalid** (`new URL()` fails — the `@`
between password and host is corrupted), so the daemon can't boot without an
override (I ran a local Redis to verify the cross-chain loop). Nothing settles
without the daemon: webhooks, screening→settlement, cashout, **and cross-chain**.
- Verify the **deploy/daemon host** has a valid `REDIS_URL` and the daemon
  process is running (it picks up the new `cctpPayin` worker on redeploy).
- Then set `CCTP_PAYIN_ENABLED=1` on the web env to show the buyer "Pay from
  Base Sepolia" button (it's gated off by default so nobody burns into a flow
  the daemon can't finish).

### 🔴 P0 — magic-link email deliverability (lands in Spam today)
Supabase's built-in SMTP sends magic links to **Spam/Promotions** (no verified
domain). I registered `myklaro.app` in your Resend account — add these DNS
records to `myklaro.app`, then click **Verify** in Resend:
| Type | Name | Value | Notes |
|---|---|---|---|
| TXT | `resend._domainkey` | `p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCdl5hGvk0raR1pRapGJa84mUofj2HJsxUdQ4Qyw4Xk/QA9dnJOFogxa65kYPp5ge2U0S/qH/QyDbQx0JryxScgfLDydf4DUeKo89iMNhYopNkoIhAtSQY0zaCSozjFUO3CcVQnihFZBJpQDs/8/G8hcX7JhEj9Hk/+p4c0dLbQ6wIDAQAB` | DKIM |
| MX | `send` | `feedback-smtp.us-east-1.amazonses.com` (priority 10) | SPF |
| TXT | `send` | `v=spf1 include:amazonses.com ~all` | SPF |

Then point **Supabase Auth → SMTP Settings** at Resend: host `smtp.resend.com`,
port `465`, user `resend`, password = your `RESEND_API_KEY`, sender
`noreply@myklaro.app`. Magic links then land in the inbox.

### 🟡 P1 — optional "go even more live" (testnet-appropriate as-is)
- KYB: set `SUMSUB_APP_TOKEN`/`SUMSUB_SECRET_KEY` on the **daemon host** (web
  already has them) for live KYB. Sanctions are already live via the free OFAC
  oracle.
- Fiat cashout: set `CASHOUT_FIAT_PARTNER` once a licensed payout LP is signed.
- WebAuthn passkey **login** is backend-ready but intentionally doesn't issue a
  session yet (honestly gated off on `/signin`); magic-link + Google OAuth are
  the live login paths.

### 🟡 Circle App Kit (passkey MPC wallet) — wired, needs the App ID
Onboarding's "Create a Circle MPC wallet" now runs the real Circle Modular
Wallets passkey flow — it's gated on `NEXT_PUBLIC_CIRCLE_APP_ID`. The API key +
client key are already valid (W3S API returns 200). Set `NEXT_PUBLIC_CIRCLE_APP_ID`
to your Modular Wallets app id from console.circle.com and the real
"Create passkey-secured wallet" button replaces the honest "configure" state —
no other code change needed.
