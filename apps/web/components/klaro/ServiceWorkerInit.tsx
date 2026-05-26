"use client";

import { useEffect } from "react";

/**
 * Registers the PWA service worker. Mount once at root layout; idempotent.
 * Silently no-ops when serviceWorker isn't supported.
 */
export function ServiceWorkerInit() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator))
      return;
    if (process.env.NODE_ENV !== "production") return; // skip in dev
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // silent fail — PWA is a progressive enhancement
    });
  }, []);
  return null;
}
