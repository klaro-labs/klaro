// Architectural guard for loop (2026-05-25): every env var
// declared in `lib/env.ts` must appear in `.env.example`. The
// failure mode happened because docs (HUMAN_ACTIONS) referenced vars the
// code didn't consume. The inverse failure — code consumes vars that
// .env.example doesn't document — is exactly as bad: new contributors
// have no clue what to set.
// This guard scans both directions: missing-from-example AND extras-in-
// example-but-not-in-code (would be dead documentation).

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ENV_TS_PATH = resolve(__dirname, "..", "lib", "env.ts");
const ENV_EXAMPLE_PATH = resolve(__dirname, "..", ".env.example");
// also scan auth.ts for direct `process.env.X` reads that bypass
// env.ts (e.g. `KLARO_ALLOW_MOCK_AUTH` — a deliberately-bypass-the-typed-env
// escape hatch documented inline). Extend if more direct readers appear.
const AUTH_TS_PATH = resolve(__dirname, "..", "lib", "auth.ts");

// Vars consumed via `opt("X")`, `required("X")`, or direct `process.env.X`.
// Catches all three patterns the env.ts file uses today. The opt/required
// match is closing-paren agnostic — prettier breaks long calls across
// multiple lines (`opt(\n "X",\n)`), so we match just the opening `(`
// + optional whitespace + quoted name.
const ENV_REF_RE =
  /(?:opt|required)\(\s*"([A-Z][A-Z0-9_]+)"|process\.env\.([A-Z][A-Z0-9_]+)/g;

// Vars listed on a LHS in the .env.example (matches `FOO=...` lines).
const EXAMPLE_KEY_RE = /^([A-Z][A-Z0-9_]+)\s*=/gm;

// Allowed to appear in code but NOT in .env.example (and vice versa).
// Use sparingly + document why.
const EXEMPT = new Set<string>([
  // NODE_ENV is set by Next/the runtime, not Klaro env config.
  "NODE_ENV",
  // X is a single-letter false-positive captured by the loose regex
  // (e.g. `process.env.X402_ENABLED` could split on the regex variant).
  "X",
]);

describe("env.ts ↔ .env.example drift guard", () => {
  it("every env var consumed by env.ts appears in .env.example", () => {
    const tsSrc =
      readFileSync(ENV_TS_PATH, "utf8") +
      "\n" +
      readFileSync(AUTH_TS_PATH, "utf8");
    const exampleSrc = readFileSync(ENV_EXAMPLE_PATH, "utf8");

    const consumed = new Set<string>();
    for (const m of tsSrc.matchAll(ENV_REF_RE)) {
      const name = m[1] ?? m[2];
      if (name && !EXEMPT.has(name)) consumed.add(name);
    }

    const documented = new Set<string>();
    for (const m of exampleSrc.matchAll(EXAMPLE_KEY_RE)) {
      documented.add(m[1]);
    }

    const missing = [...consumed].filter((v) => !documented.has(v));
    expect(
      missing,
      `env vars consumed by lib/env.ts but missing from .env.example:\n${missing.join("\n")}`,
    ).toEqual([]);
  });

  it("every var in .env.example is consumed by lib/env.ts (no dead docs)", () => {
    const tsSrc =
      readFileSync(ENV_TS_PATH, "utf8") +
      "\n" +
      readFileSync(AUTH_TS_PATH, "utf8");
    const exampleSrc = readFileSync(ENV_EXAMPLE_PATH, "utf8");

    const consumed = new Set<string>();
    for (const m of tsSrc.matchAll(ENV_REF_RE)) {
      const name = m[1] ?? m[2];
      if (name && !EXEMPT.has(name)) consumed.add(name);
    }

    const documented = new Set<string>();
    for (const m of exampleSrc.matchAll(EXAMPLE_KEY_RE)) {
      documented.add(m[1]);
    }

    const extras = [...documented].filter((v) => !consumed.has(v));
    expect(
      extras,
      `vars in .env.example that no env.ts reference consumes (dead docs):\n${extras.join("\n")}`,
    ).toEqual([]);
  });
});
