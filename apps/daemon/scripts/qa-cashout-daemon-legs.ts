/**
 * Cashout daemon-leg integration drive (LF-3 / audit blocker #1).
 *
 * Proves the daemon's on-chain cashout advance — the two legs that were
 * missing and stranded vendor USDC — work end-to-end against the LIVE
 * CashoutOrderProcessor on Arc testnet, using THREE distinct wallets:
 *   vendor   (escrows USDC via requestAndLock)
 *   operator (the daemon key — advances the escrow)
 *   LP       (receives the released USDC)
 *
 * Unlike scripts/qa-cashout-drive.mjs (which makes the operator calls
 * inline), this drive imports and invokes the ACTUAL daemon functions
 * `advanceClaimOnChain` + `advanceProofOnChain` from cashoutAdvancer.ts, so
 * a regression in the worker's ABI, proof-struct construction, or idempotent
 * status guards fails this test. Idempotency is asserted by re-invoking each
 * leg after it has advanced (must be a no-op, never a revert).
 *
 * Run from apps/daemon:
 *   node --env-file=.env <tsx> scripts/qa-cashout-daemon-legs.ts
 * Setup legs (registerLP/admit, vendor approve+requestAndLock,
 * operatorConfirmReceived) use viem-direct; the two legs under test use the
 * daemon code path. No Supabase / Redis / BullMQ — the on-chain advance
 * helpers don't touch them.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  keccak256,
  toHex,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arcTestnet } from "viem/chains";
import {
  advanceClaimOnChain,
  advanceProofOnChain,
  onChainOrder,
  ON_CHAIN_STATUS,
  CASHOUT_ABI,
} from "../src/workers/cashoutAdvancer.js";
import { env } from "../src/env.js";

const COP = env.CASHOUT_ORDER_PROCESSOR_ADDRESS as Hex;
const LP_REGISTRY = "0xCF591a1fA140c5Ca04686dDD7De006Da78C2180b" as Hex;

const VENDOR_ABI = parseAbi([
  "function usdc() view returns (address)",
  "function requestAndLock(bytes32 cashoutId, uint256 usdcAmount, uint256 inrAmount, bytes32 corridor, uint64 quoteExpiresAt, bytes32 quoteHash) external",
]);
const REG_ABI = parseAbi([
  "function registerLP(bytes32 lpId, address wallet, uint8 tier, bytes32 kybRecordHash, bytes32 payoutAccountHash) external",
  "function admit(bytes32 lpId) external",
  "function statusOf(bytes32) view returns (uint8)",
  "function walletOf(bytes32) view returns (address)",
]);
const ERC20_ABI = parseAbi([
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address owner) view returns (uint256)",
]);

function readEnv(file: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i < 0) continue;
    out[line.slice(0, i).trim()] = line
      .slice(i + 1)
      .trim()
      .replace(/^"|"$/g, "");
  }
  return out;
}

const w = readEnv(resolve("../web/e2e/wallets/.env.test-wallets"));
const operator = privateKeyToAccount(env.DAEMON_OPERATOR_PRIVATE_KEY as Hex);
const vendor = privateKeyToAccount(w.LP_TEST_PRIVATE_KEY as Hex);
const lpWallet = w.CUSTOMER_TEST_ADDRESS as Hex;

const pub = createPublicClient({
  chain: arcTestnet,
  transport: http(env.ARC_TESTNET_RPC_URL),
});
const opW = createWalletClient({
  account: operator,
  chain: arcTestnet,
  transport: http(env.ARC_TESTNET_RPC_URL),
});
const veW = createWalletClient({
  account: vendor,
  chain: arcTestnet,
  transport: http(env.ARC_TESTNET_RPC_URL),
});

const usdc = (await pub.readContract({
  address: COP,
  abi: VENDOR_ABI,
  functionName: "usdc",
})) as Hex;

const lpId = keccak256(toHex("klaro.qa.lp.inr.001"));
const cashoutId = keccak256(toHex(`klaro.qa.daemon-legs.${Date.now()}`));
const corridor = keccak256(toHex("INR"));
const usdcAmount = 1_000_000n; // 1.0 USDC (6 dec)
const inrAmount = 850_000n; // 8500.00 INR in paise
const quoteExpiresAt = BigInt(Math.floor(Date.now() / 1000) + 3600);
const quoteHash = keccak256(toHex("qa.daemon-legs.quote"));
// vendorId mirrors the Supabase vendor uuid the worker reads from
// cashout_orders.vendor_id; any non-zero anchor satisfies ProofRegistry.
const vendorIdUuid = "qa-vendor-00000000-0000-0000-0000-000000000001";

const STATUS_NAME = Object.fromEntries(
  Object.entries(ON_CHAIN_STATUS).map(([k, v]) => [v, k]),
) as Record<number, string>;

let failures = 0;
function check(label: string, ok: boolean, detail = ""): void {
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  [${detail}]` : ""}`,
  );
  if (!ok) failures++;
}
async function mined(hash: Hex, label: string): Promise<void> {
  const r = await pub.waitForTransactionReceipt({ hash });
  if (r.status !== "success") throw new Error(`${label} reverted (${hash})`);
}
const status = async (): Promise<number> =>
  Number((await onChainOrder(COP, cashoutId)).status);

console.log("operator :", operator.address);
console.log("vendor   :", vendor.address);
console.log("lpWallet :", lpWallet);
console.log("cashoutId:", cashoutId, "\n");

// ── Setup A: register + admit LP (idempotent) ────────────────────────────
const lpStatus = Number(
  await pub.readContract({
    address: LP_REGISTRY,
    abi: REG_ABI,
    functionName: "statusOf",
    args: [lpId],
  }),
);
if (lpStatus === 0) {
  await mined(
    await opW.writeContract({
      address: LP_REGISTRY,
      abi: REG_ABI,
      functionName: "registerLP",
      args: [
        lpId,
        lpWallet,
        2,
        keccak256(toHex("qa-kyb")),
        keccak256(toHex("qa-payout")),
      ],
      chain: null,
      account: operator,
    }),
    "registerLP",
  );
}
if (
  Number(
    await pub.readContract({
      address: LP_REGISTRY,
      abi: REG_ABI,
      functionName: "statusOf",
      args: [lpId],
    }),
  ) === 1
) {
  await mined(
    await opW.writeContract({
      address: LP_REGISTRY,
      abi: REG_ABI,
      functionName: "admit",
      args: [lpId],
      chain: null,
      account: operator,
    }),
    "admit",
  );
}

// ── Setup B: vendor escrows USDC (requestAndLock → LOCKED) ────────────────
const allowance = await pub.readContract({
  address: usdc,
  abi: ERC20_ABI,
  functionName: "allowance",
  args: [vendor.address, COP],
});
if ((allowance as bigint) < usdcAmount) {
  await mined(
    await veW.writeContract({
      address: usdc,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [COP, usdcAmount],
      chain: null,
      account: vendor,
    }),
    "approve",
  );
}
const lpBefore = (await pub.readContract({
  address: usdc,
  abi: ERC20_ABI,
  functionName: "balanceOf",
  args: [lpWallet],
})) as bigint;
await mined(
  await veW.writeContract({
    address: COP,
    abi: VENDOR_ABI,
    functionName: "requestAndLock",
    args: [
      cashoutId,
      usdcAmount,
      inrAmount,
      corridor,
      quoteExpiresAt,
      quoteHash,
    ],
    chain: null,
    account: vendor,
  }),
  "requestAndLock",
);
check(
  "setup: order LOCKED on-chain",
  (await status()) === ON_CHAIN_STATUS.LOCKED,
  STATUS_NAME[await status()],
);

// ── Leg 1 under test: daemon advanceClaimOnChain (LOCKED → CLAIMED) ───────
const claimedLpId = await advanceClaimOnChain(cashoutId, lpId);
check("claim: daemon returns the claimed lpId", claimedLpId === lpId);
check(
  "claim: order is CLAIMED",
  (await status()) === ON_CHAIN_STATUS.CLAIMED,
  STATUS_NAME[await status()],
);
const snapWallet = (await onChainOrder(COP, cashoutId)).lpWallet as string;
check(
  "claim: escrow snapshotted the LP wallet",
  snapWallet.toLowerCase() === lpWallet.toLowerCase(),
  snapWallet,
);
// idempotency: re-run must no-op (not revert InvalidStatus)
const claimAgain = await advanceClaimOnChain(cashoutId, lpId);
check(
  "claim: idempotent re-run no-ops",
  claimAgain === lpId && (await status()) === ON_CHAIN_STATUS.CLAIMED,
);

// ── Leg 2 under test: daemon advanceProofOnChain (CLAIMED → PROOF_SUBMITTED)
await advanceProofOnChain(cashoutId, {
  vendorId: vendorIdUuid,
  utrReference: "UTR-QA-DAEMON-0001",
  screenshotPath: "qa/screenshots/daemon-legs.png",
  proofHash: keccak256(toHex("qa-daemon-legs-proof-record")),
});
check(
  "proof: order is PROOF_SUBMITTED",
  (await status()) === ON_CHAIN_STATUS.PROOF_SUBMITTED,
  STATUS_NAME[await status()],
);
const anchoredProof = (await onChainOrder(COP, cashoutId)).proofHash as string;
check(
  "proof: a non-zero proof hash is anchored",
  /^0x[0-9a-f]{64}$/i.test(anchoredProof) &&
    anchoredProof !== `0x${"0".repeat(64)}`,
  anchoredProof,
);
// idempotency: re-run must no-op
await advanceProofOnChain(cashoutId, {
  vendorId: vendorIdUuid,
  utrReference: "UTR-QA-DAEMON-0001",
  screenshotPath: "qa/screenshots/daemon-legs.png",
  proofHash: keccak256(toHex("qa-daemon-legs-proof-record")),
});
check(
  "proof: idempotent re-run no-ops",
  (await status()) === ON_CHAIN_STATUS.PROOF_SUBMITTED,
);

// ── Release leg: operator confirms → RELEASED, USDC → LP (the leg the daemon
// already signs in cashoutAdvancer.release; here via the same ABI to verify
// the full money movement the two fixed legs unblock) ────────────────────
await mined(
  await opW.writeContract({
    address: COP,
    abi: CASHOUT_ABI,
    functionName: "operatorConfirmReceived",
    args: [cashoutId, vendor.address],
    chain: null,
    account: operator,
  }),
  "operatorConfirmReceived",
);
const lpAfter = (await pub.readContract({
  address: usdc,
  abi: ERC20_ABI,
  functionName: "balanceOf",
  args: [lpWallet],
})) as bigint;
check(
  "release: order is RELEASED",
  (await status()) === ON_CHAIN_STATUS.RELEASED,
  STATUS_NAME[await status()],
);
check(
  "release: LP received exactly the escrowed USDC",
  lpAfter - lpBefore === usdcAmount,
  `${Number(lpAfter - lpBefore) / 1e6} USDC`,
);

console.log(
  failures === 0
    ? "\nDAEMON-LEGS PASS — claimByLP + recordProof advance the live escrow; USDC released vendor→LP."
    : `\nFAIL — ${failures} check(s) failed above.`,
);
process.exit(failures === 0 ? 0 : 1);
