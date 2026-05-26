// Next.js instrumentation hook.
// Without this file, the Sentry SDK warned at build time that server-side
// telemetry would never initialize — `sentry.server.config.ts` /
// `sentry.edge.config.ts` are deprecated as standalone init points in
// Next 15. `register()` here is the canonical place to import them so
// each runtime's `Sentry.init` actually runs.
// Docs: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
// https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

// Capture nested errors in nested React Server Components so Sentry sees them.
// Sentry's onRequestError handles the wiring for App Router automatically.
export { captureRequestError as onRequestError } from "@sentry/nextjs";
