// Architectural guard for loop iters 23–25 (2026-05-25): the public-facing
// surfaces — `/receipt/[hash]` and `/api/v1/{invoices,receipts}/*` — must
// not render or return the buyer's `customer.name` / `customer.email`.
// Three live PII leaks were caught and fixed over this run: the public
// invoice GET, the public receipt page (mobile + desktop variants).
// A future contributor adding a `<Row k="Customer" v={inv.customer.name}/>`
// to either surface would silently leak buyer PII on a URL that's literally
// labeled "Anyone can verify". This grep-style test fails fast in that case.
// To intentionally bypass (e.g. a vendor-only authenticated subpath inside
// these directories), document the exemption in the test below.

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";

const PUBLIC_SURFACE_ROOTS = [
  "app/receipt",
  "app/api/v1/invoices/[id]",
  "app/api/v1/receipts",
];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const s = statSync(p);
    if (s.isDirectory()) out.push(...walk(p));
    else if (/\.(ts|tsx)$/.test(p)) out.push(p);
  }
  return out;
}

// Lines that are PERMITTED to mention customer.email/customer.name —
// each entry must be a comment, type import, or other non-render context.
const ALLOWED_SUBSTRINGS = [
  "// ", // any comment line
  "* ", // jsdoc continuation
  "/*", // block comment opener
  "*/", // block comment closer
  "import", // type-only import lines
];

function isAllowed(line: string): boolean {
  const trimmed = line.trim();
  return ALLOWED_SUBSTRINGS.some((s) => trimmed.startsWith(s));
}

describe("public surfaces — no buyer PII", () => {
  it("never reads customer.email or customer.name on public routes", async () => {
    const root = resolve(__dirname, "..");
    const files: string[] = [];
    for (const rel of PUBLIC_SURFACE_ROOTS) {
      const abs = join(root, rel);
      try {
        const s = statSync(abs);
        if (s.isDirectory()) files.push(...walk(abs));
        else files.push(abs);
      } catch {
        // path may not exist if a route is removed; that's fine — the
        // assertion below catches the "no files found" case.
      }
    }
    expect(files.length).toBeGreaterThan(0);

    const offenders: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      src.split(/\r?\n/).forEach((line, i) => {
        if (!/customer\s*\.\s*(email|name)/.test(line)) return;
        if (isAllowed(line)) return;
        offenders.push(`${f}:${i + 1} → ${line.trim()}`);
      });
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });
});
