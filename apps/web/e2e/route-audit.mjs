import { chromium } from "playwright";

const baseUrl =
  process.env.KLARO_E2E_BASE_URL ??
  process.env.E2E_BASE_URL ??
  "http://127.0.0.1:3004";

const INVOICE_ID =
  "0xc107d300000000000000000000000000000000000000000000000000000e0000";
const DISPUTE_ID =
  "0xd1d1000000000000000000000000000000000000000000000000000000000000";
const AGENT_ID =
  "0xa9e1000000000000000000000000000000000000000000000000000000000000";

const routes = [
  "/",
  "/signin",
  "/onboarding",
  "/brand-kit",
  "/product",
  "/product/invoicing",
  "/product/cashout",
  "/product/receipts",
  "/product/reputation",
  "/product/stablefx",
  "/developers",
  "/build",
  "/pricing",
  "/company",
  "/company/contact",
  "/roadmap",
  "/docs",
  "/resources",
  "/resources/flows",
  "/trust",
  "/status",
  "/help",
  "/fx",
  "/fx/brla",
  "/fx/mxnb",
  "/agents",
  `/agents/${AGENT_ID}`,
  "/x402-demo",
  "/offline",
  "/account/privacy",
  "/legal/terms",
  "/legal/privacy",
  "/legal/dpa",
  "/legal/subprocessors",
  "/legal/cookies",
  "/legal/acceptable-use",
  "/legal/disclosures",
  "/vendor",
  "/vendor/invoices",
  "/vendor/invoices/new",
  "/vendor/invoices/import",
  "/vendor/invoices/recurring",
  `/vendor/invoices/${INVOICE_ID}`,
  `/vendor/invoices/${INVOICE_ID}/screening`,
  "/vendor/links",
  "/vendor/links/new",
  "/vendor/cashout",
  "/vendor/disputes",
  `/vendor/disputes/${DISPUTE_ID}`,
  "/vendor/bills",
  "/vendor/bills/bill_seed_01",
  "/vendor/exports",
  "/vendor/financing",
  "/vendor/reputation",
  "/vendor/team",
  "/vendor/settings",
  "/vendor/trust-center",
  "/vendor/transit",
  "/vendor/retainer",
  "/vendor/delegations",
  "/vendor/agents",
  `/vendor/agents/${AGENT_ID}/jobs`,
  "/vendor/integrations/erp",
  "/vendor/integrations/webhooks",
  "/lp",
  "/lp/apply",
  "/lp/dashboard",
  "/lp/docs",
  "/lp/queue",
  "/lp/reputation",
  "/lp/settings",
  "/lp/stake",
  "/lp/walkthrough",
  "/lp/disputes",
  "/lp/disputes-explainer",
  `/lp/disputes/${DISPUTE_ID}`,
  "/admin",
  "/admin/audit-log",
  "/admin/case-management",
  "/admin/disputes",
  "/admin/limits",
  "/admin/manual-review",
  "/admin/risk-holds",
  "/admin/sanctions",
];

const frameworkErrorRe =
  /Application error|Unhandled Runtime Error|This page could not be found|Internal Server Error/i;

const failures = [];
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });

for (const route of routes) {
  const page = await context.newPage();
  const runtimeErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") runtimeErrors.push(message.text());
  });
  page.on("pageerror", (error) => runtimeErrors.push(error.message));

  const response = await page
    .goto(new URL(route, baseUrl).toString(), {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    })
    .catch((error) => {
      failures.push(`${route}: navigation failed: ${error.message}`);
      return null;
    });

  const status = response?.status() ?? 0;
  await page
    .waitForFunction(() => Boolean(document.body?.innerText?.trim()), null, {
      timeout: 20_000,
    })
    .catch(async () => {
      await page.reload({ waitUntil: "domcontentloaded", timeout: 60_000 }).catch(() => {});
      await page
        .waitForFunction(() => Boolean(document.body?.innerText?.trim()), null, {
          timeout: 10_000,
        })
        .catch(() => {});
    });
  const bodyText = await page.locator("body").innerText({ timeout: 15_000 }).catch(() => "");

  if (status >= 400 || status === 0) {
    failures.push(`${route}: bad HTTP status ${status}`);
  }
  if (!bodyText.trim()) {
    failures.push(`${route}: empty body`);
  }
  if (frameworkErrorRe.test(bodyText)) {
    failures.push(`${route}: rendered framework/runtime error`);
  }
  if (runtimeErrors.length > 0) {
    failures.push(`${route}: browser runtime errors: ${runtimeErrors.join(" | ")}`);
  }

  await page.close();
}

await context.close();
await browser.close();

if (failures.length > 0) {
  console.error(`Route audit failed for ${failures.length} issue(s):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Route audit passed for ${routes.length} routes at ${baseUrl}`);
