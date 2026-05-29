// QA-P0-4 + QA-020 workaround: publishes an invoice on-chain (LP key acting as
// vendor since QA-020 blocks the real vendor-sign UI flow), then pays it via
// the customer key. Proves contract path end-to-end. Production needs the
// proper on-chain create wiring (QA-020).

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const ARC_TESTNET = {
  id: 5_042_002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.testnet.arc.network"] } },
};

const ESCROW = "0xF5Cfe431eBF40c1c99336334123316FdA66900f5";

const ESCROW_ABI = parseAbi([
  "function createInvoice(bytes32 invoiceId, address token, uint256 amount, uint64 dueAt, bytes32 metadataHash) external",
  "function acceptAndPay(bytes32 invoiceId, bytes buyerSignature, address buyer) external",
  "function invoices(bytes32) external view returns (address vendor, address token, uint256 amount, uint64 dueAt, uint64 acceptedAt, address acceptedBy, bytes32 metadataHash, bytes32 screeningHash, bytes32 splitsHash, uint8 status)",
]);

const ERC20_ABI = parseAbi([
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function balanceOf(address owner) external view returns (uint256)",
]);

const ACCEPTANCE_TYPES = {
  InvoiceAcceptance: [
    { name: "invoiceId", type: "bytes32" },
    { name: "vendor", type: "address" },
    { name: "token", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "dueAt", type: "uint64" },
    { name: "metadataHash", type: "bytes32" },
    { name: "splitsHash", type: "bytes32" },
  ],
};
const ZERO_BYTES32 = `0x${"00".repeat(32)}`;

const invoice = {
  id: "0x06d8f379f9a82c0f9beca9d25259d8a90820e73302de9ebe5c0c9f3674fafd64",
  vendor: "0x4743FAeFbB829C01E91e73EaeC16150DBDd6F677",
  token: "0x3600000000000000000000000000000000000000",
  amount: 1_000_000n,
  dueAtUnix: 1781173390,
  metadataHash:
    "0xe68bee605ac224bdbd68bf55f45610ad36c9eea3ad51631aa9e01573fd4de59f",
  splitsHash: ZERO_BYTES32,
};

function readEnv(file) {
  const text = readFileSync(file, "utf8");
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i < 0) continue;
    out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return out;
}

const wallets = readEnv(resolve("e2e/wallets/.env.test-wallets"));
const buyer = privateKeyToAccount(wallets.CUSTOMER_TEST_PRIVATE_KEY);
const vendorActor = privateKeyToAccount(wallets.LP_TEST_PRIVATE_KEY);

const pub = createPublicClient({ chain: ARC_TESTNET, transport: http() });

console.log("Vendor (LP key):", vendorActor.address);
console.log("Buyer (customer key):", buyer.address);
console.log("Invoice:", invoice.id);
console.log("Amount:", invoice.amount, "(1 USDC)");

// ─── 1. Check on-chain invoice status ─────────────────────────────────
const onchain = await pub.readContract({
  address: ESCROW,
  abi: ESCROW_ABI,
  functionName: "invoices",
  args: [invoice.id],
});
const [vAddr, , , , , , , , , status] = onchain;
console.log("\nCurrent on-chain status:", status, "(0 = NONE, 1 = CREATED, 2 = ACCEPTED, 3 = SETTLED)");
console.log("Current on-chain vendor:", vAddr);

// ─── 2. Vendor signs createInvoice ───────────────────────────────────
if (status === 0) {
  console.log("\nPublishing on-chain (vendor-side createInvoice)…");
  const vendorWallet = createWalletClient({
    account: vendorActor,
    chain: ARC_TESTNET,
    transport: http(),
  });
  const createHash = await vendorWallet.writeContract({
    address: ESCROW,
    abi: ESCROW_ABI,
    functionName: "createInvoice",
    args: [invoice.id, invoice.token, invoice.amount, BigInt(invoice.dueAtUnix), invoice.metadataHash],
  });
  console.log("create tx:", createHash);
  const r = await pub.waitForTransactionReceipt({ hash: createHash });
  console.log("  status:", r.status, "block:", r.blockNumber);
}

// ─── 3. Buyer balance + approve ──────────────────────────────────────
const usdcBal = await pub.readContract({
  address: invoice.token,
  abi: ERC20_ABI,
  functionName: "balanceOf",
  args: [buyer.address],
});
console.log(`\nBuyer USDC balance: ${usdcBal} (need ${invoice.amount})`);
if (usdcBal < invoice.amount) {
  console.error("Insufficient USDC for buyer.");
  process.exit(1);
}

const buyerWallet = createWalletClient({
  account: buyer,
  chain: ARC_TESTNET,
  transport: http(),
});

const allowance = await pub.readContract({
  address: invoice.token,
  abi: ERC20_ABI,
  functionName: "allowance",
  args: [buyer.address, ESCROW],
});
console.log("Allowance:", allowance);
if (allowance < invoice.amount) {
  console.log("Approving escrow…");
  const approveHash = await buyerWallet.writeContract({
    address: invoice.token,
    abi: ERC20_ABI,
    functionName: "approve",
    args: [ESCROW, invoice.amount],
  });
  console.log("approve tx:", approveHash);
  await pub.waitForTransactionReceipt({ hash: approveHash });
}

// ─── 4. Sign EIP-712 acceptance ──────────────────────────────────────
const sig = await buyerWallet.signTypedData({
  domain: {
    name: "Klaro Invoice",
    version: "1",
    chainId: ARC_TESTNET.id,
    verifyingContract: ESCROW,
  },
  types: ACCEPTANCE_TYPES,
  primaryType: "InvoiceAcceptance",
  message: {
    invoiceId: invoice.id,
    vendor: invoice.vendor,
    token: invoice.token,
    amount: invoice.amount,
    dueAt: BigInt(invoice.dueAtUnix),
    metadataHash: invoice.metadataHash,
    splitsHash: invoice.splitsHash,
  },
});
console.log("EIP-712 sig:", sig);

// ─── 5. acceptAndPay ────────────────────────────────────────────────
console.log("\nSubmitting acceptAndPay…");
const payHash = await buyerWallet.writeContract({
  address: ESCROW,
  abi: ESCROW_ABI,
  functionName: "acceptAndPay",
  args: [invoice.id, sig, buyer.address],
});
console.log("pay tx:", payHash);
const payRcpt = await pub.waitForTransactionReceipt({ hash: payHash });
console.log("  status:", payRcpt.status, "block:", payRcpt.blockNumber, "gasUsed:", payRcpt.gasUsed);
console.log("  logs:", payRcpt.logs.length);

// ─── 6. Read new state ──────────────────────────────────────────────
const final = await pub.readContract({
  address: ESCROW,
  abi: ESCROW_ABI,
  functionName: "invoices",
  args: [invoice.id],
});
console.log("\nFinal on-chain status:", final[9], "(2 = ACCEPTED)");
console.log("Buyer recorded:", final[5]);
