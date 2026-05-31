// Team RBAC persistence UI E2E (no wallet — owner manages teammates). Proves
// the payoff of migration 0036 ("team vendor insert/update") + 0038
// (supabase_user_id nullable for pending invites) through the REAL UI, with
// live Supabase row verification:
//   OWNER magic-link login -> /vendor/team
//   -> invite a teammate (email + role) -> vendor_team_members row persists
//      (role=member, supabase_user_id NULL — pending invite).
//   -> Manage -> change role to Admin -> DB role=admin (0036 update policy).
//   -> Remove -> removed_at set, drops out of the list.
//
// Run from apps/web with the dev server on :3100:
//   node ../../node_modules/.pnpm/tsx@4.22.3/node_modules/tsx/dist/cli.mjs e2e/fixtures/rabby/pb-team.ts
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
const log = (...a: unknown[]) => console.log(`[team ${++n}]`, ...a);
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
const email = `teammate-${stamp}@example.com`;
log("invite email:", email);

const { data: ml, error: mlErr } = await admin.auth.admin.generateLink({
  type: "magiclink",
  email: "xprtqk@gmail.com",
});
if (mlErr || !ml.properties?.hashed_token) {
  console.error("login mint failed", mlErr?.message);
  process.exit(2);
}
const next = encodeURIComponent("/vendor/team");
const callback = `${BASE}/auth/callback?token_hash=${ml.properties.hashed_token}&type=magiclink&next=${next}`;

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
await page.goto(`${BASE}/vendor/team`, {
  waitUntil: "domcontentloaded",
  timeout: 60000,
});
await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
await page.waitForTimeout(1500);
log("on team page:", page.url());
if (/\/signin/.test(page.url())) {
  console.error("session not established");
  await browser.close();
  process.exit(2);
}

// ── invite ────────────────────────────────────────────────────────────
await page.locator('input[name="email"]').first().fill(email);
await page.locator('select[name="role"]').first().selectOption("Member");
await page
  .getByRole("button", { name: /^Invite$/i })
  .first()
  .click();
await page.waitForTimeout(2500);

const appears = await page
  .getByText(email, { exact: false })
  .first()
  .isVisible()
  .catch(() => false);
check("UI: invited teammate appears in the list", appears);

const { data: invRows } = await admin
  .from("vendor_team_members")
  .select("id,role,supabase_user_id,accepted_at,removed_at")
  .eq("email", email);
const inv = invRows?.[0];
log(
  "db row:",
  inv
    ? `role=${inv.role} user_id=${inv.supabase_user_id ?? "NULL"} removed=${inv.removed_at !== null}`
    : "(none)",
);
check("DB: invite row persisted role=member", inv?.role === "member");
check(
  "DB: pending invite has NULL supabase_user_id (0038)",
  inv?.supabase_user_id === null,
);
const memberId = inv?.id as string | undefined;

// ── change role to Admin (Manage dropdown) ─────────────────────────────
const manage = page.locator("summary", { hasText: /^Manage$/i }).first();
if (await manage.isVisible().catch(() => false)) {
  await manage.click();
  await page.waitForTimeout(500);
  // the change-role <select> inside the opened <details>
  const roleSel = page.locator("details[open] select[name='role']").first();
  await roleSel.selectOption("Admin").catch(() => {});
  await page
    .locator("details[open]")
    .getByRole("button", { name: /^Save$/i })
    .first()
    .click()
    .catch(() => {});
  await page.waitForTimeout(2500);
}
const { data: afterRole } = await admin
  .from("vendor_team_members")
  .select("role")
  .eq("email", email);
check(
  "DB: role changed to admin (0036 update policy)",
  afterRole?.[0]?.role === "admin",
  afterRole?.[0]?.role ?? "(missing)",
);

// ── remove ─────────────────────────────────────────────────────────────
// Reload for a clean closed-<details> state (the prior role-change left the
// Manage dropdown's open/closed state ambiguous across the re-render).
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForTimeout(1500);
const manage2 = page.locator("summary", { hasText: /^Manage$/i }).first();
if (await manage2.isVisible().catch(() => false)) {
  await manage2.click();
  await page.waitForTimeout(600);
  await page
    .getByRole("button", { name: /Remove from team/i })
    .first()
    .click()
    .catch(() => {});
  await page.waitForTimeout(2500);
}
const goneUi = !(await page
  .getByText(email, { exact: false })
  .first()
  .isVisible()
  .catch(() => false));
check("UI: teammate removed from list", goneUi);
const { data: afterRemove } = await admin
  .from("vendor_team_members")
  .select("removed_at")
  .eq("email", email);
check(
  "DB: removed_at set after remove",
  !!afterRemove?.[0]?.removed_at,
  afterRemove?.[0]?.removed_at ? "set" : "null",
);

await browser.close();
console.log(`\nTEAM_MEMBER_ID=${memberId ?? ""}`);
console.log(`TEAM_E2E_OK=${failures === 0}`);
process.exit(failures === 0 ? 0 : 1);
