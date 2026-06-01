/**
 * preflight boot-gate — the PURE, no-network config check that decides whether
 * production is allowed to start. Verifies the gate is a no-op in non-prod
 * (simulator mode may run with no contracts/signer) and that in prod it flags
 * every money-critical omission: missing contract addresses, no operator signer,
 * and an unset webhook HMAC secret.
 */
import { describe, it, expect, vi } from "vitest";

// preflight.ts imports env.js, which calls process.exit(1) at module load when
// the real SUPABASE_* envs are absent (they are, in unit tests). Mock it so the
// import is side-effect-free. bootConfigIssues() takes env as an explicit
// parameter, so these mock values are never read by the assertions below.
vi.mock("../src/env.js", () => ({
  env: { NODE_ENV: "test" },
  IS_PROD: false,
}));
vi.mock("../src/log.js", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { bootConfigIssues } = await import("../src/preflight.js");

const fullProd = {
  INVOICE_ESCROW_ADDRESS: "0x01",
  CASHOUT_ORDER_PROCESSOR_ADDRESS: "0x02",
  AGENT_ESCROW_ADDRESS: "0x03",
  DISPUTE_MANAGER_ADDRESS: "0x04",
  DAEMON_OPERATOR_PRIVATE_KEY: "0xkey",
  WEBHOOK_HMAC_SECRET: "shh",
};

describe("bootConfigIssues", () => {
  it("is a no-op in non-prod regardless of missing config", () => {
    expect(bootConfigIssues({}, false)).toEqual([]);
  });

  it("passes in prod when all money-critical config is present", () => {
    expect(bootConfigIssues(fullProd, true)).toEqual([]);
  });

  it("flags every missing required contract in prod", () => {
    const issues = bootConfigIssues(
      { DAEMON_OPERATOR_PRIVATE_KEY: "0xk", WEBHOOK_HMAC_SECRET: "s" },
      true,
    );
    expect(issues.join("\n")).toMatch(/INVOICE_ESCROW_ADDRESS/);
    expect(issues.join("\n")).toMatch(/CASHOUT_ORDER_PROCESSOR_ADDRESS/);
    expect(issues.join("\n")).toMatch(/AGENT_ESCROW_ADDRESS/);
    expect(issues.join("\n")).toMatch(/DISPUTE_MANAGER_ADDRESS/);
  });

  it("accepts a Circle Wallets id as a valid signer (not only a private key)", () => {
    const issues = bootConfigIssues(
      {
        ...fullProd,
        DAEMON_OPERATOR_PRIVATE_KEY: undefined,
        DAEMON_OPERATOR_WALLET_ID: "wal_1",
      },
      true,
    );
    expect(issues).toEqual([]);
  });

  it("flags a missing signer (neither key nor wallet id)", () => {
    const issues = bootConfigIssues(
      { ...fullProd, DAEMON_OPERATOR_PRIVATE_KEY: undefined },
      true,
    );
    expect(issues.join("\n")).toMatch(/operator signer/);
  });

  it("flags an unset webhook HMAC secret (unsigned deliveries)", () => {
    const issues = bootConfigIssues(
      { ...fullProd, WEBHOOK_HMAC_SECRET: undefined },
      true,
    );
    expect(issues.join("\n")).toMatch(/WEBHOOK_HMAC_SECRET/);
  });
});
