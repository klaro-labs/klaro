# Klaro

[![CI](https://github.com/klaro-labs/klaro/actions/workflows/ci.yml/badge.svg)](https://github.com/klaro-labs/klaro/actions/workflows/ci.yml)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A522-43853d.svg)](.nvmrc)
[![Solidity](https://img.shields.io/badge/Solidity-0.8.28-363636.svg)](packages/contracts/foundry.toml)

USDC invoicing on Arc. A vendor sends an invoice, the buyer pays in USDC, a receipt mints on Arc, and the vendor cashes out to local currency through a verified partner. All on testnet today.

## What's here

- **`apps/web`** — the vendor, LP, and admin dashboards. Next.js 15, server actions, Supabase for persistence.
- **`apps/daemon`** — listens for Arc events, runs the BullMQ workers (settle, screen, notify, retry, dead-letter).
- **`packages/contracts`** — 20 Solidity contracts. Invoice escrow, receipts, refunds, fee splitting, LP staking, partner cashout, agent jobs, disputes, FX, multi-chain routing. 500 Foundry tests.
- **`packages/sdk`**, **`packages/cli`** — TypeScript client and command-line entry point.
- **`packages/receipt-badge`**, **`packages/invoice-embed`** — embed components for vendor sites.

Live testnet addresses are pinned in [`DEPLOYMENT.md`](DEPLOYMENT.md). Smart-contract attack surface and mitigations: [`packages/contracts/THREAT_MODEL.md`](packages/contracts/THREAT_MODEL.md). System-level threat model: [`THREAT_MODEL.md`](THREAT_MODEL.md).

## Run it

```bash
git clone https://github.com/klaro-labs/klaro
cd klaro
pnpm install
pnpm dev                       # http://localhost:3000
```

The web app boots without any environment variables — it falls back to a labelled `[SIMULATED]` mode for every surface that isn't wired. To run any surface live, copy `apps/web/.env.example` to `apps/web/.env.local` and fill in only what you need.

Contract tests:

```bash
pnpm contracts:test
```

## Deploy to Arc Testnet

```bash
cd packages/contracts
cp .env.example .env           # set PRIVATE_KEY + ARC_TESTNET_RPC_URL
# Fund the deployer at https://faucet.circle.com (Arc testnet)
forge script script/Deploy.s.sol:Deploy \
  --rpc-url $ARC_TESTNET_RPC_URL \
  --private-key $PRIVATE_KEY \
  --broadcast
```

The script logs every deployed address. Copy them into `apps/web/.env.local` under the `NEXT_PUBLIC_*_ADDRESS` keys and the web app starts reading from chain instead of from mock data.

## Honest mode labels

Every surface tells the user what mode it's in. We never ship UI that pretends to be more than it is.

- `live testnet` — running end-to-end on Arc testnet.
- `simulated` — mock store, no chain calls.
- `access pending` — adapter exists, provider credentials are not issued yet.
- `mainnet only` — the path exists on mainnet; testnet falls back to mock.
- `partner pending` — integration is coded; the partner signature is outstanding.

Klaro is not a bank. Financing readiness is not a loan offer. No PII is stored on chain.

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for the development setup, branch and commit conventions, the review checklist, and what a good PR looks like. The code of conduct is in [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md).

Security disclosures go to `security@klaro.so`, not the public issue tracker. See [`SECURITY.md`](SECURITY.md).

## License

Apache-2.0. See [`LICENSE`](LICENSE).
