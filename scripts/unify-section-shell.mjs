#!/usr/bin/env node
// One-shot: unify landing section shells to the brand-system spec —
// 1280px max width, clamp horizontal padding, clamp vertical padding, no
// negative-margin offsets. Run once, commit the diff, delete this file.

import { readFileSync, writeFileSync } from "node:fs";
import { globSync } from "node:fs";

const PATTERNS = [
  [/max-w-\[(1200|1216)px\]/g, "max-w-[1280px]"],
  // px-6 inside a className that has a max-w-* token: switch to clamp pad.
  [/(\bmax-w-\[1280px\]\s+[^"]*?\s)px-6\b/g, "$1px-[clamp(20px,4vw,56px)]"],
  // Vertical padding: normalize the common `py-NN md:py-MM` pairs to clamp.
  [/\bpy-(?:20|24|28)\s+md:py-(?:24|28|32|40)\b/g, "py-[clamp(80px,12vw,160px)]"],
  // Lone py-NN at section level when no md:py- override sits next to it.
  // Catch py-20 / py-28 / py-32 / py-40 in the outermost section className.
  [/(\bsection[\s\S]{0,200}?className="[^"]*?)\bpy-(?:20|24|28|32|40)\b/g, (_m, p1) => `${p1}py-[clamp(80px,12vw,160px)]`],
  // Strip negative-margin section-pull hacks (`md:-mt-[Npx]`).
  [/\smd:-mt-\[\d+px\]/g, ""],
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
