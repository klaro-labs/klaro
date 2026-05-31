# Human Actions Needed

Things outside code that gate full verification or launch.

## 🔴 P0 — credentials / partners that block the remaining base gaps

These five base-product gaps remain. Two are pure code (I can finish them);
three are blocked on something only you can provide.

| Gap | Status | What I need from you |
|---|---|---|
| Webhook endpoint persistence | **blocked** | `webhooks.secret_ciphertext` must be `pgp_sym_encrypt`-ed. Provide a symmetric encryption key (Supabase Vault secret or a `WEBHOOK_ENC_KEY` env) so I can persist endpoints without storing the HMAC secret in plaintext. Until then it stays mock + labelled simulated. |
| Cashout fiat-leg (real payout) | **blocked** | A signed/licensed payout LP for at least one corridor (INR). No rails exist today; the on-chain lock + daemon advance are already real. Without a partner the fiat leg stays simulated. |
| Real screening provider | **blocked** | Chainalysis / TRM / Sumsub API credentials. Settlement currently fail-closes to manual review (correct). Wire a provider key to enable auto-screening. |
| Team membership persistence | **code, schema wrinkle** | No credential needed — I can finish it. `vendor_team_members.supabase_user_id` is NOT NULL, but an invited teammate has no user id until they accept; needs a small migration to make it nullable for pending invites. Next code increment. |
| Agents on-chain fund flow (AgentEscrow) | **partial** | Job persistence is done. Wiring real on-chain `AgentEscrow.createJob`/payout is the F8 fan-out item — needs the operator-signed daemon producer (next increment, code). |

## 🟡 P1 — verification env for live multi-wallet E2E

Disputes persistence is wired + gate-verified (typecheck/lint/105 web tests/11 daemon tests/517 forge). The §9 "verified like a real user" step — drive open → evidence → on-chain `decide` → daemon flips the Supabase row, asserting BOTH on-chain state AND the DB row — needs the live stack the sandbox blocks:

- Web dev server on `:3100`, local Redis (`klaro-redis`), daemon with `KLARO_RUN_QUEUE_WORKER=1`
- Arc testnet RPC reachable, Supabase pooler reachable
- The 3 test wallets funded (operator / vendor / LP)

Run `apps/web/scripts/qa-dispute-drive.mjs` (extend it to assert the `disputes` Supabase row mirrors the on-chain DECIDED outcome) on a machine with that access. Same applies to the agents flow once AgentEscrow is wired. Until then these ship gate-verified, E2E-pending.
