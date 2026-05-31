/**
 * Dispute→escrow routing policy (disputeRouting.ts). Pins which decided
 * disputes the daemon auto-resolves on-chain vs defers to a human, so a future
 * edit can't silently start the operator key auto-signing a SLASH it shouldn't,
 * or stop resolving the deterministic RELEASE/REFUND cases.
 */
import { describe, it, expect } from "vitest";
import { planDisputeResolution } from "../src/workers/disputeRouting.js";

describe("planDisputeResolution", () => {
  it("auto-resolves deterministic outcomes on the right escrow per context", () => {
    for (const outcome of ["RELEASE_TO_CLAIMANT", "REFUND_TO_RESPONDENT"]) {
      expect(planDisputeResolution("agent", outcome)).toEqual({
        action: "resolve",
        target: "agent",
      });
      expect(planDisputeResolution("cashout", outcome)).toEqual({
        action: "resolve",
        target: "cashout",
      });
      expect(planDisputeResolution("stream", outcome)).toEqual({
        action: "resolve",
        target: "stream",
      });
    }
  });

  it("is case-insensitive on the source discriminator", () => {
    expect(planDisputeResolution("STREAM", "RELEASE_TO_CLAIMANT")).toEqual({
      action: "resolve",
      target: "stream",
    });
  });

  it("defers SLASH_LP + PENALIZE_VENDOR to a human (operator-set amount)", () => {
    expect(planDisputeResolution("cashout", "SLASH_LP").action).toBe("manual");
    expect(planDisputeResolution("agent", "PENALIZE_VENDOR").action).toBe(
      "manual",
    );
    // ...regardless of context — these never auto-sign a money move.
    expect(planDisputeResolution("stream", "SLASH_LP").action).toBe("manual");
  });

  it("skips MUTUAL_RESOLVED (no escrow transfer)", () => {
    expect(planDisputeResolution("cashout", "MUTUAL_RESOLVED").action).toBe(
      "skip",
    );
  });

  it("routes invoice disputes to manual (RefundProtocol, no resolveDispute)", () => {
    expect(planDisputeResolution("invoice", "RELEASE_TO_CLAIMANT").action).toBe(
      "manual",
    );
  });

  it("skips unknown sources + unknown/absent outcomes (fails safe)", () => {
    expect(planDisputeResolution("widgets", "RELEASE_TO_CLAIMANT").action).toBe(
      "skip",
    );
    expect(planDisputeResolution("agent", "WAT").action).toBe("skip");
    expect(planDisputeResolution("agent", null).action).toBe("skip");
    expect(planDisputeResolution(null, null).action).toBe("skip");
  });
});
