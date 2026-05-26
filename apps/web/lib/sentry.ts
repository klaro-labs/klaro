/**
 * Sentry adapter — static import.
 * previous version dynamic-imported with a
 * try/catch fallback that swallowed errors. Result: SENTRY_DSN set in prod
 * → captureException calls silently no-op'd. Now we import statically; the
 * Sentry SDK itself handles "no DSN configured" gracefully (its functions
 * become no-ops without the init), so we don't need the fallback wrapping.
 * init is owned by `sentry.{client,server,edge}.config.ts` at the project root,
 * which Next.js loads automatically. This file just exposes the API surface
 * the rest of the app already calls.
 */

import * as Sentry from "@sentry/nextjs";
import { sentryLive } from "./env";

export function captureError(
  err: unknown,
  context?: Record<string, unknown>,
): void {
  if (!sentryLive()) {
    // Dev visibility — keep the console line so non-Sentry environments still see errors.
    console.warn("[sentry-disabled]", err, context);
  }
  Sentry.captureException(err, context ? { extra: context } : undefined);
}

export async function withSpan<T>(
  op: string,
  name: string,
  fn: () => Promise<T>,
): Promise<T> {
  return Sentry.startSpan({ op, name }, fn);
}

/** No-op shim — kept for backwards compat with callers that still invoke
 * `initSentry()` at boot. Real init lives in `sentry.{client,server,edge}.config.ts`. */
export async function initSentry(): Promise<void> {
  /* see sentry.*.config.ts */
}
