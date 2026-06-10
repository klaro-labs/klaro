# Klaro Bug Bounty (Immunefi)

**Status:** Pre-launch. The public bounty programme opens when Klaro's smart contracts are promoted to mainnet. This page documents the planned scope and rewards.

## Scope

All Klaro contracts in `packages/contracts/src/`:

- `InvoiceEscrow.sol`
- `AuditReceipt.sol`
- `RefundProtocol.sol`
- `FeeSplitter.sol`
- `RoutePolicyEngine.sol`
- `LPRegistry.sol`
- `LPStaking.sol`
- `ProofRegistry.sol`
- `CashoutOrderProcessor.sol`
- `MultiChainRouter.sol`
- `DisputeManager.sol`
- `RetainerStream.sol`
- `StableFXAdapterRegistry.sol` + adapters
- `AgentRegistry.sol`
- `AgentEscrow.sol`
- `AgentBudgetWallet.sol`
- `VendorReputation.sol`
- `ReputationManager.sol`
- `lib/ReasonCodes.sol`
- `KlaroConfig.sol`

Off-chain in scope (lower payout): `apps/web/lib/{x402,webhooks,auth,
circleWallets}.ts`.

**Out of scope:** UI bugs, content typos, social-engineering scenarios that
require Klaro employee access, anything in `mockData.ts` or `*.t.sol`.

## Severity + reward (USDC, mainnet only)

| Severity | Example                                                        | Bounty         |
| -------- | -------------------------------------------------------------- | -------------- |
| Critical | USDC custody drain, arbitrary mint, escrow bypass              | up to $100,000 |
| High     | Steal more than vendor's intended payout, signature replay     | up to $30,000  |
| Medium   | DoS on a payment-flow contract, reveal off-chain hash preimage | up to $5,000   |
| Low      | Lazy validation, gas griefing                                  | up to $500     |

## Coordinated disclosure

90-day clock. Email prateek@myklaro.app with PoC + impact analysis.
We respond within 4h business hours. PGP key at /.well-known/klaro-security.asc.

## Eligibility rules

- No exploitation against mainnet funds — testnet replication required first.
- No social engineering, no insider testing.
- Sanctioned individuals + sanctioned jurisdictions disqualified.
- One bounty per root cause; duplicates share the first valid finder's award.

## Hall of fame

(empty — be first)
