/**
 * Deployment preflight. Two layers, because "what must be true to START" and
 * "what should be true to DEPLOY" are different moments with different risk:
 *
 *  - bootConfigIssues() — PURE, no network. The daemon env schema declares the
 *    contract addresses + operator signer as optional (dev/simulator runs with
 *    none). That means PRODUCTION can boot with the money workers silently
 *    no-op'ing — flipping DB rows to SETTLED/RELEASED while never signing a
 *    chain tx. This gate makes prod refuse to start unless the money-critical
 *    config is present. Deterministic + instant → safe to run at every boot
 *    (can't flap a restart into CrashLoopBackOff).
 *
 *  - runPreflight() — ACTIVE network probes (RPC chain-id, contract bytecode,
 *    operator gas, Redis, Supabase). Run by a human / CLI before a deploy
 *    (`pnpm preflight`). A NO-GO here is informational, so it's free to do the
 *    round-trips the boot gate must avoid.
 *
 * Read-only throughout — sends no transaction, writes no row.
 */
import { arcTestnet } from "viem/chains";
import { env, IS_PROD } from "./env.js";
import { arcPublic, arcWallet } from "./arc.js";
import { redis } from "./redis.js";
import { sb } from "./db.js";
import { log } from "./log.js";

/** Money-critical contract addresses. If ANY worker that signs against these is
 * enabled, the address must be pinned in prod or that worker is a silent no-op. */
const REQUIRED_CONTRACTS_IN_PROD = [
  "INVOICE_ESCROW_ADDRESS",
  "CASHOUT_ORDER_PROCESSOR_ADDRESS",
  "AGENT_ESCROW_ADDRESS",
  "DISPUTE_MANAGER_ADDRESS",
] as const;

/** All pinned contract addresses we can verify are actually deployed. */
const ALL_CONTRACT_ENVS = [
  "INVOICE_ESCROW_ADDRESS",
  "AUDIT_RECEIPT_ADDRESS",
  "CASHOUT_ORDER_PROCESSOR_ADDRESS",
  "AGENT_ESCROW_ADDRESS",
  "RETAINER_STREAM_ADDRESS",
  "DISPUTE_MANAGER_ADDRESS",
] as const;

/**
 * PURE config gate — no network. Returns the list of production blockers (empty
 * = ok to boot). In non-prod always returns [] (simulator mode is allowed to run
 * without contracts / signer). Exported so boot() can fail-fast and tests can
 * pin the contract.
 */
export function bootConfigIssues(
  e: Record<string, string | undefined> = env as unknown as Record<
    string,
    string | undefined
  >,
  isProd = IS_PROD,
): string[] {
  if (!isProd) return [];
  const issues: string[] = [];

  for (const key of REQUIRED_CONTRACTS_IN_PROD) {
    if (!e[key])
      issues.push(
        `${key} is required in production (money worker would no-op)`,
      );
  }
  // A signer of either kind must exist or every signing worker throws at runtime.
  if (!e.DAEMON_OPERATOR_PRIVATE_KEY && !e.DAEMON_OPERATOR_WALLET_ID) {
    issues.push(
      "no operator signer: set DAEMON_OPERATOR_PRIVATE_KEY or DAEMON_OPERATOR_WALLET_ID",
    );
  }
  // Webhook deliveries are HMAC-signed; an unset secret ships unsigned payloads.
  if (!e.WEBHOOK_HMAC_SECRET) {
    issues.push(
      "WEBHOOK_HMAC_SECRET is required in production (webhooks would ship unsigned)",
    );
  }
  return issues;
}

/** Throw (→ process exit at boot) if the prod config gate fails. No-op otherwise. */
export function assertBootConfig(): void {
  const issues = bootConfigIssues();
  if (issues.length === 0) return;
  log.error("preflight.boot_config_failed", { issues });
  throw new Error(
    `daemon boot config invalid (production):\n  - ${issues.join("\n  - ")}`,
  );
}

export type CheckStatus = "pass" | "warn" | "fail";
export interface Check {
  label: string;
  status: CheckStatus;
  detail?: string;
}

const ZERO = "0x0000000000000000000000000000000000000000";

/**
 * Full active preflight. Probes the live wiring and returns a GO / NO-GO report.
 * `ok` is false iff any check is `fail` (warns don't block). Never throws on a
 * probe failure — a dead dependency becomes a `fail` check, not an exception.
 */
export async function runPreflight(): Promise<{
  ok: boolean;
  checks: Check[];
}> {
  const checks: Check[] = [];
  const add = (label: string, status: CheckStatus, detail?: string) =>
    checks.push({ label, status, detail });

  // 1. Config gate (only bites in prod).
  const cfg = bootConfigIssues();
  if (cfg.length) for (const i of cfg) add(`config: ${i}`, "fail");
  else
    add(
      "config: prod money-critical envs present",
      "pass",
      IS_PROD ? "prod" : "non-prod (skipped)",
    );

  // 2. RPC reachable + correct chain.
  const pub = arcPublic();
  let chainOk = false;
  try {
    const chainId = await pub.getChainId();
    chainOk = chainId === arcTestnet.id;
    add(
      "rpc: reachable + Arc testnet chain id",
      chainOk ? "pass" : "fail",
      `got ${chainId}, expected ${arcTestnet.id}`,
    );
  } catch (e) {
    add("rpc: reachable", "fail", (e as Error).message);
  }

  // 3. Each pinned contract address actually has bytecode (is deployed). A
  //    set-but-undeployed address (typo / wrong network) is the classic silent
  //    money-loss footgun. Skipped if the RPC is down (would just error-spam).
  if (chainOk) {
    for (const key of ALL_CONTRACT_ENVS) {
      const addr = (env as unknown as Record<string, string | undefined>)[key];
      if (!addr) {
        add(
          `contract: ${key}`,
          IS_PROD &&
            (REQUIRED_CONTRACTS_IN_PROD as readonly string[]).includes(key)
            ? "fail"
            : "warn",
          "unset",
        );
        continue;
      }
      if (addr.toLowerCase() === ZERO) {
        add(`contract: ${key}`, "fail", "zero address");
        continue;
      }
      try {
        const code = await pub.getCode({ address: addr as `0x${string}` });
        const deployed = !!code && code !== "0x";
        add(
          `contract: ${key} deployed`,
          deployed ? "pass" : "fail",
          deployed ? addr : `${addr} has no bytecode`,
        );
      } catch (e) {
        add(`contract: ${key} deployed`, "fail", (e as Error).message);
      }
    }
  }

  // 4. Operator wallet derivable + funded for gas (Arc pays gas in USDC).
  if (chainOk) {
    const w = arcWallet();
    if (!w?.account) {
      add(
        "operator: signer wallet",
        env.DAEMON_OPERATOR_WALLET_ID ? "warn" : IS_PROD ? "fail" : "warn",
        env.DAEMON_OPERATOR_WALLET_ID
          ? "Circle Wallets mode (signer not wired)"
          : "no private key",
      );
    } else {
      try {
        const bal = await pub.getBalance({ address: w.account.address });
        add(
          "operator: has gas balance",
          bal > 0n ? "pass" : IS_PROD ? "fail" : "warn",
          `${w.account.address} = ${bal} (native, gas paid in USDC on Arc)`,
        );
      } catch (e) {
        add("operator: balance read", "fail", (e as Error).message);
      }
    }
  }

  // 5. Redis reachable (BullMQ + idempotency depend on it).
  try {
    const pong = await redis().ping();
    add("redis: reachable", pong === "PONG" ? "pass" : "fail", pong);
  } catch (e) {
    add("redis: reachable", "fail", (e as Error).message);
  }

  // 6. Supabase reachable (cheap head count against a table every deploy has).
  try {
    const { error } = await sb()
      .from("vendors")
      .select("id", { count: "exact", head: true });
    add("supabase: reachable", error ? "fail" : "pass", error?.message);
  } catch (e) {
    add("supabase: reachable", "fail", (e as Error).message);
  }

  const ok = checks.every((c) => c.status !== "fail");
  return { ok, checks };
}

/** Render a report to stdout. */
function printReport(result: { ok: boolean; checks: Check[] }): void {
  console.log("\n=== Klaro daemon deployment preflight ===");
  console.log(`mode: ${IS_PROD ? "production" : env.NODE_ENV}\n`);
  for (const c of result.checks) {
    const tag =
      c.status === "pass" ? "PASS" : c.status === "warn" ? "WARN" : "FAIL";
    console.log(`${tag}  ${c.label}${c.detail ? `  [${c.detail}]` : ""}`);
  }
  console.log(
    `\n${result.ok ? "GO — preflight passed (warnings are non-blocking)." : "NO-GO — fix the FAILs above before deploying."}`,
  );
}

// CLI entry: `pnpm preflight` (tsx src/preflight.ts). Runs the full active set
// and exits non-zero on any FAIL so CI / a deploy script can gate on it.
const invokedDirectly =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  /preflight(\.ts|\.js)?$/.test(process.argv[1] ?? "");
if (invokedDirectly) {
  runPreflight()
    .then((result) => {
      printReport(result);
      process.exit(result.ok ? 0 : 1);
    })
    .catch((e) => {
      console.error("preflight crashed:", (e as Error).message);
      process.exit(1);
    });
}
