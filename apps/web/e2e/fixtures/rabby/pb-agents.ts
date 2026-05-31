// Agent-job persistence UI E2E (no wallet — vendor tracks an agent engagement).
// Proves agent_jobs create/advance/read work LIVE through the real UI now that
// the M11 gate is removed, with live Supabase row verification at each step.
// (On-chain AgentEscrow custody is partner-pending + honestly labelled — see
// the page banner; this verifies the DB lifecycle, not fund movement.)
//   VENDOR magic-link login -> /vendor/agents -> hire an agent (status CREATED)
//   -> Fund -> Agent starts -> Submit deliverable -> Accept+release (CLOSED),
//   verifying agent_jobs.status + the stage timestamp after each transition.
//
// Run from apps/web with the dev server on :3100:
//   node ../../node_modules/.pnpm/tsx@4.22.3/node_modules/tsx/dist/cli.mjs e2e/fixtures/rabby/pb-agents.ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";

function env(file: string) {
  const o: Record<string, string> = {};
  for (const l of readFileSync(file, "utf8").split(/\r?\n/)) {
    if (!l || l.startsWith("#")) continue;
    const i = l.indexOf("=");
    if (i < 0) continue;
    o[l.slice(0, i).trim()] = l
      .slice(i + 1)
      .trim()
      .replace(/^"|"$/g, "");
  }
  return o;
}
const local = env(path.resolve(".env.local"));
const BASE = "http://localhost:3100";
let n = 0;
const log = (...a: unknown[]) => console.log(`[agent ${++n}]`, ...a);
const admin = createClient(
  local.SUPABASE_URL,
  local.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: { persistSession: false, autoRefreshToken: false },
  },
);

let failures = 0;
const check = (label: string, ok: boolean, detail = "") => {
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  [${detail}]` : ""}`,
  );
  if (!ok) failures++;
};

const stamp = Date.now();
const brief = `QA agent job ${stamp} — competitor pricing scan for Q3 launch`;

const { data: ml, error: mlErr } = await admin.auth.admin.generateLink({
  type: "magiclink",
  email: "xprtqk@gmail.com",
});
if (mlErr || !ml.properties?.hashed_token) {
  console.error("login mint failed", mlErr?.message);
  process.exit(2);
}
const callback = `${BASE}/auth/callback?token_hash=${ml.properties.hashed_token}&type=magiclink&next=${encodeURIComponent("/vendor/agents")}`;

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 900 },
});
const loginPage = await ctx.newPage();
await loginPage.goto(callback, {
  waitUntil: "domcontentloaded",
  timeout: 120000,
});
await loginPage.waitForTimeout(2500);
await loginPage.close().catch(() => {});

const page = await ctx.newPage();
page.on("pageerror", (e) => log("PAGEERROR:", e.message.slice(0, 160)));
await page.goto(`${BASE}/vendor/agents`, {
  waitUntil: "domcontentloaded",
  timeout: 60000,
});
await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
await page.waitForTimeout(1500);
if (/\/signin/.test(page.url())) {
  console.error("session not established (bounced to signin)");
  await browser.close();
  process.exit(2);
}
// honest-mode: the page must show the live label + the partner-pending banner.
const honest = await page
  .evaluate(() => {
    const t = document.body.innerText;
    return (
      /Lifecycle tracked live/i.test(t) &&
      /partner-pending/i.test(t) &&
      /no USDC moves on-chain/i.test(t)
    );
  })
  .catch(() => false);
check("UI: honest live + partner-pending labels present", honest);

// ── hire (create job) ─────────────────────────────────────────────────
await page.locator('select[name="agentId"]').first().selectOption({ index: 1 });
await page.locator('input[name="amount"]').first().fill("200");
await page.locator('textarea[name="description"]').first().fill(brief);
await page
  .getByRole("button", { name: /^Open job$/i })
  .first()
  .click();
await page.waitForTimeout(2500);

const { data: created } = await admin
  .from("agent_jobs")
  .select("job_id,status,amount_usdc,vendor_id,agent_id")
  .eq("description", brief);
const job = created?.[0];
log(
  "created job:",
  job ? `status=${job.status} usdc=${job.amount_usdc}` : "(none)",
);
check("DB: agent_jobs row created (status CREATED)", job?.status === "CREATED");
const jobId = job?.job_id as string | undefined;

// ── advance through the lifecycle ─────────────────────────────────────
const steps: { btn: RegExp; status: string; tsCol: string }[] = [
  { btn: /Fund job/i, status: "FUNDED", tsCol: "funded_at" },
  { btn: /Agent starts/i, status: "STARTED", tsCol: "started_at" },
  { btn: /Submit deliverable/i, status: "DELIVERED", tsCol: "delivered_at" },
  { btn: /Accept \+ release/i, status: "CLOSED", tsCol: "closed_at" },
];
for (const s of steps) {
  // reload for a clean server render reflecting the current status + the right
  // next button (the inline server-action re-render is flaky to drive directly).
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  const b = page.getByRole("button", { name: s.btn }).first();
  if (await b.isVisible({ timeout: 6000 }).catch(() => false)) {
    await b.click().catch(() => {});
    await page.waitForTimeout(2500);
  } else {
    log(`button for ${s.status} not visible`);
  }
  const { data: row } = await admin
    .from("agent_jobs")
    .select(`status,${s.tsCol}`)
    .eq("job_id", jobId ?? "");
  const r = row?.[0] as Record<string, unknown> | undefined;
  check(
    `DB: advanced to ${s.status} (+ ${s.tsCol})`,
    r?.status === s.status && !!r?.[s.tsCol],
    `status=${r?.status}`,
  );
}

// ── read-back: deliverable hash anchored, terminal state ──────────────
const { data: fin } = await admin
  .from("agent_jobs")
  .select("status,deliverable_hash")
  .eq("job_id", jobId ?? "");
check(
  "DB: terminal CLOSED with a deliverable hash anchored",
  fin?.[0]?.status === "CLOSED" &&
    /^0x[0-9a-f]{64}$/i.test(String(fin?.[0]?.deliverable_hash ?? "")),
  fin?.[0]?.deliverable_hash ? "hash set" : "no hash",
);

await browser.close();
console.log(`\nAGENT_JOB_ID=${jobId ?? ""}`);
console.log(`AGENTS_E2E_OK=${failures === 0}`);
process.exit(failures === 0 ? 0 : 1);
