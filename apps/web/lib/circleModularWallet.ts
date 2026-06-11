/**
 * Circle Modular Wallets — browser side. Passkey-backed smart accounts owned by
 * the end user (vendor onboarding, no seed phrase). Split out from
 * `circleWallets.ts` so a client bundle never pulls in the node-only
 * developer-controlled-wallets SDK that lives there.
 *
 * Per the modular-wallets coding sample, the package is
 * `@circle-fin/modular-wallets-core`; passkey UX uses `toWebAuthnCredential` +
 * `toCircleSmartAccount` + a viem client on `arcTestnet`.
 */
import {
  circleVendorLive,
  CIRCLE_CLIENT_KEY,
  CIRCLE_MODULAR_URL,
} from "./env";
import type { Hex } from "./types";

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

/** Mock — deterministic vendor wallet derived from email so same signup →
 * same address. Looks like a real 0x-address. */
function mockVendorWallet(email: string): VendorWalletProvision {
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

export function isSimulatedVendorWallet(): boolean {
  return !circleVendorLive();
}
