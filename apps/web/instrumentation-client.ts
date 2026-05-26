/**
 * Sentry — browser-side init. Runs in every client component on first mount.
 * No-op when `NEXT_PUBLIC_SENTRY_DSN` unset (dev / preview without telemetry).
 * reads moved to env.ts so split-brain between server
 * `SENTRY_DSN` and client `NEXT_PUBLIC_SENTRY_DSN` is documented in one
 * place. Same env-bypass class as W83-2 PUBLIC_ORIGIN.
 */
import * as Sentry from "@sentry/nextjs";
import { NEXT_PUBLIC_SENTRY_DSN, NEXT_PUBLIC_SENTRY_ENV } from "@/lib/env";

const dsn = NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: NEXT_PUBLIC_SENTRY_ENV,
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1.0,
    // (#94): free-form text could carry emails / wallet
    // addresses. Strip them before they leave the browser.
    beforeSend(event) {
      return scrubPii(event);
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

// self-audit: client-side had the SAME gap as the
// server-side P1 fix — scrubPii walked only message + exception.value,
// missing event.extra / event.contexts / event.request.url. Mirror the
// server-side redactRecord pattern (incl. array walk).
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

function scrubPii<
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
  if (vals) {
    for (const v of vals) if (v.value) v.value = redact(v.value);
  }
  if (event.extra) redactRecord(event.extra);
  if (event.contexts) redactRecord(event.contexts);
  if (event.request?.url) event.request.url = redact(event.request.url);
  return event;
}

// Sentry requires this export to
// instrument App Router navigations. Without it, route-transition traces
// don't reach Sentry — silent observability gap. Surfaced by `next lint`.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
