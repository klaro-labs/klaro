# Deployments

## Arc Testnet (chain `5042002`)

- **RPC endpoint:** `https://rpc.testnet.arc.network`
- **Deployer / operator / fee receiver:** `0xAD578be3836eDa982e18600784c414cC69B4EB94`
- **Release tag:** `v0.1.0`
- **Foundry script:** [`packages/contracts/script/Deploy.s.sol`](packages/contracts/script/Deploy.s.sol)

| Contract                | Address                                      |
| ----------------------- | -------------------------------------------- |
| FeeSplitter             | `0x3b2E07e58f1578cF24B6438E3E76728C21555B66` |
| RoutePolicyEngine       | `0xb33f84A23ec052d21745F550733f5f277959E3FA` |
| InvoiceEscrow           | `0xA76edAd6e1c0D0854a21BF527086CA44b620c4e2` |
| AuditReceipt            | `0x19d44E987DBd853c3C94A4Ab35404cCCd7612B00` |
| RefundProtocol          | `0xCC4cFb95ae8d5774DF66a70E2Af8aaD7A5076339` |
| LPRegistry              | `0xCF591a1fA140c5Ca04686dDD7De006Da78C2180b` |
| LPStaking               | `0x4b36eD428b47F4254737215454BE6e9b99A1bD1f` |
| ProofRegistry           | `0xb0a2c7815D75EeBF73f8869C810EC8da5FcCbC33` |
| CashoutOrderProcessor   | `0x347935A89B95fD2baD736dbADe4C14b0a5e9E6bd` |
| MultiChainRouter        | `0xAF636EbC33D9FCB124E21C567F174f1EA5e2A241` |
| DisputeManager          | `0xee9561BE93312625C7F622D3f63B9092Af23aE5F` |
| RetainerStream          | `0xD6891F3E074F80Ea54a25E68009eDA1a1AdC360A` |
| StableFXAdapterRegistry | `0x9B8336c7a0B593A829A9b7F2eA83f7b7BB51A936` |
| MockStableFXAdapter     | `0xba4714725396A1AA0Bf2ac72329A08f56107ceD0` |
| AgentRegistry           | `0x3cB3B032d8361f0B78Cd9d688838e972f5054886` |
| AgentEscrow             | `0xedCd31c0B7f40585342047c90fB0f8Eabb99AcdD` |
| VendorReputation        | `0xb44CE869978CC1C0bf71687B307b19657d907750` |
| ReputationManager       | `0xE9272CAF1E87ad300fe557e89351b3f6200b8d51` |
| CounterpartyRegistry    | `0x59cEC2911422A08C5AA1922Ce31E85a17d17C21A` |
| PrivacyVeil             | `0x73660E5aa28a304369B1C9aF06d18468Af6a95F5` |

### Wiring performed by `Deploy.s.sol::_wire`

- `FeeSplitter` trusts `InvoiceEscrow`; `InvoiceEscrow.refundCaller` is fixed to `RefundProtocol`.
- `ProofRegistry.operator` and `LPStaking.slasher` both point at `CashoutOrderProcessor`.
- `DisputeManager` trusts `CashoutOrderProcessor`, `AgentEscrow`, and `RetainerStream`; `CashoutOrderProcessor` and `AgentEscrow` both point at `DisputeManager`.
- `VendorReputation` trusts `ReputationManager`, `CashoutOrderProcessor`, `DisputeManager`, and `InvoiceEscrow`.
- `InvoiceEscrow` is configured with the `CounterpartyRegistry` (non-strict mode) and `PrivacyVeil`. `PrivacyVeil.commitFor` is allow-listed to `InvoiceEscrow` only.
- `StableFXAdapterRegistry` is seeded with `MockStableFXAdapter` for the `USDC ↔ EURC` pair; the adapter allow-lists the registry as its sole caller.

### Reproducing this deployment

```bash
# 1. Generate a deployer wallet
cast wallet new

# 2. Fund it with Arc-testnet USDC
#    https://faucet.circle.com → Arc Testnet → paste deployer address

# 3. Configure the deploy
cd packages/contracts
cp .env.example .env
# Edit .env: set PRIVATE_KEY + ARC_TESTNET_RPC_URL

# 4. Broadcast
forge script script/Deploy.s.sol:Deploy \
  --rpc-url $ARC_TESTNET_RPC_URL \
  --private-key $PRIVATE_KEY \
  --broadcast \
  --slow
```

Approximate gas cost on Arc Testnet for the full 20-contract deploy: **0.55 USDC**.

### Operator handover for mainnet

On testnet, the deployer EOA retains ownership of every `Ownable` contract for simplicity. On mainnet, set `KLARO_OWNER` to a multisig (Safe) before running the script — `Deploy.s.sol::_handoverOwnership` will transfer ownership of every contract to that address in the same broadcast, including the mock FX adapter (so a deployer-key compromise after handover cannot drain destination-token liquidity).

---

## Web application

The hosted web application deploys via Vercel from `main`. Each pull request gets an immutable preview URL. Production is promoted manually.

---

## Daemon

The BullMQ worker process deploys to a long-lived runtime (e.g. Railway, Fly.io). It requires Redis (Upstash or self-hosted), the Supabase service-role key, and the operator wallet's `KLARO_OPERATOR_PRIVATE_KEY`. See `apps/daemon/.env.example` for the full surface.
