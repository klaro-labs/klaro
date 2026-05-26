#!/usr/bin/env node
// Capture the production landing page (and brand-kit) for visual comparison
// against the reference HTML screenshots. Writes paired screenshots so the
// design-reference docs can later embed before/after thumbnails.

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SHOTS = resolve(__dirname, "screenshots", "production");
mkdirSync(SHOTS, { recursive: true });

const BASE = process.env.PROD_BASE ?? "http://localhost:3000";

const PAGES = [
  { name: "landing", url: "/", viewport: { width: 1440, height: 900 } },
  { name: "landing-mobile", url: "/", viewport: { width: 390, height: 844 } },
  { name: "brandkit", url: "/brand-kit", viewport: { width: 1440, height: 900 } },
];

const browser = await chromium.launch({ headless: true });
for (const p of PAGES) {
  const ctx = await browser.newContext({ viewport: p.viewport });
  // Pre-seed cookie consent + first-visit toasts so captures don't show the
  // banner sitting on top of content. Real users only see it once.
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem(
        "klaro.cookie.consent.v1",
        JSON.stringify({ d: "essential-only", at: Date.now() }),
      );
    } catch {}
  });
  const page = await ctx.newPage();
  try {
    await page.goto(`${BASE}${p.url}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForTimeout(2500);
  } catch (e) {
    console.error(`[${p.name}] navigation failed:`, e.message);
    await ctx.close();
    continue;
  }
  await page.screenshot({ path: resolve(SHOTS, `${p.name}-fullpage.png`), fullPage: true });
  const totalH = await page.evaluate(() => document.documentElement.scrollHeight);
  const vp = p.viewport.height;
  let i = 0;
  for (let y = 0; y < totalH; y += vp - 80) {
    await page.evaluate((y) => window.scrollTo({ top: y, behavior: "instant" }), y);
    await page.waitForTimeout(350);
    await page.screenshot({ path: resolve(SHOTS, `${p.name}-viewport-${String(i).padStart(2, "0")}.png`) });
    i++;
    if (i > 40) break;
  }
  console.log(`[${p.name}] ${i} viewport shots + fullpage`);
  await ctx.close();
}
await browser.close();
