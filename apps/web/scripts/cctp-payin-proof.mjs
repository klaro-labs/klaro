// REAL cross-chain pay-in proof: a buyer on Base Sepolia pays a Klaro invoice;
// the vendor receives native USDC on Arc. Full CCTP V2 burn-and-mint, on-chain
// on both chains, attested by Circle's Iris sandbox. No simulation.
//
//   Base Sepolia (domain 6)                         Arc Testnet (domain 26)
//   buyer.depositForBurn(USDC) ──burn──▶ Iris attest ──▶ operator.receiveMessage ──mint──▶ vendor
//
// Run from apps/web:  node scripts/cctp-payin-proof.mjs
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  createPublicClient, createWalletClient, http, parseAbi, keccak256,
  encodeAbiParameters, decodeEventLog, formatUnits,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const BASE = {
  id: 84_532, name: "Base Sepolia",
  nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://sepolia.base.org"] } },
};
const ARC = {
  id: 5_042_002, name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.testnet.arc.network"] } },
};
// CCTP V2 — same deterministic addresses on every testnet (drift-checked vs
// Circle + Arc docs 2026-06-10).
const TOKEN_MESSENGER = "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA";
const MESSAGE_TRANSMITTER = "0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275";
const BASE_USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const ARC_USDC = "0x3600000000000000000000000000000000000000";
const ARC_DOMAIN = 26, BASE_DOMAIN = 6;
const IRIS = "https://iris-api-sandbox.circle.com";

const TM_ABI = parseAbi([
  "function depositForBurn(uint256 amount, uint32 destinationDomain, bytes32 mintRecipient, address burnToken, bytes32 destinationCaller, uint256 maxFee, uint32 minFinalityThreshold) external returns (uint64 nonce)",
]);
const MT_ABI = parseAbi([
  "function receiveMessage(bytes message, bytes attestation) external returns (bool)",
  "event MessageSent(bytes message)",
]);
const ERC20 = parseAbi([
  "function approve(address,uint256) returns (bool)",
  "function allowance(address,address) view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
]);

function env(f) {
  const o = {};
  for (const l of readFileSync(f, "utf8").split(/\r?\n/)) {
    if (!l || l.startsWith("#")) continue;
    const i = l.indexOf("="); if (i < 0) continue;
    o[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^"|"$/g, "");
  }
  return o;
}
const norm = (k) => (k.startsWith("0x") ? k : "0x" + k);
const toBytes32 = (addr) => encodeAbiParameters([{ type: "address" }], [addr]);

const wallets = env(resolve("e2e/wallets/.env.test-wallets"));
const daemon = env(resolve("../daemon/.env"));
const buyer = privateKeyToAccount(norm(wallets.CUSTOMER_TEST_PRIVATE_KEY));
const operator = privateKeyToAccount(norm(daemon.DAEMON_OPERATOR_PRIVATE_KEY));

// Target invoice (3 USDC) + vendor's Arc wallet (mint recipient).
const INVOICE = "0x7c61c63fafafed8d92354ac7770b4e397fd595a2fcb231f09efebbd5b038ac38";
const VENDOR = "0x4743FAeFbB829C01E91e73EaeC16150DBDd6F677";
const AMOUNT = 3_000_000n;            // 3 USDC, 6-dec
const MAX_FEE = 15_000n;              // 50 bps cap, well above the 1.3 bps Fast fee
const FAST = 1000;                    // minFinalityThreshold: 1000 = Fast Transfer

const basePub = createPublicClient({ chain: BASE, transport: http() });
const baseW = createWalletClient({ account: buyer, chain: BASE, transport: http() });
const arcPub = createPublicClient({ chain: ARC, transport: http() });
const arcW = createWalletClient({ account: operator, chain: ARC, transport: http() });

console.log("buyer (Base):", buyer.address);
console.log("operator (Arc minter):", operator.address);
console.log("vendor (Arc recipient):", VENDOR);

const vendorBefore = await arcPub.readContract({ address: ARC_USDC, abi: ERC20, functionName: "balanceOf", args: [VENDOR] });
console.log("vendor Arc USDC before:", formatUnits(vendorBefore, 6));

// 1) Approve Base USDC to the TokenMessenger (single-use, exact amount).
const allowance = await basePub.readContract({ address: BASE_USDC, abi: ERC20, functionName: "allowance", args: [buyer.address, TOKEN_MESSENGER] });
if (allowance < AMOUNT) {
  const ah = await baseW.writeContract({ address: BASE_USDC, abi: ERC20, functionName: "approve", args: [TOKEN_MESSENGER, AMOUNT] });
  await basePub.waitForTransactionReceipt({ hash: ah });
  console.log("approved Base USDC →", ah);
}

// 2) Burn on Base, targeting Arc. destinationCaller = operator so only Klaro mints.
console.log("burning", formatUnits(AMOUNT, 6), "USDC on Base → Arc...");
const burnHash = await baseW.writeContract({
  address: TOKEN_MESSENGER, abi: TM_ABI, functionName: "depositForBurn",
  args: [AMOUNT, ARC_DOMAIN, toBytes32(VENDOR), BASE_USDC, toBytes32(operator.address), MAX_FEE, FAST],
});
const burnRcpt = await basePub.waitForTransactionReceipt({ hash: burnHash });
console.log("BURN tx (Base):", burnHash, "block", burnRcpt.blockNumber);

// extract the CCTP message
let message = null;
for (const lg of burnRcpt.logs) {
  if (lg.address.toLowerCase() !== MESSAGE_TRANSMITTER.toLowerCase()) continue;
  try {
    const e = decodeEventLog({ abi: MT_ABI, data: lg.data, topics: lg.topics });
    if (e.eventName === "MessageSent") { message = e.args.message; break; }
  } catch { /* not it */ }
}
if (!message) throw new Error("no MessageSent in burn receipt");
console.log("CCTP message extracted, hash:", keccak256(message).slice(0, 18) + "…");

// 3) Poll Iris for the attestation (source domain = 6).
console.log("polling Iris for attestation (Fast ~15-30s)...");
let att = null;
const deadline = Date.now() + 300_000;
while (Date.now() < deadline) {
  try {
    const r = await fetch(`${IRIS}/v2/messages/${BASE_DOMAIN}?transactionHash=${burnHash}`);
    if (r.ok) {
      const b = await r.json();
      const m = b.messages?.[0];
      if (m && m.status === "complete" && m.attestation && m.attestation !== "0x") { att = m; break; }
      process.stdout.write(`  status=${m?.status ?? "pending"}\r`);
    }
  } catch { /* retry */ }
  await new Promise((r) => setTimeout(r, 4000));
}
if (!att) throw new Error("attestation timed out after 5min");
console.log("\nattestation complete.");

// 4) Mint on Arc via the operator (receiveMessage).
const mintHash = await arcW.writeContract({
  address: MESSAGE_TRANSMITTER, abi: MT_ABI, functionName: "receiveMessage",
  args: [att.message, att.attestation], chain: null, account: operator,
});
await arcPub.waitForTransactionReceipt({ hash: mintHash });
console.log("MINT tx (Arc):", mintHash);

const vendorAfter = await arcPub.readContract({ address: ARC_USDC, abi: ERC20, functionName: "balanceOf", args: [VENDOR] });
const delta = vendorAfter - vendorBefore;
console.log("vendor Arc USDC after:", formatUnits(vendorAfter, 6), `(+${formatUnits(delta, 6)})`);
console.log(delta > 0n ? "\n✓✓✓ REAL cross-chain pay-in: Base→Arc, vendor received USDC on Arc" : "\n✗ no balance change");
console.log(JSON.stringify({ invoice: INVOICE, burnTxBase: burnHash, mintTxArc: mintHash, received: formatUnits(delta, 6) }));
