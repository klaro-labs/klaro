/**
 * Dispute→escrow fan-out integration smoke.
 *
 * Drives the ACTUAL daemon `advanceDisputeResolution` against the LIVE
 * DisputeManager + CashoutOrderProcessor on Arc testnet — proving the routing,
 * the resolveDispute ABI encoding, and the simulate-then-skip safety net work
 * end-to-end, WITHOUT moving any funds: each test case uses a random caseId that
 * has no on-chain order, so the contract reverts at simulate time and the worker
 * classifies it as an idempotent skip (no tx sent). This catches ABI/address/
 * routing regressions that the pure unit test (disputeRouting.test.ts) can't.
 *
 * It does NOT prove a real fund release — that needs a funded dispute lifecycle
 * (escrow funded → openDispute → DisputeManager.decide → resolve). See
 * HUMAN_ACTIONS_NEEDED.md for that recipe.
 *
 * Run from apps/daemon:
 *   node --env-file=.env <tsx> scripts/qa-dispute-resolve-route.ts
 */
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { advanceDisputeResolution } from "../src/workers/disputeResolver.js";

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("need SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in daemon .env");
  process.exit(2);
}
const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let failures = 0;
const check = (label: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  [${detail}]` : ""}`);
  if (!ok) failures++;
};

const caseId = () => ("0x" + randomBytes(32).toString("hex")) as `0x${string}`;

async function provision(id: string, outcome: string) {
  const now = new Date().toISOString();
  const { error } = await admin.from("disputes").insert({
    case_id: id,
    source: "cashout",
    source_id: `qa-${id.slice(0, 10)}`,
    claimant_kind: "vendor",
    claimant_id: "qa-vendor",
    respondent_kind: "lp",
    respondent_id: "qa-lp",
    status: "DECIDED",
    outcome,
    decision_reason_hash: "0x" + "11".repeat(32),
    opened_at: now,
    decided_at: now,
    updated_at: now,
  });
  if (error) throw new Error(`provision failed: ${error.message}`);
}
const cleanup = (id: string) => admin.from("disputes").delete().eq("case_id", id);

// ── Case 1: cashout + RELEASE_TO_CLAIMANT → routes to the LIVE
//    CashoutOrderProcessor, simulates resolveDispute, reverts (no order), skips
//    cleanly. A throw here means broken routing / ABI / address — not a revert.
{
  const id = caseId();
  await provision(id, "RELEASE_TO_CLAIMANT");
  let threw: string | null = null;
  try {
    await advanceDisputeResolution(id);
  } catch (e) {
    threw = (e as Error).message;
  }
  await cleanup(id);
  check(
    "cashout RELEASE routes to live contract + simulate-skips (no throw, no funds)",
    threw === null,
    threw ? threw.slice(0, 120) : "skipped on revert",
  );
}

// ── Case 2: MUTUAL_RESOLVED → pure skip, no chain interaction, no throw.
{
  const id = caseId();
  await provision(id, "MUTUAL_RESOLVED");
  let threw: string | null = null;
  try {
    await advanceDisputeResolution(id);
  } catch (e) {
    threw = (e as Error).message;
  }
  await cleanup(id);
  check("MUTUAL_RESOLVED skips with no escrow call", threw === null, threw ?? "ok");
}

console.log(`\nDISPUTE_ROUTE_SMOKE_OK=${failures === 0}`);
process.exit(failures === 0 ? 0 : 1);
