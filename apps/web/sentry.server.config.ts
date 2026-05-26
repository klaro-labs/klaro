/**
 * Sentry — server-side init. Runs for every server component, server action,
 * and API route. No-op when SENTRY_DSN unset.
 * reads moved to env.ts (was bypassing the audit boundary).
 * Same env-bypass class closed across -84 sweep.
 */
import * as Sentry from "@sentry/nextjs";
import { SENTRY_DSN, SENTRY_ENV } from "@/lib/env";

if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: SENTRY_ENV,
    tracesSampleRate: 0.1,
    beforeSend(event) {
      return scrub(event);
    },
    beforeBreadcrumb(crumb) {
      // web P1 (audit): server-side previously scrubbed only
      // crumb.message; auto-instrumented http/fetch breadcrumbs put
      // URLs (with vendor-id query strings) in crumb.data.url, leaking
      // tenant identifiers. Mirror the client-side data-scrub pattern.
      if (crumb.message) crumb.message = redact(crumb.message);
      if (crumb.data) {
        for (const k of Object.keys(crumb.data)) {
          const v = crumb.data[k];
          if (typeof v === "string") crumb.data[k] = redact(v);
        }
      }
      return crumb;
    },
  });
}

function redact(s: string): string {
  return s
    .replace(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi, "[email]")
    .replace(/0x[a-f0-9]{40}/gi, (m) => `${m.slice(0, 6)}…${m.slice(-4)}`);
}

// web P1 (audit): the prior scrub() walked only event.message +
// exception.values[].value. Every `captureError(e, { vendorId, caseId,
// email, url })` from lib/sentry.ts shipped raw tenant identifiers into
// event.extra / event.contexts / event.request.url un-redacted. Same
// blast radius as HTTP-leak fix, different sink. Walk every
// string leaf in extras + contexts + request URL.
// self-audit: previous version skipped Array values, so
// `captureError(e, { invoiceIds: ["0xabc…", "0xdef…"] })` would have
// shipped raw addresses. Walk arrays too — both string elements and
// nested objects. Bounded by Sentry's transport-side depth/size cap.
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
