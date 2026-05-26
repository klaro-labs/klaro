// Architectural guard for loop (2026-05-25): same as 's
// envExampleDriftGuard but for the daemon's zod schema. Daemon's
// `src/env.ts` is a single zod object — every property must appear in
// `apps/daemon/.env.example` and vice versa.
// Lives in apps/web/test/ to keep one canonical vitest runner. The
// daemon doesn't have its own test runner today.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const DAEMON_ENV_TS = resolve(__dirname, "..", "..", "daemon", "src", "env.ts");
const DAEMON_ENV_EXAMPLE = resolve(
  __dirname,
  "..",
  "..",
  "daemon",
  ".env.example",
);

// Match zod schema keys: `KEY: z.something(...)`. Also catches direct
// `process.env.KEY` reads inside the daemon source (none today, but
// future-proofs).
// prettier can break long zod chains across lines (`KEY: z\n
// .string()...`); allow whitespace between `z` and `.`.
const SCHEMA_KEY_RE = /^\s*([A-Z][A-Z0-9_]+)\s*:\s*z\s*\./gm;
const PROCESS_ENV_RE = /process\.env\.([A-Z][A-Z0-9_]+)/g;
const EXAMPLE_KEY_RE = /^([A-Z][A-Z0-9_]+)\s*=/gm;

const EXEMPT = new Set<string>([
  "NODE_ENV", // runtime-set, not Klaro config
  "PORT", // declared in schema but also runtime-defaulted; both files have it
]);

function envSet(re: RegExp, src: string): Set<string> {
  const out = new Set<string>();
  for (const m of src.matchAll(re)) {
    const name = m[1];
    if (name && !EXEMPT.has(name)) out.add(name);
  }
  return out;
}

describe("daemon env.ts ↔ .env.example drift guard", () => {
  it("every var in the daemon's zod schema appears in .env.example", () => {
    const tsSrc = readFileSync(DAEMON_ENV_TS, "utf8");
    const exampleSrc = readFileSync(DAEMON_ENV_EXAMPLE, "utf8");
    const schemaKeys = new Set([
      ...envSet(SCHEMA_KEY_RE, tsSrc),
      ...envSet(PROCESS_ENV_RE, tsSrc),
    ]);
    const documented = envSet(EXAMPLE_KEY_RE, exampleSrc);
    const missing = [...schemaKeys].filter((v) => !documented.has(v));
    expect(
      missing,
      `daemon env vars in zod schema but missing from .env.example:\n${missing.join("\n")}`,
    ).toEqual([]);
  });

  it("every var in daemon's .env.example is in the schema (no dead docs)", () => {
    const tsSrc = readFileSync(DAEMON_ENV_TS, "utf8");
    const exampleSrc = readFileSync(DAEMON_ENV_EXAMPLE, "utf8");
    const schemaKeys = new Set([
      ...envSet(SCHEMA_KEY_RE, tsSrc),
      ...envSet(PROCESS_ENV_RE, tsSrc),
    ]);
    const documented = envSet(EXAMPLE_KEY_RE, exampleSrc);
    const extras = [...documented].filter((v) => !schemaKeys.has(v));
    expect(
      extras,
      `vars in daemon .env.example that no schema entry consumes:\n${extras.join("\n")}`,
    ).toEqual([]);
  });
});
