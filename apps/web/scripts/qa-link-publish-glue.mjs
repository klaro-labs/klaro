// Klaro Link WEB-PATH consistency proof. Reads the seeded link's stored
// authorization (service-role), replicates getOrCreateLinkInvoice's EXACT
// id/dueAt/metadataHash computation, publishes the invoice via createInvoiceFor
// using the stored vendor auth (what publishLinkInvoiceOnChain does), then the
// buyer acceptAndPay + operator settle using the SAME values PayWithUSDC would
// receive. If it settles to the vendor, the publish↔acceptance term derivation
// is consistent end-to-end.  Run from apps/web:  node scripts/qa-link-publish-glue.mjs <slug>
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { createPublicClient, createWalletClient, http, parseAbi, keccak256, stringToBytes, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

function env(f) { const o = {}; for (const l of readFileSync(f, "utf8").split(/\r?\n/)) { if (!l || l.startsWith("#")) continue; const i = l.indexOf("="); if (i < 0) continue; o[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^"|"$/g, ""); } return o; }
const local = env(resolve(".env.local"));
const w = env(resolve("e2e/wallets/.env.test-wallets"));
const cenv = env(resolve("../../packages/contracts/.env"));

const slug = process.argv[2] || "qa6cb18007";
const RPC = local.NEXT_PUBLIC_ARC_TESTNET_RPC_URL || "https://rpc.testnet.arc.network";
const ARC = { id: 5_042_002, name: "Arc", nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } };
const ESCROW = local.NEXT_PUBLIC_INVOICE_ESCROW_ADDRESS;
const USDC = "0x3600000000000000000000000000000000000000";
const sb = createClient(local.SUPABASE_URL || local.NEXT_PUBLIC_SUPABASE_URL, local.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const buyer = privateKeyToAccount(w.CUSTOMER_TEST_PRIVATE_KEY);
// The relayer key the web server uses (LINK_PUBLISHER_PRIVATE_KEY) — same as operator for QA.
const relayer = privateKeyToAccount(local.LINK_PUBLISHER_PRIVATE_KEY || cenv.PRIVATE_KEY);
const operator = privateKeyToAccount(cenv.PRIVATE_KEY);

const pub = createPublicClient({ chain: ARC, transport: http() });
const relayerW = createWalletClient({ account: relayer, chain: ARC, transport: http() });
const buyerW = createWalletClient({ account: buyer, chain: ARC, transport: http() });
const operW = createWalletClient({ account: operator, chain: ARC, transport: http() });

const ESC = parseAbi([
  "function createInvoiceFor(bytes32 invoiceId, address vendor, address token, uint256 amount, uint64 dueAt, bytes32 metadataHash, bytes32 linkId, uint64 authDeadline, bytes vendorAuthSig) external",
  "function acceptAndPay(bytes32 invoiceId, bytes buyerSignature, address buyer) external",
  "function recordScreening(bytes32 invoiceId, bytes32 screeningHash) external",
  "function settle(bytes32 invoiceId) external",
  "function invoices(bytes32) view returns (address vendor,address token,uint256 amount,uint64 dueAt,uint64 acceptedAt,address acceptedBy,bytes32 metadataHash,bytes32 screeningHash,bytes32 splitsHash,uint8 status)",
]);
const ERC = parseAbi(["function approve(address,uint256) returns (bool)", "function balanceOf(address) view returns (uint256)"]);

let n = 0; const log = (...a) => console.log(`[glue ${++n}]`, ...a);
const mined = async (h, l) => { const r = await pub.waitForTransactionReceipt({ hash: h }); log(`${l}: ${h.slice(0, 16)} ${r.status}`); if (r.status !== "success") throw new Error(l + " reverted"); };

// 1. Read the seeded link + its stored authorization.
const { data: link, error } = await sb
  .from("payment_links")
  .select("id, slug, label, amount_usdc, expires_at, link_chain_id, vendor_auth_sig, auth_deadline, vendors!inner(wallet)")
  .eq("slug", slug).single();
if (error) throw error;
const vendorWallet = link.vendors.wallet;
const amount = BigInt(String(link.amount_usdc).replace(/\.\d+$/, ""));
log("link", link.id, "vendor", vendorWallet, "amount", amount.toString());
if (!link.link_chain_id || !link.vendor_auth_sig || link.auth_deadline == null) {
  throw new Error("link has no stored on-chain authorization");
}

// 2. Replicate getOrCreateLinkInvoice's EXACT derivation (lib/repo/links.ts).
const bucket = Math.floor(Date.now() / (5 * 60 * 1000));
const invoiceId = keccak256(stringToBytes(`klaro.link|${link.id}|${buyer.address.toLowerCase()}|${bucket}`));
const dueAt = link.expires_at ? new Date(link.expires_at) : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
const dueAtUnix = BigInt(Math.floor(dueAt.getTime() / 1000));
const metadataHash = keccak256(stringToBytes(JSON.stringify({ link: link.slug, label: link.label, amount: amount.toString() })));
log("derived invoiceId", invoiceId.slice(0, 18), "dueAtUnix", dueAtUnix.toString(), "metaHash", metadataHash.slice(0, 18));

// 3. Publish via createInvoiceFor with the STORED auth (what the relayer does).
const exists = await pub.readContract({ address: ESCROW, abi: ESC, functionName: "invoices", args: [invoiceId] });
if (Number(exists[9]) === 0) {
  await mined(await relayerW.writeContract({ address: ESCROW, abi: ESC, functionName: "createInvoiceFor",
    args: [invoiceId, vendorWallet, USDC, amount, dueAtUnix, metadataHash, link.link_chain_id, BigInt(link.auth_deadline), link.vendor_auth_sig], gas: 500_000n }), "relayer.createInvoiceFor");
} else { log("invoice already on-chain (idempotent) status", Number(exists[9])); }
const oc = await pub.readContract({ address: ESCROW, abi: ESC, functionName: "invoices", args: [invoiceId] });
log("on-chain vendor", oc[0], "(want", vendorWallet + ")");

// 4. Buyer acceptAndPay with the SAME values PayWithUSDC signs.
const accSig = await buyer.signTypedData({
  domain: { name: "Klaro Invoice", version: "1", chainId: 5_042_002, verifyingContract: ESCROW },
  types: { InvoiceAcceptance: [
    { name: "invoiceId", type: "bytes32" }, { name: "vendor", type: "address" }, { name: "token", type: "address" },
    { name: "amount", type: "uint256" }, { name: "dueAt", type: "uint64" }, { name: "metadataHash", type: "bytes32" }, { name: "splitsHash", type: "bytes32" } ] },
  primaryType: "InvoiceAcceptance",
  message: { invoiceId, vendor: vendorWallet, token: USDC, amount, dueAt: dueAtUnix, metadataHash, splitsHash: toHex(0, { size: 32 }) },
});
await mined(await buyerW.writeContract({ address: USDC, abi: ERC, functionName: "approve", args: [ESCROW, amount], gas: 120_000n }), "buyer.approve");
await mined(await buyerW.writeContract({ address: ESCROW, abi: ESC, functionName: "acceptAndPay", args: [invoiceId, accSig, buyer.address], gas: 1_500_000n }), "buyer.acceptAndPay");

// 5. Operator settle → vendor receives funds.
const before = await pub.readContract({ address: USDC, abi: ERC, functionName: "balanceOf", args: [vendorWallet] });
await mined(await operW.writeContract({ address: ESCROW, abi: ESC, functionName: "recordScreening", args: [invoiceId, keccak256(stringToBytes("clean"))], gas: 200_000n }), "operator.recordScreening");
await mined(await operW.writeContract({ address: ESCROW, abi: ESC, functionName: "settle", args: [invoiceId], gas: 400_000n }), "operator.settle");
const after = await pub.readContract({ address: USDC, abi: ERC, functionName: "balanceOf", args: [vendorWallet] });
const final = await pub.readContract({ address: ESCROW, abi: ESC, functionName: "invoices", args: [invoiceId] });

log("final status", Number(final[9]), "(4=SETTLED) | vendor delta", (Number(after - before) / 1e6).toFixed(4), "USDC");
const ok = oc[0].toLowerCase() === vendorWallet.toLowerCase() && Number(final[9]) === 4 && (after - before) === amount;
console.log("LINK_WEB_GLUE_OK=" + ok);
process.exit(ok ? 0 : 1);
