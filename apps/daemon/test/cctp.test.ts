/**
 * CCTP helpers — pure, no-network unit coverage for the inbound message-parsing
 * path. The live cross-chain burn + attestation is proven separately on Arc by
 * apps/web/scripts/qa-cctp-burn-proof.mjs; these tests lock the two pure
 * functions the INBOUND mint depends on (address→bytes32 recipient encoding and
 * pulling the CCTP message out of a MessageTransmitter receipt) so a regression
 * in either can't silently misroute or drop an inbound mint.
 */
import { describe, it, expect, vi } from "vitest";
import { encodeAbiParameters, encodeEventTopics, parseAbi, type Hex } from "viem";

// cctp.ts pulls in arc.js → env.js (which process.exit(1)s without real envs).
// Mock the chain-touching modules so the pure helpers import cleanly.
vi.mock("../src/arc.js", () => ({
  arcWallet: () => null,
  arcPublic: () => ({}),
  requireArcWalletInProd: vi.fn(),
}));
vi.mock("../src/log.js", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { addressToBytes32, extractMessageSent, CCTP } = await import("../src/cctp.js");

describe("addressToBytes32", () => {
  it("left-pads a 20-byte address into a 32-byte CCTP recipient field", () => {
    const out = addressToBytes32("0xAD578be3836eDa982e18600784c414cC69B4EB94");
    expect(out.toLowerCase()).toBe(
      "0x000000000000000000000000ad578be3836eda982e18600784c414cc69b4eb94",
    );
    expect(out).toHaveLength(66); // 0x + 64 hex
  });
});

describe("extractMessageSent", () => {
  const MT_ABI = parseAbi(["event MessageSent(bytes message)"]);
  const message = "0xdeadbeefcafe" as Hex;
  const mkLog = (address: string) => ({
    address,
    data: encodeAbiParameters([{ type: "bytes" }], [message]),
    topics: encodeEventTopics({ abi: MT_ABI, eventName: "MessageSent" }) as Hex[],
  });

  it("returns the message bytes from a MessageTransmitter MessageSent log", () => {
    expect(extractMessageSent([mkLog(CCTP.messageTransmitterV2)])).toBe(message);
  });

  it("ignores a MessageSent-shaped log from any other contract", () => {
    expect(
      extractMessageSent([mkLog("0x000000000000000000000000000000000000dEaD")]),
    ).toBeNull();
  });

  it("returns null when no MessageSent log is present", () => {
    expect(
      extractMessageSent([
        { address: CCTP.messageTransmitterV2, data: "0x", topics: ["0x1234" as Hex] },
      ]),
    ).toBeNull();
  });
});
