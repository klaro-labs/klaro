// QA P-D preflight (read-only): drift-check the live on-chain wiring + operator
// identities + funds before driving the CashoutOrderProcessor state machine via
// viem-direct. Sends NO transaction. Prints a GO / NO-GO report.
//
// State machine to drive after GO:
//   vendor.requestAndLock -> operator.claimByLP -> operator.recordProof
//   -> operator.operatorConfirmReceived  (USDC: vendor -> escrow -> LP wallet)

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createPublicClient, http, parseAbi, keccak256, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const ARC = {
  id: 5_042_002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.testnet.arc.network"] } },
};

// DEPLOYMENT.md (drift-checked live below)
const COP = "0x347935A89B95fD2baD736dbADe4C14b0a5e9E6bd";
const LP_REGISTRY = "0xCF591a1fA140c5Ca04686dDD7De006Da78C2180b";
const PROOF_REGISTRY = "0xb0a2c7815D75EeBF73f8869C810EC8da5FcCbC33";
const DISPUTE_MGR = "0xee9561BE93312625C7F622D3f63B9092Af23aE5F";

const COP_ABI = parseAbi([
  "function klaroOperator() view returns (address)",
  "function registry() view returns (address)",
  "function proofs() view returns (address)",
  "function usdc() view returns (address)",
  "function disputes() view returns (address)",
]);
const REG_ABI = parseAbi([
  "function klaroOperator() view returns (address)",
  "function statusOf(bytes32) view returns (uint8)",
  "function walletOf(bytes32) view returns (address)",
]);
const PROOF_ABI = parseAbi(["function klaroOperator() view returns (address)"]);
const ERC20_ABI = parseAbi([
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
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

const dEnv = readEnv(resolve("../daemon/.env"));
const w = readEnv(resolve("e2e/wallets/.env.test-wallets"));
const operator = privateKeyToAccount(dEnv.DAEMON_OPERATOR_PRIVATE_KEY);
const vendor = w.LP_TEST_ADDRESS; // funded QA wallet, acts as cashout vendor
const lpWallet = w.CUSTOMER_TEST_ADDRESS; // distinct LP payout wallet

const pub = createPublicClient({ chain: ARC, transport: http() });
const eq = (a, b) => a?.toLowerCase() === b?.toLowerCase();

const [cOp, cReg, cProofs, cUsdc, cDisp] = await Promise.all([
  pub.readContract({ address: COP, abi: COP_ABI, functionName: "klaroOperator" }),
  pub.readContract({ address: COP, abi: COP_ABI, functionName: "registry" }),
  pub.readContract({ address: COP, abi: COP_ABI, functionName: "proofs" }),
  pub.readContract({ address: COP, abi: COP_ABI, functionName: "usdc" }),
  pub.readContract({ address: COP, abi: COP_ABI, functionName: "disputes" }),
]);
const regOp = await pub.readContract({ address: LP_REGISTRY, abi: REG_ABI, functionName: "klaroOperator" });
const proofOp = await pub.readContract({ address: PROOF_REGISTRY, abi: PROOF_ABI, functionName: "klaroOperator" });
const dec = await pub.readContract({ address: cUsdc, abi: ERC20_ABI, functionName: "decimals" });
const [vUsdc, vNative, opNative] = await Promise.all([
  pub.readContract({ address: cUsdc, abi: ERC20_ABI, functionName: "balanceOf", args: [vendor] }),
  pub.getBalance({ address: vendor }),
  pub.getBalance({ address: operator.address }),
]);

// Deterministic lpId + cashoutId for the QA drive
const lpId = keccak256(toHex("klaro.qa.lp.inr.001"));
const lpStatus = await pub.readContract({ address: LP_REGISTRY, abi: REG_ABI, functionName: "statusOf", args: [lpId] });
const STATUS = ["NONE", "PENDING", "ADMITTED", "SUSPENDED", "REVOKED"];

const checks = [];
const need = (label, ok, detail) => checks.push({ label, ok, detail });

need("COP.usdc resolves", !!cUsdc && cUsdc !== "0x0000000000000000000000000000000000000000", cUsdc);
need("COP.registry == LPRegistry(deploy)", eq(cReg, LP_REGISTRY), cReg);
need("COP.proofs == ProofRegistry(deploy)", eq(cProofs, PROOF_REGISTRY), cProofs);
need("COP.disputes == DisputeManager(deploy)", eq(cDisp, DISPUTE_MGR), cDisp);
need("COP.klaroOperator == daemon operator", eq(cOp, operator.address), `${cOp} vs ${operator.address}`);
need("LPRegistry.klaroOperator == daemon operator", eq(regOp, operator.address), `${regOp}`);
need("ProofRegistry.klaroOperator == CashoutOrderProcessor", eq(proofOp, COP), `${proofOp}`);
need("vendor has ERC-20 USDC >= 1.0", vUsdc >= 1_000_000n, `${Number(vUsdc) / 10 ** dec} USDC`);
need("vendor has native gas (USDC) > 0", vNative > 0n, `${vNative}`);
need("operator has native gas (USDC) > 0", opNative > 0n, `${opNative}`);
need("QA lpId is unregistered (NONE)", lpStatus === 0, `status=${STATUS[lpStatus]}`);

console.log("\n=== Cashout preflight (read-only) ===");
console.log("operator :", operator.address);
console.log("vendor   :", vendor, `(ERC20 USDC ${Number(vUsdc) / 10 ** dec}, native ${vNative})`);
console.log("lpWallet :", lpWallet);
console.log("USDC     :", cUsdc, `(${dec} dec)`);
console.log("lpId     :", lpId);
console.log("");
for (const c of checks) console.log(`${c.ok ? "PASS" : "FAIL"}  ${c.label}  [${c.detail}]`);
const go = checks.every((c) => c.ok);
console.log(`\n${go ? "GO — preconditions met, drive can proceed." : "NO-GO — fix the FAILs above first."}`);
process.exit(go ? 0 : 1);
