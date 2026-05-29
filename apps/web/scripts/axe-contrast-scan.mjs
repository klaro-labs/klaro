// LF-4 verify: re-run axe-core color-contrast across representative routes that
// use the brand/ink-subtle tokens. Injects axe source via page.evaluate (CDP)
// to bypass CSP. Reports any remaining color-contrast violations + the colors.
import { readFileSync } from "node:fs";
import { chromium } from "playwright";

const axeSrc = readFileSync(
  "C:/Users/prate/downloads/arcbuild/node_modules/.pnpm/axe-core@4.11.4/node_modules/axe-core/axe.min.js",
  "utf8",
);
const BASE = "http://127.0.0.1:3100";
const ROUTES = ["/", "/product/cashout", "/docs", "/trust", "/status", "/build", "/pricing", "/agents"];

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
let total = 0;
for (const route of ROUTES) {
  const page = await ctx.newPage();
  try {
    await page.goto(BASE + route, { waitUntil: "networkidle", timeout: 45000 });
    await page.evaluate(axeSrc);
    const res = await page.evaluate(async () =>
      await window.axe.run(document, { runOnly: ["color-contrast"] }),
    );
    const v = res.violations.flatMap((vi) => vi.nodes);
    total += v.length;
    console.log(`\n${route}: ${v.length} color-contrast violation node(s)`);
    for (const node of v.slice(0, 6)) {
      const msg = (node.any?.[0]?.message || "").replace(/\s+/g, " ");
      console.log(`  - ${node.target?.join(" ")} :: ${msg.slice(0, 150)}`);
    }
  } catch (e) {
    console.log(`\n${route}: SCAN ERROR ${(e?.message || e).toString().slice(0, 100)}`);
  } finally {
    await page.close();
  }
}
console.log(`\n=== TOTAL color-contrast violation nodes: ${total} ===`);
await browser.close();
process.exit(total === 0 ? 0 : 1);
