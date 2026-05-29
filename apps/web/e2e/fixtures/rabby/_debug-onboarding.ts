// Throwaway: walk Rabby import flow from #/new-user/guide and map selectors.
import { rmSync, mkdirSync } from "node:fs";
import path from "node:path";
import { launchRabby } from "./rabby-driver.js";

const profile = path.resolve("e2e/.rabby-profile");
try { rmSync(profile, { recursive: true, force: true }); } catch {}
const shots = path.resolve("e2e/.rabby-debug");
try { rmSync(shots, { recursive: true, force: true }); } catch {}
mkdirSync(shots, { recursive: true });

const { context, extId } = await launchRabby({ profileDir: profile });
console.log("EXT_ID", extId);

async function dump(page, label) {
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(shots, `${label}.png`) }).catch(() => {});
  const buttons = await page.$$eval("button", (els) => els.map((e) => (e.textContent || "").trim()).filter(Boolean)).catch(() => []);
  const inputs = await page.$$eval("input,textarea", (els) => els.map((e) => ({ tag: e.tagName, type: e.getAttribute("type"), id: e.id, ph: e.getAttribute("placeholder") }))).catch(() => []);
  const cards = await page.$$eval("*", (els) => els.filter((e) => /private key|seed phrase|mnemonic|keystore|hardware/i.test(e.childElementCount === 0 ? (e.textContent || "") : "")).map((e) => (e.textContent || "").trim()).filter((t) => t.length < 40).slice(0, 15)).catch(() => []);
  console.log(`\n=== ${label} | url=…${page.url().slice(-40)} ===`);
  console.log("buttons:", JSON.stringify(buttons));
  console.log("inputs:", JSON.stringify(inputs));
  console.log("import-option texts:", JSON.stringify([...new Set(cards)]));
}

const page = await context.newPage();
await page.goto(`chrome-extension://${extId}/index.html#/new-user/guide`);
await dump(page, "s0-guide");

await page.locator("button", { hasText: /I already have an address/i }).first().click().catch((e) => console.log("click1 err", e.message));
await dump(page, "s1-have-address");

// look for a Private Key option (text node click)
const pk = page.locator("text=/Private Key/i").first();
if (await pk.isVisible({ timeout: 2500 }).catch(() => false)) {
  await pk.click().catch((e) => console.log("pk click err", e.message));
  await dump(page, "s2-private-key");
} else {
  console.log("no 'Private Key' text visible on s1");
}

await context.close();
console.log("\nshots in", shots);
process.exit(0);
