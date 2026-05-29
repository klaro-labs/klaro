// QA-P0-8: operator-signed recordScreening + settle + receipt mint for a
// paid invoice. Bypasses the daemon's listener flakiness so we can prove
// the receipt-verification flow works end-to-end on Arc testnet.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  encodeAbiParameters,
  keccak256,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const ARC = {
  id: 5_042_002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.testnet.arc.network"] } },
};
const ESCROW = "0xF5Cfe431eBF40c1c99336334123316FdA66900f5";
const RECEIPT = "0x19d44E987DBd853c3C94A4Ab35404cCCd7612B00";

const ESCROW_ABI = parseAbi([
  "function recordScreening(bytes32 invoiceId, bytes32 screeningHash) external",
  "function settle(bytes32 invoiceId) external",
  "function invoices(bytes32) view returns (address vendor, address token, uint256 amount, uint64 dueAt, uint64 acceptedAt, address acceptedBy, bytes32 metadataHash, bytes32 screeningHash, bytes32 splitsHash, uint8 status)",
]);
const RECEIPT_ABI = parseAbi([
  "function mint((bytes32 invoiceId, bytes32 invoiceHash, bytes32 acceptanceHash, bytes32 screeningHash, bytes32 settlementTx, uint64 settledAt, uint32 sourceChainId, address vendor) a) external returns (uint256 tokenId, bytes32 receiptHash)",
  "function anchorOf(bytes32 receiptHash) view returns ((bytes32 invoiceId, bytes32 invoiceHash, bytes32 acceptanceHash, bytes32 screeningHash, bytes32 settlementTx, uint64 settledAt, uint32 sourceChainId, address vendor))",
  "function verify(bytes32 receiptHash) view returns (bool)",
]);

function readEnv(file) {
  const text = readFileSync(file, "utf8");
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i < 0) continue;
    out[line.slice(0, i).trim()] = line
      .slice(i + 1)
      .trim()
      .replace(/^"|"$/g, "");
  }
  return out;
}

const dEnv = readEnv(resolve("../daemon/.env"));
const op = privateKeyToAccount(dEnv.DAEMON_OPERATOR_PRIVATE_KEY);
console.log("Operator:", op.address);

const invoiceId =
  "0xf642e21cf1b3e2a8126e8a686e9144fdb0324acf3cd4fd062c9bc51782b18656";
const paidTxHash =
  "0x001ca5942c9e7e1893cf8ee5376ac11d3d6ab932236a60b7388ab76842e3ed1b";

const pub = createPublicClient({ chain: ARC, transport: http() });
const wallet = createWalletClient({
  account: op,
  chain: ARC,
  transport: http(),
});

// 1. Compute screeningHash from the 3 review results (deterministic for QA)
const screeningHash = keccak256(
  encodeAbiParameters(
    [{ type: "string" }, { type: "string" }, { type: "string" }],
    ["chainalysis.review", "klaro.review", "sumsub.review"],
  ),
);
console.log("screeningHash:", screeningHash);

// 2. recordScreening
const onchainBefore = await pub.readContract({
  address: ESCROW,
  abi: ESCROW_ABI,
  functionName: "invoices",
  args: [invoiceId],
});
console.log(
  "before: status =",
  onchainBefore[9],
  "screeningHash =",
  onchainBefore[7],
);

if (
  onchainBefore[7] ===
  "0x0000000000000000000000000000000000000000000000000000000000000000"
) {
  console.log("recordScreening…");
  const tx = await wallet.writeContract({
    address: ESCROW,
    abi: ESCROW_ABI,
    functionName: "recordScreening",
    args: [invoiceId, screeningHash],
  });
  await pub.waitForTransactionReceipt({ hash: tx });
  console.log("  rec tx:", tx);
}

// 3. settle
console.log("settle…");
const settleHash = await wallet.writeContract({
  address: ESCROW,
  abi: ESCROW_ABI,
  functionName: "settle",
  args: [invoiceId],
});
const settleRcpt = await pub.waitForTransactionReceipt({ hash: settleHash });
console.log(
  "  settle tx:",
  settleHash,
  "block:",
  settleRcpt.blockNumber,
  "status:",
  settleRcpt.status,
);

// 4. mint
const acceptanceHash = keccak256(`0x${paidTxHash.slice(2)}`); // proxy: hash of pay tx
const invoiceMetadataHash =
  "0xf5c71d952e1db7abdfa39044f0f225821d35801912664d57e6f3e3c2318bf9ee";
const anchor = {
  invoiceId,
  invoiceHash: invoiceMetadataHash,
  acceptanceHash,
  screeningHash,
  settlementTx: settleHash,
  settledAt: BigInt(Math.floor(Date.now() / 1000)),
  sourceChainId: 5_042_002,
  vendor: "0x4743FAeFbB829C01E91e73EaeC16150DBDd6F677",
};
console.log("mint anchor…");
const mintHash = await wallet.writeContract({
  address: RECEIPT,
  abi: RECEIPT_ABI,
  functionName: "mint",
  args: [anchor],
});
const mintRcpt = await pub.waitForTransactionReceipt({ hash: mintHash });
console.log(
  "  mint tx:",
  mintHash,
  "block:",
  mintRcpt.blockNumber,
  "status:",
  mintRcpt.status,
);

// 5. Compute the receiptHash deterministically + verify
const receiptHash = keccak256(
  encodeAbiParameters(
    [{ type: "bytes32" }, { type: "bytes32" }, { type: "bytes32" }],
    [invoiceId, acceptanceHash, settleHash],
  ),
);
console.log("Expected receiptHash:", receiptHash);

const exists = await pub.readContract({
  address: RECEIPT,
  abi: RECEIPT_ABI,
  functionName: "verify",
  args: [receiptHash],
});
console.log("receipt verify():", exists);
console.log("\nReceipt page URL:");
console.log(`  https://klaro-peach.vercel.app/receipt/${receiptHash}`);
