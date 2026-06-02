// QA proof #11 — on-chain proof that the LIVE RetainerStream (0xd6891f…c360a)
// streams USDC per-second on Arc testnet across all three fund paths. Two
// wallets:
//   payer     = CUSTOMER_TEST (creates + funds streams, cancels)
//   recipient = LP_TEST       (withdraws vested)
//
// Vesting is `deposit * clamp(now-start,0,span) / span`. block.timestamp drifts
// between txs, so we never assert exact fractions. Instead we drive three
// streams whose outcome is DETERMINISTIC by construction, and assert on the
// escrow CONTRACT balance (it sends no tx → gas-clean on Arc) + emitted events:
//
//   A — fully vested (start+end in the past): recipient withdraws the WHOLE
//       deposit. escrow Δ == -deposit, Withdrawn == deposit.
//   B — not yet started (start in the future): payer cancels → WHOLE deposit
//       refunded. escrow Δ == -deposit, Cancelled.refunded == deposit.
//   C — mid-stream: partial withdraw + cancel, then assert the conservation
//       invariant deposit == withdrawn + refundToPayer + claimableRemaining
//       (true at any timestamp) and 0 < vested < deposit (linear math live).
//
// Run from apps/web:  node scripts/qa-retainer-stream-proof.mjs
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
const STREAM = "0xd6891f3e074f80ea54a25e68009eda1a1adc360a";
const USDC = "0x3600000000000000000000000000000000000000";

const ST_ABI = parseAbi([
  "function createStream(bytes32 streamId, address recipient, address token, uint256 deposit, uint64 startAt, uint64 endAt) external",
  "function withdraw(bytes32 streamId, uint256 amount) external",
  "function cancelStream(bytes32 streamId) external",
  "function withdrawableAmount(bytes32 streamId) view returns (uint256)",
  "function vestedAmount(bytes32 streamId) view returns (uint256)",
  "function accountingFor(bytes32 streamId) view returns (uint256 deposit, uint256 withdrawn, uint256 vestedNow, uint256 refundedToPayer)",
  "event Withdrawn(bytes32 indexed streamId, address indexed recipient, uint256 amount)",
  "event Cancelled(bytes32 indexed streamId, address indexed payer, uint256 vestedSnapshot, uint256 refunded)",
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
const w = env(resolve("e2e/wallets/.env.test-wallets"));
const payer = privateKeyToAccount(w.CUSTOMER_TEST_PRIVATE_KEY);
const recipient = privateKeyToAccount(w.LP_TEST_PRIVATE_KEY);

const pub = createPublicClient({ chain: ARC, transport: http() });
const paW = createWalletClient({ account: payer, chain: ARC, transport: http() });
const reW = createWalletClient({ account: recipient, chain: ARC, transport: http() });
const bal = (a) => pub.readContract({ address: USDC, abi: ERC20, functionName: "balanceOf", args: [a] });
const mined = async (h, tag) => {
  const r = await pub.waitForTransactionReceipt({ hash: h });
  if (r.status !== "success") throw new Error(`${tag} reverted ${h}`);
  console.log(`   ${tag}: ${h}`);
  return r;
};
const eventArg = (rcpt, name) => {
  for (const log of rcpt.logs) {
    if (log.address.toLowerCase() !== STREAM.toLowerCase()) continue;
    try { const e = decodeEventLog({ abi: ST_ABI, data: log.data, topics: log.topics }); if (e.eventName === name) return e.args; } catch { /* skip */ }
  }
  return null;
};

const DEPOSIT = 1_000_000n; // 1 USDC per stream
const now = () => Math.floor(Date.now() / 1000);
const sid = (tag) => keccak256(toHex(`klaro.qa.stream.${tag}.${payer.address}.${Date.now()}`));
const checks = [];

// Ensure the payer has approved enough for all three deposits up front.
const totalNeed = DEPOSIT * 3n;
const allow = await pub.readContract({ address: USDC, abi: ERC20, functionName: "allowance", args: [payer.address, STREAM] });
if (allow < totalNeed) await mined(await paW.writeContract({ address: USDC, abi: ERC20, functionName: "approve", args: [STREAM, totalNeed] }), "approve");

console.log("RetainerStream:", STREAM, "\npayer:", payer.address, "\nrecipient:", recipient.address);

// ─── Stream A — fully vested → recipient withdraws the whole deposit ───────
{
  const id = sid("A");
  console.log("\n[A] fully-vested stream (start & end in the past)");
  const escBefore = await bal(STREAM);
  await mined(await paW.writeContract({ address: STREAM, abi: ST_ABI, functionName: "createStream", args: [id, recipient.address, USDC, DEPOSIT, BigInt(now() - 1000), BigInt(now() - 1)] }), "createA");
  const wAmt = await pub.readContract({ address: STREAM, abi: ST_ABI, functionName: "withdrawableAmount", args: [id] });
  const escFunded = await bal(STREAM);
  const rcpt = await mined(await reW.writeContract({ address: STREAM, abi: ST_ABI, functionName: "withdraw", args: [id, DEPOSIT] }), "withdrawA");
  const ev = eventArg(rcpt, "Withdrawn");
  const escAfter = await bal(STREAM);
  checks.push(["A: createStream escrowed deposit", escFunded - escBefore === DEPOSIT, `${escFunded - escBefore}`]);
  checks.push(["A: fully vested before withdraw", wAmt === DEPOSIT, `${wAmt}`]);
  checks.push(["A: Withdrawn event == deposit", ev && ev.amount === DEPOSIT, ev ? `${ev.amount}` : "none"]);
  checks.push(["A: escrow released deposit (Δ == -deposit)", escAfter - escFunded === -DEPOSIT, `${escAfter - escFunded}`]);
}

// ─── Stream B — not yet started → payer cancels, full refund ───────────────
{
  const id = sid("B");
  console.log("\n[B] not-started stream (start in the future)");
  const escBefore = await bal(STREAM);
  await mined(await paW.writeContract({ address: STREAM, abi: ST_ABI, functionName: "createStream", args: [id, recipient.address, USDC, DEPOSIT, BigInt(now() + 3600), BigInt(now() + 7200)] }), "createB");
  const vested = await pub.readContract({ address: STREAM, abi: ST_ABI, functionName: "vestedAmount", args: [id] });
  const escFunded = await bal(STREAM);
  const rcpt = await mined(await paW.writeContract({ address: STREAM, abi: ST_ABI, functionName: "cancelStream", args: [id] }), "cancelB");
  const ev = eventArg(rcpt, "Cancelled");
  const escAfter = await bal(STREAM);
  checks.push(["B: nothing vested before start", vested === 0n, `${vested}`]);
  checks.push(["B: Cancelled.refunded == deposit", ev && ev.refunded === DEPOSIT, ev ? `${ev.refunded}` : "none"]);
  checks.push(["B: escrow refunded deposit (Δ == -deposit)", escAfter - escFunded === -DEPOSIT, `${escAfter - escFunded}`]);
}

// ─── Stream C — mid-stream: partial withdraw + cancel, conservation holds ──
{
  const id = sid("C");
  console.log("\n[C] mid-stream (linear vesting active)");
  const escBefore = await bal(STREAM);
  await mined(await paW.writeContract({ address: STREAM, abi: ST_ABI, functionName: "createStream", args: [id, recipient.address, USDC, DEPOSIT, BigInt(now() - 60), BigInt(now() + 60)] }), "createC");
  const partial = DEPOSIT / 4n; // 0.25 USDC — safely below ~50% vested even with drift
  const rW = await mined(await reW.writeContract({ address: STREAM, abi: ST_ABI, functionName: "withdraw", args: [id, partial] }), "withdrawC");
  const evW = eventArg(rW, "Withdrawn");
  const rC = await mined(await paW.writeContract({ address: STREAM, abi: ST_ABI, functionName: "cancelStream", args: [id] }), "cancelC");
  const evC = eventArg(rC, "Cancelled");
  const escAfter = await bal(STREAM);
  const acct = await pub.readContract({ address: STREAM, abi: ST_ABI, functionName: "accountingFor", args: [id] });
  // acct = [deposit, withdrawn, vestedNow, refundedToPayer]
  const [dep, withdrawn, vestedNow, refundToPayer] = acct;
  const claimableRemaining = vestedNow - withdrawn;
  const escNetForC = escAfter - escBefore; // what this stream still leaves in escrow
  checks.push(["C: Withdrawn event == partial", evW && evW.amount === partial, evW ? `${evW.amount}` : "none"]);
  checks.push(["C: genuinely mid-stream (0 < vested < deposit)", vestedNow > 0n && vestedNow < DEPOSIT, `${vestedNow}`]);
  checks.push(["C: conservation deposit == withdrawn+refund+claimable", dep === withdrawn + refundToPayer + claimableRemaining, `${withdrawn}+${refundToPayer}+${claimableRemaining}=${withdrawn + refundToPayer + claimableRemaining} (dep ${dep})`]);
  checks.push(["C: escrow holds exactly recipient's claimable", escNetForC === claimableRemaining, `${escNetForC} (want ${claimableRemaining})`]);
  checks.push(["C: Cancelled.refunded == deposit - vested", evC && evC.refunded === refundToPayer, evC ? `${evC.refunded} (want ${refundToPayer})` : "none"]);
}

console.log("");
for (const [name, ok, detail] of checks) console.log(`${ok ? "PASS" : "FAIL"}  ${name}  [${detail}]`);
const allOk = checks.every((c) => c[1]);
console.log(allOk
  ? `\nRETAINER_STREAM_PROOF_OK=true — withdraw (full), cancel (full refund), and mid-stream conservation all proven on Arc testnet.`
  : `\nRETAINER_STREAM_PROOF_OK=false`);
process.exit(allOk ? 0 : 1);
