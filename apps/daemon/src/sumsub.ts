/**
 * Sumsub KYB/KYC status lookup (daemon side). The screening worker checks a
 * vendor's verification result by externalUserId (= the Klaro vendor id) when
 * deciding whether to settle. Requests are HMAC-SHA256 signed per the Sumsub
 * App-Token scheme.
 */
import { createHmac } from "node:crypto";
import { env } from "./env.js";
import { log } from "./log.js";

function signedHeaders(
  method: string,
  path: string,
  body: string,
): Record<string, string> {
  const ts = Math.floor(Date.now() / 1000);
  const sig = createHmac("sha256", env.SUMSUB_SECRET_KEY ?? "")
    .update(ts + method.toUpperCase() + path + body)
    .digest("hex");
  return {
    "X-App-Token": env.SUMSUB_APP_TOKEN ?? "",
    "X-App-Access-Ts": String(ts),
    "X-App-Access-Sig": sig,
    Accept: "application/json",
  };
}

export type KybStatus = "pass" | "fail" | "review" | "none" | "unavailable";

export interface KybResult {
  status: KybStatus;
  detail: string;
}

/**
 * Resolve a vendor's KYB outcome from Sumsub by externalUserId.
 * GREEN→pass, RED→fail, anything pending/none/unreachable→review-ish (the
 * caller fails closed). Never throws.
 */
export async function getVendorKybStatus(vendorId: string): Promise<KybResult> {
  if (!env.SUMSUB_APP_TOKEN || !env.SUMSUB_SECRET_KEY) {
    return { status: "unavailable", detail: "Sumsub not configured" };
  }
  const path = `/resources/applicants/-;externalUserId=${encodeURIComponent(vendorId)}/one`;
  try {
    const res = await fetch(env.SUMSUB_BASE_URL + path, {
      method: "GET",
      headers: signedHeaders("GET", path, ""),
    });
    if (res.status === 404) {
      return { status: "none", detail: "No Sumsub verification on file" };
    }
    if (!res.ok) {
      log.warn("sumsub.status.http", { status: res.status });
      return { status: "unavailable", detail: `Sumsub HTTP ${res.status}` };
    }
    const a = (await res.json()) as {
      review?: {
        reviewStatus?: string;
        reviewResult?: { reviewAnswer?: string };
      };
    };
    const answer = a.review?.reviewResult?.reviewAnswer; // GREEN | RED
    const reviewStatus = a.review?.reviewStatus; // init | pending | completed
    if (reviewStatus === "completed" && answer === "GREEN") {
      return { status: "pass", detail: "Sumsub KYB approved (GREEN)" };
    }
    if (reviewStatus === "completed" && answer === "RED") {
      return { status: "fail", detail: "Sumsub KYB rejected (RED)" };
    }
    return {
      status: "review",
      detail: `Sumsub KYB pending (${reviewStatus ?? "init"})`,
    };
  } catch (e) {
    log.warn("sumsub.status.error", { err: (e as Error).message });
    return { status: "unavailable", detail: "Sumsub unreachable" };
  }
}
