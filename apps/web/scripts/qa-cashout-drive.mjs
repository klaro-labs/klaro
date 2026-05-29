// QA P-D drive (viem-direct): exercise the full CashoutOrderProcessor happy
// path on Arc testnet to (a) prove the on-chain cashout state machine and
// (b) verify the daemon's `cashout` listener fans out to Supabase. No Rabby /
// web UI — bypasses the M11-deferred web wiring (LF-3). Run preflight first.
//
//   operator.registerLP+admit -> vendor.approve+requestAndLock(LOCKED)
//   -> operator.claimByLP(CLAIMED) -> operator.recordProof(PROOF_SUBMITTED)
//   -> operator.operatorConfirmReceived(RELEASED; USDC -> LP wallet)

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  keccak256,
  toHex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const ARC = {
  id: 5_042_002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.testnet.arc.network"] } },
};
const COP = "0x4047ecf1f67dE098aF919bD2Ce9137b4414d226c";
const LP_REGISTRY = "0xCF591a1fA140c5Ca04686dDD7De006Da78C2180b";

const COP_ABI = parseAbi([
  "function usdc() view returns (address)",
  "function requestAndLock(bytes32 cashoutId, uint256 usdcAmount, uint256 inrAmount, bytes32 corridor, uint64 quoteExpiresAt, bytes32 quoteHash) external",
  "function claimByLP(bytes32 cashoutId, bytes32 lpId) external",
  "function recordProof(bytes32 cashoutId, (bytes32 cashoutId, bytes32 lpId, bytes32 vendorId, uint256 inrAmount, uint256 usdcAmount, bytes32 utrReferenceHash, bytes32 screenshotHash, uint64 submittedAt, bytes32 lpSignatureHash, bytes32 verifierSignatureHash) p) external",
  "function operatorConfirmReceived(bytes32 cashoutId, address expectedVendor) external",
  "function getOrder(bytes32 cashoutId) view returns ((address vendor, address token, uint256 usdcAmount, uint256 inrAmount, bytes32 lpId, address lpWallet, bytes32 corridor, uint64 requestedAt, uint64 quoteExpiresAt, bytes32 quoteHash, bytes32 proofHash, uint8 status))",
]);
const REG_ABI = parseAbi([
  "function registerLP(bytes32 lpId, address wallet, uint8 tier, bytes32 kybRecordHash, bytes32 payoutAccountHash) external",
  "function admit(bytes32 lpId) external",
  "function statusOf(bytes32) view returns (uint8)",
]);
const ERC20_ABI = parseAbi([
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address owner) view returns (uint256)",
]);
const STATUS = [
  "NONE", "REQUESTED", "LOCKED", "CLAIMED", "PROOF_SUBMITTED", "CONFIRMED",
  "RELEASED", "DISPUTED", "RESOLVED_LP_PAYS", "RESOLVED_VENDOR_PAYS", "EXPIRED", "CANCELLED",
];

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

const dEnv = readEnv(resolve("../daemon/.env"));
const w = readEnv(resolve("e2e/wallets/.env.test-wallets"));
const operator = privateKeyToAccount(dEnv.DAEMON_OPERATOR_PRIVATE_KEY);
const vendor = privateKeyToAccount(w.LP_TEST_PRIVATE_KEY);
const lpWallet = w.CUSTOMER_TEST_ADDRESS;

const pub = createPublicClient({ chain: ARC, transport: http() });
const opW = createWalletClient({ account: operator, chain: ARC, transport: http() });
const veW = createWalletClient({ account: vendor, chain: ARC, transport: http() });
const usdc = await pub.readContract({ address: COP, abi: COP_ABI, functionName: "usdc" });

const lpId = keccak256(toHex("klaro.qa.lp.inr.001"));
const cashoutId = keccak256(toHex(`klaro.qa.cashout.${Date.now()}`));
const corridor = keccak256(toHex("INR"));
const usdcAmount = 1_000_000n; // 1.0 USDC (6 dec)
const inrAmount = 8_500_00n; // 8500.00 INR in paise (×100)
const quoteExpiresAt = BigInt(Math.floor(Date.now() / 1000) + 3600);
const quoteHash = keccak256(toHex("qa.quote.85inr.spread20bps.fee10bps"));

const mined = async (hash, label) => {
  const r = await pub.waitForTransactionReceipt({ hash });
  console.log(`  ${label}: ${hash} block=${r.blockNumber} status=${r.status}`);
  if (r.status !== "success") throw new Error(`${label} reverted`);
  return r;
};
const orderStatus = async () => {
  const o = await pub.readContract({ address: COP, abi: COP_ABI, functionName: "getOrder", args: [cashoutId] });
  return { status: o.status, statusName: STATUS[o.status], lpWallet: o.lpWallet, proofHash: o.proofHash };
};

console.log("operator:", operator.address);
console.log("vendor  :", vendor.address);
console.log("lpWallet:", lpWallet);
console.log("lpId    :", lpId);
console.log("cashoutId:", cashoutId, "\n");

// 1. Register + admit the LP (idempotent)
const lpStatus = await pub.readContract({ address: LP_REGISTRY, abi: REG_ABI, functionName: "statusOf", args: [lpId] });
if (lpStatus === 0) {
  console.log("1a. registerLP…");
  await mined(await opW.writeContract({ address: LP_REGISTRY, abi: REG_ABI, functionName: "registerLP",
    args: [lpId, lpWallet, 2, keccak256(toHex("qa-kyb-bundle")), keccak256(toHex("qa-payout-acct"))] }), "registerLP");
}
const after1a = await pub.readContract({ address: LP_REGISTRY, abi: REG_ABI, functionName: "statusOf", args: [lpId] });
if (after1a === 1) {
  console.log("1b. admit…");
  await mined(await opW.writeContract({ address: LP_REGISTRY, abi: REG_ABI, functionName: "admit", args: [lpId] }), "admit");
}
console.log("    LP status:", STATUS_LP(await pub.readContract({ address: LP_REGISTRY, abi: REG_ABI, functionName: "statusOf", args: [lpId] })));

// 2. Vendor approve + requestAndLock
const allowance = await pub.readContract({ address: usdc, abi: ERC20_ABI, functionName: "allowance", args: [vendor.address, COP] });
if (allowance < usdcAmount) {
  console.log("2a. approve USDC…");
  await mined(await veW.writeContract({ address: usdc, abi: ERC20_ABI, functionName: "approve", args: [COP, usdcAmount] }), "approve");
}
const escrowBefore = await pub.readContract({ address: usdc, abi: ERC20_ABI, functionName: "balanceOf", args: [COP] });
const lpBefore = await pub.readContract({ address: usdc, abi: ERC20_ABI, functionName: "balanceOf", args: [lpWallet] });
console.log("2b. requestAndLock…");
await mined(await veW.writeContract({ address: COP, abi: COP_ABI, functionName: "requestAndLock",
  args: [cashoutId, usdcAmount, inrAmount, corridor, quoteExpiresAt, quoteHash] }), "requestAndLock");
console.log("    order:", (await orderStatus()).statusName);

// 3. Operator claimByLP
console.log("3. claimByLP…");
await mined(await opW.writeContract({ address: COP, abi: COP_ABI, functionName: "claimByLP", args: [cashoutId, lpId] }), "claimByLP");
console.log("    order:", (await orderStatus()).statusName);

// 4. Operator recordProof
console.log("4. recordProof…");
const proof = {
  cashoutId, lpId, vendorId: keccak256(toHex(vendor.address)),
  inrAmount, usdcAmount,
  utrReferenceHash: keccak256(toHex("UTR-QA-1234567890")),
  screenshotHash: keccak256(toHex("qa-screenshot-bytes")),
  submittedAt: 0n,
  lpSignatureHash: keccak256(toHex("qa-lp-eip712-attestation")),
  verifierSignatureHash: keccak256(toHex("qa-verifier-countersign")),
};
await mined(await opW.writeContract({ address: COP, abi: COP_ABI, functionName: "recordProof", args: [cashoutId, proof] }), "recordProof");
const afterProof = await orderStatus();
console.log("    order:", afterProof.statusName, "proofHash:", afterProof.proofHash);

// 5. Operator confirm -> RELEASED, USDC to LP
console.log("5. operatorConfirmReceived…");
await mined(await opW.writeContract({ address: COP, abi: COP_ABI, functionName: "operatorConfirmReceived", args: [cashoutId, vendor.address] }), "operatorConfirmReceived");
const final = await orderStatus();
const escrowAfter = await pub.readContract({ address: usdc, abi: ERC20_ABI, functionName: "balanceOf", args: [COP] });
const lpAfter = await pub.readContract({ address: usdc, abi: ERC20_ABI, functionName: "balanceOf", args: [lpWallet] });

console.log("\n=== RESULT ===");
console.log("final order status:", final.statusName, `(expected RELEASED)`);
console.log("LP USDC delta     :", (Number(lpAfter - lpBefore) / 1e6), "USDC (expected +1.0)");
console.log("escrow USDC delta :", (Number(escrowAfter - escrowBefore) / 1e6), "USDC (expected 0 net)");
console.log("cashoutId         :", cashoutId);
const ok = final.statusName === "RELEASED" && lpAfter - lpBefore === usdcAmount;
console.log(ok ? "\nON-CHAIN PASS — cashout released to LP wallet." : "\nFAIL — see deltas above.");

function STATUS_LP(s) { return ["NONE", "PENDING", "ADMITTED", "SUSPENDED", "REVOKED"][s]; }
process.exit(ok ? 0 : 1);
