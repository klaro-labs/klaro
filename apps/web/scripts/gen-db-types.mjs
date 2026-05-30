// Post-process lib/database.types.ts: type the numeric MONEY columns as `string`.
//
// Two-step regeneration (run from apps/web):
//   1. Generate raw types from the LIVE schema via the Supavisor session pooler
//      (the direct db host no longer resolves). Build the URL with the password
//      from root .env.local — keep it out of shell history:
//        DBURL="postgresql://postgres.vweremdzsrsdbyfbzffj:$PWD@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres"
//        npx --yes supabase@latest gen types typescript --db-url "$DBURL" --schema public > lib/database.types.ts
//   2. node scripts/gen-db-types.mjs   # applies the money-column override below
//
// Why the override: `supabase gen types` maps Postgres `numeric` to `number`,
// but PostgREST returns numeric columns as precision-preserving STRINGS at
// runtime, and the repo layer reads them with `BigInt(...)` / writes them with
// `.toString()`. Typing the money columns as `string` makes the generated types
// match runtime + the code, and avoids ever coercing 6-decimal USDC / paise
// amounts through a lossy JS `number`. This script is pure (no shell, no
// secrets) so it's safe to commit + re-run after every regeneration.
//
// Add a column here whenever a new numeric money column is read/written as a
// string in the repo layer.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const MONEY_COLUMNS = [
  "amount_usdc",
  "usdc_amount",
  "payout_minor",
  "klaro_fee_usdc",
  "lp_spread_usdc",
  "quote_rate",
];

const file = path.resolve("lib/database.types.ts");
let out = readFileSync(file, "utf8");
if (!out.includes("export type Database")) {
  console.error(
    "lib/database.types.ts missing `export type Database` — run the gen step (1) first",
  );
  process.exit(2);
}

// `${col}: number` also matches the nullable `: number | null` form (it's a
// prefix); the optional `?:` form is replaced separately. No-op if a column is
// already `string` (idempotent — safe to re-run).
let overridden = 0;
for (const col of MONEY_COLUMNS) {
  const before = out;
  out = out
    .split(`${col}: number`)
    .join(`${col}: string`)
    .split(`${col}?: number`)
    .join(`${col}?: string`);
  if (out !== before) overridden++;
}

writeFileSync(file, out);
console.error(
  `money override applied to ${overridden}/${MONEY_COLUMNS.length} columns`,
);
