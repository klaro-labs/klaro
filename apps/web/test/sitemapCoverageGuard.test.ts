// Architectural guard for loop (2026-05-25): every public route
// (any `page.tsx` under `app/` that isn't a vendor/admin/lp/account/
// dynamic-param page) must appear in `app/sitemap.ts`. caught
// `/x402-demo` missing — a public developer demo that was discoverable
// from /developers but invisible to crawlers.
// Excluded paths (intentional):
// - Authed surfaces (vendor/admin/internal/lp/account) — not for crawlers
// - Dynamic-param pages ([id], [hash], etc.) — listed by parent index
// - /offline — PWA fallback rendered only when service worker hits offline
// - /receipt/[hash] — public but enumerable only via shared links

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join, relative, sep } from "node:path";

const APP_DIR = resolve(__dirname, "..", "app");
const SITEMAP_PATH = resolve(__dirname, "..", "app", "sitemap.ts");

const EXCLUDED_DIRS = [
  "vendor",
  "admin",
  "internal",
  "lp",
  "account",
  "api",
  "i",
  "receipt",
];

// Pages that ARE public but intentionally excluded from sitemap.
const ALLOWED_NO_INDEX = new Set<string>([
  "/offline", // service-worker fallback; not user-discoverable
]);

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const s = statSync(p);
    if (s.isDirectory()) out.push(...walk(p));
    else if (entry === "page.tsx") out.push(p);
  }
  return out;
}

function pageToRoute(abs: string): string {
  const rel = relative(APP_DIR, abs).split(sep).slice(0, -1).join("/");
  return rel === "" ? "" : "/" + rel;
}

describe("sitemap coverage guard", () => {
  it("every public route in app/ appears in sitemap.ts (or is on the allowlist)", () => {
    const sitemapSrc = readFileSync(SITEMAP_PATH, "utf8");
    const listed = new Set<string>();
    for (const m of sitemapSrc.matchAll(/path:\s*"([^"]*)"/g)) listed.add(m[1]);

    const pages = walk(APP_DIR);
    const publicRoutes = pages.map(pageToRoute).filter((r) => {
      if (r === "") return true; // root
      const first = r.split("/")[1] ?? "";
      if (EXCLUDED_DIRS.includes(first)) return false;
      if (r.includes("[")) return false;
      return true;
    });

    const missing = publicRoutes.filter(
      (r) => !listed.has(r) && !ALLOWED_NO_INDEX.has(r),
    );
    expect(
      missing,
      `public routes missing from app/sitemap.ts:\n${missing.join("\n")}\nEither add them to ROUTES or put them in ALLOWED_NO_INDEX with a reason.`,
    ).toEqual([]);
  });

  it("every route in sitemap.ts has a corresponding page.tsx", () => {
    const sitemapSrc = readFileSync(SITEMAP_PATH, "utf8");
    const listed: string[] = [];
    for (const m of sitemapSrc.matchAll(/path:\s*"([^"]*)"/g))
      listed.push(m[1]);

    const pages = new Set(walk(APP_DIR).map(pageToRoute));
    const dangling = listed.filter((r) => !pages.has(r));
    expect(
      dangling,
      `routes in app/sitemap.ts but no page.tsx exists:\n${dangling.join("\n")}`,
    ).toEqual([]);
  });
});
