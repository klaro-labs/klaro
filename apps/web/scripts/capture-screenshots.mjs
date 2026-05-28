/**
 * One-shot screenshot capture for the 16 marketing pages at 2 viewports.
 * Run after `pnpm start` is listening on :3000.
 *
 * Usage: node scripts/capture-screenshots.mjs
 * Outputs: apps/web/mockups/{desktop|mobile}-NN-{slug}.png
 */
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const BASE = process.env.KLARO_BASE_URL ?? "http://localhost:3000";
const OUT = path.resolve(process.cwd(), "mockups");

const PAGES = [
  { slug: "landing", path: "/" },
  { slug: "product", path: "/product" },
  { slug: "product-invoicing", path: "/product/invoicing" },
  { slug: "product-receipts", path: "/product/receipts" },
  { slug: "product-cashout", path: "/product/cashout" },
  { slug: "product-stablefx", path: "/product/stablefx" },
  { slug: "product-reputation", path: "/product/reputation" },
  { slug: "pricing", path: "/pricing" },
  { slug: "build", path: "/build" },
  { slug: "resources", path: "/resources" },
  { slug: "resources-flows", path: "/resources/flows" },
  { slug: "brand-kit", path: "/brand-kit" },
  { slug: "company", path: "/company" },
  { slug: "company-contact", path: "/company/contact" },
  { slug: "signin", path: "/signin" },
  { slug: "onboarding", path: "/onboarding" },
];

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
];

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });

  const findings = [];

  for (const viewport of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: viewport.deviceScaleFactor ?? 1,
      isMobile: viewport.isMobile ?? false,
      hasTouch: viewport.hasTouch ?? false,
      userAgent: viewport.isMobile
        ? "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
        : undefined,
      reducedMotion: "reduce",
    });

    // Pre-seed cookie consent so the banner doesn't overlay every screenshot.
    // Matches components/klaro/CookieConsent.tsx STORAGE_KEY + shape.
    await context.addInitScript(() => {
      try {
        localStorage.setItem(
          "klaro.cookie.consent.v1",
          JSON.stringify({ d: "essential-only", at: Date.now() }),
        );
      } catch {}
    });

    const page = await context.newPage();
    page.on("pageerror", (err) => {
      findings.push({ viewport: viewport.name, slug: "?", error: err.message });
    });

    for (let i = 0; i < PAGES.length; i++) {
      const { slug, path: p } = PAGES[i];
      const url = `${BASE}${p}`;
      const file = path.join(OUT, `${viewport.name}-${String(i + 1).padStart(2, "0")}-${slug}.png`);
      const consoleErrors = [];
      const consoleHandler = (msg) => {
        if (msg.type() === "error") consoleErrors.push(msg.text());
      };
      page.on("console", consoleHandler);
      try {
        const t0 = Date.now();
        await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
        // Suppress prefers-reduced-motion already; small settle for layout.
        await page.waitForTimeout(400);
        await page.screenshot({ path: file, fullPage: true });
        const took = Date.now() - t0;
        console.log(`OK  ${viewport.name.padEnd(7)} ${p.padEnd(28)} ${took}ms${consoleErrors.length ? ` errors=${consoleErrors.length}` : ""}`);
        if (consoleErrors.length) {
          findings.push({ viewport: viewport.name, slug, console: consoleErrors });
        }
      } catch (err) {
        console.log(`ERR ${viewport.name.padEnd(7)} ${p.padEnd(28)} ${err.message}`);
        findings.push({ viewport: viewport.name, slug, fail: err.message });
      } finally {
        page.off("console", consoleHandler);
      }
    }

    await context.close();
  }

  await browser.close();

  if (findings.length) {
    console.log("\n=== findings ===");
    for (const f of findings) console.log(JSON.stringify(f));
  } else {
    console.log("\n=== no console errors, no page errors ===");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
