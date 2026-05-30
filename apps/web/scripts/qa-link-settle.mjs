// Settle a specific link-backed invoice via the operator (recordScreening +
// settle), then verify: status SETTLED, funds to the vendor, and — via the
// running daemon's InvoiceSettled listener — the link's paid_count bumps.
// Run from apps/web:  node scripts/qa-link-settle.mjs <invoiceId> <linkId>
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createPublicClient, createWalletClient, http, parseAbi, keccak256, stringToBytes } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createClient } from "@supabase/supabase-js";

function env(f) { const o = {}; for (const l of readFileSync(f, "utf8").split(/\r?\n/)) { if (!l || l.startsWith("#")) continue; const i = l.indexOf("="); if (i < 0) continue; o[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^"|"$/g, ""); } return o; }
const local = env(resolve(".env.local"));
const cenv = env(resolve("../../packages/contracts/.env"));
const invoiceId = process.argv[2] || "0x9a921e0fe80a2fa782607e7d6de6f156f5861fd58d5c5e48f560da67f2f0445f";
const linkId = process.argv[3] || "b91b111a-01bd-48a7-8b90-2ada7dea4d2c";

const RPC = local.NEXT_PUBLIC_ARC_TESTNET_RPC_URL || "https://rpc.testnet.arc.network";
const ARC = { id: 5_042_002, name: "Arc", nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } };
const ESCROW = local.NEXT_PUBLIC_INVOICE_ESCROW_ADDRESS;
const USDC = "0x3600000000000000000000000000000000000000";
const operator = privateKeyToAccount(cenv.PRIVATE_KEY);
const pub = createPublicClient({ chain: ARC, transport: http() });
const operW = createWalletClient({ account: operator, chain: ARC, transport: http() });
const sb = createClient(local.SUPABASE_URL, local.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const ESC = parseAbi([
  "function recordScreening(bytes32 invoiceId, bytes32 screeningHash) external",
  "function settle(bytes32 invoiceId) external",
  "function invoices(bytes32) view returns (address vendor,address token,uint256 amount,uint64 dueAt,uint64 acceptedAt,address acceptedBy,bytes32 metadataHash,bytes32 screeningHash,bytes32 splitsHash,uint8 status)",
]);
const ERC = parseAbi(["function balanceOf(address) view returns (uint256)"]);
let n = 0; const log = (...a) => console.log(`[settle ${++n}]`, ...a);
const mined = async (h, l) => { const r = await pub.waitForTransactionReceipt({ hash: h }); log(`${l}: ${h.slice(0, 16)} ${r.status}`); if (r.status !== "success") throw new Error(l + " reverted"); };

const oc0 = await pub.readContract({ address: ESCROW, abi: ESC, functionName: "invoices", args: [invoiceId] });
log("before: status", Number(oc0[9]), "vendor", oc0[0]);
const vendor = oc0[0];
const before = await pub.readContract({ address: USDC, abi: ERC, functionName: "balanceOf", args: [vendor] });

if (Number(oc0[9]) === 3) {
  await mined(await operW.writeContract({ address: ESCROW, abi: ESC, functionName: "recordScreening", args: [invoiceId, keccak256(stringToBytes("clean"))], gas: 200_000n }), "recordScreening");
  await mined(await operW.writeContract({ address: ESCROW, abi: ESC, functionName: "settle", args: [invoiceId], gas: 400_000n }), "settle");
} else log("not PAID — skipping settle (status", Number(oc0[9]) + ")");

const oc1 = await pub.readContract({ address: ESCROW, abi: ESC, functionName: "invoices", args: [invoiceId] });
const after = await pub.readContract({ address: USDC, abi: ERC, functionName: "balanceOf", args: [vendor] });
log("after: status", Number(oc1[9]), "(4=SETTLED) | vendor USDC delta:", (Number(after - before) / 1e6).toFixed(4));

// Poll the link's paid_count — the running daemon's InvoiceSettled listener bumps it.
let bumped = false;
for (let i = 0; i < 16; i++) {
  const { data } = await sb.from("payment_links").select("paid_count").eq("id", linkId).maybeSingle();
  log(`paid_count t+${i * 5}s:`, data?.paid_count);
  if ((data?.paid_count ?? 0) >= 1) { bumped = true; break; }
  await new Promise((r) => setTimeout(r, 5000));
}
console.log("LINK_SETTLE_OK=" + (Number(oc1[9]) === 4 && bumped));
process.exit(Number(oc1[9]) === 4 && bumped ? 0 : 1);
