// QA-P0-4: pays an invoice directly via viem from the customer test wallet.
// Used to verify InvoiceEscrow.acceptAndPay() works on Arc testnet without
// the wallet-modal UI path (Reown allowlist is QA-002 user action).
//
// Usage:
//   node scripts/qa-pay-invoice.mjs <invoiceId>
// Reads CUSTOMER_TEST_PRIVATE_KEY from e2e/wallets/.env.test-wallets,
// reads escrow/RPC from .env.local. Hard-coded constants for the invoice
// metadata (vendor, token, amount, dueAt, metadataHash, splitsHash) are
// queried from Supabase via the get_public_invoice RPC.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseEther,
  encodeAbiParameters,
  keccak256,
  toBytes,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const ARC_TESTNET = {
  id: 5_042_002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.testnet.arc.network"] } },
};

const ESCROW = "0xF5Cfe431eBF40c1c99336334123316FdA66900f5";

const INVOICE_ESCROW_ABI = [
  {
    type: "function",
    name: "acceptAndPay",
    stateMutability: "nonpayable",
    inputs: [
      { name: "invoiceId", type: "bytes32" },
      { name: "buyerSignature", type: "bytes" },
      { name: "buyer", type: "address" },
    ],
    outputs: [],
  },
];

const ERC20_ABI = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
];

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

// Hard-coded for the $1 invoice created in P0-4. Could query from
// supabase but a one-shot script is more legible with explicit values.
const invoice = {
  id: "0xbe4e512904905151000a945218707364ea27ccb1d3ca4bfacec8072207fa19eb",
  vendor: "0xAD578be3836eDa982e18600784c414cC69B4EB94",
  token: "0x3600000000000000000000000000000000000000",
  amount: 1_000_000n, // 1 USDC × 1e6
  dueAtUnix: Math.floor(new Date("2026-06-11T08:54:53Z").getTime() / 1000),
  metadataHash:
    "0x3a9988dd42f909dd0827b88f1c288fca0ccb406634ffe738406366a1845ae2ea",
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
const PK = wallets.CUSTOMER_TEST_PRIVATE_KEY;
if (!PK) throw new Error("CUSTOMER_TEST_PRIVATE_KEY missing");

const buyer = privateKeyToAccount(PK);
console.log("Buyer:", buyer.address);

const pub = createPublicClient({ chain: ARC_TESTNET, transport: http() });
const wallet = createWalletClient({
  account: buyer,
  chain: ARC_TESTNET,
  transport: http(),
});

// ─── 1. Balance/allowance check ───────────────────────────────────────
const usdcBal = await pub.readContract({
  address: invoice.token,
  abi: ERC20_ABI,
  functionName: "balanceOf",
  args: [buyer.address],
});
console.log(
  `USDC balance: ${usdcBal} (need ${invoice.amount}, ratio ${Number(usdcBal) / Number(invoice.amount)})`,
);
if (usdcBal < invoice.amount) {
  console.error("Insufficient USDC ERC-20 balance for buyer wallet.");
  process.exit(1);
}

const allowance = await pub.readContract({
  address: invoice.token,
  abi: ERC20_ABI,
  functionName: "allowance",
  args: [buyer.address, ESCROW],
});
console.log(`Current allowance: ${allowance}`);

if (allowance < invoice.amount) {
  console.log("Approving escrow…");
  const approveHash = await wallet.writeContract({
    address: invoice.token,
    abi: ERC20_ABI,
    functionName: "approve",
    args: [ESCROW, invoice.amount],
  });
  console.log("approve tx:", approveHash);
  await pub.waitForTransactionReceipt({ hash: approveHash });
}

// ─── 2. EIP-712 sign InvoiceAcceptance ───────────────────────────────
const sig = await wallet.signTypedData({
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

// ─── 3. acceptAndPay ─────────────────────────────────────────────────
const txHash = await wallet.writeContract({
  address: ESCROW,
  abi: INVOICE_ESCROW_ABI,
  functionName: "acceptAndPay",
  args: [invoice.id, sig, buyer.address],
});
console.log("acceptAndPay tx:", txHash);

const rcpt = await pub.waitForTransactionReceipt({ hash: txHash });
console.log("Block:", rcpt.blockNumber, "Status:", rcpt.status);
console.log("Gas used:", rcpt.gasUsed);
console.log("Logs:", rcpt.logs.length);
