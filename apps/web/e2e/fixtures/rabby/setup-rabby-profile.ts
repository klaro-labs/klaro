/**
 * One-shot setup that imports the vendor private key into Rabby's persistent
 * profile. Run once after fetch-rabby.sh has populated `ext/`.
 *
 * Usage from apps/web:
 *   pnpm exec tsx e2e/fixtures/rabby/setup-rabby-profile.ts
 *
 * Reads `PRIVATE_KEY` from packages/contracts/.env (the vendor wallet
 * `0xAD578…`). Never prints the key.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { setupRabbyProfile } from "./rabby-driver.js";

const contractsEnvPath = path.resolve(
  process.cwd(),
  "../../packages/contracts/.env",
);

let raw: string;
try {
  raw = readFileSync(contractsEnvPath, "utf8");
} catch (e) {
  console.error("[setup] cannot read", contractsEnvPath);
  console.error("[setup] run from apps/web dir");
  process.exit(2);
}

const pkMatch = raw.match(/^PRIVATE_KEY=(0x[0-9a-fA-F]{64})\s*$/m);
if (!pkMatch) {
  console.error("[setup] PRIVATE_KEY not found in", contractsEnvPath);
  process.exit(3);
}

console.log("[setup] starting Rabby import for vendor wallet (key not printed)...");
await setupRabbyProfile(pkMatch[1]);
console.log("[setup] done. Profile at apps/web/e2e/.rabby-profile/");
process.exit(0);
