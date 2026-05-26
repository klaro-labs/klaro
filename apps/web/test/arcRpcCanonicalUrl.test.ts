// Architectural guard for loop (2026-05-25): every place Klaro
// hardcodes the Arc testnet RPC URL must use the canonical value from
// docs.arc.io. caught a real drift: web used
// `rpc.testnet.arc.network` (correct per Arc docs), daemon defaulted to
// `rpc-testnet.arc.io` (wrong — different hostname; would hit nothing).
// Canonical reference: https://docs.arc.io/integrate/infrastructure
// (chain ID 5042002, RPC https://rpc.testnet.arc.network).

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const CANONICAL_RPC = "https://rpc.testnet.arc.network";
const CANONICAL_WSS = "wss://rpc.testnet.arc.network";

// Files where the Arc RPC URL is hardcoded as a default / fallback / allow-list.
// added next.config.mjs because the CSP `connect-src` had the same
// hostname drift as — wrong hostname in security headers silently
// blocks every real Arc RPC call in production.
const FILES = [
  resolve(__dirname, "..", "lib", "env.ts"),
  resolve(__dirname, "..", ".env.example"),
  resolve(__dirname, "..", "next.config.mjs"),
  resolve(__dirname, "..", "..", "daemon", "src", "env.ts"),
  resolve(__dirname, "..", "..", "daemon", ".env.example"),
];

describe("Arc testnet RPC URL — canonical reference (arc-docs MCP verified)", () => {
  it("no file uses the wrong rpc-testnet.arc.io hostname", () => {
    const offenders: string[] = [];
    for (const f of FILES) {
      const src = readFileSync(f, "utf8");
      // Match the wrong hostname in any context except a comment that
      // documents the fix.
      const lines = src.split(/\r?\n/);
      lines.forEach((line, i) => {
        if (!/rpc-testnet\.arc\.io/.test(line)) return;
        // Allow mentions inside comments (the fix comment).
        const trimmed = line.trim();
        if (
          trimmed.startsWith("//") ||
          trimmed.startsWith("*") ||
          trimmed.startsWith("/*")
        )
          return;
        offenders.push(`${f}:${i + 1} → ${line.trim()}`);
      });
    }
    expect(
      offenders,
      `files still using the wrong rpc-testnet.arc.io hostname:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  it("each tracked file references the canonical arc.network hostname at least once", () => {
    // next.config.mjs uses a CSP wildcard (*.arc.network) — so the loose
    // arc.network substring is the right minimum bar across all files.
    const missing: string[] = [];
    for (const f of FILES) {
      const src = readFileSync(f, "utf8");
      if (!src.includes("arc.network")) {
        missing.push(f);
      }
    }
    expect(
      missing,
      `files that should reference arc.network but don't:\n${missing.join("\n")}`,
    ).toEqual([]);
  });
});
