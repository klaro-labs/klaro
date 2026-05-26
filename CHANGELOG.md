# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
