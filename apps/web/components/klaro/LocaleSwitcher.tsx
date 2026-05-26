"use client";

import { useEffect, useState } from "react";
import {
  SUPPORTED_LOCALES,
  LOCALE_LABELS,
  LOCALE_COOKIE,
  DEFAULT_LOCALE,
  type Locale,
} from "@/lib/i18n";

function readCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  const match = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"));
  return match ? decodeURIComponent(match[2]) : undefined;
}

export function LocaleSwitcher() {
  const [locale, setLocale] = useState<Locale>(DEFAULT_LOCALE);
  useEffect(() => {
    const cookie = readCookie(LOCALE_COOKIE);
    if (cookie && (SUPPORTED_LOCALES as readonly string[]).includes(cookie)) {
      setLocale(cookie as Locale);
    }
  }, []);

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value as Locale;
    setLocale(next);
    // 1 year, all paths. SameSite=Lax so cross-site links still carry it.
    document.cookie = `${LOCALE_COOKIE}=${next};path=/;max-age=${60 * 60 * 24 * 365};SameSite=Lax`;
    // Reload so server components re-render with the new locale.
    window.location.reload();
  }

  return (
    <label className="inline-flex items-center gap-2 text-xs text-current">
      <span className="sr-only">Language</span>
      <select
        value={locale}
        onChange={onChange}
        // Theme-neutral: uses currentColor + transparent bg so it inherits
        // from the surrounding surface (dark footer or light pages alike).
        className="cursor-pointer rounded border border-current/30 bg-transparent px-2 py-1 text-xs text-current focus:border-current focus:outline-none"
      >
        {SUPPORTED_LOCALES.map((l) => (
          <option key={l} value={l} className="text-[var(--color-ink)]">
            {LOCALE_LABELS[l]}
          </option>
        ))}
      </select>
    </label>
  );
}
