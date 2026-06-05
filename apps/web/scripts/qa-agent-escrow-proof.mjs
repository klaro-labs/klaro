// QA proof #4 — on-chain proof that the LIVE AgentEscrow (0xedCd31…AcdD) drives
// the full ERC-8183 agent-job lifecycle on Arc testnet: register an agent
// (operator EIP-712 co-signs), principal funds escrow, agent starts + delivers,
// principal accepts → agent paid (amount) + protocol fee carved to the fee
// receiver. Three distinct wallets:
//   principal = CUSTOMER_TEST (funds + drives create/fund/complete)
//   agent     = LP_TEST       (registers, starts, delivers)
//   operator  = DAEMON key    (registry operator + escrow fee receiver)
//
// Assertions are GAS-INDEPENDENT. Arc pays gas in native USDC (same token as
// the ERC-20 precompile), so any wallet that SENDS a tx has a confounded
// balance. We therefore assert on:
//   • the JobCompleted event (paidToAgent / paidProtocolFee — exact transfer
//     amounts, independent of gas),
//   • the escrow contract balance Δ == 0 (funded → fully paid out),
//   • the fee-receiver balance Δ == +fee (the operator sends NO tx in the happy
//     path, so its delta is clean),
//   • the on-chain job status == CLOSED.
//
// Run from apps/web:  node scripts/qa-agent-escrow-proof.mjs
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  createPublicClient, createWalletClient, http, parseAbi, keccak256, toHex,
  decodeEventLog, zeroAddress,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const ARC = {
  id: 5_042_002, name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.testnet.arc.network"] } },
};
const ESCROW = "0xedCd31c0B7f40585342047c90fB0f8Eabb99AcdD";
const REGISTRY = "0x3cb3b032d8361f0b78cd9d688838e972f5054886";
const USDC = "0x3600000000000000000000000000000000000000";

const REG_ABI = parseAbi([
  "function registerAgent(bytes32 agentId, address owner_, string displayName, string pricingEndpointUrl, uint16 feeBps, uint64 deadline, bytes operatorAuth) external",
  "function registerNonce(bytes32) view returns (uint256)",
  "function feeBpsOf(bytes32) view returns (uint16)",
  "function assertActive(bytes32) view",
]);
const ESC_ABI = parseAbi([
  "function createJob(bytes32 jobId, bytes32 agentId, address agent, uint256 amountUsdc, address hook) external",
  "function fundJob(bytes32 jobId) external",
  "function startJob(bytes32 jobId) external",
  "function submitDeliverable(bytes32 jobId, bytes32 deliverableHash) external",
  "function markCompleted(bytes32 jobId) external",
  "function getJob(bytes32 jobId) view returns ((address principal, bytes32 agentId, address agent, address token, uint256 amountUsdc, uint256 feeUsdc, bytes32 deliverableHash, uint8 status, address hook, uint64 createdAt, uint64 fundedAt, uint64 startedAt, uint64 completedAt))",
  "function klaroFeeReceiver() view returns (address)",
  "event JobCompleted(bytes32 indexed jobId, uint256 paidToAgent, uint256 paidProtocolFee)",
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
const operator = privateKeyToAccount(d.DAEMON_OPERATOR_PRIVATE_KEY); // registry op + fee receiver
const agent = privateKeyToAccount(w.LP_TEST_PRIVATE_KEY);            // agent owner + payout
const principal = privateKeyToAccount(w.CUSTOMER_TEST_PRIVATE_KEY);  // job principal

const pub = createPublicClient({ chain: ARC, transport: http() });
const agW = createWalletClient({ account: agent, chain: ARC, transport: http() });
const prW = createWalletClient({ account: principal, chain: ARC, transport: http() });
const bal = (a) => pub.readContract({ address: USDC, abi: ERC20, functionName: "balanceOf", args: [a] });
const mined = async (h, tag) => {
  const r = await pub.waitForTransactionReceipt({ hash: h });
  if (r.status !== "success") throw new Error(`${tag} reverted ${h}`);
  console.log(`   ${tag}: ${h}`);
  return r;
};

const AMOUNT = 2_000_000n;       // 2 USDC payout to agent
const FEE_BPS = 100n;            // 1%
const FEE = (AMOUNT * FEE_BPS) / 10_000n; // 20_000 (0.02 USDC)
const stamp = Date.now();
const agentId = keccak256(toHex(`klaro.qa.agent.${agent.address}.${stamp}`));
const jobId = keccak256(toHex(`klaro.qa.job.${principal.address}.${stamp}`));

console.log("AgentEscrow:", ESCROW, "\nAgentRegistry:", REGISTRY);
console.log("operator/feeReceiver:", operator.address, "\nagent:", agent.address, "\nprincipal:", principal.address);

const feeReceiver = await pub.readContract({ address: ESCROW, abi: ESC_ABI, functionName: "klaroFeeReceiver" });
if (feeReceiver.toLowerCase() !== operator.address.toLowerCase()) {
  throw new Error(`feeReceiver ${feeReceiver} != operator ${operator.address}; clean-delta assertion invalid`);
}

// ─── 1. operator EIP-712 co-signs the agent registration auth ──────────────
const nonce = await pub.readContract({ address: REGISTRY, abi: REG_ABI, functionName: "registerNonce", args: [agentId] });
const deadline = BigInt(Math.floor(stamp / 1000) + 3600);
const operatorAuth = await operator.signTypedData({
  domain: { name: "Klaro AgentRegistry", version: "1", chainId: ARC.id, verifyingContract: REGISTRY },
  types: {
    RegisterAuthorization: [
      { name: "agentId", type: "bytes32" },
      { name: "owner", type: "address" },
      { name: "deadline", type: "uint64" },
      { name: "nonce", type: "uint256" },
    ],
  },
  primaryType: "RegisterAuthorization",
  message: { agentId, owner: agent.address, deadline, nonce },
});
console.log("\n1. agent registerAgent (operator co-signed, feeBps 100)…");
await mined(await agW.writeContract({
  address: REGISTRY, abi: REG_ABI, functionName: "registerAgent",
  args: [agentId, agent.address, "Klaro QA Agent", "https://agents.www.myklaro.app/qa", Number(FEE_BPS), deadline, operatorAuth],
}), "registerAgent");
await pub.readContract({ address: REGISTRY, abi: REG_ABI, functionName: "assertActive", args: [agentId] });
const onFee = await pub.readContract({ address: REGISTRY, abi: REG_ABI, functionName: "feeBpsOf", args: [agentId] });
console.log(`   registry feeBpsOf=${onFee} ✓ (agent active)`);

// Snapshot the clean wallets (escrow + fee receiver) BEFORE funding.
const escBefore = await bal(ESCROW);
const feeBefore = await bal(feeReceiver);

// ─── 2. principal opens + funds the job ────────────────────────────────────
console.log("2. principal createJob (2 USDC)…");
await mined(await prW.writeContract({ address: ESCROW, abi: ESC_ABI, functionName: "createJob", args: [jobId, agentId, agent.address, AMOUNT, zeroAddress] }), "createJob");
const job = await pub.readContract({ address: ESCROW, abi: ESC_ABI, functionName: "getJob", args: [jobId] });
if (job.feeUsdc !== FEE) throw new Error(`stored feeUsdc ${job.feeUsdc} != ${FEE}`);
console.log(`   on-chain feeUsdc=${job.feeUsdc} (status ${job.status}=CREATED) ✓`);

const need = AMOUNT + FEE;
const allow = await pub.readContract({ address: USDC, abi: ERC20, functionName: "allowance", args: [principal.address, ESCROW] });
if (allow < need) await mined(await prW.writeContract({ address: USDC, abi: ERC20, functionName: "approve", args: [ESCROW, need] }), "approve");
console.log("3. principal fundJob (locks amount + fee)…");
await mined(await prW.writeContract({ address: ESCROW, abi: ESC_ABI, functionName: "fundJob", args: [jobId] }), "fundJob");
const escFunded = await bal(ESCROW);
if (escFunded - escBefore !== need) throw new Error(`escrow funded Δ ${escFunded - escBefore} != ${need}`);
console.log(`   escrow holds +${escFunded - escBefore} ✓`);

// ─── 3. agent works, principal accepts ─────────────────────────────────────
console.log("4. agent startJob…");
await mined(await agW.writeContract({ address: ESCROW, abi: ESC_ABI, functionName: "startJob", args: [jobId] }), "startJob");
console.log("5. agent submitDeliverable…");
await mined(await agW.writeContract({ address: ESCROW, abi: ESC_ABI, functionName: "submitDeliverable", args: [jobId, keccak256(toHex("qa-deliverable"))] }), "deliver");
console.log("6. principal markCompleted (payout + fee carve)…");
const rcpt = await mined(await prW.writeContract({ address: ESCROW, abi: ESC_ABI, functionName: "markCompleted", args: [jobId] }), "complete");

// JobCompleted event = the exact, gas-independent transfer amounts.
let evt = null;
for (const log of rcpt.logs) {
  if (log.address.toLowerCase() !== ESCROW.toLowerCase()) continue;
  try { const e = decodeEventLog({ abi: ESC_ABI, data: log.data, topics: log.topics }); if (e.eventName === "JobCompleted") evt = e.args; } catch { /* not this event */ }
}

const escAfter = await bal(ESCROW);
const feeAfter = await bal(feeReceiver);
const finalJob = await pub.readContract({ address: ESCROW, abi: ESC_ABI, functionName: "getJob", args: [jobId] });

const checks = [
  ["JobCompleted paidToAgent == amount", evt && evt.paidToAgent === AMOUNT, evt ? `${evt.paidToAgent}` : "no event"],
  ["JobCompleted paidProtocolFee == fee", evt && evt.paidProtocolFee === FEE, evt ? `${evt.paidProtocolFee}` : "no event"],
  ["escrow fully drained (Δ == 0)", escAfter === escBefore, `${escAfter - escBefore}`],
  ["fee receiver received exactly fee", feeAfter - feeBefore === FEE, `${feeAfter - feeBefore} (want ${FEE})`],
  ["job status == CLOSED (7)", Number(finalJob.status) === 7, `${finalJob.status}`],
];
console.log("");
for (const [name, ok, detail] of checks) console.log(`${ok ? "PASS" : "FAIL"}  ${name}  [${detail}]`);
const allOk = checks.every((c) => c[1]);
console.log(allOk
  ? `\nAGENT_ESCROW_PROOF_OK=true — agent paid ${AMOUNT}, fee ${FEE} → ${feeReceiver}; escrow conserved; job CLOSED.`
  : `\nAGENT_ESCROW_PROOF_OK=false`);
process.exit(allOk ? 0 : 1);
