# @klaro/sdk

TypeScript SDK for the **Klaro payment OS on Arc** — invoices, receipts, cashouts, agent jobs in a single typed client.

```ts
import { createPublicClient, createWalletClient, http, custom } from "viem";
import { KlaroClient, ADDRESSES } from "@klaro/sdk";

const publicClient = createPublicClient({
  chain: {
    id: 5042002,
    name: "Arc Testnet",
    rpcUrls: { default: { http: ["https://rpc.testnet.arc.network"] } },
  } as never,
  transport: http(),
});

const walletClient = createWalletClient({
  chain: publicClient.chain,
  transport: custom(window.ethereum),
});

const klaro = new KlaroClient({
  escrow: process.env.NEXT_PUBLIC_INVOICE_ESCROW_ADDRESS as `0x${string}`,
  receipt: process.env.NEXT_PUBLIC_AUDIT_RECEIPT_ADDRESS as `0x${string}`,
  publicClient,
  walletClient,
});

// 1. Vendor creates an invoice
const tx = await klaro.invoices.create({
  invoiceId: "0x...",
  token: ADDRESSES.USDC,
  amount: 4_200_000_000n, // 4,200 USDC (6 dec)
  dueAt: BigInt(Math.floor(Date.now() / 1000) + 7 * 86400),
  metadataHash: "0x...",
});

// 2. Buyer signs acceptance
const sig = await klaro.invoices.signAcceptance("0x...", buyerAddress);

// 3. Buyer / relayer submits
await klaro.invoices.acceptAndPay("0x...", sig, buyerAddress);

// 4. Anyone verifies the receipt
const result = await klaro.receipt.load("0x...");
if (result.exists) console.log("Verified", result.anchor);
```

## What's in v1.0

| Module                                                   | Surface                                                   |
| -------------------------------------------------------- | --------------------------------------------------------- |
| `invoices`                                               | `create()`, `signAcceptance()`, `acceptAndPay()`, `get()` |
| `receipt`                                                | `verify(hash)`, `load(hash)`                              |
| `cashout`                                                | `requestAndLock()`, `confirmReceived()`, `openDispute()`  |
| `ADDRESSES`                                              | 18 Arc-testnet addresses (mirrors `KlaroConfig.sol`)      |
| `INVOICE_ESCROW_ABI` / `AUDIT_RECEIPT_ABI` / `ERC20_ABI` | hand-rolled minimal ABIs                                  |
| `ACCEPTANCE_EIP712_TYPES`                                | typed-data schema for buyer acceptance                    |

Full ABIs frozen at [`packages/contracts/abis/v1.0/*.json`](../contracts/abis/v1.0).

## Versioning

SDK `1.0.0-rc.1` pins to **contract ABI `v1.0`**. Any drift between this SDK
version and the deployed addresses = bug — open an issue.

## License

Apache-2.0.
