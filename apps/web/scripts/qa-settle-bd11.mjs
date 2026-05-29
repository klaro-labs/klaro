// P-B completion: operator-approve settle + receipt mint for the UI-paid
// invoice 0xbd11 (screening fail-closed to admin-review since no Chainalysis
// key — this is the real operator fallback path). Produces the public receipt.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createPublicClient, createWalletClient, http, parseAbi, encodeAbiParameters, keccak256 } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const ARC = { id: 5_042_002, name: "Arc Testnet", nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 }, rpcUrls: { default: { http: ["https://rpc.testnet.arc.network"] } } };
const ESCROW = "0xF5Cfe431eBF40c1c99336334123316FdA66900f5";
const RECEIPT = "0x19d44E987DBd853c3C94A4Ab35404cCCd7612B00";
const INVOICE = "0xbd11239f93407b52f7d43b66f4f1af19c251c5c400613cb533cc138ea4455933";
const META = "0x7b9b113138495d7ae3ee11eb43aea76b4e65d733082e59808f515a8ee25bf9ba";
const PAID = "0xd6ad1b50c3389381872a77bc3778b3646f9c234d9b2d82ab601e3114df9b7e35";
const VENDOR = "0x4743FAeFbB829C01E91e73EaeC16150DBDd6F677";

const ESC_ABI = parseAbi([
  "function recordScreening(bytes32 invoiceId, bytes32 screeningHash) external",
  "function settle(bytes32 invoiceId) external",
  "function invoices(bytes32) view returns (address vendor, address token, uint256 amount, uint64 dueAt, uint64 acceptedAt, address acceptedBy, bytes32 metadataHash, bytes32 screeningHash, bytes32 splitsHash, uint8 status)",
]);
const RCPT_ABI = parseAbi([
  "function mint((bytes32 invoiceId, bytes32 invoiceHash, bytes32 acceptanceHash, bytes32 screeningHash, bytes32 settlementTx, uint64 settledAt, uint32 sourceChainId, address vendor) a) external returns (uint256 tokenId, bytes32 receiptHash)",
  "function verify(bytes32 receiptHash) view returns (bool)",
]);

function env(f){const o={};for(const l of readFileSync(f,"utf8").split(/\r?\n/)){if(!l||l.startsWith("#"))continue;const i=l.indexOf("=");if(i<0)continue;o[l.slice(0,i).trim()]=l.slice(i+1).trim().replace(/^"|"$/g,"");}return o;}
const dEnv = env(resolve("../daemon/.env"));
const op = privateKeyToAccount(dEnv.DAEMON_OPERATOR_PRIVATE_KEY);
const pub = createPublicClient({ chain: ARC, transport: http() });
const wallet = createWalletClient({ account: op, chain: ARC, transport: http() });
const mined = async (h, l) => { const r = await pub.waitForTransactionReceipt({ hash: h }); console.log(`  ${l}: ${h} status=${r.status}`); if (r.status !== "success") throw new Error(`${l} reverted`); };
console.log("operator:", op.address);

const before = await pub.readContract({ address: ESCROW, abi: ESC_ABI, functionName: "invoices", args: [INVOICE] });
console.log("before: status", Number(before[9]), "screeningHash", before[7]);

const screeningHash = keccak256(encodeAbiParameters([{ type: "string" }, { type: "string" }, { type: "string" }], ["chainalysis.review", "klaro.review", "sumsub.review"]));
if (before[7] === "0x" + "0".repeat(64)) {
  console.log("recordScreening…");
  await mined(await wallet.writeContract({ address: ESCROW, abi: ESC_ABI, functionName: "recordScreening", args: [INVOICE, screeningHash] }), "recordScreening");
}
console.log("settle…");
const settleHash = await wallet.writeContract({ address: ESCROW, abi: ESC_ABI, functionName: "settle", args: [INVOICE] });
await mined(settleHash, "settle");

const acceptanceHash = keccak256(`0x${PAID.slice(2)}`);
const anchor = { invoiceId: INVOICE, invoiceHash: META, acceptanceHash, screeningHash, settlementTx: settleHash, settledAt: BigInt(1781000000), sourceChainId: 5_042_002, vendor: VENDOR };
console.log("mint…");
await mined(await wallet.writeContract({ address: RECEIPT, abi: RCPT_ABI, functionName: "mint", args: [anchor] }), "mint");

const receiptHash = keccak256(encodeAbiParameters([{ type: "bytes32" }, { type: "bytes32" }, { type: "bytes32" }], [INVOICE, acceptanceHash, settleHash]));
const exists = await pub.readContract({ address: RECEIPT, abi: RCPT_ABI, functionName: "verify", args: [receiptHash] });
const after = await pub.readContract({ address: ESCROW, abi: ESC_ABI, functionName: "invoices", args: [INVOICE] });
console.log("\n=== RESULT ===");
console.log("invoice status:", Number(after[9]), "(settled)");
console.log("receiptHash:", receiptHash, "verify():", exists);
console.log("receipt URL: /receipt/" + receiptHash);
console.log("SETTLE_OK=" + (exists === true));
process.exit(exists === true ? 0 : 1);
