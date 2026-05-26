import { describe, it, expect } from "vitest";
import crypto from "node:crypto";
import { makeWebhookReceiver } from "@/lib/webhookReceiver";

const SECRET = "test_secret_xx_minimum_length_for_safety_xx";

function stripeSig(body: string, t = Math.floor(Date.now() / 1000)) {
  const sig = crypto
    .createHmac("sha256", SECRET)
    .update(`${t}.${body}`)
    .digest("hex");
  return `t=${t},v1=${sig}`;
}

// receiver now takes the resolved `secret` directly
// (read from env.ts by the route) instead of an env var name. Tests
// pass the literal value through.

describe("makeWebhookReceiver", () => {
  it("503s when secret unset", async () => {
    const handler = makeWebhookReceiver({
      provider: "stripe",
      headerName: "stripe-signature",
      format: "stripe",
      secret: null,
    });
    const r = await handler(
      new Request("https://x/", { method: "POST", body: "{}" }),
    );
    expect(r.status).toBe(503);
  });

  it("accepts a valid stripe-style signature", async () => {
    // Force fresh handler reads env at construction; rebuild after setting env.
    const handler = makeWebhookReceiver({
      provider: "stripe",
      headerName: "stripe-signature",
      format: "stripe",
      secret: SECRET,
    });
    const body = JSON.stringify({ id: "evt_iter3_ok" });
    const r = await handler(
      new Request("https://x/", {
        method: "POST",
        headers: { "stripe-signature": stripeSig(body) },
        body,
      }),
    );
    expect(r.status).toBe(200);
  });

  it("401s on bad signature", async () => {
    const handler = makeWebhookReceiver({
      provider: "stripe",
      headerName: "stripe-signature",
      format: "stripe",
      secret: SECRET,
    });
    const r = await handler(
      new Request("https://x/", {
        method: "POST",
        headers: { "stripe-signature": "t=1,v1=deadbeef" },
        body: JSON.stringify({ id: "evt_iter3_bad" }),
      }),
    );
    expect(r.status).toBe(401);
  });

  it("invokes onVerified with parsed payload", async () => {
    let seen: unknown = null;
    const handler = makeWebhookReceiver({
      provider: "stripe",
      headerName: "stripe-signature",
      format: "stripe",
      secret: SECRET,
      onVerified: (payload) => {
        seen = payload;
      },
    });
    const body = JSON.stringify({ id: "evt_iter3_handler", n: 42 });
    const r = await handler(
      new Request("https://x/", {
        method: "POST",
        headers: { "stripe-signature": stripeSig(body) },
        body,
      }),
    );
    expect(r.status).toBe(200);
    expect(seen).toEqual({ id: "evt_iter3_handler", n: 42 });
  });

  it("500s when onVerified throws", async () => {
    const handler = makeWebhookReceiver({
      provider: "stripe",
      headerName: "stripe-signature",
      format: "stripe",
      secret: SECRET,
      onVerified: () => {
        throw new Error("downstream broke");
      },
    });
    const body = JSON.stringify({ id: "evt_iter3_throw" });
    const r = await handler(
      new Request("https://x/", {
        method: "POST",
        headers: { "stripe-signature": stripeSig(body) },
        body,
      }),
    );
    expect(r.status).toBe(500);
  });
});
