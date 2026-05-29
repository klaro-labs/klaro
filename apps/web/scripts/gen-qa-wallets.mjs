/**
 * Generate two throwaway QA test wallets and write to gitignored file.
 * Never prints private keys to stdout — only addresses (public).
 * Run from apps/web: `node scripts/gen-qa-wallets.mjs`
 */
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const TARGET = resolve("e2e/wallets/.env.test-wallets");
if (existsSync(TARGET)) {
  console.error("REFUSE: wallet file already exists at", TARGET);
  console.error("Delete it manually if you really want to regenerate.");
  process.exit(2);
}
mkdirSync(dirname(TARGET), { recursive: true });

const customer = generatePrivateKey();
const lp = generatePrivateKey();
const cust = privateKeyToAccount(customer);
const lpAcc = privateKeyToAccount(lp);

writeFileSync(
  TARGET,
  [
    "# QA test wallets — gitignored. Throwaway testnet only. Sweep back after QA.",
    "",
    `CUSTOMER_TEST_ADDRESS=${cust.address}`,
    `CUSTOMER_TEST_PRIVATE_KEY=${customer}`,
    "",
    `LP_TEST_ADDRESS=${lpAcc.address}`,
    `LP_TEST_PRIVATE_KEY=${lp}`,
    "",
  ].join("\n"),
  { mode: 0o600 },
);

console.log("OK file:", TARGET);
console.log("CUSTOMER:", cust.address);
console.log("LP:      ", lpAcc.address);
