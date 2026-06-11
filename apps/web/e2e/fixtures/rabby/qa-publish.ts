// QA money flow — vendor publishes an existing CREATED invoice on-chain via
// real Rabby signing. Screenshots the APP page (not Rabby's). Verifies on-chain.
import { readFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  launchRabby,
  unlockRabby,
  waitForRabbyPopup,
  confirmRabbyPopup,
} from "./rabby-driver.js";

function env(file: string) {
  const o: Record<string, string> = {};
  for (const l of readFileSync(file, "utf8").split(/\r?\n/)) {
    if (!l || l.startsWith("#")) continue;
    const i = l.indexOf("=");
    if (i < 0) continue;
    o[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^"|"$/g, "");
  }
  return o;
}
const local = env(path.resolve(".env.local"));
const BASE = "http://localhost:3000";
const INV = process.env.QA_INVOICE_ID!;
const shots = path.resolve("e2e/.qa-shots");
mkdirSync(shots, { recursive: true });
let n = 0;
const log = (...a: unknown[]) => console.log(`[qa ${++n}]`, ...a);

const admin = createClient(local.SUPABASE_URL, local.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { data: link } = await admin.auth.admin.generateLink({
  type: "magiclink",
  email: "xprtqk@gmail.com",
});
const callback = `${BASE}/auth/callback?token_hash=${link.properties!.hashed_token}&type=magiclink&next=${encodeURIComponent(`/vendor/invoices/${INV}`)}`;

const { context, extId } = await launchRabby({ profileDir: path.resolve("e2e/.rabby-profile") });
const page = await context.newPage();
const snap = async (label: string) => { try { await page.screenshot({ path: path.join(shots, `${label}.png`), fullPage: true }); } catch {} };

await unlockRabby(page).catch(() => {});
await page.goto(callback, { waitUntil: "networkidle", timeout: 45000 });
await page.waitForTimeout(3000); // let server-side on-chain reconcile settle
log("on invoice detail:", page.url());
await snap("01-detail");

async function clickAndConfirm(rx: RegExp, label: string, signTimeout = 45000) {
  const btn = page.locator("button", { hasText: rx }).first();
  if (!(await btn.isVisible({ timeout: 12000 }).catch(() => false))) {
    log(`${label}: button not visible`);
    return false;
  }
  await btn.scrollIntoViewIfNeeded().catch(() => {});
  const known = new Set(context.pages());
  await btn.click();
  log(`clicked ${label}`);
  const pop = await waitForRabbyPopup(context, extId, known, 18000).catch(() => null);
  if (pop) {
    await unlockRabby(pop).catch(() => {});
    await confirmRabbyPopup(pop, { timeoutMs: signTimeout }).catch((e) => log(`${label} confirm:`, e.message));
  } else {
    log(`${label}: no Rabby popup appeared`);
  }
  await page.waitForTimeout(3500);
  return true;
}

await clickAndConfirm(/Connect wallet/i, "connect", 30000);
await snap("02-after-connect");
await clickAndConfirm(/Switch to Arc|Switch network/i, "switch", 30000);
await snap("03-after-switch");
await clickAndConfirm(/Publish invoice on-chain|Publish on-chain|Publish/i, "publish", 60000);
await snap("04-after-publish");

await page.waitForTimeout(3000);
const pageText = (await page.evaluate(() => document.body.innerText).catch(() => "")).replace(/\s+/g, " ");
log("page shows 'Published on-chain':", /Published on-chain/i.test(pageText));

// verify on-chain
const { createPublicClient, http, parseAbi } = await import("viem");
const ARC = { id: 5_042_002, name: "Arc", nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 }, rpcUrls: { default: { http: [local.NEXT_PUBLIC_ARC_TESTNET_RPC_URL || "https://rpc.testnet.arc.network"] } } } as const;
const pub = createPublicClient({ chain: ARC, transport: http() });
const ESC = parseAbi(["function invoices(bytes32) view returns (address vendor, address token, uint256 amount, uint64 dueAt, uint64 acceptedAt, address acceptedBy, bytes32 metadataHash, bytes32 screeningHash, bytes32 splitsHash, uint8 status)"]);
const oc = await pub.readContract({ address: local.NEXT_PUBLIC_INVOICE_ESCROW_ADDRESS as `0x${string}`, abi: ESC, functionName: "invoices", args: [INV as `0x${string}`] }).catch((e) => { log("onchain read err", e.shortMessage || e.message); return null; });
log("ON-CHAIN status:", oc ? Number(oc[9]) : "n/a", "(1=CREATED on-chain) vendor:", oc ? oc[0] : "n/a");
const { data: row } = await admin.from("invoices").select("status, published_tx_hash").eq("id", INV).maybeSingle();
log("DB published_tx_hash:", row?.published_tx_hash ?? "null");
console.log("PUBLISHED_ONCHAIN=" + (oc != null && Number(oc[9]) === 1));
await context.close();
process.exit(0);
