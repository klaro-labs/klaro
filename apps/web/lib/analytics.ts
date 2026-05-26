/**
 * PostHog analytics adapter — CLIENT-ONLY by design.
 * **+W82-2 honest-label (per ):** this module
 * is browser-only. `consentGiven()` requires `window.localStorage`,
 * and `client()` requires `window` to call into posthog-js. When called
 * from a server context (server action, API route, server component),
 * `track()` is a no-op — it does NOT route to posthog-node despite
 * the prior docstring's claim (posthog-node was never wired).
 * ANA1 wired `track()` calls from 3 server actions; those calls
 * silently did nothing AND leaked tenant identifiers to stdout via
 * the `console.debug` fallback. reverts those 3 call sites
 * and gates the dev-mode debug log behind NODE_ENV !== "production".
 * Live (POSTHOG_KEY set + cookie consent = "accept-all" + browser
 * context): captures events keyed by the strict `KlaroEvent` enum
 * from `lib/events.ts`.
 * Server-side analytics (PostHog Node SDK + queue worker) is M11
 * scope — wired alongside the live screening + GrowthBook flag
 * provider rollout. Until then, server-side `track()` calls are
 * deliberately not added: that pattern violates by
 * looking-wired while doing nothing.
 * Consent: cookies/CookieConsent.tsx stores `klaro.cookie.consent.v1`.
 * We only call into posthog-js when consent === "accept-all".
 */

import { POSTHOG_KEY, POSTHOG_HOST, posthogLive } from "./env";
import type { KlaroEvent } from "./events";

function consentGiven(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.localStorage.getItem("klaro.cookie.consent.v1");
    if (!raw) return false;
    const v = JSON.parse(raw);
    return v?.d === "accept-all";
  } catch {
    return false;
  }
}

/** Hide the optional `posthog-js` import from webpack's static analyzer so
 * the build never requires the package to be installed. Loaded only when
 * posthog is actually live. */
const dynamicImport = (path: string) =>
  (Function("p", "return import(p)") as (p: string) => Promise<unknown>)(path);

let _client: {
  capture: (e: string, p: Record<string, unknown>) => void;
} | null = null;

async function client() {
  if (_client) return _client;
  if (!posthogLive() || typeof window === "undefined" || !consentGiven())
    return null;
  try {
    const mod = (await dynamicImport("posthog-js")) as { default?: unknown };
    const posthog = (mod.default ?? mod) as {
      init: (k: string, opts: Record<string, unknown>) => void;
      capture: (e: string, p: Record<string, unknown>) => void;
    };
    posthog.init(POSTHOG_KEY!, {
      api_host: POSTHOG_HOST,
      capture_pageview: false,
    });
    _client = posthog;
    return _client;
  } catch {
    return null;
  }
}

export async function track(
  event: KlaroEvent,
  props?: Record<string, unknown>,
): Promise<void> {
  if (!posthogLive() || !consentGiven()) {
    // previously logged `props` (vendorId, invoiceId,
    // orderId, caseId, amounts) to stdout on every call. With
    // ANA1 wiring those calls fired from server actions in prod,
    // leaking tenant correlators + amounts to Vercel runtime logs.
    // Now: dev-only debug + event-name without props. Server callers
    // are reverted ; this branch only runs in browser when
    // consent is denied or POSTHOG_KEY is unset.
    if (process.env.NODE_ENV !== "production") {
      console.debug("[mock-posthog]", event, props);
    }
    return;
  }
  const c = await client();
  c?.capture(event, props ?? {});
}
