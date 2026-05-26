# Klaro

[![CI](https://github.com/klaro-labs/klaro/actions/workflows/ci.yml/badge.svg)](https://github.com/klaro-labs/klaro/actions/workflows/ci.yml)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A522-43853d.svg)](.nvmrc)
[![Solidity](https://img.shields.io/badge/Solidity-0.8.28-363636.svg)](packages/contracts/foundry.toml)
[![Arc Testnet](https://img.shields.io/badge/Arc-Testnet_5042002-000000.svg)](DEPLOYMENT.md)

USDC invoicing on Arc. A vendor issues an invoice, a buyer pays from any wallet, an audit-grade receipt mints on chain, and the vendor cashes out to local currency through a verified partner. Live on testnet today.

**Live testnet:** [klaro-peach.vercel.app](https://klaro-peach.vercel.app)
**Deployed contracts:** [`DEPLOYMENT.md`](DEPLOYMENT.md)

## Why

A USDC transfer between two wallets leaves no receipt anyone outside the two parties can verify, no audit trail an accountant can use at year end, and no screening trail that satisfies the bank a vendor cashes out to. Klaro makes the receipt as portable as the dollar: the buyer signs an EIP-712 acceptance, the escrow settles in seconds on Arc, and the receipt that mints is the same artifact the vendor's tax authority, the buyer's bookkeeper, and the cashout partner all read.

The protocol is open source. The testnet is live. The mainnet ships after the contract audit lands.

## Try it

```bash
git clone https://github.com/klaro-labs/klaro
cd klaro
pnpm install
pnpm dev
```

Open `http://localhost:3000`. The app boots without environment variables — every external surface (Supabase, Circle, Resend, screening providers) falls back to a labelled `[SIMULATED]` mode. To run any surface live, copy `apps/web/.env.example` to `apps/web/.env.local` and fill in only what you need.

## Use the SDK

```ts
import { createPublicClient, http } from "viem";
import { arcTestnet } from "viem/chains";
import { KlaroClient } from "@klaro/sdk";

const klaro = new KlaroClient({
  publicClient: createPublicClient({ chain: arcTestnet, transport: http() }),
  escrow:  "0xF5Cfe431eBF40c1c99336334123316FdA66900f5",
  receipt: "0x19d44E987DBd853c3C94A4Ab35404cCCd7612B00",
});

const result = await klaro.receipt.verify("0x...receiptHash...");
console.log(result.valid, result.invoiceId, result.settledAt);
```

Server-side invoice creation, refund, and cashout helpers are available with a `walletClient`. See [`packages/sdk/src/`](packages/sdk/src/).

## What's in the repository

| Path | What it is |
| --- | --- |
| [`apps/web`](apps/web) | Next.js 15 app. Vendor, LP, admin, and agent surfaces. 56 routes. |
| [`apps/daemon`](apps/daemon) | Node 22 worker. Arc event listener, BullMQ queues, DLQ + paging hooks. |
| [`packages/contracts`](packages/contracts) | 20 Solidity contracts (Foundry). 500 tests. |
| [`packages/sdk`](packages/sdk) | TypeScript SDK (`@klaro/sdk`). |
| [`packages/cli`](packages/cli) | Command-line entry point. |
| [`packages/receipt-badge`](packages/receipt-badge) | Embeddable receipt React + web component. |
| [`packages/invoice-embed`](packages/invoice-embed) | Iframe-friendly hosted invoice page. |

## Contract architecture

The protocol is a graph of small, audited-in-isolation contracts. Each touches only what it must. The full set deployed at addresses in [`DEPLOYMENT.md`](DEPLOYMENT.md):

`InvoiceEscrow`, `AuditReceipt`, `RefundProtocol`, `FeeSplitter`, `RoutePolicyEngine`, `CashoutOrderProcessor`, `LPStaking`, `LPRegistry`, `ProofRegistry`, `MultiChainRouter`, `DisputeManager`, `RetainerStream`, `StableFXAdapterRegistry`, `AgentRegistry`, `AgentEscrow`, `AgentBudgetWallet`, `VendorReputation`, `ReputationManager`, `CounterpartyRegistry`, `PrivacyVeil`.

Smart-contract attack surface and mitigations: [`packages/contracts/THREAT_MODEL.md`](packages/contracts/THREAT_MODEL.md). Echidna and Halmos targets live in [`packages/contracts/test/echidna`](packages/contracts/test/echidna) and [`packages/contracts/test/halmos`](packages/contracts/test/halmos).

## Built on Arc and Circle

| Primitive | Where Klaro touches it |
| --- | --- |
| **USDC on Arc** (`0x3600…0000`) | Native gas + ERC-20 invoice currency |
| **CCTP V2** | Cross-chain buyer pays (`MultiChainRouter`) |
| **Circle Gateway** | Batched settlement |
| **StableFX** | `USDC ↔ EURC` corridor (`StableFXAdapterRegistry`) |
| **Modular Wallets** | Vendor passkey provisioning |
| **Developer-Controlled Wallets** | Operator wallet for `settle()` |
| **App Kit** | Bridge / Swap / Unified Balance widgets |
| **ERC-8004** | Agent identity, reputation, validation |
| **ERC-8183** | Agent job escrow reference |
| **x402** | Nanopayments via EIP-3009 |
| **Pyth Network** | FX and financing oracle |
| **Permit2** | Gasless allowances |

All external addresses are pinned in [`packages/contracts/src/KlaroConfig.sol`](packages/contracts/src/KlaroConfig.sol). CI runs a drift check on every push against the live `docs.arc.io` corpus.

## Honest mode labels

Every surface tells the user what mode it is in. We never ship UI that pretends to be more than it is.

| Label | Meaning |
| --- | --- |
| `live testnet` | End-to-end on Arc testnet |
| `simulated` | Mock store, no chain calls |
| `access pending` | Adapter built; provider credentials not issued yet |
| `mainnet only` | Path exists on mainnet; testnet falls back to mock |
| `partner pending` | Integration coded; partner signature outstanding |

Klaro is not a bank. Financing readiness is not a loan offer. No PII is stored on chain.

## Documentation

| Document | What's inside |
| --- | --- |
| [`DEPLOYMENT.md`](DEPLOYMENT.md) | Live testnet addresses + wiring + deploy commands |
| [`THREAT_MODEL.md`](THREAT_MODEL.md) | System-level threats (web, daemon, RPC, third parties) |
| [`packages/contracts/THREAT_MODEL.md`](packages/contracts/THREAT_MODEL.md) | Smart-contract attack surface and mitigations |
| [`docs/runbooks`](docs/runbooks) | Operator runbooks (dispute, pause, cashout-stuck, refund-issue, …) |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | Development setup, branch and commit conventions, review checklist |
| [`SECURITY.md`](SECURITY.md) | Vulnerability disclosure policy |
| [`CHANGELOG.md`](CHANGELOG.md) | Release notes |

## License

Apache-2.0. See [`LICENSE`](LICENSE).
