/**
 * Shared HMAC verification + replay-guard for inbound webhook receivers.
 * Each provider has a slightly different header convention; this module
 * normalizes them so the receiver code stays one-liner-clean.
 * replay dedup now uses the
 * Redis-backed `seenOnce` from `lib/seenOnce.ts` instead of an in-process
 * Map. The previous Map reset on every Vercel cold start and didn't sync
 * across replicas — a replay attacker had two bypass paths. Now atomic
 * across replicas via Redis SET NX EX. Function became async as a result;
 * one call site (webhookReceiver.ts) + the test file updated.
 */
import crypto from "node:crypto";
import { seenOnce } from "./seenOnce";

const REPLAY_WINDOW_SECONDS = 5 * 60;
const DEDUP_TTL_SECONDS = 10 * 60; // longer than replay window so late-arriving replays are caught

export interface VerifyOptions {
  rawBody: string;
  header: string; // raw header value (e.g. "t=…,v1=…")
  secret: string;
  /** Acceptable header separator/format variant. */
  format?: "klaro" | "stripe";
}

export async function verifyHmac(
  opts: VerifyOptions,
): Promise<{ ok: true; t: number } | { ok: false; reason: string }> {
  if (!opts.secret) return { ok: false, reason: "secret_missing" };
  if (!opts.header) return { ok: false, reason: "header_missing" };

  // removed the `raw-hex` format
  // — it derived `t` from the receiver's clock, so the replay-window
  // check at line below was `|now - now| == 0`, always passing. Any
  // captured raw-hex signature replayed cleanly for the 10-min
  // `seenOnce` TTL. Format had no real producers in the codebase
  // (only a vitest fixture). If a future provider needs an inline-hex
  // signature, they must send a timestamp out-of-band so the binding
  // is real.
  // klaro = "t=…,v1=…"; stripe = "t=…,v1=…" (same syntax)
  const parts = Object.fromEntries(
    opts.header.split(",").map((p) => p.split("=") as [string, string]),
  );
  const t: number | null = parts.t ? Number(parts.t) : null;
  const sig: string | null = parts.v1 ?? null;
  if (!t || !sig) return { ok: false, reason: "header_malformed" };
  if (Math.abs(Math.floor(Date.now() / 1000) - t) > REPLAY_WINDOW_SECONDS)
    return { ok: false, reason: "replay_window" };

  const expected = crypto
    .createHmac("sha256", opts.secret)
    .update(`${t}.${opts.rawBody}`)
    .digest("hex");
  // `crypto.timingSafeEqual`
  // throws `RangeError` on mismatched buffer lengths. A trivial probe
  // (sig with odd hex chars / wrong length) crashed past the
  // signature_mismatch path, bubbling as a 500 with no per-provider
  // Sentry context. Length pre-check converts every malformed-sig
  // failure into the same clean `signature_mismatch` return path so
  // observability stays uniform.
  const expectedBuf = Buffer.from(expected, "hex");
  const sigBuf = Buffer.from(sig, "hex");
  if (expectedBuf.length !== sigBuf.length) {
    return { ok: false, reason: "signature_mismatch" };
  }
  const ok = crypto.timingSafeEqual(expectedBuf, sigBuf);
  if (!ok) return { ok: false, reason: "signature_mismatch" };

  // cross-replica dedup. SET NX EX on Redis (atomic) — first
  // delivery returns false; replay returns true. Falls back to in-process
  // Map in dev / when REDIS_URL unset (documented in seenOnce.ts).
  if (await seenOnce(`webhook:${sig}`, DEDUP_TTL_SECONDS)) {
    return { ok: false, reason: "duplicate_delivery" };
  }
  return { ok: true, t };
}
