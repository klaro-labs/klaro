/** Sentry — edge runtime (middleware + edge routes).
 * reads moved to env.ts (was bypassing the audit boundary).
 * self-audit: previously had NO scrub at all. Sentry's edge
 * auto-instrumentation captures uncaught middleware/edge-route errors
 * with request URL + headers in event.request.url — leaking tenant
 * identifiers. Mirror the server-side + client-side
 * scrub pattern (incl. array walk).
 */
import * as Sentry from "@sentry/nextjs";
import { SENTRY_DSN, SENTRY_ENV } from "@/lib/env";

if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: SENTRY_ENV,
    tracesSampleRate: 0.05,
    beforeSend(event) {
      return scrub(event);
    },
    beforeBreadcrumb(crumb) {
      if (crumb.message) crumb.message = redact(crumb.message);
      if (crumb.data) redactRecord(crumb.data);
      return crumb;
    },
  });
}

function redact(s: string): string {
  return s
    .replace(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi, "[email]")
    .replace(/0x[a-f0-9]{40}/gi, (m) => `${m.slice(0, 6)}…${m.slice(-4)}`);
}

function redactRecord(rec: Record<string, unknown>): void {
  for (const k of Object.keys(rec)) {
    const v = rec[k];
    if (typeof v === "string") {
      rec[k] = redact(v);
    } else if (Array.isArray(v)) {
      for (let i = 0; i < v.length; i++) {
        const el = v[i];
        if (typeof el === "string") v[i] = redact(el);
        else if (el && typeof el === "object" && !Array.isArray(el)) {
          redactRecord(el as Record<string, unknown>);
        }
      }
    } else if (v && typeof v === "object") {
      redactRecord(v as Record<string, unknown>);
    }
  }
}

function scrub<
  T extends {
    exception?: { values?: { value?: string }[] };
    message?: string;
    extra?: Record<string, unknown>;
    contexts?: Record<string, unknown>;
    request?: { url?: string };
  },
>(event: T): T {
  if (event.message) event.message = redact(event.message);
  const vals = event.exception?.values;
  if (vals) for (const v of vals) if (v.value) v.value = redact(v.value);
  if (event.extra) redactRecord(event.extra);
  if (event.contexts) redactRecord(event.contexts);
  if (event.request?.url) event.request.url = redact(event.request.url);
  return event;
}
