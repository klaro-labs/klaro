"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

const STORAGE_KEY = "klaro.cookie.consent.v1";
const OPTIONAL_ANALYTICS_ENABLED = Boolean(process.env.NEXT_PUBLIC_POSTHOG_KEY);

type Decision = "accept-all" | "essential-only";

export function CookieConsent() {
  const pathname = usePathname();
  const [decided, setDecided] = useState<boolean>(true); // assume decided to avoid flash

  useEffect(() => {
    try {
      const v = window.localStorage.getItem(STORAGE_KEY);
      setDecided(Boolean(v));
    } catch {
      setDecided(true);
    }
  }, []);

  function decide(d: Decision) {
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ d, at: Date.now() }),
      );
    } catch {}
    setDecided(true);
    // Wire to PostHog opt-in/out in M11. Today the consent is recorded locally
    // and the daemon's analytics adapter is no-op until M11.
  }

  // Suppress inside the authenticated app shell (/vendor, /lp, /admin,
  // /internal): those routes render a fixed mobile bottom-tab nav + FAB that
  // this bottom-pinned banner would sit on top of and hide. Consent is still
  // collected on every public page (incl. /signin, which every user passes
  // through) and persists site-wide via localStorage.
  const inAppShell = ["/vendor", "/lp", "/admin", "/internal"].some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
  if (
    !OPTIONAL_ANALYTICS_ENABLED ||
    decided ||
    pathname === "/onboarding" ||
    inAppShell
  ) {
    return null;
  }

  return (
    <div
      role="dialog"
      aria-label="Cookie consent"
      // QA-057: was `fixed bottom-20 ... centered` which on standard 900px
      // viewports landed the banner SQUARELY over the primary pricing tier
      // (and equivalent above-the-fold CTAs on every other page). Move
      // to a slim bottom-pinned bar so it docks below all real content.
      className="fixed bottom-0 left-0 right-0 z-[60] border-t border-[var(--color-line)] bg-[var(--color-bg)] px-4 pt-3 pb-[max(env(safe-area-inset-bottom),12px)] shadow-[0_-4px_20px_rgba(0,0,0,0.10)]"
    >
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-2 md:flex-row md:items-center md:gap-6">
        <div className="flex-1 text-sm">
          <p className="font-medium">
            Cookies{" "}
            <span className="font-normal text-[var(--color-ink-muted)]">
              — essential to keep you signed in; optional analytics only with
              your okay.
            </span>
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            onClick={() => decide("essential-only")}
            className="flex-1 rounded border border-[var(--color-line)] bg-white px-3 py-2 text-xs font-medium hover:border-[var(--color-brand)] md:flex-none"
          >
            Essential only
          </button>
          <button
            onClick={() => decide("accept-all")}
            className="flex-1 rounded bg-[var(--color-ink)] px-3 py-2 text-xs font-medium text-white hover:bg-black md:flex-none"
          >
            Accept all
          </button>
        </div>
      </div>
    </div>
  );
}
