import { describe, it, expect, afterEach } from "vitest";
import { currentSecret, validSecrets, timingSafeEqual } from "@/lib/secrets";

const SAVED: Record<string, string | undefined> = {};

afterEach(() => {
  for (const k of Object.keys(SAVED)) {
    if (SAVED[k] === undefined) delete process.env[k];
    else process.env[k] = SAVED[k];
  }
  for (const k of Object.keys(SAVED)) delete SAVED[k];
});

function setEnv(name: string, value: string | undefined) {
  if (!(name in SAVED)) SAVED[name] = process.env[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

describe("secrets", () => {
  it("returns current and previous when both set", () => {
    setEnv("FOO_SECRET", "new");
    setEnv("FOO_SECRET_PREVIOUS", "old");
    expect(currentSecret("FOO")).toBe("new");
    expect(validSecrets("FOO")).toEqual(["new", "old"]);
  });

  it("omits previous when unset", () => {
    setEnv("FOO_SECRET", "new");
    setEnv("FOO_SECRET_PREVIOUS", undefined);
    expect(validSecrets("FOO")).toEqual(["new"]);
  });

  it("returns empty when unset", () => {
    setEnv("FOO_SECRET", undefined);
    setEnv("FOO_SECRET_PREVIOUS", undefined);
    expect(currentSecret("FOO")).toBeUndefined();
    expect(validSecrets("FOO")).toEqual([]);
  });
});

describe("timingSafeEqual", () => {
  it("matches identical strings", () => {
    expect(timingSafeEqual("abc123", "abc123")).toBe(true);
  });

  it("rejects different strings of same length", () => {
    expect(timingSafeEqual("abc123", "abc124")).toBe(false);
  });

  it("rejects different lengths", () => {
    expect(timingSafeEqual("abc", "abcd")).toBe(false);
  });
});
