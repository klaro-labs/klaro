// P-B Cashout vendor-leg UI E2E (injected EIP-1193 provider, same proven
// pattern as pb-link/pb-pay — real key, real signatures, real on-chain txs,
// driven through the REAL app UI). Verifies LF-3 from the vendor's seat:
//   VENDOR (LP_TEST): magic-link login → /vendor/cashout → fill amount →
//     Connect → "Lock USDC for cashout" (signs approve + requestAndLock via the
//     injected provider; recordCashoutRequestedAction verifies the on-chain
//     LOCKED order + writes the row) → /vendor/cashout/<cashoutId>.
// Asserts the CashoutOrderProcessor order is LOCKED on-chain with vendor +
// amount matching, and the DB row exists at status LOCKED. The daemon's
// claim→proof→release legs are proven separately by qa-cashout-daemon-legs.
//
// Run from apps/web (dev server on :3100):
//   node ../../node_modules/.pnpm/tsx@4.22.3/node_modules/tsx/dist/cli.mjs e2e/fixtures/rabby/pb-cashout.ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { chromium, type Browser, type BrowserContext } from "playwright";
import { createClient } from "@supabase/supabase-js";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  type PrivateKeyAccount,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

function env(file: string) {
  const o: Record<string, string> = {};
  for (const l of readFileSync(file, "utf8").split(/\r?\n/)) {
    if (!l || l.startsWith("#")) continue;
    const i = l.indexOf("=");
    if (i < 0) continue;
    o[l.slice(0, i).trim()] = l
      .slice(i + 1)
      .trim()
      .replace(/^"|"$/g, "");
  }
  return o;
}
const local = env(path.resolve(".env.local"));
const wallets = env(path.resolve("e2e/wallets/.env.test-wallets"));
const BASE = "http://127.0.0.1:3100";
const RPC = local.NEXT_PUBLIC_ARC_TESTNET_RPC_URL || "https://rpc.testnet.arc.network";
const CHAIN_ID = 5_042_002;
const CHAIN_HEX = "0x" + CHAIN_ID.toString(16);
const COP = local.NEXT_PUBLIC_CASHOUT_ORDER_PROCESSOR_ADDRESS as `0x${string}`;
let n = 0;
const log = (...a: unknown[]) => console.log(`[cashout ${++n}]`, ...a);

const admin = createClient(local.SUPABASE_URL, local.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const ARC = {
  id: CHAIN_ID,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
};
const pub = createPublicClient({ chain: ARC, transport: http() });
const COP_ABI = parseAbi([
  "function getOrder(bytes32 cashoutId) view returns ((address vendor, address token, uint256 usdcAmount, uint256 inrAmount, bytes32 lpId, address lpWallet, bytes32 corridor, uint64 requestedAt, uint64 quoteExpiresAt, bytes32 quoteHash, bytes32 proofHash, uint8 status))",
]);

const shimContent = `
(function(){
  var chainHex = ${JSON.stringify(CHAIN_HEX)};
  var listeners = {};
  var provider = { isKlaroTestWallet:true, isMetaMask:false, chainId:chainHex,
    request:function(a){ return window.__klaroBridge(JSON.stringify(a)); },
    on:function(e,c){ (listeners[e]=listeners[e]||[]).push(c); return provider; },
    addListener:function(e,c){ return provider.on(e,c); },
    removeListener:function(e,c){ listeners[e]=(listeners[e]||[]).filter(function(f){return f!==c;}); return provider; },
    removeAllListeners:function(){ for (var k in listeners) listeners[k]=[]; return provider; } };
  window.ethereum = provider;
  var info = { uuid:"00000000-0000-0000-0000-0000000c1a70", name:"Klaro Test Wallet", icon:"data:image/svg+xml;base64,PHN2Zy8+", rdns:"io.klaro.testwallet" };
  function announce(){ window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail: Object.freeze({ info:info, provider:provider }) })); }
  window.addEventListener("eip6963:requestProvider", announce);
  announce();
})();`;

function makeBridge(account: PrivateKeyAccount, wallet: WalletClient) {
  let rpcId = 0;
  let nextNonce: number | null = null;
  return async function bridge(argsJson: string) {
    const { method, params = [] } = JSON.parse(argsJson);
    log("bridge:", method);
    switch (method) {
      case "eth_requestAccounts":
      case "eth_accounts":
        return [account.address];
      case "eth_chainId":
        return CHAIN_HEX;
      case "net_version":
        return String(CHAIN_ID);
      case "wallet_switchEthereumChain":
      case "wallet_addEthereumChain":
      case "wallet_watchAsset":
        return null;
      case "wallet_requestPermissions":
      case "wallet_getPermissions":
        return [{ parentCapability: "eth_accounts" }];
      case "personal_sign":
        return await account.signMessage({ message: { raw: params[0] } });
      case "eth_sendTransaction": {
        const tx = params[0] || {};
        if (nextNonce === null)
          nextNonce = await pub.getTransactionCount({ address: account.address, blockTag: "pending" });
        const nonce = nextNonce++;
        const hash = await wallet.sendTransaction({
          account,
          chain: ARC,
          to: tx.to,
          data: tx.data,
          value: tx.value ? BigInt(tx.value) : 0n,
          nonce,
          gas: 1_500_000n,
        });
        log("sendTransaction ->", hash, "nonce", nonce);
        return hash;
      }
      default: {
        const res = await fetch(RPC, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }),
        });
        const j = await res.json();
        if (j.error) throw new Error(`${method}: ${j.error.message || JSON.stringify(j.error)}`);
        return j.result;
      }
    }
  };
}

async function injectedContext(browser: Browser, account: PrivateKeyAccount): Promise<BrowserContext> {
  const wallet = createWalletClient({ account, chain: ARC, transport: http() });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.exposeFunction("__klaroBridge", makeBridge(account, wallet));
  await ctx.addInitScript({ content: shimContent });
  return ctx;
}

const browser = await chromium.launch({ headless: true });
const vendor = privateKeyToAccount(wallets.LP_TEST_PRIVATE_KEY as `0x${string}`);
log("vendor (injected):", vendor.address, "| COP:", COP);

const { data: ml, error: mlErr } = await admin.auth.admin.generateLink({
  type: "magiclink",
  email: "xprtqk@gmail.com",
});
if (mlErr || !ml.properties?.hashed_token) {
  console.error("login mint failed", mlErr?.message);
  process.exit(2);
}
const callback = `${BASE}/auth/callback?token_hash=${ml.properties.hashed_token}&type=magiclink&next=${encodeURIComponent("/vendor/cashout")}`;

const vctx = await injectedContext(browser, vendor);
const loginPage = await vctx.newPage();
await loginPage.goto(callback, { waitUntil: "domcontentloaded", timeout: 120000 });
await loginPage.waitForTimeout(2500);
log("login landed:", loginPage.url());
await loginPage.close().catch(() => {});

const vpage = await vctx.newPage();
vpage.on("console", (m) => {
  const t = m.text();
  if (/reject|revert|mismatch|insufficient|error|cashout/i.test(t)) log("vpage:", t.slice(0, 200));
});
vpage.on("pageerror", (e) => log("vpage PAGEERROR:", e.message.slice(0, 180)));
await vpage.goto(`${BASE}/vendor/cashout`, { waitUntil: "domcontentloaded", timeout: 60000 });
await vpage.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
await vpage.waitForTimeout(2000);
log("on /vendor/cashout:", vpage.url());
if (/\/signin/.test(vpage.url())) {
  console.error("session not established (bounced to signin)");
  await browser.close();
  process.exit(2);
}

// Diagnose what the cashout form is showing (locker vs. simulator vs. balance gate).
const formState = await vpage
  .evaluate(() => {
    const txt = document.body.innerText;
    return {
      hasLock: /Lock USDC for cashout/i.test(txt),
      hasConnectPayout: /Connect the payout wallet/i.test(txt),
      exceedsBalance: /exceeds your cashoutable balance/i.test(txt),
      simulate: /Simulate .* cashout/i.test(txt),
    };
  })
  .catch(() => ({}));
log("cashout form state:", JSON.stringify(formState));

// Fill a small amount the vendor can afford on-chain (~2.17 USDC available).
const amtInput = vpage.locator('input[type="number"]').first();
await amtInput.waitFor({ state: "visible", timeout: 20000 }).catch(() => {});
await amtInput.fill("");
await amtInput.fill("0.50");
log("amount value:", await amtInput.inputValue().catch(() => "?"));

// Connect the injected wallet (== payout wallet, so RequestCashoutOnChain unlocks).
const connect = vpage.locator("button", { hasText: /Connect wallet/i }).first();
if (await connect.isVisible({ timeout: 6000 }).catch(() => false)) {
  log("Connect");
  await connect.click().catch(() => {});
}
for (let i = 0; i < 30; i++) {
  await vpage.waitForTimeout(700);
  if (await vpage.getByText(/^disconnect$/i).first().isVisible({ timeout: 400 }).catch(() => false)) {
    log("connected (iter", i + ")");
    break;
  }
  if (i === 5 || i === 12) {
    const cb = vpage.locator("button", { hasText: /^Connect wallet$/i }).first();
    if (await cb.isVisible({ timeout: 300 }).catch(() => false)) await cb.click().catch(() => {});
  }
}
// Clean re-mount to restore a working signer (login redirect churns wagmi state).
await vpage.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
await vpage.waitForTimeout(2500);
await vpage.locator('input[type="number"]').first().fill("0.50").catch(() => {});
for (let i = 0; i < 20; i++) {
  await vpage.waitForTimeout(700);
  if (await vpage.getByText(/^disconnect$/i).first().isVisible({ timeout: 400 }).catch(() => false)) {
    log("reconnected after reload (iter", i + ")");
    break;
  }
  if (i === 4) {
    const cb = vpage.locator("button", { hasText: /^Connect wallet$/i }).first();
    if (await cb.isVisible({ timeout: 300 }).catch(() => false)) await cb.click().catch(() => {});
  }
}
await vpage.waitForTimeout(1200);

const lockBtn = vpage.locator("button", { hasText: /Lock USDC for cashout/i }).first();
log("lock button visible:", await lockBtn.isVisible({ timeout: 4000 }).catch(() => false));
for (let attempt = 0; attempt < 8; attempt++) {
  const state = await vpage
    .evaluate(() => {
      const btn =
        Array.from(document.querySelectorAll("button")).find((b) =>
          /Lock USDC|Approve USDC|Waiting for lock|Preparing|Recording/i.test(b.textContent || ""),
        )?.textContent ?? "";
      const err = document.querySelector(".bg-rose-50")?.textContent ?? "";
      return { btn: btn.replace(/\s+/g, " ").trim(), err: err.replace(/\s+/g, " ").slice(0, 140) };
    })
    .catch(() => ({ btn: "?", err: "" }));
  log(`attempt ${attempt}: btn="${state.btn}" err="${state.err}"`);
  await lockBtn.click({ timeout: 2500, force: true }).catch(() => {});
  try {
    await vpage.waitForURL(/\/vendor\/cashout\/0x[0-9a-fA-F]{64}/, { timeout: 12000 });
    break;
  } catch {
    /* not yet */
  }
  await vpage.waitForTimeout(1500);
}

const cashoutId = vpage.url().match(/\/vendor\/cashout\/(0x[0-9a-fA-F]{64})/)?.[1] ?? null;
log("after lock, url:", vpage.url(), "cashoutId:", cashoutId);
if (!cashoutId) {
  const errBox = await vpage.locator(".bg-rose-50").first().innerText({ timeout: 1500 }).catch(() => "");
  log("lock FAILED. errorBox:", errBox || "(none)");
  await browser.close();
  process.exit(3);
}
await vctx.close();

// On-chain verification: the order must be LOCKED with this vendor + amount.
const order = await pub
  .readContract({ address: COP, abi: COP_ABI, functionName: "getOrder", args: [cashoutId as `0x${string}`] })
  .catch(() => null);
const STATUS = ["NONE", "REQUESTED", "LOCKED", "CLAIMED", "PROOF_SUBMITTED", "CONFIRMED", "RELEASED"];
const onChainLocked =
  !!order &&
  Number(order.status) === 2 &&
  order.vendor.toLowerCase() === vendor.address.toLowerCase() &&
  order.usdcAmount === 500_000n;
log(
  "on-chain order:",
  order ? `${STATUS[Number(order.status)]} vendor=${order.vendor} usdc=${order.usdcAmount}` : "(none)",
);

// DB mirror verification.
const { data: dbRow } = await admin
  .from("cashout_orders")
  .select("id,status,vendor_wallet,usdc_amount")
  .eq("id", cashoutId)
  .maybeSingle();
log("db row:", dbRow ? `status=${dbRow.status} usdc=${dbRow.usdc_amount}` : "(none)");
const dbOk = !!dbRow && dbRow.status === "LOCKED";

await browser.close();
const ok = onChainLocked && dbOk;
console.log("CASHOUT_ID=" + cashoutId);
console.log("ON_CHAIN_LOCKED=" + onChainLocked);
console.log("DB_LOCKED=" + dbOk);
console.log("CASHOUT_UI_E2E_OK=" + ok);
process.exit(ok ? 0 : 1);
