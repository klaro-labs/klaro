import { describe, it, expect } from "vitest";
import crypto from "node:crypto";
import { verifyHmac } from "@/lib/webhookVerify";

function sign(secret: string, t: number, body: string): string {
  const sig = crypto
    .createHmac("sha256", secret)
    .update(`${t}.${body}`)
    .digest("hex");
  return `t=${t},v1=${sig}`;
}

describe("verifyHmac", () => {
  const secret = "wh_test_secret_minimum_length_for_safety";
  // Each test uses a unique body so signatures don't collide in the module-level
  // `seen` map (used for duplicate-delivery detection).
  const body = (tag: string) =>
    JSON.stringify({ kind: "invoice.settled", id: `0x${tag}` });

  // verifyHmac is now async (Redis-backed dedup). Tests updated
  // to await throughout.
  it("accepts a valid stripe-style signature", async () => {
    const t = Math.floor(Date.now() / 1000);
    const b = body("valid");
    const r = await verifyHmac({
      rawBody: b,
      header: sign(secret, t, b),
      secret,
    });
    expect(r.ok).toBe(true);
  });

  it("rejects when secret is missing", async () => {
    const t = Math.floor(Date.now() / 1000);
    const b = body("nosecret");
    const r = await verifyHmac({
      rawBody: b,
      header: sign(secret, t, b),
      secret: "",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("secret_missing");
  });

  it("rejects when header is missing", async () => {
    const r = await verifyHmac({ rawBody: body("nohdr"), header: "", secret });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("header_missing");
  });

  it("rejects outside the 5-minute replay window", async () => {
    const t = Math.floor(Date.now() / 1000) - 6 * 60;
    const b = body("replay");
    const r = await verifyHmac({
      rawBody: b,
      header: sign(secret, t, b),
      secret,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("replay_window");
  });

  it("rejects a tampered body", async () => {
    const t = Math.floor(Date.now() / 1000);
    const b = body("tamper");
    const sig = sign(secret, t, b);
    const r = await verifyHmac({ rawBody: b + "x", header: sig, secret });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("signature_mismatch");
  });

  it("rejects a duplicate delivery", async () => {
    const t = Math.floor(Date.now() / 1000);
    const b = body("dup");
    const header = sign(secret, t, b);
    const a = await verifyHmac({ rawBody: b, header, secret });
    const b2 = await verifyHmac({ rawBody: b, header, secret });
    expect(a.ok).toBe(true);
    expect(b2.ok).toBe(false);
    if (!b2.ok) expect(b2.reason).toBe("duplicate_delivery");
  });

  // removed the `raw-hex` format entirely because its replay-
  // window check was always `|now - now| == 0` (receiver-clock t),
  // letting any captured signature replay for the 10-min seenOnce TTL.
  // No real producers existed. If a future provider needs an inline-hex
  // signature, the sender must include a real timestamp out-of-band.

  // regression for length-mismatch fix:
  // an odd-length / wrong-length hex signature used to throw RangeError
  // inside crypto.timingSafeEqual and bubble as an unhandled 500 with
  // no per-provider Sentry context. Pre-check should now route to a
  // clean signature_mismatch.
  it("returns signature_mismatch on odd-length hex sig (not throws)", async () => {
    const t = Math.floor(Date.now() / 1000);
    const b = body("lenodd");
    const r = await verifyHmac({
      rawBody: b,
      header: `t=${t},v1=deadbee`, // 7 hex chars — half-byte misalignment
      secret,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("signature_mismatch");
  });

  it("returns signature_mismatch on short hex sig (not throws)", async () => {
    const t = Math.floor(Date.now() / 1000);
    const b = body("lenshort");
    const r = await verifyHmac({
      rawBody: b,
      header: `t=${t},v1=00`, // 1 byte — clearly wrong length vs sha256's 32
      secret,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("signature_mismatch");
  });
});
