// Seed a REAL Klaro Link into the DB (service-role) with a vendor-signed
// LinkInvoiceAuthorization — mirrors exactly what createLinkAction stores. Lets
// us exercise /pay/[slug] on the running dev server + the on-chain publish glue
// without needing a logged-in vendor session. Run from apps/web:
//   node scripts/qa-link-seed.mjs
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { createWalletClient, http, keccak256, stringToBytes, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

function env(f) { const o = {}; for (const l of readFileSync(f, "utf8").split(/\r?\n/)) { if (!l || l.startsWith("#")) continue; const i = l.indexOf("="); if (i < 0) continue; o[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^"|"$/g, ""); } return o; }
const local = env(resolve(".env.local"));
const w = env(resolve("e2e/wallets/.env.test-wallets"));

const SUPABASE_URL = local.SUPABASE_URL || local.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = local.SUPABASE_SERVICE_ROLE_KEY;
const ESCROW = local.NEXT_PUBLIC_INVOICE_ESCROW_ADDRESS;
const USDC = "0x3600000000000000000000000000000000000000";
const sb = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });

const vendor = privateKeyToAccount(w.LP_TEST_PRIVATE_KEY);
console.log("LP_TEST vendor wallet:", vendor.address);

// 1. Find the vendor row whose wallet is LP_TEST.
const { data: vendors, error: vErr } = await sb
  .from("vendors")
  .select("id, wallet, display_name")
  .ilike("wallet", vendor.address);
if (vErr) throw vErr;
if (!vendors?.length) {
  console.log("No vendor row with wallet", vendor.address, "— listing a few vendors:");
  const { data: any } = await sb.from("vendors").select("id, wallet, display_name").limit(5);
  console.log(any);
  process.exit(2);
}
const vrow = vendors[0];
console.log("vendor row:", vrow.id, vrow.display_name);

// 2. Sign a LinkInvoiceAuthorization (exactly like LinkForm).
const amountUSD = 0.1;
const amountWei = BigInt(Math.round(amountUSD * 100)) * 10n ** 4n; // 6-dec → 100000
const linkChainId = toHex(crypto.getRandomValues(new Uint8Array(32)));
const nowS = Math.floor(Date.now() / 1000);
const authDeadline = nowS + 730 * 86_400;
const authSig = await vendor.signTypedData({
  domain: { name: "Klaro Invoice", version: "1", chainId: 5_042_002, verifyingContract: ESCROW },
  types: { LinkInvoiceAuthorization: [
    { name: "vendor", type: "address" }, { name: "token", type: "address" },
    { name: "amount", type: "uint256" }, { name: "linkId", type: "bytes32" },
    { name: "authDeadline", type: "uint64" },
  ] },
  primaryType: "LinkInvoiceAuthorization",
  message: { vendor: vendor.address, token: USDC, amount: amountWei, linkId: linkChainId, authDeadline: BigInt(authDeadline) },
});

// 3. Insert the link row (service-role bypasses RLS, like the relayer would read).
const slug = "qa" + toHex(crypto.getRandomValues(new Uint8Array(4))).slice(2);
const { data: ins, error: iErr } = await sb
  .from("payment_links")
  .insert({
    vendor_id: vrow.id, slug, amount_usdc: amountWei.toString(),
    label: "QA link — settle test", link_chain_id: linkChainId,
    vendor_auth_sig: authSig, auth_deadline: authDeadline,
  })
  .select("id, slug")
  .single();
if (iErr) throw iErr;

console.log("LINK_SEEDED id=%s slug=%s", ins.id, ins.slug);
console.log("PAY_URL=/pay/%s", ins.slug);
