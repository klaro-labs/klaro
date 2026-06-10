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
  const submit = page.getByRole("button", { name: /Create invoice/i });
  await waitEnabled(submit, "create-invoice submit");
  await fillStable(page.getByLabel("Amount (USD)"), "42.50");
  await fillStable(page.getByLabel("Description"), "Demo flow audit invoice");
  await fillStable(page.getByLabel("Customer email"), "buyer.demo@example.com");
  await fillStable(page.getByLabel("Customer name (optional)"), "Demo Buyer");
  await fillStable(page.getByLabel("Due in (days)"), "14");
  await submit.click();
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
  const receiptUrl = new RegExp(`/receipt/${invoiceId}$`, "i");
  await clickUntil(
    page.getByRole("button", { name: /Pay invoice in USDC/i }),
    async () => {
      if (receiptUrl.test(page.url())) return true;
      const body = await page.locator("body").innerText().catch(() => "");
      return /Payment submitted/i.test(body);
    },
    "hosted invoice: simulated payment did not submit",
  );
  await page.waitForURL(receiptUrl, {
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
  await fillStable(page.getByRole("spinbutton", { name: "Amount (USD)" }).first(), "10");
  await selectStable(page.getByRole("combobox", { name: "Corridor" }).first(), "INR");
  await expectText("You receive:", "cashout: quote panel missing");
  const submit = page.getByRole("button", { name: /Simulate .* cashout/i });
  await waitEnabled(submit, "cashout submit");
  await clickUntil(
    submit,
    async () => /\/vendor\/cashout\/0x[0-9a-f]{64}$/i.test(page.url()),
    "cashout: submit produced no order",
  );
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
  await selectStable(page.getByLabel("Entry point"), "cashout");
  await fillStable(page.getByLabel(/Reference ID/i), cashoutId);
  await fillStable(page.getByLabel(/Respondent/i), "Demo payout partner");
  await fillStable(page.getByLabel(/Amount in dispute/i), "10");
  await fillStable(
    page.getByLabel(/What happened/i),
    "Demo flow audit dispute because the simulated payout did not arrive.",
  );
  await page.getByRole("button", { name: /Open dispute/i }).click();
  await page.waitForURL(/\/vendor\/disputes\/0x[0-9a-f]{64}$/i, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await expectText("Case", "dispute detail: case page did not render");
  await expectNoFrameworkError("dispute detail");
}

/** Click that survives React hydration. A click before handlers attach does
 * nothing visible — so do what a human does: wait, then press again. Each
 * attempt gets a generous window so a slow server action is not double-fired. */
async function clickUntil(locator, predicate, failure, attempts = 4) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    await locator.click({ timeout: 10_000 }).catch(() => {});
    for (let tick = 0; tick < 40; tick++) {
      await page.waitForTimeout(250);
      if (await predicate()) return;
    }
  }
  throw new Error(failure);
}

/** Fill that survives React hydration. If hydration re-renders the controlled
 * input and wipes the value mid-flow, retype it — exactly what a human would
 * do — and only proceed once the value sticks. */
async function fillStable(locator, value) {
  for (let attempt = 0; attempt < 10; attempt++) {
    await locator.fill(value);
    await page.waitForTimeout(200);
    if ((await locator.inputValue()) === value) return;
  }
  throw new Error(`field kept resetting (hydration race): ${value}`);
}

async function selectStable(locator, value) {
  for (let attempt = 0; attempt < 10; attempt++) {
    await locator.selectOption(value);
    await page.waitForTimeout(200);
    if ((await locator.inputValue()) === value) return;
  }
  throw new Error(`select kept resetting (hydration race): ${value}`);
}

async function waitEnabled(locator, label) {
  await locator.waitFor({ state: "visible", timeout: 20_000 });
  for (let attempt = 0; attempt < 100; attempt++) {
    if (!(await locator.isDisabled())) return;
    await page.waitForTimeout(200);
  }
  throw new Error(`${label}: button never became enabled`);
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
