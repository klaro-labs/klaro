/**
 * Shared API helpers — zod validation, JSON response, error shape, idempotency.
 * Every REST route imports from here for consistency.
 */
import { createHash } from "node:crypto";
import { z, type ZodSchema } from "zod";
import { redis as edgeIdem } from "./apiIdem";
import { captureError } from "./sentry";
import { getCurrentSession } from "./auth";

/**
 * Idempotency cache key, namespaced by the authenticated principal. The raw
 * Idempotency-Key header is a GLOBAL value the client chooses — keying the cache
 * on it alone let tenant B replay tenant A's idem key and receive A's
 * authenticated response (cross-tenant leak), and let an anonymous caller read a
 * cached authenticated body (auth bypass). Resolve the session first and prefix
 * with the vendor id (or "anon"); hash the raw key so it can't inject cache-key
 * structure or blow up the key length.
 */
async function idempotencyCacheKey(idemKey: string): Promise<string> {
  const session = await getCurrentSession().catch(() => null);
  const principal = session?.vendor?.id ?? "anon";
  return `${principal}:${createHash("sha256").update(idemKey).digest("hex")}`;
}

export type ApiHandler<T> = (input: T, req: Request) => Promise<unknown>;

export interface ApiError {
  error: string;
  detail?: unknown;
  requestId?: string;
}

// JSON.stringify throws on bigint.
// Invoice.amount, AgentJob.amountUsdc, LineItem.amountUsdc and several
// other domain types use bigint for USDC 6-dec precision. Any API route
// returning these would 500 in prod with `TypeError: Do not know how to
// serialize a BigInt`. Stringifying bigint here is the canonical workaround
// — every caller already expects USDC amounts as decimal strings to
// preserve precision across the JSON boundary.
function bigintReplacer(_key: string, value: unknown): unknown {
  return typeof value === "bigint" ? value.toString() : value;
}

function jsonSafe(data: unknown): string {
  return JSON.stringify(data, bigintReplacer);
}

export function ok<T>(data: T, init?: ResponseInit): Response {
  return new Response(jsonSafe(data), {
    status: 200,
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });
}
export function created<T>(data: T): Response {
  return ok(data, { status: 201 });
}
export function noContent(): Response {
  return new Response(null, { status: 204 });
}

export function err(status: number, error: string, detail?: unknown): Response {
  const body: ApiError = { error, detail };
  return new Response(jsonSafe(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** GET-handler wrapper. Same auth/error mapping as handle() but no body parse.
 * Bare GET handlers that called requireVendor() returned uncaught 500 to anon
 * callers (P0-11 pen-test finding). This collapses every read endpoint to the
 * same auth→401, forbidden→403 mapping.
 */
export function handleGet<T>(
  fn: (req: Request) => Promise<T>,
): (req: Request) => Promise<Response> {
  return async (req) => {
    try {
      const result = await fn(req);
      return new Response(jsonSafe(result), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    } catch (e) {
      const error = e as Error;
      captureError(error, { url: req.url, method: req.method });
      const status = /unauthor/i.test(error.message)
        ? 401
        : /forbid/i.test(error.message)
          ? 403
          : 500;
      const code =
        status === 401
          ? "unauthorized"
          : status === 403
            ? "forbidden"
            : "internal_error";
      return err(status, code);
    }
  };
}

/** Wrap a handler: parse JSON body, validate with zod, dispatch errors uniformly,
 * honor `Idempotency-Key` header (replay → 200 with cached response). */
export function handle<T extends ZodSchema>(
  schema: T,
  fn: ApiHandler<z.infer<T>>,
): (req: Request) => Promise<Response> {
  return async (req) => {
    try {
      const idemKey = req.headers.get("idempotency-key");
      // Resolve the per-principal cache key BEFORE the lookup so a cached
      // authenticated response can never be replayed across tenants or to an
      // anonymous caller (audit 2026-05-30).
      const cacheKey = idemKey ? await idempotencyCacheKey(idemKey) : null;
      if (cacheKey) {
        const cached = await edgeIdem.get(cacheKey);
        if (cached)
          return new Response(cached, {
            status: 200,
            headers: {
              "content-type": "application/json",
              "idempotent-replay": "true",
            },
          });
      }

      const raw =
        req.method === "GET" || req.method === "DELETE"
          ? {}
          : await req.json().catch(() => ({}));
      const parsed = schema.safeParse(raw);
      if (!parsed.success)
        return err(400, "validation_error", parsed.error.flatten());

      const result = await fn(parsed.data, req);
      // bare `JSON.stringify(result)` threw
      // `TypeError: Do not know how to serialize a BigInt` for every
      // handler returning a domain type that carries USDC amounts
      // (Invoice.amount, AgentJob.amountUsdc, etc). The thrown error
      // was caught at line 96 → every successful POST returned
      // 500 internal_error. The `ok()`/`err()` helpers already use
      // jsonSafe; handle() must too.
      const body = jsonSafe(result);
      if (cacheKey) await edgeIdem.set(cacheKey, body, 24 * 60 * 60);
      return new Response(body, {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    } catch (e) {
      const error = e as Error;
      captureError(error, { url: req.url, method: req.method });
      // err(status, error.message)
      // leaked raw Error.message including PostgREST schema/table names,
      // file paths, and connection-string fragments. Sentry already has
      // the full error via captureError above. The HTTP response now ships
      // only a sanitized class code that distinguishes auth/validation
      // failures the caller threw on purpose (so client-side handlers can
      // still route on 401/403/400) from generic server-error.
      // added the `_not_yet_(available|persistent|live)`
      // pattern → 503 so 's OpenAPI 503 declaration on
      // /v1/webhooks matches what the runtime actually returns. Same
      // applies to /v1/disputes (`disputes_not_yet_persistent`) and any
      // future M11-deferred surface using the same naming convention.
      const status = /unauthor/i.test(error.message)
        ? 401
        : /forbid/i.test(error.message)
          ? 403
          : /^validation|invalid/i.test(error.message)
            ? 400
            : /_not_yet_(available|persistent|live)/.test(error.message)
              ? 503
              : 500;
      const code =
        status === 401
          ? "unauthorized"
          : status === 403
            ? "forbidden"
            : status === 400
              ? "validation_failed"
              : status === 503
                ? "not_yet_available"
                : "internal_error";
      return err(status, code);
    }
  };
}

/// Sanitize an arbitrary Error for client response. Reuse from route
/// handlers that catch their own errors and want to surface a generic
/// public-safe message while keeping the real error in Sentry.
/// replaces the pattern of
/// `err(400, (e as Error).message)` scattered across webauthn + push
/// routes which leaked exception text directly to callers.
export function publicErrorMessage(
  e: unknown,
  fallback = "request_failed",
): string {
  if (!(e instanceof Error)) return fallback;
  // Allow short, safe codes (snake_case, single word) through — these are
  // intentional, caller-supplied identifiers. Anything else (long, has
  // punctuation, multi-word) becomes the fallback.
  if (/^[a-z][a-z0-9_]{0,48}$/.test(e.message)) return e.message;
  return fallback;
}
