// Apply one or more SQL migration files to the live Supabase Postgres via the
// Supavisor pooler. The legacy direct host (db.<ref>.supabase.co) no longer
// resolves (Supabase dropped IPv4 direct); this project lives on the
// aws-1-ap-northeast-1 pooler. Migrations here are written idempotent
// (create ... if not exists / create or replace / add column if not exists),
// so re-running is safe and re-syncs with `supabase db push` later.
//
// Usage (from apps/web): node scripts/db-apply.mjs supabase/migrations/0027_payment_links.sql [more.sql ...]
import { readFileSync } from "node:fs";
import path from "node:path";
import pkg from "pg";
const { Client } = pkg;

function env(f) { const o = {}; for (const l of readFileSync(f, "utf8").split(/\r?\n/)) { if (!l || l.startsWith("#")) continue; const i = l.indexOf("="); if (i < 0) continue; o[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^"|"$/g, ""); } return o; }

const root = env(path.resolve("../../.env.local"));
const REF = "vweremdzsrsdbyfbzffj";
const HOST = process.env.SUPABASE_POOLER_HOST || "aws-1-ap-northeast-1.pooler.supabase.com";
let pwd = root.SUPABASE_DB_PASSWORD;
if (!pwd && root.SUPABASE_DB_URL) { const m = root.SUPABASE_DB_URL.match(/:\/\/[^:]+:([^@]+)@/); if (m) pwd = decodeURIComponent(m[1]); }
if (!pwd) { console.error("no DB password (set SUPABASE_DB_PASSWORD in root .env.local)"); process.exit(2); }

const files = process.argv.slice(2);
if (files.length === 0) { console.error("usage: node scripts/db-apply.mjs <file.sql> [...]"); process.exit(2); }

const url = `postgresql://postgres.${REF}:${encodeURIComponent(pwd)}@${HOST}:5432/postgres`;
// Verify TLS — never disable verification (MITM on the DB password). Supabase's
// pooler uses a private CA, so system-CA verification fails with
// SELF_SIGNED_CERT_IN_CHAIN. Provide Supabase's CA cert (download from the
// dashboard → Project Settings → Database → SSL certificate) and point
// PGSSLROOTCERT at it, e.g.:
//   PGSSLROOTCERT=./scripts/supabase-ca.pem node scripts/db-apply.mjs <file.sql>
// Without it, the script fails closed rather than silently trusting any cert.
const caPath = process.env.PGSSLROOTCERT;
const ssl = caPath
  ? { ca: readFileSync(path.resolve(caPath), "utf8"), rejectUnauthorized: true }
  : { rejectUnauthorized: true };
const client = new Client({ connectionString: url, ssl, connectionTimeoutMillis: 15000 });
await client.connect();
console.log("connected:", HOST);
for (const f of files) {
  const sql = readFileSync(path.resolve(f), "utf8");
  console.log("applying", path.basename(f), "...");
  await client.query(sql);
  console.log("  OK");
}
await client.end();
console.log("DONE");
