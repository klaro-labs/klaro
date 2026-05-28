/**
 * Open-redirect-safe path resolver.
 *
 * Three separate redirect helpers in this codebase (QA-019 /auth/callback
 * safeNext, QA-044 /api/moonpay/buy safeRedirectTarget, QA-045
 * /api/auth/magic safeRedirect) all shared the same defect: they whitelisted
 * paths via `startsWith("/") && !startsWith("//")` which lets backslash-
 * prefixed paths like "/\\evil.com" slip through. Chromium normalizes
 * backslashes in URLs to forward slashes, so the resulting URL becomes
 * "//evil.com" — an off-origin redirect with attacker-controlled host.
 *
 * This module consolidates the fix into one allow-list validator so the
 * three call sites can't drift apart again. Future redirect helpers MUST
 * call assertOriginRelative() rather than rolling their own whitelist.
 */

/**
 * Returns true if `raw` is a same-origin redirect target. Rejects:
 *   - absolute URLs to other hosts (https://evil.com)
 *   - protocol-relative URLs (//evil.com)
 *   - backslash-prefixed paths (/\\evil.com — normalized to //evil.com by Chromium)
 *   - any URL whose resolved origin differs from ours
 *   - non-http(s) schemes (javascript:, data:, mailto:)
 *
 * The allow-list mindset: accept ONE narrowly-defined shape (origin-relative
 * path starting with a single `/`), reject everything else. Deny-list
 * patterns (`!startsWith("//")`) lose to URL-normalization quirks.
 */
export function isSafeOriginRelative(raw: string, origin: string): boolean {
  if (!raw) return false;
  if (raw.includes("\\")) return false;
  if (!raw.startsWith("/")) return false;
  if (raw.startsWith("//")) return false;
  let u: URL;
  try {
    u = new URL(raw, origin);
  } catch {
    return false;
  }
  if (u.origin !== origin) return false;
  if (u.pathname.startsWith("//")) return false;
  return true;
}

/**
 * Resolve `raw` to a safe same-origin URL string, falling back to the
 * origin root if `raw` is malformed or off-origin. Use this when you need
 * a URL to emit (e.g. as an `emailRedirectTo` or 302 Location).
 */
export function resolveSafeRedirect(
  raw: string | null | undefined,
  origin: string,
  fallback = "/",
): string {
  const candidate = raw ?? fallback;
  if (!isSafeOriginRelative(candidate, origin)) {
    return new URL(fallback, origin).toString();
  }
  return new URL(candidate, origin).toString();
}
