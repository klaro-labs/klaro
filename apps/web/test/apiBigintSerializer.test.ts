// Regression for loop (2026-05-25): lib/api.ts ok()/err() must
// serialize bigint values. Every Klaro domain type uses bigint for USDC
// 6-dec precision. The previous implementation called JSON.stringify
// directly, which throws `TypeError: Do not know how to serialize a
// BigInt`. Coerce to decimal string at the API boundary so callers can
// parse with BigInt(...) without losing precision.

import { describe, it, expect } from "vitest";
import { ok, err } from "@/lib/api";

describe("lib/api ok()/err() bigint serialization", () => {
  it("ok() serializes bigint as decimal string", async () => {
    const res = ok({ amount: 1_234_567n, name: "x", nested: { fee: 999n } });
    const body = await res.json();
    expect(body.amount).toBe("1234567");
    expect(body.name).toBe("x");
    expect(body.nested.fee).toBe("999");
  });

  it("err() serializes bigint in detail", async () => {
    const res = err(400, "bad_amount", { provided: 42n });
    const body = await res.json();
    expect(body.error).toBe("bad_amount");
    expect(body.detail.provided).toBe("42");
  });

  it("preserves precision for large amounts (no Number lossy round)", async () => {
    // 2^53 + 1 — Number can't represent this exactly, bigint can.
    const big = 9_007_199_254_740_993n;
    const res = ok({ amount: big });
    const body = await res.json();
    expect(body.amount).toBe("9007199254740993");
  });
});
