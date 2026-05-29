// QA P-E drive (viem-direct): exercise the cashout DISPUTE path end-to-end on
// Arc testnet to prove (a) the on-chain dispute state machine across
// CashoutOrderProcessor + DisputeManager and (b) the daemon's `disputes`
// listener fans out on OrderDisputed/Decided. No web UI (LF-3 deferred).
//
//   vendor.requestAndLock -> operator.claimByLP(CLAIMED)
//   -> vendor.openDispute (COP DISPUTED + DisputeManager case OPENED)
//   -> operator.assignToReview(UNDER_REVIEW) -> operator.decide(REFUND_TO_RESPONDENT)
//   -> operator.resolveDispute -> RESOLVED_LP_PAYS, USDC -> LP wallet
//
// Reuses the ADMITTED lpId from qa-cashout-drive. Run qa-cashout-preflight first.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createPublicClient, createWalletClient, http, parseAbi, keccak256, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const ARC = {
  id: 5_042_002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.testnet.arc.network"] } },
};
const COP = "0x4047ecf1f67dE098aF919bD2Ce9137b4414d226c";
const DISPUTE_MGR = "0xee9561BE93312625C7F622D3f63B9092Af23aE5F";
const LP_REGISTRY = "0xCF591a1fA140c5Ca04686dDD7De006Da78C2180b";

const COP_ABI = parseAbi([
  "function usdc() view returns (address)",
  "function requestAndLock(bytes32 cashoutId, uint256 usdcAmount, uint256 inrAmount, bytes32 corridor, uint64 quoteExpiresAt, bytes32 quoteHash) external",
  "function claimByLP(bytes32 cashoutId, bytes32 lpId) external",
  "function openDispute(bytes32 cashoutId, bytes32 openingEvidenceHash) external",
  "function resolveDispute(bytes32 cashoutId, uint256 slashAmount, bytes32 reasonHash) external",
  "function getOrder(bytes32 cashoutId) view returns ((address vendor, address token, uint256 usdcAmount, uint256 inrAmount, bytes32 lpId, address lpWallet, bytes32 corridor, uint64 requestedAt, uint64 quoteExpiresAt, bytes32 quoteHash, bytes32 proofHash, uint8 status))",
]);
const DM_ABI = parseAbi([
  "function trustedCallers(address) view returns (bool)",
  "function klaroOperator() view returns (address)",
  "function assignToReview(bytes32 caseId) external",
  "function decide(bytes32 caseId, uint8 outcome, bytes32 reasonHash, bytes32 evidenceHash) external",
  "function getCase(bytes32 caseId) view returns ((address claimant, address respondent, bytes32 context, bytes32 contextRefId, bytes32 openingEvidenceHash, bytes32 latestEvidenceHash, bytes32 decisionEvidenceHash, bytes32 decisionReasonHash, uint8 status, uint8 outcome, uint64 openedAt, uint64 decidedAt))",
]);
const REG_ABI = parseAbi(["function statusOf(bytes32) view returns (uint8)"]);
const ERC20_ABI = parseAbi([
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address owner) view returns (uint256)",
]);
const OSTATUS = ["NONE","REQUESTED","LOCKED","CLAIMED","PROOF_SUBMITTED","CONFIRMED","RELEASED","DISPUTED","RESOLVED_LP_PAYS","RESOLVED_VENDOR_PAYS","EXPIRED","CANCELLED"];
const CSTATUS = ["NONE","OPENED","EVIDENCE_REQUESTED","EVIDENCE_SUBMITTED","UNDER_REVIEW","DECIDED"];
const COUTCOME = ["NONE","RELEASE_TO_CLAIMANT","REFUND_TO_RESPONDENT","SLASH_LP","PENALIZE_VENDOR","MUTUAL_RESOLVED"];

function readEnv(file) {
  const out = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("="); if (i < 0) continue;
    out[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^"|"$/g, "");
  }
  return out;
}
const dEnv = readEnv(resolve("../daemon/.env"));
const w = readEnv(resolve("e2e/wallets/.env.test-wallets"));
const operator = privateKeyToAccount(dEnv.DAEMON_OPERATOR_PRIVATE_KEY);
const vendor = privateKeyToAccount(w.LP_TEST_PRIVATE_KEY);
const lpWallet = w.CUSTOMER_TEST_ADDRESS;

const pub = createPublicClient({ chain: ARC, transport: http() });
const opW = createWalletClient({ account: operator, chain: ARC, transport: http() });
const veW = createWalletClient({ account: vendor, chain: ARC, transport: http() });
const usdc = await pub.readContract({ address: COP, abi: COP_ABI, functionName: "usdc" });
const eq = (a, b) => a?.toLowerCase() === b?.toLowerCase();

// ── Inline preflight (abort before any tx) ──
const lpId = keccak256(toHex("klaro.qa.lp.inr.001"));
const [dmTrustsCop, dmOp, lpStat] = await Promise.all([
  pub.readContract({ address: DISPUTE_MGR, abi: DM_ABI, functionName: "trustedCallers", args: [COP] }),
  pub.readContract({ address: DISPUTE_MGR, abi: DM_ABI, functionName: "klaroOperator" }),
  pub.readContract({ address: LP_REGISTRY, abi: REG_ABI, functionName: "statusOf", args: [lpId] }),
]);
const pf = [
  ["DisputeManager.trustedCallers[COP] == true", dmTrustsCop === true, `${dmTrustsCop}`],
  ["DisputeManager.klaroOperator == daemon operator", eq(dmOp, operator.address), `${dmOp}`],
  ["LP (reused lpId) is ADMITTED", lpStat === 2, `status=${lpStat}`],
];
console.log("=== dispute preflight ===");
for (const [l, ok, d] of pf) console.log(`${ok ? "PASS" : "FAIL"}  ${l}  [${d}]`);
if (!pf.every(([, ok]) => ok)) { console.log("\nNO-GO — fix wiring first."); process.exit(1); }

const cashoutId = keccak256(toHex(`klaro.qa.dispute.${Date.now()}`));
const corridor = keccak256(toHex("INR"));
const usdcAmount = 1_000_000n;
const reason = keccak256(toHex("klaro.reason.DISPUTE_USER_FAULT"));
const REFUND_TO_RESPONDENT = 2;

const mined = async (hash, label) => {
  const r = await pub.waitForTransactionReceipt({ hash });
  console.log(`  ${label}: ${hash} block=${r.blockNumber} status=${r.status}`);
  if (r.status !== "success") throw new Error(`${label} reverted`);
  return r;
};
const oStat = async () => OSTATUS[(await pub.readContract({ address: COP, abi: COP_ABI, functionName: "getOrder", args: [cashoutId] })).status];

console.log("\noperator:", operator.address, "\nvendor  :", vendor.address, "\nlpWallet:", lpWallet, "\ncashoutId:", cashoutId, "\n");

// 1. lock + claim -> CLAIMED
const allowance = await pub.readContract({ address: usdc, abi: ERC20_ABI, functionName: "allowance", args: [vendor.address, COP] });
if (allowance < usdcAmount) { console.log("approve…"); await mined(await veW.writeContract({ address: usdc, abi: ERC20_ABI, functionName: "approve", args: [COP, usdcAmount] }), "approve"); }
const lpBefore = await pub.readContract({ address: usdc, abi: ERC20_ABI, functionName: "balanceOf", args: [lpWallet] });
console.log("1. requestAndLock…");
await mined(await veW.writeContract({ address: COP, abi: COP_ABI, functionName: "requestAndLock", args: [cashoutId, usdcAmount, 850000n, corridor, BigInt(Math.floor(Date.now()/1000)+3600), keccak256(toHex("qa.quote"))] }), "requestAndLock");
console.log("2. claimByLP…");
await mined(await opW.writeContract({ address: COP, abi: COP_ABI, functionName: "claimByLP", args: [cashoutId, lpId] }), "claimByLP");
console.log("   order:", await oStat());

// 2. vendor opens dispute -> COP DISPUTED + DisputeManager case OPENED
console.log("3. openDispute (vendor)…");
await mined(await veW.writeContract({ address: COP, abi: COP_ABI, functionName: "openDispute", args: [cashoutId, keccak256(toHex("qa-dispute-evidence"))] }), "openDispute");
console.log("   order:", await oStat());
let c = await pub.readContract({ address: DISPUTE_MGR, abi: DM_ABI, functionName: "getCase", args: [cashoutId] });
console.log("   case :", CSTATUS[c.status], "claimant=", c.claimant, "respondent=", c.respondent);

// 3. operator review + decide
console.log("4. assignToReview…");
await mined(await opW.writeContract({ address: DISPUTE_MGR, abi: DM_ABI, functionName: "assignToReview", args: [cashoutId] }), "assignToReview");
console.log("5. decide(REFUND_TO_RESPONDENT)…");
await mined(await opW.writeContract({ address: DISPUTE_MGR, abi: DM_ABI, functionName: "decide", args: [cashoutId, REFUND_TO_RESPONDENT, reason, keccak256(toHex("qa-decision-evidence"))] }), "decide");
c = await pub.readContract({ address: DISPUTE_MGR, abi: DM_ABI, functionName: "getCase", args: [cashoutId] });
console.log("   case :", CSTATUS[c.status], "outcome=", COUTCOME[c.outcome]);

// 4. operator resolves on the escrow -> USDC to LP
console.log("6. resolveDispute…");
await mined(await opW.writeContract({ address: COP, abi: COP_ABI, functionName: "resolveDispute", args: [cashoutId, 0n, reason] }), "resolveDispute");
const finalO = await oStat();
const lpAfter = await pub.readContract({ address: usdc, abi: ERC20_ABI, functionName: "balanceOf", args: [lpWallet] });

console.log("\n=== RESULT ===");
console.log("final order status:", finalO, "(expected RESOLVED_LP_PAYS)");
console.log("case status/outcome:", CSTATUS[c.status], "/", COUTCOME[c.outcome]);
console.log("LP USDC delta:", Number(lpAfter - lpBefore) / 1e6, "USDC (expected +1.0)");
console.log("cashoutId:", cashoutId);
const ok = finalO === "RESOLVED_LP_PAYS" && CSTATUS[c.status] === "DECIDED" && lpAfter - lpBefore === usdcAmount;
console.log(ok ? "\nON-CHAIN PASS — dispute decided + funds routed to respondent (LP)." : "\nFAIL — see above.");
process.exit(ok ? 0 : 1);
