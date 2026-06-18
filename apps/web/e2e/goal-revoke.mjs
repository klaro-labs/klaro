// Drive delegations revoke (plain server action) + verify DB revoked_at.
import { readFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
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
const SB = local.SUPABASE_URL, ANON = local.NEXT_PUBLIC_SUPABASE_ANON_KEY, SRK = local.SUPABASE_SERVICE_ROLE_KEY;
const REF = SB.match(/https:\/\/([a-z0-9]+)\./)[1];
const BASE = process.env.KLARO_E2E_BASE_URL || "https://www.myklaro.app";
const admin = createClient(SB, SRK, { auth: { persistSession: false } });

await fetch(`${SB}/auth/v1/admin/users/37adac16-1a23-4887-b822-baed0339de5b`, { method: "PUT", headers: { apikey: SRK, Authorization: "Bearer " + SRK, "Content-Type": "application/json" }, body: JSON.stringify({ password: "Klaro-QA-Test-9x7Kp2!" }) });
const session = await (await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" }, body: JSON.stringify({ email: "xprtqk@gmail.com", password: "Klaro-QA-Test-9x7Kp2!" }) })).json();
const value = "base64-" + Buffer.from(JSON.stringify(session)).toString("base64");
const name = `sb-${REF}-auth-token`, domain = new URL(BASE).hostname, CHUNK = 3180;
const cookies = value.length <= CHUNK ? [{ name, value, domain, path: "/", secure: true, sameSite: "Lax" }]
  : value.match(new RegExp(`.{1,${CHUNK}}`, "g")).map((v, i) => ({ name: `${name}.${i}`, value: v, domain, path: "/", secure: true, sameSite: "Lax" }));

const before = (await admin.from("session_keys").select("id", { count: "exact", head: true }).eq("vendor_id", "989f0a85-82e8-409b-b7d3-206e73118113").is("revoked_at", null)).count ?? 0;
console.log("active keys before:", before);

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.addCookies(cookies);
const page = await ctx.newPage();
await page.goto(BASE + "/vendor/delegations", { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForTimeout(2000);
const revBtns = page.locator("button", { hasText: /revoke/i });
const n = await revBtns.count();
console.log("revoke buttons visible:", n);
if (n > 0) { await revBtns.first().click().catch((e) => console.log("click err", e.message)); await page.waitForTimeout(3500); }
await browser.close();

const after = (await admin.from("session_keys").select("id", { count: "exact", head: true }).eq("vendor_id", "989f0a85-82e8-409b-b7d3-206e73118113").is("revoked_at", null)).count ?? before;
const revoked = (await admin.from("session_keys").select("id", { count: "exact", head: true }).eq("vendor_id", "989f0a85-82e8-409b-b7d3-206e73118113").not("revoked_at", "is", null)).count ?? 0;
console.log(`active keys after: ${after} | revoked keys: ${revoked} | REVOKE ${after < before ? "PASS" : "CHECK"}`);
