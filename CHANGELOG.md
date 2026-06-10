# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added — 2026-06-10
- Demo mode: `NEXT_PUBLIC_KLARO_DEMO_MODE` companion flag and a central `onchainLive()` gate keep demo builds simulator-first even when contract addresses are configured; demo invoice state persists across server-action bundles.
- Bulk CSV invoice import now creates invoices (was a disabled placeholder button).
- Playwright e2e harness: `e2e:smoke`, `e2e:routes`, `e2e:demo` scripts; the demo-flow script survives React hydration races the way a human tester would.
- Root `CLAUDE.md` (repo guide + working rules) and `.gitattributes` enforcing LF endings.
- Product documents under `docs/product/`: product paper, 13-slide pitch deck, and one-page brief — PDF + HTML source, all claims verified against the repo.
- `docs/DEMO_GUIDE.md` (reviewer walkthrough + seed/reset), `docs/RECONCILIATION_CHECKLIST.md` (chain-vs-DB for all four money objects), post-deploy verification checklist and rollback procedure in `DEPLOYMENT.md`, rollback steps in the contract-upgrade runbook.
- Recorded forge run in `docs/test-evidence/`: 531 tests passing locally (forge 1.7.1, 2026-06-10) — README badge updated from the stale 523.
- README: consolidated per-money-path truth table.

### Changed — 2026-06-10
- Brand color migrated terracotta → Klaro blue `#1B6BFF` per the frozen designer mockups (tokens, BrandMark, favicon/OG sources); brand-kit page rebuilt as a numbered long-scroll guide.
- Honesty pass on user-facing copy: product/trust/docs/help pages, OpenAPI + WebAuthn descriptions (passkeys verify but do not issue sessions), JSON-LD; dead disabled buttons replaced with honest working actions.
- Onboarding gains the mobile welcome take-over; cookie banner renders only when analytics is configured; LP settings toggle uses `aria-checked`.
- Web3Provider builds its wagmi config client-side (SSR-safe WalletConnect); CSP allows WalletConnect endpoints.

### Fixed — 2026-06-10
- Stale `klaro.so` / `klaro.me` references removed from `security.txt`, `SECURITY.md`, runbooks, bug-bounty doc, hero, and brand-kit — domain is `myklaro.app`, contact `prateek@myklaro.app`.
- `SECURITY.md` no longer advertises a PGP key and web form that do not exist.
- Prod logs no longer leak mock-email/contact/analytics fallbacks; Next.js dynamic-server probes are not logged as Supabase outages.

### Added
- 6 new Supabase migrations since 0.1.0: advisor follow-ups (0020), contact submissions (0021), vendor write policies (0021), public invoice read (0022), payout-proof verification columns (0023), public invoice via RPC (0023). Brings total table count to ~38.

## [0.1.0] — 2026-05-26

Initial public release. Targets Arc Testnet (chain `5042002`).

### Added

- 20 Solidity contracts deployed to Arc Testnet, covering invoicing, escrow, audit receipts, refunds, fee splitting, route policy, cashout orders, LP staking + registry + reputation, agent jobs + budget wallets, disputes, retainer streams, stablecoin FX adapters, multi-chain routing, counterparty registry, and a privacy commit veil. Addresses pinned in `DEPLOYMENT.md`.
- Foundry test suite (500 tests) covering happy paths, revert paths, fuzz, and re-entrancy targets.
- `apps/web` — Next.js 15 vendor / LP / admin / agent surfaces. 56 routes. Mock-mode fallback when external credentials are absent.
- `apps/daemon` — BullMQ workers + Arc event listener (Node 22). Dead-letter queue with operator paging hooks.
- `packages/sdk` — TypeScript client (`KlaroClient`) for programmatic vendor + agent integration.
- `packages/cli` — `klaro` command-line entry point.
- `packages/receipt-badge`, `packages/invoice-embed` — embeddable React + web components.
- Supabase schema with 18 migrations + Row-Level Security on every tenant table.
- Cross-chain settlement via Circle CCTP V2 + Circle Gateway integration paths.
- Stablecoin FX via Circle StableFX adapter registry (Permit2 allowances).
- Agent flows via ERC-8004 (identity / reputation / validation) and ERC-8183 (job escrow).
- x402 nanopayment scaffolding for per-call agent metering.
- System-level [`THREAT_MODEL.md`](THREAT_MODEL.md) and contract-level threat model.
- [`CONTRIBUTING.md`](CONTRIBUTING.md), [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md), and a private security disclosure policy in [`SECURITY.md`](SECURITY.md).
- GitHub Actions CI: typecheck, lint, web tests, contract tests, and a drift check that verifies pinned Arc addresses still match `docs.arc.io`.

### Status labels

- `live testnet` — end-to-end on Arc testnet
- `simulated` — UI + mock store; no chain calls
- `access pending` — adapter built; provider credentials not yet issued
- `mainnet only` — path exists on mainnet; testnet falls back to mock
- `partner pending` — integration coded; partner signature outstanding

[Unreleased]: https://github.com/klaro-labs/klaro/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/klaro-labs/klaro/releases/tag/v0.1.0
