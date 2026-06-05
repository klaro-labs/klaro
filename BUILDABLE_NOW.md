# Buildable-on-Arc-testnet-now — build plan (2026-06-02)

From a 5-agent map of every not-built feature, classified **build-now** (fully works
on Arc testnet now, no external account/license/mainnet) vs **blocked** (needs a paid
provider/license). The operator-signed `wallet.writeContract` pattern in
`apps/daemon/src/workers/cashoutAdvancer.ts` is the proven template every money-flow
item mirrors. All contract addresses confirmed against `DEPLOYMENT.md`.

## 🔨 BUILD-NOW — ✅ 16 / 16 DONE

| # | Feature | Effort | Status |
|---|---|---|---|
| 1 | **Klaro Link relayer** — real on-chain `createInvoiceFor` at pay time (permissionless; needs only a funded testnet gas wallet — `LINK_PUBLISHER_PRIVATE_KEY` already set) | S | ✅ |
| 2 | **On-chain denylist live read** — `NEXT_PUBLIC_COUNTERPARTY_REGISTRY_ADDRESS` set → `readDenylistEntries` goes live | S | ✅ |
| 3 | **On-chain reputation writes** — operator-signed `VendorReputation.record()` at settle/release/job-close/dispute; lights up the already-live read | M | ✅ |
| 4 | **Agent escrow on-chain lifecycle** — createJob→fund→start→deliver→complete/cancel against deployed `AgentEscrow` (mirrors cashout) | M | ✅ proven live → `qa-agent-escrow-proof.mjs` |
| 5 | **CCTP V2 cross-chain** — `apps/daemon/src/cctp.ts` (burnOnArc/fetchAttestation/receiveOnArc). Outbound burn + Iris attestation **proven live on Arc** (`qa-cctp-burn-proof.mjs`); inbound mint code + unit tests ready (inbound E2E needs a source-chain burn) | L | ✅ outbound proven / inbound code-ready |
| 6 | **StableFX USDC↔EURC swap** — worker executes the real on-chain `registry.swap`; deployed **MockEURC** + seeded liquidity; **proven live** (`qa-fx-swap-proof.mjs`, 1 USDC→0.92 EURC) | M | ✅ proven live |
| 7 | **Admin pause/unpause multicall** — operator-signed `pause()` over the Pausable contracts (auth/reasons/audit already exist) | M | ✅ |
| 8 | **Webhook subscription persistence** — Supabase table + repo + per-vendor secret encryption (unblocks the live delivery worker) | M | ✅ |
| 9 | **Persistent disputes** — tables + repo (verify branch first — may already be done) | M | ✅ |
| 10 | **Web Push send-half + CTA** — install `web-push`, `sendPush` fan-out, settings opt-in (VAPID self-generated, no account) | M | ✅ |
| 11 | **Retainer streams on-chain** — payer `createStream`, recipient `withdraw`, payer `cancel`; **proven live** (`qa-retainer-stream-proof.mjs`, withdraw + refund + mid-stream conservation) | L | ✅ proven live |
| 12 | **Webhook receivers `onVerified` effects** — idempotent upserts (pairs with CCTP) | S | ✅ |
| 13 | **/api/status honesty** — derive CCTP/Gateway from live flags | S | ✅ |
| 14 | **Notification preferences UI** — `lp_preferences` table + working toggles | S | ✅ |
| 15 | **Privacy/AML retention countdown** — DB state machine + scheduled hard-delete | S | ✅ |
| 16 | **Testnet KPI live aggregation** — daemon writes `kpi_snapshots` from settled invoices | M | ✅ pipeline wired + scheduled — `kpiAggregator` counts real invoices/settled/cashouts (soft-delete-filtered) and upserts `kpi_snapshots` on BullMQ crons (hourly `0 * * * *`, daily `5 0 * * *`); `/internal/kpi` reads them via `latestSnapshotsByWindow()`. Only remaining `simulated-placeholder` labels are landing-page marketing hero numbers (`testnetMetrics.ts`) + a few static KPI reference rows — honestly labelled, not part of the rollup |

### Live on-chain proofs (this build pass, all green on Arc testnet 5042002)
- **#4 AgentEscrow** — register (operator EIP-712 co-sign) → fund → start → deliver → complete; agent paid, 1% fee carved, escrow drained, job CLOSED.
- **#6 StableFX** — `registry.swap` 1 USDC → 0.92 EURC (real MockEURC), pulled from payer, paid from adapter liquidity, `SwapExecuted` emitted.
- **#11 RetainerStream** — full-vested withdraw, not-started full refund, mid-stream `deposit == withdrawn + refund + claimable` conservation (linear vesting live).
- **#5 CCTP V2** — Arc `depositForBurn` 0.5 USDC → Ethereum Sepolia; Circle Iris returned a `complete` 131-byte attestation (near-instant via Arc finality).
- All assertions are gas-independent (Arc pays gas in native USDC), keyed on contract balances + event amounts.

## 🔌 EXTERNAL INTEGRATIONS — live vs still-blocked (updated 2026-06-05)

Every integration whose provider offers a free sandbox / no-account path is now **LIVE**
(keys in gitignored env + Vercel prod; daemon-host env still needs the same keys for the
daemon-side legs). The only things still simulated are the ones that legally require a
license or a signed partner/enterprise contract — i.e. genuinely mainnet, not a testnet gap.

### ✅ NOW LIVE (wired + verified this pass)
| Integration | What's live | How / proof |
|---|---|---|
| **MoonPay** (card on-ramp) | "Card → USDC" opens the real signed sandbox widget | `lib/moonpay.ts` HMAC-signed URL; live 302→`buy-sandbox.moonpay.com` on prod |
| **Circle Wallets** (passkey/modular) | vendor onboarding wallet provisioning | `lib/circleWallets.ts` + `TEST_CLIENT_KEY`; modular-sdk URL fixed |
| **QuickBooks** (ERP sync) | Intuit OAuth connect + invoice push on settle | `lib/quickbooks.ts` + `/api/integrations/quickbooks/*`; daemon `quickbooks.ts`; sandbox |
| **OFAC sanctions** (screening leg 1) | every buyer address screened vs the live OFAC SDN crypto list | `daemon/src/ofac.ts` — **free, no account**; 415 addrs, known-sanctioned blocked, clean cleared |
| **Sumsub KYB** (screening leg 2) | vendor business verification + screening gate | `lib/sumsub.ts` + WebSDK card on `/vendor/settings`; daemon `sumsub.ts`; sandbox |
| **Sanctions list refresh** | OFAC list refreshed daily into the screen cache | `sanctionsRefresh` worker (OFAC real; EU/UN still honest-sim) |
| Resend (email) · Sentry · PostHog · GrowthBook | already wired | env-gated |

> 3-of-3 screening now resolves: **sanctions = OFAC (real)**, **KYB = Sumsub (real)**,
> behavioral = honestly-labelled testnet heuristic. A clean buyer + OFAC-clear + KYB-verified
> vendor AUTO-SETTLES; a sanctioned buyer or RED-flagged vendor is blocked.

### 🚫 STILL BLOCKED (license / partner / mainnet — not a testnet gap)
- **Cashout fiat (INR/UPI) payout** — licensed money-transmitter partner. *The real hard wall.* (On-chain USDC lock→release already works.)
- **Circle StableFX live** (FxEscrow) — Circle partner allow-list. (MockEURC stand-in proves the swap on testnet → #6.)
- **Full Chainalysis KYT / TRM / Elliptic** risk scoring — enterprise contract. (The *free* OFAC sanctions oracle above covers the sanctions requirement.)
- **x402 live settlement + Circle Gateway gas** — funded Circle Gateway Wallet + account.
- **Session keys / ERC-6900 enforcement** — Circle Modular Wallet plugin.
- **Cross-chain transit *dashboard* (Gateway/AppKit aggregate)** — Circle Gateway. (CCTP sub-path ✅ built → #5; inbound-into-Arc E2E needs a source-chain burn.)
- **Apple/Google Wallet passes** — Apple Developer ($99/yr) + Google issuer.
- **Other ERPs** (Xero / Zoho / Tally) — per-provider OAuth apps (QuickBooks already covers the main one).
- **Email *sending* from `@myklaro.app`** — needs the domain verified in Resend (DNS). Contact email is `prateek@myklaro.app` everywhere; outbound currently sends from the verified Resend domain.

> The honest next frontier is no longer "another sandbox" — it's the **mainnet / licensing** track.
