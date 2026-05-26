"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "klaro.cookie.consent.v1";

type Decision = "accept-all" | "essential-only";

export function CookieConsent() {
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

  if (decided) return null;

  return (
    <div
      role="dialog"
      aria-label="Cookie consent"
      className="fixed bottom-4 left-1/2 z-50 w-[min(960px,calc(100vw-2rem))] -translate-x-1/2 rounded-lg border border-[var(--color-line)] bg-white p-4 shadow-[0_8px_30px_rgba(0,0,0,0.18)]"
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-6">
        <div className="flex-1 text-sm">
          <p className="font-medium">Cookies</p>
          <p className="mt-1 text-[var(--color-ink-muted)]">
            Klaro uses essential cookies to keep you signed in + record your
            consent. Optional analytics help us understand which surfaces
            vendors actually use. Your call.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            onClick={() => decide("essential-only")}
            className="rounded border border-[var(--color-line)] bg-white px-3 py-2 text-xs font-medium hover:border-[var(--color-brand)]"
          >
            Essential only
          </button>
          <button
            onClick={() => decide("accept-all")}
            className="rounded bg-[var(--color-ink)] px-3 py-2 text-xs font-medium text-white hover:bg-black"
          >
            Accept all
          </button>
        </div>
      </div>
    </div>
  );
}
