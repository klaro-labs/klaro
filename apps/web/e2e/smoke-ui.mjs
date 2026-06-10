import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright";

const baseUrl =
  process.env.KLARO_E2E_BASE_URL ??
  process.env.E2E_BASE_URL ??
  "http://127.0.0.1:3004";

const pages = [
  { path: "/", name: "landing", mustContain: ["Klaro"] },
  { path: "/signin", name: "sign in", mustContain: ["Sign in"] },
  { path: "/help", name: "help", mustContain: ["Help"] },
  { path: "/brand-kit", name: "brand kit", mustContain: ["Brand"] },
  { path: "/product", name: "product", mustContain: ["Klaro"] },
  { path: "/product/invoicing", name: "invoicing product", mustContain: ["Invoice"] },
  { path: "/status", name: "status", mustContain: ["status"] },
  { path: "/lp/docs", name: "lp docs", mustContain: ["LP"] },
  { path: "/vendor", name: "vendor dashboard", protected: true, mustContain: ["Vendor"] },
  {
    path: "/vendor/invoices/new",
    name: "new invoice",
    protected: true,
    mustContain: ["Invoice"],
    createInvoice: true,
  },
  {
    path: "/vendor/invoices/import",
    name: "bulk invoice import",
    protected: true,
    mustContain: ["CSV", "invoice"],
    uploadCsv: true,
  },
  { path: "/vendor/cashout", name: "cashout", protected: true, mustContain: ["Cashout"], checkCashout: true },
  { path: "/vendor/disputes", name: "disputes", protected: true, mustContain: ["Dispute"] },
  { path: "/admin", name: "admin", protected: true, mustContain: ["Admin"] },
];

const failures = [];
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });

async function checkPage(spec) {
  const page = await context.newPage();
  const runtimeErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") runtimeErrors.push(message.text());
  });
  page.on("pageerror", (error) => runtimeErrors.push(error.message));

  const url = new URL(spec.path, baseUrl).toString();
  const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 }).catch((error) => {
    failures.push(`${spec.name}: navigation failed: ${error.message}`);
    return null;
  });

  const status = response?.status() ?? 0;
  if ((spec.mustContain ?? []).length > 0) {
    await page
      .waitForFunction(
        (texts) => {
          const body = document.body?.innerText?.toLowerCase() ?? "";
          return texts.every((text) => body.includes(text.toLowerCase()));
        },
        spec.mustContain,
        { timeout: 20_000 },
      )
      .catch(() => {});
  }
  const bodyText = await page.locator("body").innerText({ timeout: 10_000 }).catch(() => "");

  if (status >= 400 || status === 0) {
    failures.push(`${spec.name}: bad HTTP status ${status}`);
  }
  if (!bodyText.trim()) {
    failures.push(`${spec.name}: empty page body`);
  }
  if (/Application error|Unhandled Runtime Error|This page could not be found/i.test(bodyText)) {
    failures.push(`${spec.name}: rendered a framework/runtime error`);
  }
  if (spec.protected && /Welcome to Klaro|Sign in to continue|Sign in with Google/i.test(bodyText)) {
    failures.push(`${spec.name}: protected page redirected to sign-in instead of mock demo state`);
  }
  for (const text of spec.mustContain ?? []) {
    if (!bodyText.toLowerCase().includes(text.toLowerCase())) {
      failures.push(`${spec.name}: missing visible text "${text}"`);
    }
  }
  if (runtimeErrors.length > 0) {
    failures.push(`${spec.name}: browser runtime errors: ${runtimeErrors.join(" | ")}`);
  }

  if (spec.uploadCsv) {
    await checkBulkImport(page, spec.name);
  }
  if (spec.createInvoice) {
    await checkInvoiceCreate(page, spec.name);
  }
  if (spec.checkCashout) {
    await checkCashout(page, spec.name);
  }

  await page.close();
}

async function checkInvoiceCreate(page, name) {
  try {
    const submit = page.getByRole("button", { name: /Create invoice/i });
    await submit.waitFor({ state: "visible", timeout: 20_000 });
    await page.waitForFunction(() => {
      const button = [...document.querySelectorAll("button")].find((el) =>
        /Create invoice/i.test(el.textContent ?? ""),
      );
      return button instanceof HTMLButtonElement && !button.disabled;
    });
    await page.getByLabel("Amount (USD)").fill("33.25");
    await page.getByLabel("Description").fill("Smoke invoice UI check");
    await page.getByLabel("Customer email").fill("smoke@example.com");
    await page.getByLabel("Customer name (optional)").fill("Smoke Buyer");
    await page.getByLabel("Due in (days)").fill("7");
    await submit.click();
    await page.waitForURL(/\/vendor\/invoices\/0x[0-9a-f]{64}$/i, {
      timeout: 60_000,
      waitUntil: "commit",
    });
    const text = await page.locator("body").innerText({ timeout: 10_000 });
    if (!/Smoke invoice UI check|Invoice|Payment/i.test(text)) {
      failures.push(`${name}: created invoice detail page did not render expected content`);
    }
  } catch (error) {
    const text = await page.locator("body").innerText({ timeout: 5_000 }).catch(() => "");
    failures.push(`${name}: create-invoice flow failed: ${error.message}${text ? ` | visible body: ${compact(text)}` : ""}`);
  }
}

async function checkBulkImport(page, name) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "klaro-smoke-"));
  const dueDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const csvPath = path.join(tempDir, "invoice-import.csv");

  try {
    await writeFile(csvPath, `customerEmail,amount,description,dueAt\nsmoke@example.com,25.00,Smoke invoice,${dueDate}\n`);
    await page.waitForFunction(() => {
      const input = document.querySelector('input[type="file"]');
      return input instanceof HTMLInputElement && !input.disabled;
    });
    await page.setInputFiles('input[type="file"]', csvPath);
    await page.waitForFunction(() => document.body.innerText.includes("Create 1 invoice"));
    const bodyText = await page.locator("body").innerText({ timeout: 10_000 });
    if (!/Create 1 invoice/i.test(bodyText)) {
      failures.push(`${name}: CSV upload did not enable the create action`);
    }
  } catch (error) {
    failures.push(`${name}: CSV upload check failed: ${error.message}`);
  } finally {
    await rm(tempDir, { force: true, recursive: true });
  }
}

async function checkCashout(page, name) {
  try {
    const desktop = page.locator("main");
    await desktop.getByRole("spinbutton", { name: "Amount (USD)" }).first().fill("10");
    await desktop.getByRole("combobox", { name: "Corridor" }).first().selectOption("INR");
    const text = await page.locator("body").innerText({ timeout: 10_000 });
    if (!/You receive:/i.test(text)) {
      failures.push(`${name}: cashout quote panel did not render`);
    }
    if (!/Demo only|Simulate|INR pilot/i.test(text)) {
      failures.push(`${name}: cashout simulation truth label is missing`);
    }
    const button = page.getByRole("button", { name: /cashout/i }).first();
    if ((await button.count()) === 0) {
      failures.push(`${name}: no cashout action button found`);
    } else if (await button.isDisabled()) {
      failures.push(`${name}: cashout action is disabled in demo state`);
    }
  } catch (error) {
    failures.push(`${name}: cashout quote check failed: ${error.message}`);
  }
}

function compact(text) {
  return text.replace(/\s+/g, " ").slice(0, 700);
}

for (const spec of pages) {
  await checkPage(spec);
}

await context.close();
await browser.close();

if (failures.length > 0) {
  console.error("UI smoke check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`UI smoke check passed for ${pages.length} pages at ${baseUrl}`);
process.exit(0);
