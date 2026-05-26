/**
 * Circle Wallets adapter — env-gated.
 * Two distinct surfaces:
 * 1. **Modular Wallets** (vendor / buyer side) — passkey-backed smart
 * accounts owned by the end user. Used for vendor onboarding (no
 * seed-phrase UX) and buyer EIP-712 signing. Browser-side library.
 * 2. **Developer-Controlled Wallets** (Klaro operator) — server-held key
 * used to call `InvoiceEscrow.settle()` + `recordScreening()`. Backend.
 * Per the modular-wallets coding sample, the package is
 * `@circle-fin/modular-wallets-core@1.0.12`; passkey UX uses
 * `toWebAuthnCredential` + `toCircleSmartAccount` + a viem bundler client.
 * Arc Testnet is supported via viem's `arcTestnet` chain export and
 * `ContractAddress.ArcTestnet_USDC` (= the same 0x3600… ERC-20 interface
 * Klaro uses — 6 decimals).
 * **Why a wrapper:** dynamic-import the heavy SDK only when live env is
 * present. Mock path returns deterministic addresses so the UI can render
 * without a network round-trip; real path provisions a true smart account.
 */

import {
  circleVendorLive,
  circleOperatorLive,
  CIRCLE_CLIENT_KEY,
  CIRCLE_MODULAR_URL,
  CIRCLE_API_KEY,
  CIRCLE_ENTITY_SECRET,
} from "./env";
import type { Hex } from "./types";

// ─── Modular Wallets (vendor / buyer) ───────────────────────────────

export interface VendorWalletProvision {
  /** Smart-account address on Arc testnet. */
  address: Hex;
  /** WebAuthn credential id — store on the vendor row. */
  credentialId?: string;
  /** True if this came from the mock path. */
  simulated: boolean;
}

/**
 * Provisions (or recovers) a vendor smart account using a passkey.
 * Mock path: deterministic address derived from email so repeat sign-ins
 * return the same wallet. No real WebAuthn ceremony.
 */
export async function provisionVendorWallet(opts: {
  email: string;
  /** WebAuthn `register` if first sign-in, `login` otherwise. */
  mode: "Register" | "Login";
  credentialId?: string;
}): Promise<VendorWalletProvision> {
  if (!circleVendorLive()) {
    return mockVendorWallet(opts.email);
  }
  // Real path — runs in the browser only because WebAuthn needs window.
  // Server-rendered pages call this through a client island.
  if (typeof window === "undefined") {
    throw new Error(
      "provisionVendorWallet() must run in the browser when Circle vendor env is live.",
    );
  }

  const mw = await import("@circle-fin/modular-wallets-core");
  const viemAA = await import("viem/account-abstraction");
  const viem = await import("viem");
  const chains = await import("viem/chains");

  const passkeyTransport = mw.toPasskeyTransport(
    CIRCLE_MODULAR_URL,
    CIRCLE_CLIENT_KEY!,
  );
  const modularTransport = mw.toModularTransport(
    `${CIRCLE_MODULAR_URL}/arcTestnet`,
    CIRCLE_CLIENT_KEY!,
  );

  // Either register a new passkey or log into an existing one.
  const credential = await mw.toWebAuthnCredential({
    transport: passkeyTransport,
    mode:
      opts.mode === "Register"
        ? mw.WebAuthnMode.Register
        : mw.WebAuthnMode.Login,
    username: opts.email,
    credentialId: opts.credentialId,
  });

  const client = viem.createPublicClient({
    chain: chains.arcTestnet,
    transport: modularTransport,
  });

  const account = await mw.toCircleSmartAccount({
    client: client as Parameters<typeof mw.toCircleSmartAccount>[0]["client"],
    owner: viemAA.toWebAuthnAccount({ credential }),
    name: opts.email,
  });

  return {
    address: account.address as Hex,
    credentialId: credential.id,
    simulated: false,
  };
}

/** Mock — deterministic vendor wallet derived from email so the same
 * signup → same address. Looks like a real 0x-address. */
function mockVendorWallet(email: string): VendorWalletProvision {
  // Hash a short string into a 40-char hex address deterministically.
  let h = 0;
  for (let i = 0; i < email.length; i++) {
    h = (h * 31 + email.charCodeAt(i)) >>> 0;
  }
  const hex = h.toString(16).padStart(8, "0");
  return {
    address: ("0x" + hex.repeat(5)) as Hex,
    simulated: true,
  };
}

// ─── Developer-Controlled Wallet (Klaro operator) ───────────────────

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
  // previously read process.env.CIRCLE_API_KEY! +
  // CIRCLE_ENTITY_SECRET! directly with bang-assertions, bypassing
  // env.ts even though both vars are declared there. Bang-assert
  // crashed with NPE-equivalent if either unset while circleOperatorLive()
  // somehow returned true. Same defect class as W82-3 / W83-1/2.
  if (!CIRCLE_API_KEY || !CIRCLE_ENTITY_SECRET) {
    throw new Error(
      "circle_operator_creds_missing: CIRCLE_API_KEY + CIRCLE_ENTITY_SECRET required when circleOperatorLive() is true",
    );
  }
  const { initiateDeveloperControlledWalletsClient } =
    await import("@circle-fin/developer-controlled-wallets");
  const client = initiateDeveloperControlledWalletsClient({
    apiKey: CIRCLE_API_KEY,
    entitySecret: CIRCLE_ENTITY_SECRET,
  });
  // We expect ONE wallet set named "klaro-operator" with a single
  // Arc-testnet wallet. List + pick first match (M11 hardens with a
  // pinned `WALLET_ID` env var).
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

export function isSimulatedVendorWallet(): boolean {
  return !circleVendorLive();
}
export function isSimulatedOperatorWallet(): boolean {
  return !circleOperatorLive();
}
