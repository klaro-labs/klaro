// Dispute persistence UI E2E (no wallet — vendor opens a case + submits
// evidence). Proves the payoff of 0036 ("disputes party update") through the
// REAL UI with live DB verification, AND proves the 0039 hardening (a party
// cannot self-decide their own case via a direct PostgREST update):
//   VENDOR magic-link login -> /vendor/disputes
//   -> open a dispute on an invoice they own -> disputes + dispute_evidence rows
//   -> /vendor/disputes/<caseId> -> add evidence -> status EVIDENCE_SUBMITTED
//      + a 2nd evidence row (0036 update).
//   -> attempt PATCH disputes {status:DECIDED, outcome:REFUND_TO_RESPONDENT}
//      with the vendor's own JWT -> BLOCKED by 0039 (row stays undecided).
//
// Run from apps/web with the dev server on :3100:
//   node ../../node_modules/.pnpm/tsx@4.22.3/node_modules/tsx/dist/cli.mjs e2e/fixtures/rabby/pb-disputes.ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { chromium, type BrowserContext } from "playwright";
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
const SUPABASE_URL = local.SUPABASE_URL;
const ANON = local.NEXT_PUBLIC_SUPABASE_ANON_KEY;
let n = 0;
const log = (...a: unknown[]) => console.log(`[disp ${++n}]`, ...a);
const admin = createClient(SUPABASE_URL, local.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let failures = 0;
const check = (label: string, ok: boolean, detail = "") => {
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  [${detail}]` : ""}`,
  );
  if (!ok) failures++;
};

// an invoice owned by the test vendor (xprtqk) — the dispute source.
const contextRefId =
  "0xd212a692b3ac905ce2b36e643b5fc4e16823ebb27c7fb990ef929ece325b0cd1";
const note = `QA dispute ${Date.now()} — buyer claims the delivered work failed acceptance; opening a case to review.`;

// Reconstruct the @supabase/ssr access token (JWT) from the auth cookie(s),
// which may be chunked (...auth-token.0, .1) and base64- prefixed.
async function accessTokenFrom(ctx: BrowserContext): Promise<string | null> {
  const cookies = await ctx.cookies();
  const auth = cookies
    .filter((c) => /sb-.*-auth-token(\.\d+)?$/.test(c.name))
    .sort((a, b) => a.name.localeCompare(b.name));
  if (!auth.length) return null;
  let raw = auth.map((c) => decodeURIComponent(c.value)).join("");
  if (raw.startsWith("base64-")) {
    raw = Buffer.from(raw.slice("base64-".length), "base64").toString("utf8");
  }
  try {
    const parsed = JSON.parse(raw);
    return parsed.access_token ?? parsed[0]?.access_token ?? null;
  } catch {
    return null;
  }
}

const { data: ml, error: mlErr } = await admin.auth.admin.generateLink({
  type: "magiclink",
  email: "xprtqk@gmail.com",
});
if (mlErr || !ml.properties?.hashed_token) {
  console.error("login mint failed", mlErr?.message);
  process.exit(2);
}
const callback = `${BASE}/auth/callback?token_hash=${ml.properties.hashed_token}&type=magiclink&next=${encodeURIComponent("/vendor/disputes")}`;

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
await page.goto(`${BASE}/vendor/disputes`, {
  waitUntil: "domcontentloaded",
  timeout: 60000,
});
await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
await page.waitForTimeout(1500);
if (/\/signin/.test(page.url())) {
  console.error("session not established");
  await browser.close();
  process.exit(2);
}

// ── open dispute ──────────────────────────────────────────────────────
await page.locator('select[name="context"]').first().selectOption("invoice");
await page.locator('input[name="contextRefId"]').first().fill(contextRefId);
await page
  .locator('input[name="respondentLabel"]')
  .first()
  .fill("QA Buyer Ltd");
await page.locator('input[name="amount"]').first().fill("25");
await page.locator('textarea[name="note"]').first().fill(note);
await page
  .getByRole("button", { name: /^Open dispute$/i })
  .first()
  .click();
await page
  .waitForURL(/\/vendor\/disputes\/0x[0-9a-fA-F]{64}/, { timeout: 20000 })
  .catch(() => {});
const caseId =
  page.url().match(/\/vendor\/disputes\/(0x[0-9a-fA-F]{64})/)?.[1] ?? null;
log("opened caseId:", caseId);
check("UI: redirected to the new case page", !!caseId);

const { data: dRows } = await admin
  .from("disputes")
  .select("id,status,source,source_id,claimant_id,outcome")
  .eq("case_id", caseId ?? "");
const d = dRows?.[0];
log(
  "db dispute:",
  d
    ? `status=${d.status} source=${d.source} outcome=${d.outcome ?? "null"}`
    : "(none)",
);
check(
  "DB: dispute row persisted (status OPENED, source invoice)",
  d?.status === "OPENED" && d?.source === "invoice",
);
const disputeId = d?.id as string | undefined;

const { data: ev0 } = await admin
  .from("dispute_evidence")
  .select("id")
  .eq("dispute_id", disputeId ?? "");
check("DB: opening evidence row created", (ev0?.length ?? 0) >= 1);

// ── add evidence (case detail page) ───────────────────────────────────
await page
  .locator('textarea[name="note"]')
  .first()
  .fill("Follow-up: attaching the signed acceptance + delivery log.");
await page
  .getByRole("button", { name: /Submit evidence/i })
  .first()
  .click();
await page.waitForTimeout(2500);
const { data: dAfter } = await admin
  .from("disputes")
  .select("status")
  .eq("case_id", caseId ?? "");
check(
  "DB: status advanced to EVIDENCE_SUBMITTED (0036 update)",
  dAfter?.[0]?.status === "EVIDENCE_SUBMITTED",
  dAfter?.[0]?.status ?? "?",
);
const { data: ev1 } = await admin
  .from("dispute_evidence")
  .select("id")
  .eq("dispute_id", disputeId ?? "");
check(
  "DB: a 2nd evidence row was added",
  (ev1?.length ?? 0) >= 2,
  `${ev1?.length ?? 0} rows`,
);

// ── 0039: party cannot self-decide via direct PostgREST ───────────────
const token = await accessTokenFrom(ctx);
if (token && caseId) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/disputes?case_id=eq.${caseId}`,
    {
      method: "PATCH",
      headers: {
        apikey: ANON,
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        prefer: "return=representation",
      },
      body: JSON.stringify({
        status: "DECIDED",
        outcome: "REFUND_TO_RESPONDENT",
      }),
    },
  );
  const body = await res.json().catch(() => null);
  const updatedCount = Array.isArray(body) ? body.length : 0;
  log(`self-decide PATCH: http=${res.status} rows_updated=${updatedCount}`);
  const { data: dCheck } = await admin
    .from("disputes")
    .select("status,outcome")
    .eq("case_id", caseId);
  const dec = dCheck?.[0];
  // undecided = status not DECIDED + outcome still the default PENDING (never
  // the REFUND_TO_RESPONDENT the attacker tried to write).
  const stillUndecided =
    dec?.status !== "DECIDED" && dec?.outcome !== "REFUND_TO_RESPONDENT";
  check(
    "0039: vendor self-decide is BLOCKED (row stays undecided)",
    updatedCount === 0 && stillUndecided,
    `http_blocked rows=${updatedCount} status=${dec?.status} outcome=${dec?.outcome}`,
  );
} else {
  log(
    "WARN: could not extract access token — skipping self-decide block check",
  );
  check("0039: self-decide block (token unavailable)", false, "no token");
}

await browser.close();
console.log(`\nCASE_ID=${caseId ?? ""}`);
console.log(`DISPUTE_E2E_OK=${failures === 0}`);
process.exit(failures === 0 ? 0 : 1);
