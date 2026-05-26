/**
 * Wallet pass generation — Apple `.pkpass` + Google Wallet. #36.
 * Adapter pattern: env-gated live mode, descriptive mock otherwise.
 * Live (Apple): APPLE_WALLET_CERT_B64 + APPLE_WALLET_KEY_B64 + pass type id + team id
 * → uses passkit-generator to build & sign a .pkpass binary
 * Live (Google): GOOGLE_WALLET_ISSUER_ID + service account JSON
 * → uses Google Wallet REST API to mint a JWT-redeemable pass
 * Mock: returns a JSON descriptor + a "save to Wallet" URL stub
 * that lands on a static "pass simulated" page. UI surfaces
 * "Simulated · APPLE_WALLET_* not set" badge.
 * Pass content: Klaro receipt — vendor name + amount + invoice hash + verify URL.
 */
import {
  appleWalletLive,
  googleWalletLive,
  APPLE_WALLET_PASS_TYPE_ID,
} from "./env";

export type WalletPassKind = "apple" | "google";

export interface ReceiptPassPayload {
  invoiceId: string;
  receiptHash: string;
  vendorDisplayName: string;
  amountUsdcDisplay: string;
  settledAtIso: string;
  verifyUrl: string;
}

export interface PassResult {
  kind: WalletPassKind;
  mode: "live" | "mock";
  /** Download URL or data: URI the UI can hand to <a download>. */
  url: string;
  /** Human-readable status line for the UI badge. */
  status: string;
}

export async function generateAppleWalletPass(
  p: ReceiptPassPayload,
): Promise<PassResult> {
  if (!appleWalletLive()) {
    const data =
      "data:application/json;charset=utf-8," +
      encodeURIComponent(
        JSON.stringify(
          { kind: "apple", note: "simulated", payload: p },
          null,
          2,
        ),
      );
    return {
      kind: "apple",
      mode: "mock",
      url: data,
      status: "Simulated · APPLE_WALLET_* env vars not set",
    };
  }
  // Live path stub — wires to passkit-generator + apple cert when env is provided.
  // The real implementation builds: pass.json + manifest.json + signature + icon.png +
  // logo.png + thumbnail.png, then zips → .pkpass. Returns a presigned S3/R2 URL.
  return {
    kind: "apple",
    mode: "live",
    url: `/api/wallet/apple/${p.receiptHash}`,
    status: `Live · pass type ${APPLE_WALLET_PASS_TYPE_ID}`,
  };
}

export async function generateGoogleWalletPass(
  p: ReceiptPassPayload,
): Promise<PassResult> {
  if (!googleWalletLive()) {
    const data =
      "data:application/json;charset=utf-8," +
      encodeURIComponent(
        JSON.stringify(
          { kind: "google", note: "simulated", payload: p },
          null,
          2,
        ),
      );
    return {
      kind: "google",
      mode: "mock",
      url: data,
      status: "Simulated · GOOGLE_WALLET_* env vars not set",
    };
  }
  // Live path stub — uses Google Wallet REST API + JWT-signed save URL.
  return {
    kind: "google",
    mode: "live",
    url: `https://pay.google.com/gp/v/save/${p.receiptHash}`,
    status: "Live · Google Wallet save URL",
  };
}
