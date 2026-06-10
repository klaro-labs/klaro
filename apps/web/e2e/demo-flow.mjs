import { chromium } from "playwright";

const baseUrl =
  process.env.KLARO_E2E_BASE_URL ??
  process.env.E2E_BASE_URL ??
  "http://127.0.0.1:3004";

const failures = [];
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();

page.on("console", (message) => {
  if (message.type() === "error") failures.push(`browser console error: ${message.text()}`);
});
page.on("pageerror", (error) => failures.push(`browser page error: ${error.message}`));

try {
  await go("/vendor", ["Vendor", "Simulated"]);

  const invoiceId = await createInvoice();
  await payHostedInvoice(invoiceId);
  await verifyReceipt(invoiceId);

  const cashoutId = await createCashout();
  await verifyCashoutProgress(cashoutId);
  await openCashoutDispute(cashoutId);
} catch (error) {
  failures.push(error instanceof Error ? error.message : String(error));
}

await context.close();
await browser.close();

if (failures.length > 0) {
  console.error(`Demo flow audit failed for ${failures.length} issue(s):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Demo flow audit passed at ${baseUrl}`);

async function go(path, mustContain = []) {
  const response = await page.goto(new URL(path, baseUrl).toString(), {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  const status = response?.status() ?? 0;
  if (status >= 400 || status === 0) throw new Error(`${path}: bad HTTP status ${status}`);
  await expectNoFrameworkError(path);
  for (const text of mustContain) await expectText(text, `${path}: missing "${text}"`);
}

async function createInvoice() {
  await go("/vendor/invoices/new", ["Invoice"]);
  await page.getByLabel("Amount (USD)").fill("42.50");
  await page.getByLabel("Description").fill("Demo flow audit invoice");
  await page.getByLabel("Customer email").fill("buyer.demo@example.com");
  await page.getByLabel("Customer name (optional)").fill("Demo Buyer");
  await page.getByLabel("Due in (days)").fill("14");
  await page.getByRole("button", { name: /Create invoice/i }).click();
  await page.waitForURL(/\/vendor\/invoices\/0x[0-9a-f]{64}$/i, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await expectNoFrameworkError("created invoice");
  await expectText("Demo flow audit invoice", "created invoice: description missing");

  const match = page.url().match(/\/vendor\/invoices\/(0x[0-9a-f]{64})$/i);
  if (!match) throw new Error(`created invoice: could not read invoice id from ${page.url()}`);
  return match[1];
}

async function payHostedInvoice(invoiceId) {
  await go(`/i/${invoiceId}`, ["Amount due", "Pay invoice in USDC"]);
  await page.getByRole("button", { name: /Pay invoice in USDC/i }).click();
  await expectText("Payment submitted", "hosted invoice: simulated payment did not submit");
  await page.waitForURL(new RegExp(`/receipt/${invoiceId}$`, "i"), {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await expectNoFrameworkError("receipt redirect");
}

async function verifyReceipt(invoiceId) {
  await go(`/receipt/${invoiceId}`, ["Receipt", "42.50"]);
  const text = await page.locator("body").innerText({ timeout: 10_000 });
  if (!/Verified|Simulated|preview|receipt/i.test(text)) {
    throw new Error("receipt: no visible verification/simulation status");
  }
}

async function createCashout() {
  await go("/vendor/cashout?new=1", ["Cashout", "You receive"]);
  await page.getByRole("spinbutton", { name: "Amount (USD)" }).first().fill("10");
  await page.getByRole("combobox", { name: "Corridor" }).first().selectOption("INR");
  await expectText("You receive:", "cashout: quote panel missing");
  await page.getByRole("button", { name: /Simulate .* cashout/i }).click();
  await page.waitForURL(/\/vendor\/cashout\/0x[0-9a-f]{64}$/i, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await expectNoFrameworkError("created cashout");

  const match = page.url().match(/\/vendor\/cashout\/(0x[0-9a-f]{64})$/i);
  if (!match) throw new Error(`created cashout: could not read cashout id from ${page.url()}`);
  return match[1];
}

async function verifyCashoutProgress(cashoutId) {
  await go(`/vendor/cashout/${cashoutId}`, ["Cashout"]);
  await page.waitForFunction(
    () => /Proof|LP assigned|Claimed|Requested|Order timeline|status/i.test(document.body.innerText),
    null,
    { timeout: 20_000 },
  );
  await expectNoFrameworkError("cashout detail");
}

async function openCashoutDispute(cashoutId) {
  await go(`/vendor/disputes`, ["Open new case"]);
  await page.getByLabel("Entry point").selectOption("cashout");
  await page.getByLabel(/Reference ID/i).fill(cashoutId);
  await page.getByLabel(/Respondent/i).fill("Demo payout partner");
  await page.getByLabel(/Amount in dispute/i).fill("10");
  await page
    .getByLabel(/What happened/i)
    .fill("Demo flow audit dispute because the simulated payout did not arrive.");
  await page.getByRole("button", { name: /Open dispute/i }).click();
  await page.waitForURL(/\/vendor\/disputes\/0x[0-9a-f]{64}$/i, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await expectText("Case", "dispute detail: case page did not render");
  await expectNoFrameworkError("dispute detail");
}

async function expectText(text, failure) {
  await page
    .waitForFunction(
      (needle) => document.body.innerText.toLowerCase().includes(String(needle).toLowerCase()),
      text,
      { timeout: 20_000 },
    )
    .catch(async () => {
      const body = await page.locator("body").innerText({ timeout: 5_000 }).catch(() => "");
      throw new Error(`${failure} | visible body: ${compact(body)}`);
    });
}

async function expectNoFrameworkError(label) {
  const body = await page.locator("body").innerText({ timeout: 10_000 }).catch(() => "");
  if (/Application error|Unhandled Runtime Error|This page could not be found|Internal Server Error/i.test(body)) {
    throw new Error(`${label}: rendered framework/runtime error | ${compact(body)}`);
  }
}

function compact(text) {
  return text.replace(/\s+/g, " ").slice(0, 700);
}
