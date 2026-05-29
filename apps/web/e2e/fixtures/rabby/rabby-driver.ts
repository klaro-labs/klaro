/**
 * Rabby browser-extension driver for Playwright.
 * Ported from fhenix-builder pattern (rabby-driver.ts:1-497) — proven
 * production-grade. The CDP-raw-click pattern is the key insight:
 * page.click() silently drops on Rabby's MV3 notification.html popups;
 * raw Input.dispatchMouseEvent via CDPSession reliably yields.
 *
 * Why Rabby only (not MetaMask/Coinbase/etc.): MV3 popup behaviour under
 * Playwright is fragile across other wallets; Rabby has been verified
 * reliable. See fhenix's 09-mm-smoke.spec.ts:19-23 for the abandoned MM
 * attempt and reasoning.
 */
import {
  chromium,
  type BrowserContext,
  type Page,
} from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, mkdirSync } from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RABBY_EXT_DIR = path.resolve(__dirname, "ext");
const DEFAULT_PROFILE_DIR =
  process.env.RABBY_PROFILE_DIR ??
  path.resolve(__dirname, "../../.rabby-profile");
const RABBY_PASSWORD = process.env.RABBY_PASSWORD ?? "RabbyPass123!QA";

export interface LaunchRabbyOpts {
  shotsDir?: string;
  viewport?: { width: number; height: number };
  profileDir?: string;
}

export interface RabbyContext {
  context: BrowserContext;
  extId: string;
}

/**
 * Launch a persistent Chromium context with Rabby side-loaded.
 * `headless: false` is required — Rabby's MV3 service worker needs a real
 * Chromium runtime.
 */
export async function launchRabby(
  opts: LaunchRabbyOpts = {},
): Promise<RabbyContext> {
  const viewport = opts.viewport ?? { width: 1440, height: 900 };
  const profileDir = opts.profileDir ?? DEFAULT_PROFILE_DIR;
  mkdirSync(profileDir, { recursive: true });

  if (!existsSync(RABBY_EXT_DIR)) {
    throw new Error(
      `Rabby extension not found at ${RABBY_EXT_DIR}. Run apps/web/scripts/fetch-rabby.sh first.`,
    );
  }

  const context = await chromium.launchPersistentContext(profileDir, {
    headless: false,
    viewport,
    recordVideo: opts.shotsDir ? { dir: opts.shotsDir, size: viewport } : undefined,
    args: [
      `--disable-extensions-except=${RABBY_EXT_DIR}`,
      `--load-extension=${RABBY_EXT_DIR}`,
      "--disable-blink-features=AutomationControlled",
      "--no-sandbox",
    ],
  });

  // Discover Rabby's extension ID by polling service workers.
  const extId = await discoverExtId(context);
  return { context, extId };
}

async function discoverExtId(
  context: BrowserContext,
  timeoutMs = 30_000,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const sw of context.serviceWorkers()) {
      const url = sw.url();
      const m = url.match(/^chrome-extension:\/\/([a-z]{32})\//);
      if (m) return m[1];
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(
    "Could not discover Rabby extension ID after 30s. Is the extension loading?",
  );
}

/**
 * Unlock the Rabby vault with the saved password (set during setup).
 * Idempotent — if Rabby is already unlocked, this is a no-op.
 */
export async function unlockRabby(page: Page) {
  const pwdInput = page.locator('input[type="password"]').first();
  if (await pwdInput.isVisible({ timeout: 1500 }).catch(() => false)) {
    await pwdInput.fill(RABBY_PASSWORD);
    const unlockBtn = page.locator("button", { hasText: /^Unlock$/i }).first();
    if (await unlockBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await unlockBtn.click({ force: true }).catch(() => page.keyboard.press("Enter"));
    } else {
      await page.keyboard.press("Enter");
    }
    await page.waitForTimeout(800);
  }
}

/**
 * Enable Rabby testnet visibility (ported from fhenix rabby-driver). Without
 * this, the Connect popup's chain dropdown only shows mainnet chains and the
 * Connect button can stay disabled for testnet dApps. Idempotent.
 */
export async function enableRabbyTestnets(rabbyPage: Page, extensionId: string): Promise<boolean> {
  await rabbyPage.goto(`chrome-extension://${extensionId}/index.html`).catch(() => {});
  await rabbyPage.waitForTimeout(2500);
  let opened = false;
  const gearCandidates = [
    rabbyPage.getByRole("button", { name: /^settings$/i }).first(),
    rabbyPage.locator('[aria-label="Settings" i]').first(),
    rabbyPage.locator('[aria-label*="setting" i]').first(),
    rabbyPage.locator('header [role="button"], header button').last(),
  ];
  for (const g of gearCandidates) {
    if (await g.isVisible({ timeout: 1500 }).catch(() => false)) {
      await g.click({ timeout: 2000, force: true }).catch(() => {});
      await rabbyPage.waitForTimeout(2500);
      opened = true;
      break;
    }
  }
  const row = rabbyPage.locator("div, label").filter({ hasText: /testnet|test network/i }).first();
  if (!opened || !(await row.isVisible({ timeout: 5000 }).catch(() => false))) {
    await rabbyPage.goto(`chrome-extension://${extensionId}/index.html`).catch(() => {});
    return false;
  }
  const sw = row.locator('[role="switch"], button.ant-switch, .ant-switch, input[type="checkbox"]').first();
  let alreadyOn = false;
  if (await sw.isVisible({ timeout: 1500 }).catch(() => false)) {
    const aria = await sw.getAttribute("aria-checked").catch(() => null);
    if (aria === "true") alreadyOn = true;
    else {
      const cls = await sw.getAttribute("class").catch(() => "");
      if (cls && /\bant-switch-checked\b/.test(cls)) alreadyOn = true;
    }
  }
  if (alreadyOn) {
    await rabbyPage.goto(`chrome-extension://${extensionId}/index.html`).catch(() => {});
    await rabbyPage.waitForTimeout(800);
    return false;
  }
  let toggled = false;
  if (await sw.isVisible({ timeout: 1500 }).catch(() => false)) {
    await sw.click({ timeout: 2500, force: true }).catch(() => {});
    toggled = true;
  } else {
    const bb = await row.boundingBox({ timeout: 2000 }).catch(() => null);
    if (bb) { await rabbyPage.mouse.click(Math.round(bb.x + bb.width - 24), Math.round(bb.y + bb.height / 2)); toggled = true; }
  }
  await rabbyPage.waitForTimeout(1500);
  await rabbyPage.goto(`chrome-extension://${extensionId}/index.html`).catch(() => {});
  await rabbyPage.waitForTimeout(1000);
  return toggled;
}

/**
 * Wait for a new Rabby popup (notification.html) to open after a vendor
 * trigger (e.g., clicking "Connect wallet" or "Pay"). Returns the popup
 * page. `knownPages` lets you ignore tabs that already existed.
 */
export async function waitForRabbyPopup(
  ctx: BrowserContext,
  extId: string,
  knownPages: Set<Page> = new Set(),
  timeoutMs = 15_000,
): Promise<Page> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const p of ctx.pages()) {
      if (knownPages.has(p)) continue;
      if (p.url().includes(`${extId}/notification.html`)) return p;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`No Rabby popup appeared after ${timeoutMs}ms`);
}

/**
 * Click an element on a Rabby popup via raw CDP. Playwright's .click()
 * silently drops on Rabby's React-painted popup because hover and press
 * land in different repainted DOMs. Raw Input.dispatchMouseEvent at the
 * bounding-box center bypasses this entirely.
 */
export async function cdpRawClick(popup: Page, x: number, y: number) {
  const cdp = await popup.context().newCDPSession(popup);
  try {
    await cdp.send("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x,
      y,
      button: "none",
      buttons: 0,
    });
    await new Promise((r) => setTimeout(r, 50));
    await cdp.send("Input.dispatchMouseEvent", {
      type: "mousePressed",
      x,
      y,
      button: "left",
      buttons: 1,
      clickCount: 1,
    });
    await new Promise((r) => setTimeout(r, 80));
    await cdp.send("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x,
      y,
      button: "left",
      buttons: 0,
      clickCount: 1,
    });
  } finally {
    await cdp.detach();
  }
}

/**
 * Click a button by its visible text on the popup. Tries Playwright's
 * native click first (works for simple buttons); falls back to CDP-raw if
 * the click drops or the popup doesn't navigate.
 */
export async function clickPopupButton(
  popup: Page,
  textRegex: RegExp,
  shotsDir?: string,
  label?: string,
) {
  const btn = popup.locator("button", { hasText: textRegex }).first();
  await btn.waitFor({ state: "visible", timeout: 5_000 });
  const box = await btn.boundingBox();
  if (!box) throw new Error(`No bounding box for button ${textRegex}`);
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  // Try native click; if it silently drops, fall back to CDP-raw.
  try {
    await btn.click({ timeout: 3_000 });
  } catch {
    await cdpRawClick(popup, x, y);
  }
  if (shotsDir && label) {
    await popup.screenshot({ path: path.join(shotsDir, `popup-${label}.png`) });
  }
}

/**
 * Confirm a Rabby popup by clicking through the CTA chain in order:
 * Sign, Confirm, Approve, Connect, Allow, Switch network. Loops until the
 * popup closes or the timeout fires.
 */
export async function confirmRabbyPopup(
  popup: Page,
  opts: { timeoutMs?: number; shotsDir?: string; label?: string } = {},
) {
  const timeoutMs = opts.timeoutMs ?? 90_000;
  const deadline = Date.now() + timeoutMs;
  const ctas = [
    /^Sign$/i,
    /^Confirm$/i,
    /^Approve$/i,
    /^Connect$/i,
    /^Allow$/i,
    /^Switch network$/i,
    /^Switch to/i,
    /^Add$/i, // "Add Custom Network to Rabby" — first switch to an un-added chain
    /^Next$/i,
    /^Proceed$/i,
  ];
  // Rabby shows a security-alert bar for low-popularity dApps ("Listed by:
  // None / Site popularity: Very Low" — true for localhost) that GATES the
  // primary CTA (Connect/Sign stays disabled until the alerts are acknowledged).
  // Dismiss it via the "Ignore all" link first, else the button never enables
  // and the popup never closes. (fhenix-proven.)
  async function dismissSecurityBar() {
    if (popup.isClosed()) return;
    for (const rx of [/^Ignore all$/i, /^Ignore$/i]) {
      const link = popup.getByText(rx).first();
      if (await link.isVisible({ timeout: 600 }).catch(() => false)) {
        const bb = await link.boundingBox().catch(() => null);
        if (bb) {
          await popup.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2).catch(() => {});
        } else {
          await link.click({ force: true }).catch(() => {});
        }
        await popup.waitForTimeout(800);
        return;
      }
    }
  }
  let step = 0;
  let clicks = 0;
  let lastClick = Date.now();
  while (Date.now() < deadline) {
    if (popup.isClosed()) return;
    await dismissSecurityBar();
    if (popup.isClosed()) return;
    for (const rx of ctas) {
      try {
        const btn = popup.locator("button", { hasText: rx }).first();
        if (!(await btn.isVisible({ timeout: 400 }).catch(() => false))) continue;
        // Visible-but-disabled CTA = security bar not yet cleared or metadata
        // still loading. Wait + re-loop rather than firing a no-op click.
        if (!(await btn.isEnabled().catch(() => true))) {
          await popup.waitForTimeout(1500);
          break;
        }
        const bb = await btn.boundingBox().catch(() => null);
        if (!bb) continue;
        await cdpRawClick(popup, bb.x + bb.width / 2, bb.y + bb.height / 2);
        clicks++;
        lastClick = Date.now();
        if (opts.shotsDir) {
          await popup
            .screenshot({ path: `${opts.shotsDir}/${opts.label ?? "cta"}-${++step}.png` })
            .catch(() => {});
        }
        await popup.waitForTimeout(3000);
        break;
      } catch {
        // try next pattern
      }
    }
    // After ≥1 successful click, if 25s pass with no further CTA the request is
    // done (popup may linger on a success screen) — stop waiting.
    if (clicks > 0 && Date.now() - lastClick > 25_000) return;
    if (popup.isClosed()) return;
    await popup.waitForTimeout(300).catch(() => {});
  }
  // Popup closed = request approved (the common success path). Only the
  // never-closed case is a real failure.
  if (popup.isClosed()) return;
  throw new Error(
    `Rabby popup did not close within ${timeoutMs}ms — manual review required.`,
  );
}

/**
 * One-shot setup: import a vendor private key into Rabby. Idempotent —
 * if the vault already exists, this skips the import (logs warning).
 * Run once per machine; the persistent profile dir keeps state across runs.
 *
 * Usage:
 *   pnpm exec tsx apps/web/e2e/fixtures/rabby/setup-rabby-profile.ts
 */
export async function setupRabbyProfile(privateKey: string) {
  const { context, extId } = await launchRabby();
  try {
    const home = await context.newPage();
    await home.goto(`chrome-extension://${extId}/index.html`);

    // Onboarding: first-run shows "Get Started" / language picker.
    // Click through to "I have a wallet" → "Import private key".
    await home.waitForLoadState("domcontentloaded");
    await home.waitForTimeout(800);

    // Click "I already have a wallet" or "Import"
    for (const rx of [/I already have/i, /Get started/i, /Import/i]) {
      const btn = home.locator("button", { hasText: rx }).first();
      if (await btn.isVisible({ timeout: 1500 }).catch(() => false)) {
        await btn.click();
        await home.waitForTimeout(500);
        break;
      }
    }

    // Pick "Private key" import method
    const pkOption = home.locator("text=/Private Key/i").first();
    if (await pkOption.isVisible({ timeout: 3000 }).catch(() => false)) {
      await pkOption.click();
      await home.waitForTimeout(500);
    }

    // Fill private key textarea
    const pkInput = home.locator('textarea, input[type="password"], input[type="text"]').first();
    await pkInput.fill(privateKey.replace(/^0x/, ""));
    await home.waitForTimeout(300);

    // Click Confirm / Import
    for (const rx of [/^Confirm$/i, /^Import$/i, /^Next$/i]) {
      const btn = home.locator("button", { hasText: rx }).first();
      if (await btn.isEnabled({ timeout: 1500 }).catch(() => false)) {
        await btn.click();
        await home.waitForTimeout(800);
        break;
      }
    }

    // Set Rabby password
    const pwd1 = home.locator('input[type="password"]').first();
    const pwd2 = home.locator('input[type="password"]').nth(1);
    if (await pwd1.isVisible({ timeout: 2000 }).catch(() => false)) {
      await pwd1.fill(RABBY_PASSWORD);
      if (await pwd2.isVisible({ timeout: 1000 }).catch(() => false)) {
        await pwd2.fill(RABBY_PASSWORD);
      }
      const accept = home.locator('input[type="checkbox"]').first();
      if (await accept.isVisible({ timeout: 1000 }).catch(() => false)) {
        await accept.check();
      }
      const submit = home.locator("button", { hasText: /Confirm|Next|Finish|Save/i }).first();
      await submit.click();
      await home.waitForTimeout(1500);
    }

    console.log("[rabby-setup] vendor key imported, password set, profile saved at", DEFAULT_PROFILE_DIR);
  } finally {
    await context.close();
  }
}
