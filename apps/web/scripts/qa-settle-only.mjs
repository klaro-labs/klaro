// Operator-signed recordScreening + settle ONLY. Stops short of mint
// so we can verify the daemon catches the InvoiceSettled event +
// invokes its receipt-generate worker (which calls AuditReceipt.mint
// per QA-024 fix).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  keccak256,
  encodeAbiParameters,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const ARC = {
  id: 5_042_002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.testnet.arc.network"] } },
};
const ESCROW = "0xF5Cfe431eBF40c1c99336334123316FdA66900f5";

const ABI = parseAbi([
  "function recordScreening(bytes32 invoiceId, bytes32 screeningHash) external",
  "function settle(bytes32 invoiceId) external",
  "function invoices(bytes32) view returns (address vendor, address token, uint256 amount, uint64 dueAt, uint64 acceptedAt, address acceptedBy, bytes32 metadataHash, bytes32 screeningHash, bytes32 splitsHash, uint8 status)",
]);

function readEnv(file) {
  const out = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i < 0) continue;
    out[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^"|"$/g, "");
  }
  return out;
}

const invoiceId =
  process.argv[2] ||
  "0x06d8f379f9a82c0f9beca9d25259d8a90820e73302de9ebe5c0c9f3674fafd64";
console.log("invoice:", invoiceId);

const dEnv = readEnv(resolve("../daemon/.env"));
const op = privateKeyToAccount(dEnv.DAEMON_OPERATOR_PRIVATE_KEY);
console.log("operator:", op.address);

const pub = createPublicClient({ chain: ARC, transport: http() });
const wallet = createWalletClient({ account: op, chain: ARC, transport: http() });

const before = await pub.readContract({
  address: ESCROW,
  abi: ABI,
  functionName: "invoices",
  args: [invoiceId],
});
console.log("before status:", before[9], "(3=PAID, 4=SETTLED)");

if (before[7] === "0x0000000000000000000000000000000000000000000000000000000000000000") {
  const screeningHash = keccak256(
    encodeAbiParameters(
      [{ type: "string" }, { type: "string" }, { type: "string" }],
      ["chainalysis.review", "klaro.review", "sumsub.review"],
    ),
  );
  console.log("recordScreening:", screeningHash);
  const t = await wallet.writeContract({
    address: ESCROW,
    abi: ABI,
    functionName: "recordScreening",
    args: [invoiceId, screeningHash],
  });
  await pub.waitForTransactionReceipt({ hash: t });
  console.log("  rec tx:", t);
}

console.log("settle…");
const settleHash = await wallet.writeContract({
  address: ESCROW,
  abi: ABI,
  functionName: "settle",
  args: [invoiceId],
});
const r = await pub.waitForTransactionReceipt({ hash: settleHash });
console.log("settle tx:", settleHash, "block:", r.blockNumber, "status:", r.status);

// NOTE: Daemon's InvoiceSettled listener should now fire + call
// receipt-generate worker which calls AuditReceipt.mint. We do NOT
// mint here — that's what we're verifying the daemon does.
console.log("\nWaiting for daemon to catch InvoiceSettled + mint receipt…");
