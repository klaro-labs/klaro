// QA proof #5 — on-chain proof that Klaro drives Arc's canonical cross-chain
// USDC path (CCTP V2) for real. Arc is the SOURCE here: the operator burns Arc
// USDC via TokenMessengerV2.depositForBurn targeting Ethereum Sepolia (domain
// 0), the MessageTransmitterV2 emits the CCTP message, and Circle's Iris
// sandbox attests it. A completed attestation is the cryptographic proof that
// the message is valid and would mint native USDC on the destination chain.
//
// This is the fully-on-Arc-verifiable leg of cross-chain. The symmetric INBOUND
// leg (buyer pays from Base/Ethereum → vendor receives on Arc) uses the exact
// same protocol via MessageTransmitterV2.receiveMessage (see
// apps/daemon/src/cctp.ts receiveOnArc); its end-to-end live test additionally
// requires a burn on a source testnet chain (external USDC), which is the one
// step that cannot be produced from Arc alone.
//
// Run from apps/web:  node scripts/qa-cctp-burn-proof.mjs
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  createPublicClient, createWalletClient, http, parseAbi, keccak256,
  encodeAbiParameters, decodeEventLog,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const ARC = {
  id: 5_042_002, name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.testnet.arc.network"] } },
};
const TOKEN_MESSENGER = "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA";
const MESSAGE_TRANSMITTER = "0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275";
const USDC = "0x3600000000000000000000000000000000000000";
const ARC_DOMAIN = 26;
const DST_DOMAIN = 0; // Ethereum Sepolia
const IRIS = "https://iris-api-sandbox.circle.com";

const TM_ABI = parseAbi([
  "function depositForBurn(uint256 amount, uint32 destinationDomain, bytes32 mintRecipient, address burnToken, bytes32 destinationCaller, uint256 maxFee, uint32 minFinalityThreshold) external returns (uint64 nonce)",
]);
const MT_ABI = parseAbi(["event MessageSent(bytes message)"]);
const ERC20 = parseAbi([
  "function approve(address,uint256) returns (bool)",
  "function allowance(address,address) view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
]);

function env(file) {
  const o = {};
  for (const l of readFileSync(file, "utf8").split(/\r?\n/)) {
    if (!l || l.startsWith("#")) continue;
    const i = l.indexOf("="); if (i < 0) continue;
    o[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^"|"$/g, "");
  }
  return o;
}
const d = env(resolve("../daemon/.env"));
const operator = privateKeyToAccount(d.DAEMON_OPERATOR_PRIVATE_KEY);

const pub = createPublicClient({ chain: ARC, transport: http() });
const opW = createWalletClient({ account: operator, chain: ARC, transport: http() });
const mined = async (h, tag) => {
  const r = await pub.waitForTransactionReceipt({ hash: h });
  if (r.status !== "success") throw new Error(`${tag} reverted ${h}`);
  console.log(`   ${tag}: ${h}`);
  return r;
};
const b32 = (addr) => encodeAbiParameters([{ type: "address" }], [addr]);

const AMOUNT = 500_000n; // 0.5 USDC

console.log("TokenMessengerV2:", TOKEN_MESSENGER, "\nMessageTransmitterV2:", MESSAGE_TRANSMITTER);
console.log("operator:", operator.address, "\nburning", Number(AMOUNT) / 1e6, "USDC: Arc(26) → Ethereum Sepolia(0)");

const allow = await pub.readContract({ address: USDC, abi: ERC20, functionName: "allowance", args: [operator.address, TOKEN_MESSENGER] });
if (allow < AMOUNT) {
  console.log("\napprove TokenMessengerV2…");
  await mined(await opW.writeContract({ address: USDC, abi: ERC20, functionName: "approve", args: [TOKEN_MESSENGER, AMOUNT] }), "approve");
}

console.log("depositForBurn (operator USDC → CCTP, mintRecipient = operator on dst)…");
const burnRcpt = await mined(await opW.writeContract({
  address: TOKEN_MESSENGER, abi: TM_ABI, functionName: "depositForBurn",
  args: [AMOUNT, DST_DOMAIN, b32(operator.address), USDC, "0x0000000000000000000000000000000000000000000000000000000000000000", 0n, 2000],
}), "depositForBurn");

// Extract the CCTP message from MessageTransmitterV2's MessageSent log.
let message = null;
for (const lg of burnRcpt.logs) {
  if (lg.address.toLowerCase() !== MESSAGE_TRANSMITTER.toLowerCase()) continue;
  try { const e = decodeEventLog({ abi: MT_ABI, data: lg.data, topics: lg.topics }); if (e.eventName === "MessageSent") message = e.args.message; } catch { /* skip */ }
}
const messageHash = message ? keccak256(message) : null;
console.log(`\nMessageSent: ${message ? `${message.slice(0, 26)}… (hash ${messageHash.slice(0, 14)}…)` : "NONE"}`);

// Poll Circle Iris sandbox for the attestation (Arc is the source domain).
console.log("polling Circle Iris for attestation (Arc has instant finality → fast)…");
let att = null;
const deadline = Date.now() + 180_000;
while (Date.now() < deadline) {
  try {
    const res = await fetch(`${IRIS}/v2/messages/${ARC_DOMAIN}?transactionHash=${burnRcpt.transactionHash}`);
    if (res.ok) {
      const body = await res.json();
      const m = body.messages?.[0];
      if (m) process.stdout.write(`   status=${m.status} `);
      if (m && m.status === "complete" && m.attestation && m.attestation !== "0x") { att = m; break; }
    }
  } catch (e) { process.stdout.write(`(poll err) `); }
  await new Promise((r) => setTimeout(r, 4_000));
}
console.log("");

const checks = [
  ["depositForBurn mined on Arc", burnRcpt.status === "success", burnRcpt.transactionHash.slice(0, 14) + "…"],
  ["CCTP MessageSent emitted", Boolean(message), message ? "yes" : "no"],
  ["Circle Iris attested the burn (status=complete)", Boolean(att), att ? att.status : "timeout/none"],
  ["attestation is a non-empty signature", Boolean(att?.attestation && att.attestation.length > 2), att?.attestation ? `${att.attestation.length} hex chars` : "-"],
];
console.log("");
for (const [name, ok, detail] of checks) console.log(`${ok ? "PASS" : "FAIL"}  ${name}  [${detail}]`);
const allOk = checks.every((c) => c[1]);
console.log(allOk
  ? `\nCCTP_BURN_PROOF_OK=true — Arc CCTP V2 outbound burn + Circle attestation proven live. The attested message would mint ${Number(AMOUNT) / 1e6} USDC on Ethereum Sepolia; the symmetric receiveMessage leg mints INTO Arc.`
  : `\nCCTP_BURN_PROOF_OK=false (attestation may still be pending — re-run to re-poll the same burn by tx hash).`);
process.exit(allOk ? 0 : 1);
