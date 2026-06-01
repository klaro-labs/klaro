# Buildable-on-Arc-testnet-now — build plan (2026-06-02)

From a 5-agent map of every not-built feature, classified **build-now** (fully works
on Arc testnet now, no external account/license/mainnet) vs **blocked** (needs a paid
provider/license). The operator-signed `wallet.writeContract` pattern in
`apps/daemon/src/workers/cashoutAdvancer.ts` is the proven template every money-flow
item mirrors. All contract addresses confirmed against `DEPLOYMENT.md`.

## 🔨 BUILD-NOW (ordered: highest value / lowest risk first)

| # | Feature | Effort | Status |
|---|---|---|---|
| 1 | **Klaro Link relayer** — real on-chain `createInvoiceFor` at pay time (permissionless; needs only a funded testnet gas wallet — `LINK_PUBLISHER_PRIVATE_KEY` already set) | S | ☐ |
| 2 | **On-chain denylist live read** — `NEXT_PUBLIC_COUNTERPARTY_REGISTRY_ADDRESS` set → `readDenylistEntries` goes live | S | ☐ |
| 3 | **On-chain reputation writes** — operator-signed `VendorReputation.record()` at settle/release/job-close/dispute; lights up the already-live read | M | ☐ |
| 4 | **Agent escrow on-chain lifecycle** — createJob→fund→start→deliver→complete/cancel against deployed `AgentEscrow` (mirrors cashout) | M | ☐ |
| 5 | **CCTP V2 cross-chain receive** — Base/Eth Sepolia burn → Iris attest (keyless) → Arc `receiveMessage` mint → invoice settle (daemon poller) | L | ☐ |
| 6 | **StableFX USDC↔EURC swap** — via deployed **MockStableFXAdapter** (operator seeds rate + EURC liquidity); EURC confirmed on Arc testnet | M | ☐ |
| 7 | **Admin pause/unpause multicall** — operator-signed `pause()` over the Pausable contracts (auth/reasons/audit already exist) | M | ☐ |
| 8 | **Webhook subscription persistence** — Supabase table + repo + per-vendor secret encryption (unblocks the live delivery worker) | M | ☐ |
| 9 | **Persistent disputes** — tables + repo (verify branch first — may already be done) | M | ☐ |
| 10 | **Web Push send-half + CTA** — install `web-push`, `sendPush` fan-out, settings opt-in (VAPID self-generated, no account) | M | ☐ |
| 11 | **Retainer streams on-chain** — payer approve+`createStream`, recipient `withdraw`, payer `cancel` (needs a payer-signing surface) | L | ☐ |
| 12 | **Webhook receivers `onVerified` effects** — idempotent upserts (pairs with CCTP) | S | ☐ |
| 13 | **/api/status honesty** — derive CCTP/Gateway from live flags (✅ partial: marked pending in `90344c0`) | S | ◑ |
| 14 | **Notification preferences UI** — Supabase CRUD + gating | S | ☐ |
| 15 | **Privacy/AML retention countdown** — DB state machine + scheduled hard-delete | S | ☐ |
| 16 | **Testnet KPI live aggregation** — daemon writes `kpi_snapshots` from settled invoices (do last, needs real data) | M | ☐ |

## 🚫 BLOCKED (need a paid account / license / mainnet — cannot fully work on testnet now)

- **Buyer screening 3-of-3** (Chainalysis/TRM/Elliptic + Sumsub KYB) — manual-review fallback already works; auto-pass needs provider keys.
- **Cashout fiat (INR/UPI) payout** — licensed money-transmitter partner. (On-chain USDC lock→release legs already work.)
- **x402 live settlement** + **Circle Gateway gas** — funded Circle Gateway Wallet + account.
- **x402 agent /call live response** — Circle Gateway + a real agent backend.
- **Session keys / ERC-6900 enforcement** — Circle Modular Wallet account + plugin.
- **Cross-chain transit *dashboard* (Gateway/AppKit aggregate)** — Circle Gateway. (The CCTP sub-path is build-now → #5.)
- **Card on-ramp (MoonPay)** — MoonPay partner account.
- **Apple/Google Wallet passes** — Apple Developer ($99/yr) + Google issuer; signing path also unimplemented.
- **ERP sync push** (Tally/QuickBooks/Xero/Zoho) — per-provider OAuth apps.
- **Sanctions list nightly refresh** — Chainalysis/TRM credentials (same blocker as screening).

> Already-works (not in build list): cashout on-chain escrow legs, x402 mock negotiation,
> screening manual-review fallback, outbound email (Resend). Several read-side flips
> (denylist, reputation read, link relayer) are already enabled because their env vars are
> now set in `.env.local` + Vercel prod — the real build is the missing write/flow code.
