// Architectural guard for loop (2026-05-25): production code
// paths (server actions, route handlers, pages, components) MUST NOT
// import `mock*` functions that have a dual-mode repo wrapper. Those
// imports bypass the live Supabase path entirely — exactly the bug iter
// 31 + closed in the lifecycle-reminder cron.
// Allowed:
// - `lib/mockData.ts` itself (the source).
// - `lib/repo/*.ts` files (legitimate fallback wrappers — they ARE
// the dual-mode layer).
// - `test/**/*.ts` (test fixtures).
// Grandfathered: every other file currently in the snapshot. To remove
// a file from this list, route its mock import through `lib/repo/*` so
// it picks up the live path. To add a NEW file with a mock import,
// don't — go through repo. The intentional path is to shrink the
// snapshot, not grow it.

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join, relative } from "node:path";

const APP_ROOT = resolve(__dirname, "..");
const SCAN_ROOTS = ["app", "components"];

// Functions in mockData.ts that have a dual-mode wrapper in `lib/repo/*.ts`.
// Confirmed by `grep -h "return mock" lib/repo/*.ts`. If a new mock function
// gets a repo wrapper, add it here so future production callers fail fast.
const WRAPPED_MOCKS = [
  "mockGetCurrentVendor",
  "mockGetInvoice",
  "mockListInvoices",
  "mockListAllInvoices",
  "mockCreateInvoice",
  "mockGetCashout",
  "mockListCashouts",
  "mockCreateCashout",
  "mockAdvanceCashout",
  "mockGetPrimaryLpForVendor",
  "mockListLpMembershipsForVendor",
];

// Snapshot of currently-grandfathered files . Each entry is a
// path relative to `apps/web/`. Shrink this list when refactoring; do not
// grow it.
const GRANDFATHERED: ReadonlySet<string> = new Set([
  // refactors removed: account/privacy/actions.ts, lp/actions.ts
  // (partial — kept non-wrapped LP mocks), receipt/[hash]/page.tsx,
  // vendor/exports/actions.ts, vendor/financing/page.tsx,
  // vendor/invoices/[id]/screening/page.tsx, vendor/invoices/new/actions.ts.
  // /35 refactors removed earlier — see git log.
  // `app/i/[id]/actions.ts` stays — the simulator-only payment path; switching
  // its mockGetInvoice → repo would silently no-op in live mode because
  // it mutates the in-memory map. Documented inline at the file head.
  "app/i/[id]/actions.ts",
]);

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

describe("no mockX in production paths", () => {
  it("only grandfathered files may import dual-mode mock functions", () => {
    const files: string[] = [];
    for (const root of SCAN_ROOTS) {
      const abs = join(APP_ROOT, root);
      try {
        if (statSync(abs).isDirectory()) files.push(...walk(abs));
      } catch {
        // root may not exist if folder removed; fine — the assertion below
        // catches "no files scanned" via SCAN_ROOTS length.
      }
    }
    expect(files.length).toBeGreaterThan(0);

    // Build a regex that matches `import { ... mockX ... }` for any WRAPPED_MOCKS.
    // Allow word boundaries so mockGetInvoice doesn't match mockGetInvoiceX.
    const namesAlt = WRAPPED_MOCKS.map((n) =>
      n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    ).join("|");
    const importMatcher = new RegExp(`\\b(${namesAlt})\\b`);

    const offenders: string[] = [];
    const reachable: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      // Only look at import lines + identifier references in source code
      // (not comment-only mentions like the cron docs).
      const codeOnly = src
        .split(/\r?\n/)
        .filter((l) => {
          const t = l.trim();
          return (
            !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*")
          );
        })
        .join("\n");
      if (!importMatcher.test(codeOnly)) continue;
      // Strip URL-transparent route-group segments (e.g. `(wallet)`) so the
      // GRANDFATHERED snapshot keys on the stable logical path, not the
      // route-group layout (app/(wallet)/i/[id]/actions.ts → app/i/...).
      const rel = relative(APP_ROOT, f)
        .replace(/\\/g, "/")
        .replace(/\/\([^/]+\)/g, "");
      reachable.push(rel);
      if (!GRANDFATHERED.has(rel)) offenders.push(rel);
    }

    // Surface "shrinkage opportunity": files in GRANDFATHERED that no
    // longer use any mock should be removed from the list.
    const stillGrandfathered = new Set(reachable);
    const obsolete = [...GRANDFATHERED].filter(
      (f) => !stillGrandfathered.has(f),
    );

    expect(
      offenders,
      `New file imports a dual-mode mock function. Route through lib/repo/* instead:\n${offenders.join("\n")}`,
    ).toEqual([]);

    expect(
      obsolete,
      `These files no longer use any dual-mode mock — remove them from GRANDFATHERED in this test:\n${obsolete.join("\n")}`,
    ).toEqual([]);
  });
});
