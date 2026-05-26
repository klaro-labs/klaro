# Klaro threat model (top-level)

This document covers the **system**: web app, daemon, Supabase, third-party providers, RPC. For the contract-specific threat model see `packages/contracts/THREAT_MODEL.md`.

Trust boundaries:

```
  vendor / buyer  → Vercel edge → Next.js (RLS via Supabase)
                                ↘ /api/* → REST handlers (zod-validated)
                                ↘ /api/cron/* (Bearer-gated)
  Arc L1 ←─ daemon (Railway, Node 22) → Redis (BullMQ) + Supabase service-role
                                       ← Sentry / PostHog
  webhook senders → /api/webhooks/* (HMAC SHA256 + 5-min replay)
  outbound        → /api/v1/webhooks (sign + retry + DLQ)
```

## Attack surface + controls

| #   | Vector                        | Threat                                             | Control                                                                                                                                                          |
| --- | ----------------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Cross-tenant data leak        | Vendor A reads Vendor B's invoices                 | Supabase RLS on every table; helpers `current_vendor_id()` / `is_admin()`. Verified by RLS-policy unit tests.                                                    |
| 2   | Server-action param injection | Client sets `vendorId` directly                    | Every action derives identity from `requireVendor()` / `requireOperator()`; never trusts form data. (Audit fix 2026-05-25 P0-1.)                                 |
| 3   | Webhook replay                | Attacker re-sends a signed delivery                | `verifyHmac` enforces 5-min `t` window + in-memory dedupe by signature.                                                                                          |
| 4   | Webhook signature forgery     | Forged HMAC                                        | Constant-time `crypto.timingSafeEqual`; fail-closed when secret unset in prod.                                                                                   |
| 5   | API rate-storm                | Scrapers / accidental retry loop                   | Edge middleware token-bucket: 60 req/min per IP on `/api/*`. Upstash Redis in prod.                                                                              |
| 6   | Cron forgery                  | Anonymous caller triggers reminders                | `Authorization: Bearer $CRON_SECRET` required on every cron route.                                                                                               |
| 7   | Open redirect                 | `?from=https://evil` round-trip                    | Allow-list paths only on `/signin` + `/auth/callback`; MoonPay redirect already locked down.                                                                     |
| 8   | XSS via vendor branding       | Vendor stores `<script>` in display name           | React escapes by default; CSP `frame-ancestors 'none'` + `x-frame-options: DENY`.                                                                                |
| 9   | CSRF on server actions        | Cross-site form post                               | Next.js automatic action-id token + SameSite=lax session cookie.                                                                                                 |
| 10  | Session theft                 | Stolen cookie                                      | `secure; httpOnly; sameSite=lax`; rotation via `secrets.ts` previous-secret window.                                                                              |
| 11  | RPC compromise                | Hostile Arc RPC returns wrong state                | `arcClient.ts` falls back to mock; never trust RPC for money-moving decisions — those go through the daemon listener with `(event,txHash,logIndex)` idempotency. |
| 12  | Operator-secret leakage       | Service-role key on the client bundle              | `serviceDb()` only callable from server actions / daemon. Build flag fails the build if `SUPABASE_SERVICE_ROLE_KEY` is imported in a `"use client"` file.        |
| 13  | Push-subscription abuse       | Attacker registers their endpoint for another user | Push endpoints stored per vendor; `subscribePush` posts a signed body including `userAgentHash` for binding.                                                     |
| 14  | PII leakage to Sentry         | Free-form `noteMd` contains emails                 | `auditLog.ts` strips emails + 0x-wallets before breadcrumb.                                                                                                      |
| 15  | Drift between docs + on-chain | Arc moves an address, code doesn't                 | Pre-deploy CI gate diffs `docs.arc.io/llms.txt` against `KlaroConfig.sol`.                                                                                       |

## Incident response

- DLQ alert → `docs/runbooks/dlq-handler.md`
- Webhook 5xx storm → rotate `WEBHOOK_HMAC_SECRET` via `_PREVIOUS` window
- Contract pause → operator calls `pause()` on every Pausable, web shows banner via `/api/status`
- Stolen operator key → rotate via Safe multisig owner change; daemon re-signs everything with the new key

## Out of scope

- Arc L1 consensus and its USDC + CCTP + Gateway contracts (Circle's threat model applies)
- Third-party KYB providers (Sumsub, Elliptic, TRM) — they hold their own evidence; we anchor only hashes
- Vendor's own customer-database privacy (their data, their controls)

## Update process

Any new server action, API route, or webhook receiver MUST add a row to the table above before merge. CI greps for "@klaro/threat-model" in PR descriptions whenever `apps/web/app/api/**` or `apps/web/app/**/actions.ts` changes.
