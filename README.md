<div align="center">

# Klaro

**USDC invoicing on Arc.**
On-chain receipts. Verified cashout. Built for the businesses USDC was supposed to serve.

[![CI](https://github.com/klaro-labs/klaro/actions/workflows/ci.yml/badge.svg)](https://github.com/klaro-labs/klaro/actions/workflows/ci.yml)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-1f6feb.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A522-43853d.svg)](.nvmrc)
[![Solidity 0.8.28](https://img.shields.io/badge/Solidity-0.8.28-363636.svg)](packages/contracts/foundry.toml)
[![500 tests](https://img.shields.io/badge/forge_tests-500-1f6feb.svg)](packages/contracts/test)

[**Try the live testnet →**](https://klaro-peach.vercel.app)
&nbsp; · &nbsp;
[**Deployed addresses**](DEPLOYMENT.md)
&nbsp; · &nbsp;
[**Threat model**](packages/contracts/THREAT_MODEL.md)
&nbsp; · &nbsp;
[**Runbooks**](docs/runbooks)

</div>

---

<table>
<tr>
<td align="center" width="25%"><b>20</b><br/><sub>deployed contracts</sub></td>
<td align="center" width="25%"><b>500</b><br/><sub>Foundry tests</sub></td>
<td align="center" width="25%"><b>37</b><br/><sub>tables, RLS on every one</sub></td>
<td align="center" width="25%"><b>0.55 USDC</b><br/><sub>full-protocol deploy cost</sub></td>
</tr>
</table>

---

## Why this exists

A USDC transfer between two wallets is fast, final, and useless to a real business. It leaves no receipt anyone outside the two parties can verify. It leaves no audit trail an accountant can use at year end. It skips the sanctions screening every regulated payment provider runs. And it strands the vendor's USDC in a stablecoin their grocer doesn't accept.

Klaro fixes that on Circle's Arc L1. A vendor issues an invoice, the buyer pays from any wallet, an audit‑grade receipt mints on chain, and the vendor cashes out to local currency through a verified liquidity partner. Every step is honest about its state: live, simulated, or pending. Every dollar of value is escrowed, screened, and traceable end to end.

The protocol is open source. The testnet is live. Mainnet ships after the audit lands.

---

## What's working today

<table>
<tr><td>✅</td><td><b>Vendor signup + invoice creation</b> — Google OAuth or email magic link, server‑side identity, RLS‑isolated per tenant</td></tr>
<tr><td>✅</td><td><b>Buyer payment</b> — connect any wallet at <code>/i/[id]</code>, EIP‑712 acceptance, USDC settles in seconds on Arc</td></tr>
<tr><td>✅</td><td><b>On‑chain audit receipt</b> — mints atomically on settlement, shareable URL, verifiable by hash</td></tr>
<tr><td>✅</td><td><b>LP staking + partner cashout</b> — LP stakes USDC, claims orders, submits payout proof, slashed on dispute loss</td></tr>
<tr><td>✅</td><td><b>Agent jobs</b> — ERC‑8004 identity + ERC‑8183 escrow, budget‑capped agent wallets, dispute protected</td></tr>
<tr><td>✅</td><td><b>Cross‑chain pay‑in</b> — CCTP V2 + Circle Gateway routing via <code>MultiChainRouter</code></td></tr>
<tr><td>✅</td><td><b>StableFX corridors</b> — <code>USDC ↔ EURC</code> via Circle's <code>FxEscrow</code> + Permit2</td></tr>
<tr><td>✅</td><td><b>Disputes</b> — opener → evidence → operator review → on‑chain decision, mirrored to <code>VendorReputation</code></td></tr>
<tr><td>✅</td><td><b>Honest mode labelling</b> — every surface tells the user whether it's live, simulated, or partner‑pending</td></tr>
</table>

---

## Try it in 30 seconds

```bash
git clone https://github.com/klaro-labs/klaro
cd klaro
pnpm install
pnpm dev
```

Open `http://localhost:3000`. The app boots without environment variables. Every external surface (Supabase, Circle, Resend, screening providers) falls back to a labelled `[SIMULATED]` mode so you can navigate the full UI on a fresh clone. Wire any surface live by copying `apps/web/.env.example` to `apps/web/.env.local` and filling in only what you need.

---

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

// Verify a Klaro receipt from its on-chain hash.
const result = await klaro.receipt.verify("0x…receiptHash…");
console.log(result.valid, result.invoiceId, result.settledAt);
```

Pass a `walletClient` to create invoices, issue refunds, or request cashout. Full reference: [`packages/sdk/src/`](packages/sdk/src/).

---

## Repository

```
klaro/
├── apps/
│   ├── web/                   Next.js 15 vendor + LP + admin + agent surfaces · 56 routes
│   └── daemon/                Arc event listener + BullMQ workers + DLQ paging
│
├── packages/
│   ├── contracts/             22 Solidity contracts · 504 Foundry tests
│   ├── sdk/                   @klaro/sdk — TypeScript client
│   ├── cli/                   klaro command-line entry point
│   ├── receipt-badge/         Embeddable receipt React + web component
│   └── invoice-embed/         Iframe-friendly hosted invoice page
│
├── docs/
│   ├── runbooks/              Operator runbooks (dispute, pause, cashout-stuck, …)
│   └── bug-bounty/            Disclosure programme reference
│
├── DEPLOYMENT.md              Live testnet contract addresses + wiring
├── THREAT_MODEL.md            System-level threats and controls
├── CONTRIBUTING.md            Contribution + review process
└── SECURITY.md                Vulnerability disclosure policy
```

---

## Smart contracts

Twenty contracts, each scoped to one concern and audited in isolation. Deployed addresses live in [`DEPLOYMENT.md`](DEPLOYMENT.md).

| Money flow | Cashout + LP | Agents | Disputes + reputation | Cross-chain + FX | Privacy + config |
| --- | --- | --- | --- | --- | --- |
| `InvoiceEscrow` | `CashoutOrderProcessor` | `AgentRegistry` | `DisputeManager` | `MultiChainRouter` | `CounterpartyRegistry` |
| `AuditReceipt` | `LPStaking` | `AgentEscrow` | `ReputationManager` | `StableFXAdapterRegistry` | `PrivacyVeil` |
| `RefundProtocol` | `LPRegistry` | `AgentBudgetWallet` | `VendorReputation` | | `KlaroConfig` |
| `FeeSplitter` | `ProofRegistry` | | | | |
| `RoutePolicyEngine` | `RetainerStream` | | | | |

Coverage runs against Foundry, Echidna, and Halmos. Attack surface and mitigations: [`packages/contracts/THREAT_MODEL.md`](packages/contracts/THREAT_MODEL.md).

---

## Built on Arc and Circle

<table>
<tr>
<td><b>USDC on Arc</b></td><td>Native gas + ERC‑20 invoice currency (<code>0x3600…0000</code>)</td>
</tr>
<tr><td><b>CCTP V2</b></td><td>Cross‑chain pay‑in via <code>MultiChainRouter</code></td></tr>
<tr><td><b>Circle Gateway</b></td><td>Batched settlement</td></tr>
<tr><td><b>StableFX</b></td><td><code>USDC ↔ EURC</code> corridor via Permit2</td></tr>
<tr><td><b>Modular Wallets</b></td><td>Passkey vendor wallets (ERC‑4337 / ERC‑6900)</td></tr>
<tr><td><b>Developer‑Controlled Wallets</b></td><td>Operator wallet for <code>settle()</code></td></tr>
<tr><td><b>App Kit</b></td><td>Bridge / Swap / Unified Balance widgets</td></tr>
<tr><td><b>ERC‑8004</b></td><td>Three agent registries — Identity, Reputation, Validation</td></tr>
<tr><td><b>ERC‑8183</b></td><td>Agent job escrow reference</td></tr>
<tr><td><b>x402</b></td><td>Nanopayments via EIP‑3009</td></tr>
<tr><td><b>Pyth Network</b></td><td>FX and financing oracle</td></tr>
<tr><td><b>Permit2</b></td><td>Gasless allowances</td></tr>
</table>

External addresses are pinned in [`packages/contracts/src/KlaroConfig.sol`](packages/contracts/src/KlaroConfig.sol). A CI job fetches every page linked from `docs.arc.io/llms.txt` on each push and warns when a pinned address no longer appears in the live corpus.

---

## Honest mode labelling

> Every surface tells the user what mode it is in. We never ship UI that pretends to be more than it is.

| Label | Meaning |
| --- | --- |
| `live testnet` | End‑to‑end on Arc testnet |
| `simulated` | Mock store, no chain calls |
| `access pending` | Adapter built; provider credentials not yet issued |
| `mainnet only` | Path exists on mainnet; testnet falls back to mock |
| `partner pending` | Integration coded; partner signature outstanding |

Klaro is not a bank. Financing readiness is not a loan offer. No PII is stored on chain.

---

## Roadmap

| Stage | What ships |
| --- | --- |
| Now (testnet) | Vendor invoicing, buyer payment, on‑chain receipts, LP staking, partner cashout, agent jobs, disputes, cross‑chain pay‑in |
| Next | External contract audit, Sumsub‑gated KYB, Chainalysis live sanctions, MoonPay card on‑ramp, Apple + Google Wallet pass |
| Mainnet | Multisig ownership handover, Immunefi bounty live, real cashout corridors with Onmeta / Mudrex / TransFi |

---

## Documentation

| | |
| --- | --- |
| [`DEPLOYMENT.md`](DEPLOYMENT.md) | Live testnet addresses, wiring, and the deploy command that produced them |
| [`THREAT_MODEL.md`](THREAT_MODEL.md) | System‑level threats — web, daemon, RPC, third parties |
| [`packages/contracts/THREAT_MODEL.md`](packages/contracts/THREAT_MODEL.md) | Smart‑contract attack surface and mitigations |
| [`docs/runbooks`](docs/runbooks) | Operator runbooks for every incident class |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | Development setup, branch and commit conventions, PR review checklist |
| [`SECURITY.md`](SECURITY.md) | Vulnerability disclosure policy |
| [`CHANGELOG.md`](CHANGELOG.md) | Release notes |

---

## License

Apache‑2.0. See [`LICENSE`](LICENSE).

<div align="center">
<sub>Built by <a href="https://github.com/klaro-labs">Klaro Labs</a>. <a href="https://klaro-peach.vercel.app">Try the testnet</a>.</sub>
</div>
