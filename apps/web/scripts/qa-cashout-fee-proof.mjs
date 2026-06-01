// QA test #1 — on-chain proof that the LIVE fee-bearing CashoutOrderProcessor
// (0x347935…E6bd) withholds the Klaro fee on a real release. Drives 3 distinct
// wallets: vendor locks WITH a non-zero klaroFee, operator advances the legs,
// the admitted LP receives (amount − fee), and the fee lands at the fee
// receiver. Assertions are GAS-INDEPENDENT (we assert on the LP wallet, the
// CashoutFeeWithheld event, the stored klaroFee, and escrow→0 — never on the
// operator's balance, which is confounded by gas paid in native USDC on Arc).
//
// Run: node apps/web/scripts/qa-cashout-fee-proof.mjs   (from apps/web)
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
const COP = "0x347935A89B95fD2baD736dbADe4C14b0a5e9E6bd";
const USDC = "0x3600000000000000000000000000000000000000";
const LP_REGISTRY = "0xCF591a1fA140c5Ca04686dDD7De006Da78C2180b";
const LP_ID = keccak256(toHex("klaro.qa.lp.inr.001"));

const COP_ABI = parseAbi([
  "function requestAndLock(bytes32 cashoutId, uint256 usdcAmount, uint256 klaroFee, uint256 inrAmount, bytes32 corridor, uint64 quoteExpiresAt, bytes32 quoteHash) external",
  "function claimByLP(bytes32 cashoutId, bytes32 lpId) external",
  "function recordProof(bytes32 cashoutId, (bytes32 cashoutId, bytes32 lpId, bytes32 vendorId, uint256 inrAmount, uint256 usdcAmount, bytes32 utrReferenceHash, bytes32 screenshotHash, uint64 submittedAt, bytes32 lpSignatureHash, bytes32 verifierSignatureHash) p) external",
  "function operatorConfirmReceived(bytes32 cashoutId, address expectedVendor) external",
  "function getOrder(bytes32 cashoutId) view returns ((address vendor, address token, uint256 usdcAmount, uint256 klaroFee, uint256 inrAmount, bytes32 lpId, address lpWallet, bytes32 corridor, uint64 requestedAt, uint64 quoteExpiresAt, bytes32 quoteHash, bytes32 proofHash, uint8 status))",
  "function klaroFeeReceiver() view returns (address)",
  "event CashoutFeeWithheld(bytes32 indexed cashoutId, address indexed receiver, uint256 fee)",
]);
const ERC20 = parseAbi([
  "function approve(address,uint256) returns (bool)",
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
]);
const REG = parseAbi([
  "function walletOf(bytes32) view returns (address)",
  "function statusOf(bytes32) view returns (uint8)",
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
const vendor = privateKeyToAccount(w.LP_TEST_PRIVATE_KEY); // funded locker

const pub = createPublicClient({ chain: ARC, transport: http() });
const opW = createWalletClient({ account: operator, chain: ARC, transport: http() });
const veW = createWalletClient({ account: vendor, chain: ARC, transport: http() });
const bal = (a) => pub.readContract({ address: USDC, abi: ERC20, functionName: "balanceOf", args: [a] });
const mined = async (h, tag) => { const r = await pub.waitForTransactionReceipt({ hash: h }); if (r.status !== "success") throw new Error(`${tag} reverted ${h}`); console.log(`   ${tag}: ${h}`); return r; };

const AMOUNT = 5_000_000n;  // 5 USDC
const FEE = 15_000n;        // 0.3%
const EXPECT_LP = AMOUNT - FEE;
const corridor = keccak256(toHex("INR"));
const cashoutId = keccak256(toHex(`qa.fee.proof.${vendor.address}.${AMOUNT}.${FEE}.${Date.now()}`));

console.log("COP:", COP, "\nvendor:", vendor.address, "\noperator/feeReceiver:", operator.address);
const feeReceiver = await pub.readContract({ address: COP, abi: COP_ABI, functionName: "klaroFeeReceiver" });
const lpWallet = await pub.readContract({ address: LP_REGISTRY, abi: REG, functionName: "walletOf", args: [LP_ID] });
const lpStatus = await pub.readContract({ address: LP_REGISTRY, abi: REG, functionName: "statusOf", args: [LP_ID] });
console.log("lpWallet:", lpWallet, "(status", lpStatus, "=ADMITTED expected 2)\nfeeReceiver:", feeReceiver);
if (Number(lpStatus) !== 2) throw new Error(`LP not ADMITTED (status ${lpStatus})`);

const lpBefore = await bal(lpWallet);
const copBefore = await bal(COP);
console.log(`\nlpWallet before: ${lpBefore}  COP escrow before: ${copBefore}`);

const allow = await pub.readContract({ address: USDC, abi: ERC20, functionName: "allowance", args: [vendor.address, COP] });
if (allow < AMOUNT) await mined(await veW.writeContract({ address: USDC, abi: ERC20, functionName: "approve", args: [COP, AMOUNT] }), "approve");

console.log("1. vendor requestAndLock (5 USDC, fee 0.015)…");
await mined(await veW.writeContract({ address: COP, abi: COP_ABI, functionName: "requestAndLock", args: [cashoutId, AMOUNT, FEE, AMOUNT * 80n, corridor, BigInt(Math.floor(Date.now() / 1000) + 3600), keccak256(toHex("q"))] }), "lock");
const locked = await pub.readContract({ address: COP, abi: COP_ABI, functionName: "getOrder", args: [cashoutId] });
if (locked.klaroFee !== FEE) throw new Error(`stored klaroFee ${locked.klaroFee} != ${FEE}`);
console.log(`   on-chain klaroFee=${locked.klaroFee} ✓`);

console.log("2. operator claimByLP…");
await mined(await opW.writeContract({ address: COP, abi: COP_ABI, functionName: "claimByLP", args: [cashoutId, LP_ID] }), "claim");
console.log("3. operator recordProof…");
const proof = { cashoutId, lpId: LP_ID, vendorId: keccak256(toHex(vendor.address)), inrAmount: AMOUNT * 80n, usdcAmount: AMOUNT, utrReferenceHash: keccak256(toHex("UTR")), screenshotHash: keccak256(toHex("ss")), submittedAt: 0n, lpSignatureHash: keccak256(toHex("lp")), verifierSignatureHash: keccak256(toHex("v")) };
await mined(await opW.writeContract({ address: COP, abi: COP_ABI, functionName: "recordProof", args: [cashoutId, proof] }), "proof");
console.log("4. operator operatorConfirmReceived (release + fee carve)…");
const rcpt = await mined(await opW.writeContract({ address: COP, abi: COP_ABI, functionName: "operatorConfirmReceived", args: [cashoutId, vendor.address] }), "release");

// CashoutFeeWithheld event proof (gas-independent: confirms fee→receiver exactly)
let feeEvent = null;
for (const log of rcpt.logs) {
  if (log.address.toLowerCase() !== COP.toLowerCase()) continue;
  try { const e = decodeEventLog({ abi: COP_ABI, data: log.data, topics: log.topics }); if (e.eventName === "CashoutFeeWithheld") feeEvent = e.args; } catch { /* not this event */ }
}

const lpAfter = await bal(lpWallet);
const copAfter = await bal(COP);
const lpDelta = lpAfter - lpBefore;
const checks = [
  ["LP received amount − fee", lpDelta === EXPECT_LP, `${lpDelta} (want ${EXPECT_LP})`],
  ["escrow fully released (Δ COP == 0)", copAfter === copBefore, `${copAfter - copBefore}`],
  ["CashoutFeeWithheld fee == FEE", feeEvent && feeEvent.fee === FEE, feeEvent ? `${feeEvent.fee}` : "no event"],
  ["CashoutFeeWithheld receiver == feeReceiver", feeEvent && feeEvent.receiver?.toLowerCase() === feeReceiver.toLowerCase(), feeEvent?.receiver ?? "-"],
];
console.log("");
for (const [name, ok, detail] of checks) console.log(`${ok ? "PASS" : "FAIL"}  ${name}  [${detail}]`);
const allOk = checks.every((c) => c[1]);
console.log(allOk
  ? `\nFEE_PROOF_OK=true — LP got ${lpDelta} (= ${AMOUNT} − ${FEE}); fee ${FEE} → ${feeReceiver}; escrow conserved.\nlock_tx + release_tx printed above.`
  : `\nFEE_PROOF_OK=false`);
process.exit(allOk ? 0 : 1);
