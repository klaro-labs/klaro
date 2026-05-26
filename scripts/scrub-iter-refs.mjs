#!/usr/bin/env node
// Scrub iteration / audit-loop references from source comments. Replaces the
// "WHEN/WHO added this" phrases — the remaining comment still explains WHY.
//
// Line-aware: only touches a line if it is a pure comment line
// (// ..., /// ..., -- ..., or sits inside a /* ... */ or /** ... */ block).
// Code lines are left exactly as written. Trailing-comment scrubs only
// modify the comment tail, never the code preceding it.
//
// Usage:
//   node scripts/scrub-iter-refs.mjs [--dry-run] <glob1> [glob2] ...

import { readFileSync, writeFileSync } from "node:fs";
import { globSync } from "node:fs";
import { argv } from "node:process";

const args = argv.slice(2);
const dryRun = args.includes("--dry-run");
const patterns = args.filter((a) => a !== "--dry-run");

if (patterns.length === 0) {
  console.error("usage: node scrub-iter-refs.mjs [--dry-run] <glob1> [glob2] ...");
  process.exit(1);
}

// Replacements applied to the COMMENT-text portion of a line.
// Order matters — longer/more-specific first.
const COMMENT_RULES = [
  [/Audit fix \(loop iter \d+,\s*\d{4}-\d{2}-\d{2}\):\s*/gi, ""],
  [/Audit fix \d{4}-\d{2}-\d{2}(?:\s+P\d+-\d+)?(?:\s+wiring)?:?\s*/gi, ""],
  [/Audit fix loop iter \d+\.?\s*/gi, ""],
  [/Audit finding #\d+(?:\s*\(\d{4}-\d{2}-\d{2}\))?(?:\s+wiring)?:?\s*/gi, ""],
  [/\(loop iter \d+,\s*\d{4}-\d{2}-\d{2}\)\s*/gi, ""],
  [/\(iter[- ]\d+(?:,\s*\d{4}-\d{2}-\d{2})?\)\s*/gi, ""],
  [/\bIter \d+(?:\s+[A-Z]\d+-?\d*)?(?:\s+(?:fix|finding))?(?:\s*\(P\d+\))?:?\s*/g, ""],
  [/\biter[- ]\d+(?:\s+[A-Z]\d+-?\d*)?\b/g, ""],
  [/\bLoop iter \d+\b/gi, ""],
  [/\bper v2 §[\d.A-Z]+/gi, ""],
  [/\b[Pp]rinciple \d+\b/g, ""],
  [/\(original\s+AUDIT\s+P\d+\s+[^)]*\)/gi, ""],
  // Collapse leftover double-spaces and trim — comment-text only.
  [/  +/g, " "],
  [/^\s+/, ""],
  [/\s+$/, ""],
];

function scrubFile(file) {
  const before = readFileSync(file, "utf8");
  const lines = before.split(/\r?\n/);

  let inBlockComment = false;
  const out = [];

  for (let raw of lines) {
    let line = raw;

    // Detect block-comment boundaries.
    let lineStartsInBlock = inBlockComment;
    if (!inBlockComment && /\/\*/.test(line) && !/\/\*.*\*\//.test(line)) {
      inBlockComment = true;
    } else if (inBlockComment && /\*\//.test(line)) {
      inBlockComment = false;
    }

    // Match a pure line comment ("//", "///", "--", or " * " inside a block).
    // Pattern groups: (leadingWS)(commentMarker)(spaceAfter)(text)
    let m =
      line.match(/^(\s*)(\/\/\/?|--)(\s?)(.*)$/) ||
      (lineStartsInBlock ? line.match(/^(\s*)(\*)(\s?)(.*)$/) : null);

    if (m) {
      const [, lead, marker, sep, text] = m;
      let cleaned = text;
      for (const [re, rep] of COMMENT_RULES) cleaned = cleaned.replace(re, rep);
      if (cleaned.trim() === "") {
        // Drop the line entirely — empty comment shell, no value to readers.
        continue;
      }
      out.push(`${lead}${marker}${sep}${cleaned}`);
      continue;
    }

    // Code line with a trailing // comment — scrub only the comment tail.
    const trailing = line.match(/^(.*?)(\s*\/\/+\s?)(.*)$/);
    if (trailing) {
      const [, code, sep, tail] = trailing;
      // Be conservative: don't touch URLs ('//' in 'http://').
      if (!/:\/\/$/.test(code.replace(/\s+$/, ""))) {
        let cleaned = tail;
        for (const [re, rep] of COMMENT_RULES) cleaned = cleaned.replace(re, rep);
        if (cleaned.trim() === "") {
          // Comment fully removed — drop the comment but keep the code.
          out.push(code.replace(/\s+$/, ""));
          continue;
        }
        out.push(`${code}${sep}${cleaned}`);
        continue;
      }
    }

    // Plain code line — leave untouched.
    out.push(line);
  }

  // Drop runs of blank lines down to a single blank.
  const collapsed = [];
  let lastBlank = false;
  for (const l of out) {
    const blank = l.trim() === "";
    if (blank && lastBlank) continue;
    collapsed.push(l);
    lastBlank = blank;
  }
  return { before, after: collapsed.join("\n") };
}

let touched = 0;
let scanned = 0;
for (const pattern of patterns) {
  for (const file of globSync(pattern, { dot: false })) {
    scanned++;
    const { before, after } = scrubFile(file);
    if (after !== before) {
      touched++;
      if (dryRun) console.log(`[dry] would change ${file}`);
      else {
        writeFileSync(file, after, "utf8");
        console.log(`[ok] ${file}`);
      }
    }
  }
}

console.log(`\n${dryRun ? "Would change" : "Changed"} ${touched}/${scanned} files.`);
