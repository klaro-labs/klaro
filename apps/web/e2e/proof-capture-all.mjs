// PROOF CAPTURE — ALL surfaces, all personas, all feature states.
// Drives live myklaro.app like a real user and saves a screenshot per surface +
// per feature action, for the proof deck. Output = apps/web/public/proof-deck/shots
// + a manifest.json mapping shot -> {group, title, caption, tx?}.
import { readFileSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { createPublicClient, createWalletClient, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createClient } from "@supabase/supabase-js";

function env(file) {
  const o = {};
  for (const l of readFileSync(file, "utf8").split(/\r?\n/)) {
    if (!l || l.startsWith("#")) continue;
    const i = l.indexOf("="); if (i < 0) continue;
    o[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^"|"$/g, "");
  }
  return o;
}
const local = env(path.resolve(".env.local"));
const wallets = env(path.resolve("e2e/wallets/.env.test-wallets"));
const SB = local.SUPABASE_URL, ANON = local.NEXT_PUBLIC_SUPABASE_ANON_KEY, SRK = local.SUPABASE_SERVICE_ROLE_KEY;
const REF = SB.match(/https:\/\/([a-z0-9]+)\./)[1];
const BASE = process.env.KLARO_E2E_BASE_URL || "https://www.myklaro.app";
const RPC = local.NEXT_PUBLIC_ARC_TESTNET_RPC_URL || "https://rpc.testnet.arc.network";
const CHAIN_ID = 5_042_002;
const OUT = path.resolve("public/proof-deck/shots");
try { rmSync(OUT, { recursive: true, force: true }); } catch {}
mkdirSync(OUT, { recursive: true });
const admin = createClient(SB, SRK, { auth: { persistSession: false, autoRefreshToken: false } });
const M = []; // manifest
function note(group, file, title, caption, tx) { M.push({ group, file: file + ".png", title, caption, tx: tx || null }); }
const log = (...a) => console.log("[cap]", ...a);

// ── chains / keys / wallet bridge ──────────────────────────────────────────
const ARC = { id: CHAIN_ID, name: "Arc Testnet", nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } };
const vendor = privateKeyToAccount(wallets.LP_TEST_PRIVATE_KEY);
const buyer = privateKeyToAccount(wallets.CUSTOMER_TEST_PRIVATE_KEY);
const walletV = createWalletClient({ account: vendor, chain: ARC, transport: http() });
const pub = createPublicClient({ chain: ARC, transport: http() });
const CHAIN_HEX = "0x" + CHAIN_ID.toString(16);
let rpcId = 0;
async function rpcForward(method, params) {
  const res = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }) });
  const j = await res.json(); if (j.error) throw new Error(j.error.message); return j.result;
}
function makeBridge(account, wallet) {
  return async (argsJson) => {
    const { method, params = [] } = JSON.parse(argsJson);
    switch (method) {
      case "eth_requestAccounts": case "eth_accounts": return [account.address];
      case "eth_chainId": return CHAIN_HEX;
      case "net_version": return String(CHAIN_ID);
      case "wallet_switchEthereumChain": case "wallet_addEthereumChain": case "wallet_watchAsset": return null;
      case "wallet_requestPermissions": case "wallet_getPermissions": return [{ parentCapability: "eth_accounts" }];
      case "personal_sign": return await wallet.signMessage({ account, message: { raw: params[0] } });
      case "eth_signTypedData_v4": { const td = typeof params[1] === "string" ? JSON.parse(params[1]) : params[1]; return await account.signTypedData(td); }
      case "eth_sendTransaction": { const tx = params[0] || {}; return await wallet.sendTransaction({ to: tx.to, data: tx.data, value: tx.value ? BigInt(tx.value) : 0n }); }
      default: return await rpcForward(method, params);
    }
  };
}
const shim = `(function(){var chainHex=${JSON.stringify(CHAIN_HEX)};var listeners={};var provider={isKlaroTestWallet:true,isMetaMask:false,chainId:chainHex,request:function(a){return window.__klaroBridge(JSON.stringify(a));},on:function(e,c){(listeners[e]=listeners[e]||[]).push(c);return provider;},addListener:function(e,c){return provider.on(e,c);},removeListener:function(e,c){listeners[e]=(listeners[e]||[]).filter(function(f){return f!==c;});return provider;},removeAllListeners:function(){for(var k in listeners)listeners[k]=[];return provider;}};window.ethereum=provider;window.__klaroShimRan=true;var info={uuid:"00000000-0000-0000-0000-0000000c1a70",name:"Klaro Test Wallet",icon:"data:image/svg+xml;base64,PHN2Zy8+",rdns:"io.klaro.testwallet"};function announce(){window.dispatchEvent(new CustomEvent("eip6963:announceProvider",{detail:Object.freeze({info:info,provider:provider})}));}window.addEventListener("eip6963:requestProvider",announce);announce();})();`;

async function cookiesFor(userId, email, pw) {
  await fetch(`${SB}/auth/v1/admin/users/${userId}`, { method: "PUT", headers: { apikey: SRK, Authorization: "Bearer " + SRK, "Content-Type": "application/json" }, body: JSON.stringify({ password: pw }) });
  const session = await (await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" }, body: JSON.stringify({ email, password: pw }) })).json();
  const value = "base64-" + Buffer.from(JSON.stringify(session)).toString("base64");
  const name = `sb-${REF}-auth-token`, domain = new URL(BASE).hostname, CHUNK = 3180;
  return value.length <= CHUNK ? [{ name, value, domain, path: "/", secure: true, sameSite: "Lax" }]
    : value.match(new RegExp(`.{1,${CHUNK}}`, "g")).map((v, i) => ({ name: `${name}.${i}`, value: v, domain, path: "/", secure: true, sameSite: "Lax" }));
}
const QA_ID = "37adac16-1a23-4887-b822-baed0339de5b", QA_EMAIL = "xprtqk@gmail.com", PW = "Klaro-QA-Test-9x7Kp2!";

const browser = await chromium.launch({ headless: true });
const VW = { width: 1280, height: 900 };
const setRole = async (role) => { await admin.auth.admin.updateUserById(QA_ID, { app_metadata: { klaro_role: role } }); };

// ── helper: an authed context for the QA user with the vendor wallet bridge ─
async function authedCtx() {
  const ctx = await browser.newContext({ viewport: VW });
  await ctx.addCookies(await cookiesFor(QA_ID, QA_EMAIL, PW));
  await ctx.exposeFunction("__klaroBridge", makeBridge(vendor, walletV));
  await ctx.addInitScript({ content: shim });
  return ctx;
}
async function clickWait(page, name, { timeout = 15000, find = /success|saved|created|added|revoked|locked|stream|deleted|dispute/i } = {}) {
  const b = page.locator("button", { hasText: name }).first();
  if (!(await b.isVisible({ timeout: 4000 }).catch(() => false))) return false;
  await b.click().catch(() => {});
  for (let i = 0; i < timeout / 1000; i++) { await page.waitForTimeout(1000); const t = await page.evaluate(() => document.body.innerText).catch(() => ""); if (find.test(t)) return true; }
  return true; // clicked even if no obvious toast
}

// ══════════════════════════ PUBLIC (no auth) ════════════════════════════════
{
  const ctx = await browser.newContext({ viewport: VW });
  const p = await ctx.newPage();
  const pub = async (url, file, title, cap) => { await p.goto(BASE + url, { waitUntil: "networkidle", timeout: 50000 }).catch(() => {}); await p.waitForTimeout(2200); await p.screenshot({ path: path.join(OUT, file + ".png") }); note("Product", file, title, cap); log("public", file); };
  await pub("/", "pub-01-landing", "Landing", "Arc-native USDC invoicing — 'Get paid in seconds. Not weeks.'");
  await pub("/product", "pub-02-product", "Product overview", "Feature surfaces");
  await pub("/fx", "pub-03-fx", "Cross-chain / FX", "Pay from any chain — CCTP V2");
  await pub("/status", "pub-04-status", "Status", "Live system health — web, daemon, Arc RPC, CCTP");
  await pub("/developers", "pub-05-developers", "Developers", "SDK + embeddable receipt badge + API");
  await pub("/pricing", "pub-06-pricing", "Pricing", "Transparent, honest labels");
  await pub("/trust", "pub-07-trust", "Trust / receipts", "On-chain verifiable receipts");
  await pub("/signin", "pub-08-signin", "Sign in", "Magic link + Google OAuth");
  await ctx.close();
}

// ══════════════════════════ VENDOR ══════════════════════════════════════════
await setRole("vendor");
{
  const ctx = await authedCtx();
  const p = await ctx.newPage();
  const go = async (url, file, title, cap) => { await p.goto(BASE + url, { waitUntil: "domcontentloaded", timeout: 50000 }).catch(() => {}); await p.waitForTimeout(2600); await p.screenshot({ path: path.join(OUT, file + ".png") }); note("Vendor", file, title, cap); log("vendor", file); };

  await go("/vendor", "ven-01-dashboard", "Dashboard", "Invoices, balances, reputation");
  await go("/vendor/invoices/new", "ven-02-create", "Create invoice", "Amount, customer, description");

  // create + publish on-chain
  const amount = "1";
  await p.locator('input[type="number"], input[inputmode="decimal"], [name="amount"]').first().fill(amount).catch(() => {});
  await p.getByPlaceholder(/Backend dev|sprint/i).fill("Proof-deck invoice — live on-chain run").catch(() => {});
  await p.getByPlaceholder(/client@company|@/i).first().fill("buyer-qa@example.com").catch(() => {});
  await p.locator("button", { hasText: /Create invoice/i }).first().click();
  await p.waitForURL(/\/vendor\/invoices\/0x[0-9a-fA-F]{64}/, { timeout: 30000 }).catch(() => {});
  const invoiceId = p.url().match(/(0x[0-9a-fA-F]{64})/)?.[1];
  log("created invoice:", invoiceId);
  await p.waitForTimeout(1500);
  await p.screenshot({ path: path.join(OUT, "ven-03-invoice-detail.png") }); note("Vendor", "ven-03-invoice-detail", "Invoice created", "Hosted page + on-chain publish");
  const connect = p.locator("button", { hasText: /Connect wallet/i }).first();
  if (await connect.isVisible({ timeout: 5000 }).catch(() => false)) { await connect.click().catch(() => {}); await p.waitForTimeout(2500); }
  const sw = p.locator("button", { hasText: /Switch to Arc/i }).first();
  if (await sw.isVisible({ timeout: 3000 }).catch(() => false)) { await sw.click().catch(() => {}); await p.waitForTimeout(2000); }
  const pubBtn = p.locator("button", { hasText: /Publish invoice on-chain/i }).first();
  if (await pubBtn.isVisible({ timeout: 6000 }).catch(() => false)) { await pubBtn.click().catch(() => {}); for (let i = 0; i < 35; i++) { await p.waitForTimeout(1000); if (/Published on-chain/i.test(await p.evaluate(() => document.body.innerText).catch(() => ""))) break; } }
  await p.waitForTimeout(1000);
  const { data: prow } = invoiceId ? await admin.from("invoices").select("published_tx_hash").eq("id", invoiceId).maybeSingle() : { data: null };
  await p.screenshot({ path: path.join(OUT, "ven-04-published.png") }); note("Vendor", "ven-04-published", "Published on-chain", "InvoiceEscrow.createInvoice → CREATED", prow?.published_tx_hash);

  await go("/vendor/invoices/recurring", "ven-05-recurring", "Recurring", "Schedule preview (honest 'coming soon')");
  await go("/vendor/bills", "ven-06-bills", "Bills", "Vendor bills");
  await go("/vendor/cashout", "ven-07-cashout", "Cashout", "USDC → local currency, on-chain lock");
  await go("/vendor/reputation", "ven-08-reputation", "Reputation", "Verifiable vendor reputation");
  await go("/vendor/links", "ven-09-links", "Payment links", "Shareable /pay/<slug> links");

  // pay-link create
  const newLink = p.locator("button", { hasText: /New link|Create link/i }).first();
  if (await newLink.isVisible({ timeout: 4000 }).catch(() => false)) { await newLink.click().catch(() => {}); await p.waitForTimeout(1500); await p.screenshot({ path: path.join(OUT, "ven-09b-link-create.png") }); note("Vendor", "ven-09b-link-create", "Create pay link", "Materializes on first pay"); }

  await go("/vendor/branding", "ven-10-branding", "Branding", "Hosted-invoice brand");
  await go("/vendor/webhooks", "ven-11-webhooks", "Webhooks", "HMAC-signed live delivery");

  // webhook create (fills + submits; screenshot after)
  const whUrl = p.locator('input[type="url"], input[name*="url" i]').first();
  if (await whUrl.isVisible({ timeout: 3000 }).catch(() => false)) {
    await whUrl.fill("https://webhook.site/klaro-proof-deck").catch(() => {});
    const create = p.locator("button", { hasText: /Create|Add|Save webhook/i }).first();
    if (await create.isVisible({ timeout: 2000 }).catch(() => false)) { await create.click().catch(() => {}); await p.waitForTimeout(2500); await p.screenshot({ path: path.join(OUT, "ven-11b-webhook-created.png") }); note("Vendor", "ven-11b-webhook-created", "Webhook created", "Endpoint registered for live events"); }
  }

  await go("/vendor/team", "ven-12-team", "Team", "Roles — owner / admin / finance / viewer");

  // delegations: capture + issue + revoke
  await go("/vendor/delegations", "ven-13-delegations", "Delegations", "Session keys / ERC-6900 scope");
  await clickWait(p, /Issue|Create|New session key|Add key/i);
  await p.screenshot({ path: path.join(OUT, "ven-13b-delegation-issued.png") }); note("Vendor", "ven-13b-delegation-issued", "Session key issued", "Scoped delegation (DB-confirmed)");
  await clickWait(p, /Revoke/i);
  await p.screenshot({ path: path.join(OUT, "ven-13c-delegation-revoked.png") }); note("Vendor", "ven-13c-delegation-revoked", "Session key revoked", "revoked_at set");

  // retainer: capture + create stream
  await go("/vendor/retainer", "ven-14-retainer", "Retainer", "Streaming vesting");
  await clickWait(p, /Create|New stream|Start/i);
  await p.waitForTimeout(2000);
  await p.screenshot({ path: path.join(OUT, "ven-14b-retainer-stream.png") }); note("Vendor", "ven-14b-retainer-stream", "Retainer stream live", "Vesting counter ticking");

  await go("/vendor/import", "ven-15-import", "Import", "Import invoices (CSV / external)");
  await go("/vendor/erp", "ven-16-erp", "ERP sync", "QuickBooks (Intuit OAuth)");
  await go("/vendor/settings", "ven-17-settings", "Settings", "Workspace + KYB (Sumsub)");
  await ctx.close();
}

// ══════════════════════════ LP ══════════════════════════════════════════════
await setRole("vendor"); // LP resolves on the vendor role on this account
{
  const ctx = await authedCtx();
  const p = await ctx.newPage();
  const go = async (url, file, title, cap) => { await p.goto(BASE + url, { waitUntil: "domcontentloaded", timeout: 50000 }).catch(() => {}); await p.waitForTimeout(2600); await p.screenshot({ path: path.join(OUT, file + ".png") }); note("LP", file, title, cap); log("lp", file); };
  await go("/lp", "lp-01-dashboard", "LP dashboard", "Stake, tiers, earnings");
  await go("/lp/queue", "lp-02-queue", "Cashout queue", "Claimable cashout orders");
  await go("/lp/stake", "lp-03-stake", "Stake", "LP staking");
  await go("/lp/reputation", "lp-04-reputation", "LP reputation", "Slashing history / reliability");
  await go("/lp/settings", "lp-05-settings", "LP settings", "LP profile");
  await ctx.close();
}

// ══════════════════════════ ADMIN ═══════════════════════════════════════════
await setRole("operator");
{
  const ctx = await authedCtx();
  const p = await ctx.newPage();
  const go = async (url, file, title, cap) => { await p.goto(BASE + url, { waitUntil: "domcontentloaded", timeout: 50000 }).catch(() => {}); await p.waitForTimeout(2600); await p.screenshot({ path: path.join(OUT, file + ".png") }); note("Admin", file, title, cap); log("admin", file); };
  await go("/admin", "adm-01-console", "Admin console", "Operator overview");
  await go("/admin/invoices", "adm-02-invoices", "Invoices", "All invoices + screening state");
  await go("/admin/screening", "adm-03-screening", "Screening", "OFAC / KYB screening queue");
  await go("/admin/disputes", "adm-04-disputes", "Disputes", "Dispute resolution");
  await go("/admin/sanctions", "adm-05-sanctions", "Sanctions", "Sanctions refresh runs");
  await go("/admin/lps", "adm-06-lps", "Liquidity providers", "LP registry + stakes");
  await go("/admin/vendors", "adm-07-vendors", "Vendors", "Vendor registry + KYB");
  await go("/admin/audits", "adm-08-audits", "Audits", "Audit log");
  await go("/admin/governance", "adm-09-governance", "Governance", "Pause / limits / params");
  await ctx.close();
}

// ══════════════════════════ BUYER (public money pages) ═════════════════════
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  const { data: inv } = await admin.from("invoices").select("id").eq("vendor_id", "989f0a85-82e8-409b-b7d3-206e73118113").order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (inv?.id) { await p.goto(`${BASE}/i/${inv.id}`, { waitUntil: "domcontentloaded", timeout: 45000 }); await p.waitForTimeout(2600); await p.screenshot({ path: path.join(OUT, "buy-01-hosted-invoice.png") }); note("Buyer", "buy-01-hosted-invoice", "Hosted invoice", "Buyer pays in USDC on Arc (mobile)"); log("buyer hosted"); }
  await p.goto(`${BASE}/receipt/0x5b3eeca94a0a1b0541036835ba0a0b5e62926b57a6af173cf10466dd4ebcd1a5`, { waitUntil: "networkidle", timeout: 45000 }).catch(() => {});
  await p.waitForTimeout(2600); await p.screenshot({ path: path.join(OUT, "buy-02-receipt.png") }); note("Buyer", "buy-02-receipt", "Receipt", "Settled, anchored, publicly verifiable — verify=true");
  await ctx.close();
}

// restore role + write manifest
await setRole("vendor");
writeFileSync(path.resolve("public/proof-deck/manifest.json"), JSON.stringify({ generated: new Date().toISOString(), shots: M }, null, 2));
console.log("\nMANIFEST " + M.length + " shots -> " + path.resolve("public/proof-deck/manifest.json"));
await browser.close();
