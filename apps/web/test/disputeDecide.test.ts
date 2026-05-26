import { describe, it, expect } from "vitest";
import { mockOpenDispute, mockDecideDispute } from "@/lib/mockData";
import type { Hex } from "@/lib/types";
import { keccak256, stringToBytes } from "viem";

const REASON = keccak256(stringToBytes("klaro.reason.DISPUTE_AGENT_FAULT"));
const CASE = ("0x" + "c0de".padEnd(64, "0")) as Hex;

describe("mockDecideDispute double-decide guard", () => {
  it("rejects re-decide on an already DECIDED case", async () => {
    await mockOpenDispute({
      caseId: CASE,
      context: "cashout",
      contextRefId: ("0x" + "11".repeat(32)) as Hex,
      vendorId: "vendor-dispute-test",
      claimantLabel: "Vendor A",
      respondentLabel: "Counterparty",
      amountUsdc: 0n,
      openingNote: "decision-test bootstrapping case for double-decide guard",
      openingHash: keccak256(stringToBytes("seed")),
    });
    const first = await mockDecideDispute(
      CASE,
      "RELEASE_TO_CLAIMANT",
      "first decision note long enough",
      REASON,
    );
    expect(first?.status).toBe("DECIDED");
    expect(first?.outcome).toBe("RELEASE_TO_CLAIMANT");

    await expect(
      mockDecideDispute(
        CASE,
        "REFUND_TO_RESPONDENT",
        "second decision attempt should fail",
        REASON,
      ),
    ).rejects.toThrow(/already DECIDED/);
  });
});
