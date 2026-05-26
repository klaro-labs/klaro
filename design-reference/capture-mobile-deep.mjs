#!/usr/bin/env node
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SHOTS = resolve(__dirname, "screenshots", "mobile-deep");
mkdirSync(SHOTS, { recursive: true });

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.goto("file:///C:/Users/prate/Downloads/klaro%20ui/Klaro%20Mobile%20offline.html", { waitUntil: "load" });

// Wait for the bundler thumbnail to vanish + at least 3000px of real content.
let height = 0;
for (let i = 0; i < 60; i++) {
  height = await page.evaluate(() => document.documentElement.scrollHeight);
  const thumbVisible = await page.evaluate(() => {
    const t = document.getElementById("__bundler_thumbnail");
    if (!t) return false;
    return getComputedStyle(t).display !== "none";
  });
  if (height > 3000 && !thumbVisible) break;
  await page.waitForTimeout(1000);
}
console.log(`Ready: scrollHeight=${height}px`);

const step = 700;
let i = 0;
for (let y = 0; y < height + 200; y += step) {
  await page.evaluate((y) => window.scrollTo({ top: y, behavior: "instant" }), y);
  await page.waitForTimeout(450);
  await page.screenshot({ path: resolve(SHOTS, `m-${String(i).padStart(2, "0")}-y${y}.png`), fullPage: false });
  i++;
  if (i > 80) break;
}
console.log(`mobile-deep: ${i} viewport shots`);

// Also take a real full-page capture now that everything's loaded.
await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
await page.waitForTimeout(500);
await page.screenshot({ path: resolve(SHOTS, `mobile-fullpage-deep.png`), fullPage: true });
console.log("mobile-deep: + fullpage");
await browser.close();
