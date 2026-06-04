/**
 * OFAC SDN crypto-address parser — pure, no-network coverage. The live fetch +
 * cache is exercised against the real Treasury list at runtime; this locks the
 * extraction + lowercasing so a buyer-address lookup can never silently miss a
 * sanctioned address due to a parse regression.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("../src/env.js", () => ({ env: { NODE_ENV: "test" }, IS_PROD: false }));
vi.mock("../src/log.js", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { parseOfacCryptoAddresses } = await import("../src/ofac.js");

describe("parseOfacCryptoAddresses", () => {
  it("extracts + lowercases crypto addresses from SDN remarks", () => {
    const csv =
      `"...","Linked To: FOO; Digital Currency Address - ETH ` +
      `0x098B716B8Aaf21512996dC57EB0615e2383E2f96; Digital Currency Address - ` +
      `XBT 12QtD5BFwRsdNsAZY76UVE1xyCGNTojH9h; other remark"`;
    const set = parseOfacCryptoAddresses(csv);
    expect(set.has("0x098b716b8aaf21512996dc57eb0615e2383e2f96")).toBe(true);
    expect(set.has("12qtd5bfwrsdnsazy76uve1xycgntojh9h")).toBe(true);
    expect(set.size).toBe(2);
  });

  it("returns an empty set when there are no crypto addresses", () => {
    expect(parseOfacCryptoAddresses("ent_num,SDN_Name,no addresses here").size).toBe(0);
  });

  it("membership matches a lowercased buyer address (EVM case-insensitive)", () => {
    const set = parseOfacCryptoAddresses(
      "Digital Currency Address - ETH 0xAbCDef0123456789012345678901234567890ABc",
    );
    const buyer = "0xABCDEF0123456789012345678901234567890abc";
    expect(set.has(buyer.toLowerCase())).toBe(true);
  });
});
