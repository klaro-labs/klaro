import en from "@/messages/en.json";
import hi from "@/messages/hi.json";

/**
 * Klaro i18n. Cookie-based locale (no `app/[locale]/...` route restructure
 * yet — that's M12 polish if a real i18n user lands).
 * `t(key, locale, vars)` reads from the chosen JSON; falls back to English
 * for missing keys (and for the 4 untranslated locales today). M11 ships:
 * - en (full)
 * - hi (DeepL pre-translated + native review pending)
 * - pt-BR / es / tl / ar (placeholders, Crowdin queue active)
 */

export const SUPPORTED_LOCALES = [
  "en",
  "hi",
  "pt-BR",
  "es",
  "tl",
  "ar",
] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";

/** RTL locales. Layout/components add `dir={isRtl(locale) ? "rtl" : "ltr"}`
 * to the `<html>` element when locale flips. */
export const RTL_LOCALES: readonly Locale[] = ["ar"];
export const isRtl = (l: Locale): boolean => RTL_LOCALES.includes(l);

export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  hi: "हिन्दी",
  "pt-BR": "Português (BR)",
  es: "Español",
  tl: "Filipino",
  ar: "العربية",
};

const MESSAGES: Record<Locale, Record<string, unknown>> = {
  en: en as Record<string, unknown>,
  hi: hi as Record<string, unknown>,
  "pt-BR": {},
  es: {},
  tl: {},
  ar: {},
};

type Messages = typeof en;
type Path<T, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends Record<string, unknown>
    ? Path<T[K], `${P}${P extends "" ? "" : "."}${K}`>
    : `${P}${P extends "" ? "" : "."}${K}`;
}[keyof T & string];
export type MessageKey = Path<Messages>;

function deep(obj: Record<string, unknown>, key: string): string | undefined {
  return key.split(".").reduce<unknown>((acc, k) => {
    if (acc && typeof acc === "object" && k in acc)
      return (acc as Record<string, unknown>)[k];
    return undefined;
  }, obj) as string | undefined;
}

export function t(
  key: MessageKey,
  locale: Locale = DEFAULT_LOCALE,
  vars?: Record<string, string | number>,
): string {
  const fromLocale = deep(MESSAGES[locale], key);
  const fromEn = deep(MESSAGES.en, key);
  const raw = fromLocale ?? fromEn ?? key;
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`));
}

export const LOCALE_COOKIE = "klaro.locale";

/** Server-side: parse the locale cookie from `cookies()`. Returns DEFAULT_LOCALE
 * when unset or invalid. */
export function parseLocale(cookieValue: string | undefined): Locale {
  if (!cookieValue) return DEFAULT_LOCALE;
  return (SUPPORTED_LOCALES as readonly string[]).includes(cookieValue)
    ? (cookieValue as Locale)
    : DEFAULT_LOCALE;
}
