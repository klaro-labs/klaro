#!/usr/bin/env node
/**
 * Sync `abis/v1.0/<Contract>.json` from fresh `forge build` output.
 *
 * Audit fix 2026-05-25 P0-4: hand-maintained ABIs in `apps/web/lib/`
 * drifted from contract sources (missing `splitsHash` in InvoiceEscrow.getInvoice
 * → web app would have decoded `status` from the wrong slot). This script
 * is the single source-of-truth pipeline: run `pnpm --filter @klaro/contracts sync-abis`
 * after touching any .sol file. CI calls it post-test and fails on uncommitted diff.
 */
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const here       = dirname(fileURLToPath(import.meta.url));
const pkgRoot    = join(here, "..");
const outDir     = join(pkgRoot, "out");
const targetDir  = join(pkgRoot, "abis", "v1.0");

// Subset of compiled contracts we publish. Test mocks, libs, interfaces excluded.
const PUBLISHED = [
  "AgentBudgetWallet", "AgentEscrow", "AgentRegistry", "AuditReceipt",
  "CashoutOrderProcessor", "CounterpartyRegistry", "DisputeManager", "FeeSplitter",
  "InvoiceEscrow", "LPRegistry", "LPStaking", "MultiChainRouter", "PrivacyVeil",
  "ProofRegistry", "RefundProtocol", "ReputationManager", "RetainerStream",
  "RoutePolicyEngine", "StableFXAdapterRegistry", "VendorReputation",
];

function ensureForgeBuild() {
  if (existsSync(outDir)) return;
  console.log("[sync-abis] out/ missing, running forge build…");
  const r = spawnSync("forge", ["build"], { cwd: pkgRoot, stdio: "inherit" });
  if (r.status !== 0) throw new Error(`forge build failed (${r.status})`);
}

async function readForgeArtifact(contract) {
  // forge layout: out/<File>.sol/<Contract>.json
  const fileDir = join(outDir, `${contract}.sol`);
  if (!existsSync(fileDir)) {
    throw new Error(`No forge artifact dir for ${contract} (looked in ${fileDir}). ` +
      `Contract name must match the .sol filename, or this contract may have been removed.`);
  }
  const raw = await readFile(join(fileDir, `${contract}.json`), "utf8");
  return JSON.parse(raw);
}

async function syncOne(contract) {
  const art = await readForgeArtifact(contract);
  const payload = {
    contractName: contract,
    version: "v1.0",
    abi: art.abi,
  };
  const dest = join(targetDir, `${contract}.json`);
  // Stable JSON formatting so git diff stays clean across machines.
  await writeFile(dest, JSON.stringify(payload, null, 2) + "\n", "utf8");
  return dest;
}

(async () => {
  ensureForgeBuild();
  await mkdir(targetDir, { recursive: true });

  // Sanity-check: warn if forge produced an artifact for a contract we don't
  // ship, so reviewers explicitly decide whether to publish or exclude.
  const allArtifacts = (await readdir(outDir)).filter(f => f.endsWith(".sol"));
  const knownSet = new Set(PUBLISHED.map(c => `${c}.sol`));
  const extras = allArtifacts.filter(f => !knownSet.has(f) &&
    !f.includes("Mock") && !f.includes("Test") && !f.startsWith("I") && !f.startsWith("ReasonCodes"));
  if (extras.length) {
    console.log("[sync-abis] note — extra .sol artifacts not in PUBLISHED list:", extras.join(", "));
  }

  for (const c of PUBLISHED) {
    const dest = await syncOne(c);
    console.log(`[sync-abis] wrote ${basename(dest)}`);
  }
  console.log(`[sync-abis] ${PUBLISHED.length} ABIs synced → ${targetDir}`);
})().catch(err => { console.error(err); process.exit(1); });
