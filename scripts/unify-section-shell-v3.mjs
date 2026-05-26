#!/usr/bin/env node
// Third pass: tighten the standard section py to match the reference's
// vertical rhythm. Cards in many sections are shorter than the reference's
// equivalent, so the same 160px clamp creates dead viewports.

import { readFileSync, writeFileSync } from "node:fs";
import { globSync } from "node:fs";

const PATTERNS = [
  // The standard section clamp set by v1 unifier.
  [/py-\[clamp\(80px,12vw,160px\)\]/g, "py-[clamp(64px,9vw,120px)]"],
];

const files = [
  ...globSync("apps/web/components/klaro/sections/*.tsx", { dot: false }),
  "apps/web/components/klaro/Hero.tsx",
];
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
