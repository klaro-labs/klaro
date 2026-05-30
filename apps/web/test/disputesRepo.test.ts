// Disputes repo contract — mock-mode round-trip (no DB). Locks the
// open → get → evidence → assign → decide path and the double-decide guard
// (mirrors the on-chain DisputeManager replay revert). Live Supabase mapping
// is covered by the qa-dispute-drive E2E (on-chain + DB).
import { describe, it, expect, vi } from "vitest";
import type { Hex } from "@/lib/types";

// Force simulator mode so the repo uses the in-memory mock store.
vi.mock("@/lib/db", () => ({ tryDb: vi.fn(async () => null) }));

const CASE_ID = ("0xdada" + "0".repeat(60)) as Hex;
const REF = ("0xbeef" + "0".repeat(60)) as Hex;

describe("disputes repo (mock mode)", () => {
  it("round-trips open → get → evidence → assign → decide", async () => {
    const repo = await import("@/lib/repo/disputes");
    await repo.openDispute({
      caseId: CASE_ID,
      context: "cashout",
      contextRefId: REF,
      vendorId: "vendor-asha",
      claimantLabel: "Asha (vendor)",
      respondentLabel: "LP3",
      amountUsdc: 100_000_000n,
      openingNote: "payout never landed in my account",
      openingHash: ("0x" + "11".repeat(32)) as Hex,
    });

    const opened = await repo.getDispute(CASE_ID);
    expect(opened?.status).toBe("OPENED");
    expect(opened?.vendorId).toBe("vendor-asha");
    expect(opened?.evidence.length).toBe(1);

    await repo.addEvidence(CASE_ID, {
      by: "respondent",
      at: new Date(),
      note: "UTR attached, bank confirms credit",
      hash: ("0x" + "22".repeat(32)) as Hex,
    });
    const withEvidence = await repo.getDispute(CASE_ID);
    expect(withEvidence?.evidence.length).toBe(2);
    expect(withEvidence?.status).toBe("EVIDENCE_SUBMITTED");

    await repo.assignToReview(CASE_ID);
    expect((await repo.getDispute(CASE_ID))?.status).toBe("UNDER_REVIEW");

    const decided = await repo.decide(
      CASE_ID,
      "REFUND_TO_RESPONDENT",
      "LP proved the payout",
      ("0x" + "33".repeat(32)) as Hex,
    );
    expect(decided?.status).toBe("DECIDED");
    expect(decided?.outcome).toBe("REFUND_TO_RESPONDENT");
  });

  it("refuses to re-decide a DECIDED case (on-chain replay parity)", async () => {
    const repo = await import("@/lib/repo/disputes");
    await expect(
      repo.decide(
        CASE_ID,
        "RELEASE_TO_CLAIMANT",
        "second decision",
        ("0x" + "44".repeat(32)) as Hex,
      ),
    ).rejects.toThrow(/already DECIDED/);
  });
});
