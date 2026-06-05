/**
 * Sumsub KYB/KYC (web side). Mints a WebSDK access token for the vendor's
 * verification flow and reads their current verification status. The vendor's
 * Sumsub applicant is keyed by externalUserId = the Klaro vendor id, so the
 * daemon's screening worker can look up the same applicant when settling.
 * Requests are HMAC-SHA256 signed (App-Token scheme). Server-only (node:crypto).
 */
import { createHmac } from "node:crypto";
import {
  SUMSUB_APP_TOKEN,
  SUMSUB_SECRET_KEY,
  SUMSUB_LEVEL_NAME,
  SUMSUB_BASE_URL,
  sumsubConfigured,
} from "./env";

export { sumsubConfigured, SUMSUB_LEVEL_NAME };

function signedHeaders(
  method: string,
  path: string,
  body: string,
): Record<string, string> {
  const ts = Math.floor(Date.now() / 1000);
  const sig = createHmac("sha256", SUMSUB_SECRET_KEY ?? "")
    .update(ts + method.toUpperCase() + path + body)
    .digest("hex");
  return {
    "X-App-Token": SUMSUB_APP_TOKEN ?? "",
    "X-App-Access-Ts": String(ts),
    "X-App-Access-Sig": sig,
    Accept: "application/json",
  };
}

/** Mint a short-lived WebSDK access token for this vendor's verification. */
export async function createKybAccessToken(externalUserId: string): Promise<string> {
  const path =
    `/resources/accessTokens?userId=${encodeURIComponent(externalUserId)}` +
    `&levelName=${encodeURIComponent(SUMSUB_LEVEL_NAME)}&ttlInSecs=600`;
  const res = await fetch(SUMSUB_BASE_URL + path, {
    method: "POST",
    headers: signedHeaders("POST", path, ""),
  });
  if (!res.ok) {
    throw new Error(`sumsub_token_${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const j = (await res.json()) as { token: string };
  return j.token;
}

export type KybStatus = "verified" | "rejected" | "pending" | "none" | "error";

/** Read a vendor's Sumsub verification status by externalUserId. */
export async function getKybStatus(externalUserId: string): Promise<KybStatus> {
  if (!sumsubConfigured()) return "error";
  const path = `/resources/applicants/-;externalUserId=${encodeURIComponent(externalUserId)}/one`;
  try {
    const res = await fetch(SUMSUB_BASE_URL + path, {
      method: "GET",
      headers: signedHeaders("GET", path, ""),
    });
    if (res.status === 404) return "none";
    if (!res.ok) return "error";
    const a = (await res.json()) as {
      review?: { reviewStatus?: string; reviewResult?: { reviewAnswer?: string } };
    };
    const answer = a.review?.reviewResult?.reviewAnswer;
    const status = a.review?.reviewStatus;
    if (status === "completed" && answer === "GREEN") return "verified";
    if (status === "completed" && answer === "RED") return "rejected";
    return "pending";
  } catch {
    return "error";
  }
}
