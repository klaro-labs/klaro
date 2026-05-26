#!/usr/bin/env node
// Open each of the 3 reference HTMLs via http://localhost:9876, wait for the
// offline bundle to unpack, then capture scroll-positioned screenshots so we
// can compare the references vs the production landing later.

import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SHOTS = resolve(__dirname, "screenshots");
mkdirSync(SHOTS, { recursive: true });

const REF_PORT = 9876;
const BASE = `http://127.0.0.1:${REF_PORT}`;

const FILES = [
  { name: "landing",   url: "/Klaro%20Landing%20offline.html",   viewport: { width: 1440, height: 900 } },
  { name: "brandkit",  url: "/Klaro%20Brand%20Kit%20offline.html", viewport: { width: 1440, height: 900 } },
  { name: "mobile",    url: "/Klaro%20Mobile%20offline.html",     viewport: { width: 1440, height: 900 } },
  // Mobile reference is a desktop showcase — sized 1440 to see all phone frames at once
];

async function waitForUnpack(page) {
  // Bundler hides #__bundler_thumbnail when render finishes — wait for it to
  // be gone OR display:none. Bound the wait so test never hangs forever.
  for (let i = 0; i < 60; i++) {
    const state = await page.evaluate(() => {
      const t = document.getElementById("__bundler_thumbnail");
      if (!t) return "gone";
      const cs = getComputedStyle(t);
      return cs.display === "none" || cs.opacity === "0" || cs.visibility === "hidden" ? "hidden" : "visible";
    });
    if (state !== "visible") return;
    await page.waitForTimeout(500);
  }
}

async function capture(page, name, dir) {
  // Full-page screenshot first.
  const full = resolve(SHOTS, `${name}-fullpage.png`);
  await page.screenshot({ path: full, fullPage: true });

  // Then scroll-positioned viewport shots at every 800px so we have section
  // checkpoints (top hero, mid-1, mid-2, footer, etc.) without committing
  // to a section map yet.
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  const vp = await page.evaluate(() => window.innerHeight);
  let i = 0;
  for (let y = 0; y < height; y += vp - 80) {
    await page.evaluate((y) => window.scrollTo({ top: y, behavior: "instant" }), y);
    await page.waitForTimeout(350);
    const p = resolve(SHOTS, `${name}-viewport-${String(i).padStart(2, "0")}.png`);
    await page.screenshot({ path: p, fullPage: false });
    i++;
    if (i > 40) break;
  }
  console.log(`[${name}] ${i} viewport shots + 1 fullpage at ${full}`);
}

async function run() {
  const browser = await chromium.launch({ headless: true });
  for (const f of FILES) {
    const ctx = await browser.newContext({
      viewport: f.viewport,
      recordVideo: { dir: SHOTS, size: f.viewport },
    });
    const page = await ctx.newPage();
    console.log(`[${f.name}] navigating to ${BASE}${f.url}`);
    await page.goto(`${BASE}${f.url}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await waitForUnpack(page);
    await page.waitForTimeout(2000);
    await capture(page, f.name);
    // Save the rendered HTML + computed styles snapshot for the design-system extraction.
    const html = await page.content();
    writeFileSync(resolve(SHOTS, `${f.name}-rendered.html`), html, "utf8");
    const tokens = await page.evaluate(() => {
      const root = getComputedStyle(document.documentElement);
      const body = getComputedStyle(document.body);
      const cssVars = {};
      for (const sheet of [...document.styleSheets]) {
        try {
          for (const rule of [...sheet.cssRules]) {
            if (rule.style) {
              for (const prop of rule.style) {
                if (prop.startsWith("--")) cssVars[prop] = rule.style.getPropertyValue(prop).trim();
              }
            }
          }
        } catch {}
      }
      return {
        rootFontSize: root.fontSize,
        bodyFontFamily: body.fontFamily,
        bodyBackground: body.backgroundColor,
        bodyColor: body.color,
        cssVars,
      };
    });
    writeFileSync(resolve(SHOTS, `${f.name}-tokens.json`), JSON.stringify(tokens, null, 2));
    await page.close();
    await ctx.close();
  }
  await browser.close();
}

run().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
