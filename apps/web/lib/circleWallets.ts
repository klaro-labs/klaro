/**
 * Circle Developer-Controlled Wallets (Klaro operator) — server-held key used
 * to call `InvoiceEscrow.settle()` + `recordScreening()`. Node-only: the
 * developer-controlled-wallets SDK pulls in `fs`/`crypto`, so this must never
 * be imported into a client bundle. The browser-side modular/passkey wallet
 * lives in `circleModularWallet.ts`.
 */

import {
  circleOperatorLive,
  CIRCLE_API_KEY,
  CIRCLE_ENTITY_SECRET,
} from "./env";
import type { Hex } from "./types";

export interface OperatorContext {
  /** Klaro's operator wallet address — used in InvoiceEscrow constructor. */
  address: Hex;
  simulated: boolean;
}

/**
 * Initialize the developer-controlled wallet client + return Klaro's
 * operator wallet. In production this wallet is provisioned ONCE via
 * the Circle Console + funded with testnet USDC; we look it up by
 * walletSetId from env.
 */
export async function getOperatorContext(): Promise<OperatorContext> {
  if (!circleOperatorLive()) {
    return {
      address: "0x000000000000000000000000000000000000B2B2" as Hex,
      simulated: true,
    };
  }
  if (!CIRCLE_API_KEY || !CIRCLE_ENTITY_SECRET) {
    throw new Error(
      "circle_operator_creds_missing: CIRCLE_API_KEY + CIRCLE_ENTITY_SECRET required when circleOperatorLive() is true",
    );
  }
  const { initiateDeveloperControlledWalletsClient } = await import(
    "@circle-fin/developer-controlled-wallets"
  );
  const client = initiateDeveloperControlledWalletsClient({
    apiKey: CIRCLE_API_KEY,
    entitySecret: CIRCLE_ENTITY_SECRET,
  });
  // We expect ONE wallet set named "klaro-operator" with a single Arc-testnet
  // wallet. List + pick first match.
  const wallets = await client.listWallets({ blockchain: "ARC-TESTNET" });
  const addr = wallets.data?.wallets?.[0]?.address as Hex | undefined;
  if (!addr) {
    throw new Error(
      "No Arc-testnet wallet found for the developer-controlled entity. " +
        "Create one via Circle Console + ensure CIRCLE_API_KEY matches.",
    );
  }
  return { address: addr, simulated: false };
}

export function isSimulatedOperatorWallet(): boolean {
  return !circleOperatorLive();
}
