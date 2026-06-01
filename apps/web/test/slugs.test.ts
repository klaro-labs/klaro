/**
 * slugs — Klaro Link short-code generation + validation. A malformed slug must
 * be rejected by isValidSlug BEFORE it reaches the DB (the /pay/[slug] route's
 * cheap pre-filter), and a generated slug must always round-trip through the
 * validator. The base58 alphabet deliberately excludes the ambiguous 0/O/I/l.
 */
import { describe, it, expect } from "vitest";
import {
  generateSlug,
  isValidSlug,
  SLUG_LENGTH,
  SLUG_ALPHABET,
} from "@/lib/slugs";

describe("generateSlug", () => {
  it("is exactly SLUG_LENGTH chars, all from the base58 alphabet", () => {
    for (let i = 0; i < 200; i++) {
      const s = generateSlug();
      expect(s).toHaveLength(SLUG_LENGTH);
      for (const ch of s) expect(SLUG_ALPHABET).toContain(ch);
    }
  });

  it("never emits an ambiguous 0/O/I/l", () => {
    for (let i = 0; i < 200; i++) {
      expect(generateSlug()).not.toMatch(/[0OIl]/);
    }
  });

  it("every generated slug round-trips through isValidSlug", () => {
    for (let i = 0; i < 200; i++) {
      expect(isValidSlug(generateSlug())).toBe(true);
    }
  });
});

describe("isValidSlug", () => {
  it("rejects wrong length", () => {
    expect(isValidSlug("")).toBe(false);
    expect(isValidSlug("abc")).toBe(false); // too short
    expect(isValidSlug("a".repeat(SLUG_LENGTH + 1))).toBe(false);
  });

  it("rejects out-of-alphabet chars (ambiguous + punctuation + scanning probes)", () => {
    expect(isValidSlug("0OIl0OIl")).toBe(false); // every char excluded
    expect(isValidSlug("abcd-fgh")).toBe(false); // hyphen
    expect(isValidSlug("../../../")).toBe(false); // path traversal probe
    expect(isValidSlug("abcdefg ")).toBe(false); // trailing space
  });

  it("rejects non-string input without throwing", () => {
    // route params are typed string, but a guard shouldn't explode on junk
    expect(isValidSlug(undefined as unknown as string)).toBe(false);
    expect(isValidSlug(null as unknown as string)).toBe(false);
    expect(isValidSlug(12345678 as unknown as string)).toBe(false);
  });

  it("accepts a known-good fixed slug", () => {
    expect(isValidSlug("Ab1Cd2Ef")).toBe(true);
  });
});
