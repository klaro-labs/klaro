// Live verification of the deployed createInvoiceFor (Klaro Link on-chain path).
// Proves: vendor signs a LinkInvoiceAuthorization ONCE → operator publishes the
// invoice on the vendor's behalf via createInvoiceFor (relayed, vendor absent)
// → buyer acceptAndPay → operator settle → funds land with the VENDOR.
// Run from apps/web: node scripts/qa-link-onchain.mjs
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createPublicClient, createWalletClient, http, parseAbi, keccak256, toBytes, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

function env(f) { const o = {}; for (const l of readFileSync(f, "utf8").split(/\r?\n/)) { if (!l || l.startsWith("#")) continue; const i = l.indexOf("="); if (i < 0) continue; o[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^"|"$/g, ""); } return o; }
const local = env(resolve(".env.local"));
const w = env(resolve("e2e/wallets/.env.test-wallets"));
const cenv = env(resolve("../../packages/contracts/.env"));
const RPC = local.NEXT_PUBLIC_ARC_TESTNET_RPC_URL || "https://rpc.testnet.arc.network";
const ARC = { id: 5_042_002, name: "Arc", nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } };
const ESCROW = local.NEXT_PUBLIC_INVOICE_ESCROW_ADDRESS;
const USDC = local.NEXT_PUBLIC_USDC_ADDRESS || "0x3600000000000000000000000000000000000000";

const vendor = privateKeyToAccount(w.LP_TEST_PRIVATE_KEY);          // the link's vendor (absent at pay time)
const buyer = privateKeyToAccount(w.CUSTOMER_TEST_PRIVATE_KEY);
const operator = privateKeyToAccount(cenv.PRIVATE_KEY);            // Klaro operator = the relayer

const pub = createPublicClient({ chain: ARC, transport: http() });
const vendorW = createWalletClient({ account: vendor, chain: ARC, transport: http() });
const operW = createWalletClient({ account: operator, chain: ARC, transport: http() });
const buyerW = createWalletClient({ account: buyer, chain: ARC, transport: http() });

const ESC_ABI = parseAbi([
  "function createInvoiceFor(bytes32 invoiceId, address vendor, address token, uint256 amount, uint64 dueAt, bytes32 metadataHash, bytes32 linkId, uint64 authDeadline, bytes vendorAuthSig) external",
  "function acceptAndPay(bytes32 invoiceId, bytes buyerSignature, address buyer) external",
  "function recordScreening(bytes32 invoiceId, bytes32 screeningHash) external",
  "function settle(bytes32 invoiceId) external",
  "function invoices(bytes32) view returns (address vendor,address token,uint256 amount,uint64 dueAt,uint64 acceptedAt,address acceptedBy,bytes32 metadataHash,bytes32 screeningHash,bytes32 splitsHash,uint8 status)",
]);
const ERC = parseAbi(["function approve(address,uint256) returns (bool)", "function balanceOf(address) view returns (uint256)"]);

const AMOUNT = 100_000n;                  // 0.10 USDC
const DUE = 2_500_000_000n;
const META = keccak256(toBytes("link-meta-onchain"));
const LINK_ID = keccak256(toBytes("klaro.link.qa." + ESCROW));
const invoiceId = keccak256(toBytes(`klaro.link|${LINK_ID}|${buyer.address}|onchain-test`));
const authDeadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

const domain = { name: "Klaro Invoice", version: "1", chainId: 5_042_002, verifyingContract: ESCROW };
let n = 0; const log = (...a) => console.log(`[link ${++n}]`, ...a);
const mined = async (h, l) => { const r = await pub.waitForTransactionReceipt({ hash: h }); log(`${l}: ${h.slice(0, 16)} ${r.status}`); if (r.status !== "success") throw new Error(l + " reverted"); };

log("vendor", vendor.address, "| buyer", buyer.address, "| operator(relayer)", operator.address);

// 1. Vendor signs the link authorization ONCE (off-chain, no gas).
const authSig = await vendor.signTypedData({
  domain,
  types: { LinkInvoiceAuthorization: [{ name: "vendor", type: "address" }, { name: "token", type: "address" }, { name: "amount", type: "uint256" }, { name: "linkId", type: "bytes32" }, { name: "authDeadline", type: "uint64" }] },
  primaryType: "LinkInvoiceAuthorization",
  message: { vendor: vendor.address, token: USDC, amount: AMOUNT, linkId: LINK_ID, authDeadline },
});
log("vendor signed LinkInvoiceAuthorization");

// 2. Operator (relayer, NOT the vendor) publishes the invoice on-chain.
await mined(await operW.writeContract({ address: ESCROW, abi: ESC_ABI, functionName: "createInvoiceFor", args: [invoiceId, vendor.address, USDC, AMOUNT, DUE, META, LINK_ID, authDeadline, authSig], gas: 400_000n }), "operator.createInvoiceFor");
const oc1 = await pub.readContract({ address: ESCROW, abi: ESC_ABI, functionName: "invoices", args: [invoiceId] });
log("on-chain invoice vendor:", oc1[0], "(want", vendor.address + ")", "status", Number(oc1[9]));

// 3. Buyer signs acceptance + approves + acceptAndPay.
const accSig = await buyer.signTypedData({
  domain,
  types: { InvoiceAcceptance: [{ name: "invoiceId", type: "bytes32" }, { name: "vendor", type: "address" }, { name: "token", type: "address" }, { name: "amount", type: "uint256" }, { name: "dueAt", type: "uint64" }, { name: "metadataHash", type: "bytes32" }, { name: "splitsHash", type: "bytes32" }] },
  primaryType: "InvoiceAcceptance",
  message: { invoiceId, vendor: vendor.address, token: USDC, amount: AMOUNT, dueAt: DUE, metadataHash: META, splitsHash: toHex(0, { size: 32 }) },
});
await mined(await buyerW.writeContract({ address: USDC, abi: ERC, functionName: "approve", args: [ESCROW, AMOUNT], gas: 120_000n }), "buyer.approve");
await mined(await buyerW.writeContract({ address: ESCROW, abi: ESC_ABI, functionName: "acceptAndPay", args: [invoiceId, accSig, buyer.address], gas: 1_500_000n }), "buyer.acceptAndPay");

// 4. Operator settles → vendor receives funds.
const vBefore = await pub.readContract({ address: USDC, abi: ERC, functionName: "balanceOf", args: [vendor.address] });
await mined(await operW.writeContract({ address: ESCROW, abi: ESC_ABI, functionName: "recordScreening", args: [invoiceId, keccak256(toBytes("clean"))], gas: 200_000n }), "operator.recordScreening");
await mined(await operW.writeContract({ address: ESCROW, abi: ESC_ABI, functionName: "settle", args: [invoiceId], gas: 400_000n }), "operator.settle");
const vAfter = await pub.readContract({ address: USDC, abi: ERC, functionName: "balanceOf", args: [vendor.address] });
const oc2 = await pub.readContract({ address: ESCROW, abi: ESC_ABI, functionName: "invoices", args: [invoiceId] });

log("final status:", Number(oc2[9]), "(4=SETTLED) | vendor USDC delta:", (Number(vAfter - vBefore) / 1e6).toFixed(4));
const ok = oc1[0].toLowerCase() === vendor.address.toLowerCase() && Number(oc2[9]) === 4 && (vAfter - vBefore) === AMOUNT;
console.log("LINK_ONCHAIN_OK=" + ok);
process.exit(ok ? 0 : 1);
