// Regression for loop (2026-05-25): err() and publicErrorMessage
// must NEVER leak raw Error.message text to the HTTP response. Sentry has
// the real error (via captureError in lib/api.ts:92), the response ships
// only sanitized codes.
// parallel audit caught: lib/api.ts:99 + health route detail
// field + 6 push/webauthn routes all sent raw error.message back to the
// client — including PostgREST schema names, connection-string fragments,
// and file paths.

import { describe, it, expect } from "vitest";
import { err, publicErrorMessage } from "@/lib/api";

describe("publicErrorMessage — sanitization", () => {
  it("passes short snake_case codes through (intentional caller-supplied)", () => {
    expect(publicErrorMessage(new Error("unauthorized"))).toBe("unauthorized");
    expect(publicErrorMessage(new Error("quote_expired"))).toBe(
      "quote_expired",
    );
    expect(publicErrorMessage(new Error("rate_limited"))).toBe("rate_limited");
  });

  it("falls back to the default for prose error messages", () => {
    const dbErr = new Error(
      'permission denied for table "invoices" at /supabase/_internal/postgrest.ts:218',
    );
    expect(publicErrorMessage(dbErr)).toBe("request_failed");
    expect(publicErrorMessage(dbErr, "db_error")).toBe("db_error");
  });

  it("strips PostgREST-style table/schema leakage", () => {
    const r = publicErrorMessage(
      new Error('relation "public.audit_logs" does not exist'),
    );
    expect(r).toBe("request_failed");
    expect(r).not.toMatch(/audit_logs|public\./);
  });

  it("strips stack-trace-style messages", () => {
    const r = publicErrorMessage(
      new Error("at /apps/web/lib/auth.ts:67:13 in getCurrentSession"),
    );
    expect(r).toBe("request_failed");
    expect(r).not.toContain("apps/web");
  });

  it("returns fallback for non-Error inputs", () => {
    expect(publicErrorMessage("oops")).toBe("request_failed");
    expect(publicErrorMessage({ msg: "x" })).toBe("request_failed");
    expect(publicErrorMessage(undefined)).toBe("request_failed");
  });

  it("rejects messages with whitespace or capitals", () => {
    expect(publicErrorMessage(new Error("Quote Expired"))).toBe(
      "request_failed",
    );
    expect(publicErrorMessage(new Error("quote expired"))).toBe(
      "request_failed",
    );
  });

  it("err() response body never contains raw stack-trace text", async () => {
    const res = err(400, "validation_failed", { hint: "missing field x" });
    const body = await res.json();
    const blob = JSON.stringify(body);
    expect(blob).not.toMatch(/at\s+\/|node_modules|stack:/);
    expect(body.error).toBe("validation_failed");
  });
});
