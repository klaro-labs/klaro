#!/usr/bin/env node
// Second pass: strip positive `md:mt-[Npx]` section-pull offsets that the
// first unifier didn't catch (it only caught `md:-mt-` negatives). Also
// normalize lingering `px-6` to clamp horizontal padding now that those
// offsets are gone.

import { readFileSync, writeFileSync } from "node:fs";
import { globSync } from "node:fs";

const PATTERNS = [
  // "md:mt-[26px]" / "md:mt-[657px]" anywhere on a section shell.
  [/\smd:mt-\[\d+px\]/g, ""],
  // px-6 inside a section className that has max-w-[1280px]: switch to clamp.
  // Run after the mt strip so we don't have to match across the now-gone offset.
  [/(\bmax-w-\[1280px\]\s+)px-6\b/g, "$1px-[clamp(20px,4vw,56px)]"],
  // Collapse the doubled `py-[clamp(...)] md:py-[clamp(...)]` shape that the
  // first unifier leaves behind. Same value on both = redundant.
  [/(py-\[clamp\(80px,12vw,160px\)\])\s+md:\1/g, "$1"],
];

const files = globSync("apps/web/components/klaro/sections/*.tsx", { dot: false });
let touched = 0;
for (const f of files) {
  const before = readFileSync(f, "utf8");
  let after = before;
  for (const [re, rep] of PATTERNS) after = after.replace(re, rep);
  if (after !== before) {
    writeFileSync(f, after, "utf8");
    console.log(`[ok] ${f}`);
    touched++;
  }
}
console.log(`Changed ${touched}/${files.length} files.`);
