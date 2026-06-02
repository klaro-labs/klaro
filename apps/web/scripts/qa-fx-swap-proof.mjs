// QA proof #6 — on-chain proof that the LIVE StableFXAdapterRegistry
// (0x9b8336…A936) executes a real USDC→EURC swap on Arc testnet through the
// MockStableFXAdapter (0xba4714…7ced0), paying out a genuine ERC-20 EURC
// (MockEURC 0xbe3EB8…6ACF3, deployed for testnet until Circle StableFX TEST
// access). This is the multi-currency settlement path.
//
// The script is self-contained + idempotent: as registry/adapter/EURC owner
// (the operator key) it ensures the 0.92 USDC→EURC rate is set and the adapter
// holds EURC liquidity, then drives the operator-gated swap and asserts.
//
// Wallets:
//   operator  = DAEMON key (registry operator + adapter owner + EURC minter; drives swap)
//   payer     = LP_TEST      (holds USDC, approves the registry, funds are pulled from it)
//   recipient = CUSTOMER_TEST (receives EURC)
//
// Assertions are GAS-INDEPENDENT. Gas on Arc is paid in native USDC, NOT EURC,
// so the recipient's EURC delta is clean regardless of who paid gas. We also
// assert on the adapter's USDC/EURC balances (it sends no tx) + the
// SwapExecuted event.
//
// Run from apps/web:  node scripts/qa-fx-swap-proof.mjs
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  createPublicClient, createWalletClient, http, parseAbi, keccak256, toHex, decodeEventLog,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const ARC = {
  id: 5_042_002, name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.testnet.arc.network"] } },
};
const REGISTRY = "0x9b8336c7a0b593a829a9b7f2ea83f7b7bb51a936";
const ADAPTER = "0xba4714725396a1aa0bf2ac72329a08f56107ced0";
const USDC = "0x3600000000000000000000000000000000000000";
const EURC = "0xbe3EB882dC786cad95E84eb9EF254E346696ACF3";

const REG_ABI = parseAbi([
  "function quote(address srcToken, address dstToken, uint256 srcAmount) view returns (uint256 dstAmount, bytes32 quoteHash, uint64 expiresAt, address adapter)",
  "function swap(address payer, address srcToken, address dstToken, uint256 srcAmount, uint256 minDstAmount, bytes32 expectedQuoteHash, bytes32 corridor, address recipient) returns (uint256 dstAmount)",
  "function adapterFor(address srcToken, address dstToken) view returns (address)",
  "function setAdapter(address srcToken, address dstToken, address adapter) external",
  "event SwapExecuted(address indexed srcToken, address indexed dstToken, address indexed adapter, uint256 srcAmount, uint256 dstAmount, address recipient)",
]);
const ADP_ABI = parseAbi([
  "function rate(address,address) view returns (uint256)",
  "function setRate(address srcToken, address dstToken, uint256 rate18) external",
]);
const EURC_ABI = parseAbi([
  "function mint(address to, uint256 amount) external",
  "function balanceOf(address) view returns (uint256)",
]);
const ERC20 = parseAbi([
  "function approve(address,uint256) returns (bool)",
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
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
const w = env(resolve("e2e/wallets/.env.test-wallets"));
const operator = privateKeyToAccount(d.DAEMON_OPERATOR_PRIVATE_KEY);
const payer = privateKeyToAccount(w.LP_TEST_PRIVATE_KEY);
const recipient = privateKeyToAccount(w.CUSTOMER_TEST_PRIVATE_KEY);

const pub = createPublicClient({ chain: ARC, transport: http() });
const opW = createWalletClient({ account: operator, chain: ARC, transport: http() });
const paW = createWalletClient({ account: payer, chain: ARC, transport: http() });
const usdcBal = (a) => pub.readContract({ address: USDC, abi: ERC20, functionName: "balanceOf", args: [a] });
const eurcBal = (a) => pub.readContract({ address: EURC, abi: EURC_ABI, functionName: "balanceOf", args: [a] });
const mined = async (h, tag) => {
  const r = await pub.waitForTransactionReceipt({ hash: h });
  if (r.status !== "success") throw new Error(`${tag} reverted ${h}`);
  console.log(`   ${tag}: ${h}`);
  return r;
};

const SRC = 1_000_000n;                  // 1 USDC in
const RATE = 920_000_000_000_000_000n;   // 0.92 (1e18-scaled) → matches app fx quote table
const EXPECT_DST = (SRC * RATE) / 1_000_000_000_000_000_000n; // 920_000 EURC
const corridor = keccak256(toHex("EURC"));

console.log("StableFXAdapterRegistry:", REGISTRY, "\nadapter:", ADAPTER, "\nEURC:", EURC);
console.log("operator:", operator.address, "\npayer:", payer.address, "\nrecipient:", recipient.address);

// ─── Idempotent setup (operator owns registry + adapter + EURC) ────────────
// Route the (USDC, EURC) pair to our adapter in the registry. setRate (below)
// configures the adapter's pricing; setAdapter wires the registry → adapter
// route — both are required before quote/swap resolve.
const curAdapter = await pub.readContract({ address: REGISTRY, abi: REG_ABI, functionName: "adapterFor", args: [USDC, EURC] });
if (curAdapter.toLowerCase() !== ADAPTER.toLowerCase()) {
  console.log("\nsetAdapter (USDC,EURC) → MockStableFXAdapter…");
  await mined(await opW.writeContract({ address: REGISTRY, abi: REG_ABI, functionName: "setAdapter", args: [USDC, EURC, ADAPTER] }), "setAdapter");
}
const curRate = await pub.readContract({ address: ADAPTER, abi: ADP_ABI, functionName: "rate", args: [USDC, EURC] });
if (curRate !== RATE) {
  console.log("\nsetRate USDC→EURC = 0.92…");
  await mined(await opW.writeContract({ address: ADAPTER, abi: ADP_ABI, functionName: "setRate", args: [USDC, EURC, RATE] }), "setRate");
}
let adpEurc = await eurcBal(ADAPTER);
if (adpEurc < EXPECT_DST) {
  console.log("mint EURC liquidity into adapter…");
  await mined(await opW.writeContract({ address: EURC, abi: EURC_ABI, functionName: "mint", args: [ADAPTER, 10_000_000n] }), "mintEURC"); // 10 EURC
  adpEurc = await eurcBal(ADAPTER);
}
console.log(`adapter EURC liquidity: ${adpEurc}`);

const allow = await pub.readContract({ address: USDC, abi: ERC20, functionName: "allowance", args: [payer.address, REGISTRY] });
if (allow < SRC) {
  console.log("payer approve registry for USDC…");
  await mined(await paW.writeContract({ address: USDC, abi: ERC20, functionName: "approve", args: [REGISTRY, SRC] }), "approve");
}

// ─── Snapshot clean balances (adapter + recipient send no tx that moves these) ──
const recipEurcBefore = await eurcBal(recipient.address);
const adpEurcBefore = await eurcBal(ADAPTER);
const adpUsdcBefore = await usdcBal(ADAPTER);

// ─── Quote then operator-gated swap ────────────────────────────────────────
const q = await pub.readContract({ address: REGISTRY, abi: REG_ABI, functionName: "quote", args: [USDC, EURC, SRC] });
const [qDst, quoteHash] = q;
console.log(`\nquote: ${SRC} USDC → ${qDst} EURC (hash ${quoteHash.slice(0, 10)}…)`);
if (qDst !== EXPECT_DST) throw new Error(`quote dst ${qDst} != expected ${EXPECT_DST}`);

console.log("operator swap (USDC→EURC, operator-gated)…");
const rcpt = await mined(await opW.writeContract({ address: REGISTRY, abi: REG_ABI, functionName: "swap", args: [payer.address, USDC, EURC, SRC, EXPECT_DST, quoteHash, corridor, recipient.address] }), "swap");

let evt = null;
for (const log of rcpt.logs) {
  if (log.address.toLowerCase() !== REGISTRY.toLowerCase()) continue;
  try { const e = decodeEventLog({ abi: REG_ABI, data: log.data, topics: log.topics }); if (e.eventName === "SwapExecuted") evt = e.args; } catch { /* skip */ }
}

const recipEurcAfter = await eurcBal(recipient.address);
const adpEurcAfter = await eurcBal(ADAPTER);
const adpUsdcAfter = await usdcBal(ADAPTER);

const checks = [
  ["dst == src * 0.92 (FX rate applied)", qDst === EXPECT_DST, `${qDst} (want ${EXPECT_DST})`],
  ["recipient received exactly dst EURC", recipEurcAfter - recipEurcBefore === EXPECT_DST, `${recipEurcAfter - recipEurcBefore}`],
  ["adapter paid out dst EURC", adpEurcBefore - adpEurcAfter === EXPECT_DST, `${adpEurcBefore - adpEurcAfter}`],
  ["adapter received src USDC (pull+forward)", adpUsdcAfter - adpUsdcBefore === SRC, `${adpUsdcAfter - adpUsdcBefore}`],
  ["SwapExecuted srcAmount == src", evt && evt.srcAmount === SRC, evt ? `${evt.srcAmount}` : "none"],
  ["SwapExecuted dstAmount == dst", evt && evt.dstAmount === EXPECT_DST, evt ? `${evt.dstAmount}` : "none"],
  ["SwapExecuted recipient correct", evt && evt.recipient?.toLowerCase() === recipient.address.toLowerCase(), evt?.recipient ?? "-"],
];
console.log("");
for (const [name, ok, detail] of checks) console.log(`${ok ? "PASS" : "FAIL"}  ${name}  [${detail}]`);
const allOk = checks.every((c) => c[1]);
console.log(allOk
  ? `\nFX_SWAP_PROOF_OK=true — ${SRC} USDC → ${EXPECT_DST} EURC at 0.92; pulled from payer, paid to recipient from adapter liquidity; SwapExecuted emitted.`
  : `\nFX_SWAP_PROOF_OK=false`);
process.exit(allOk ? 0 : 1);
