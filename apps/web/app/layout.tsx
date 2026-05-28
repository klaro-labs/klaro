import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Inter, Inter_Tight, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Web3Provider } from "@/components/providers/Web3Provider";
import { CookieConsent } from "@/components/klaro/CookieConsent";
import { JsonLd } from "@/components/klaro/JsonLd";
import { ServiceWorkerInit } from "@/components/klaro/ServiceWorkerInit";
import { LOCALE_COOKIE, parseLocale, isRtl } from "@/lib/i18n";

const SITE_JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://klaro.so/#org",
      name: "Klaro",
      url: "https://klaro.so",
      logo: "https://klaro.so/brand/klaro-wordmark.svg",
      description:
        "Arc-native payment OS for emerging-market vendors. Invoice globally in USDC, prove every payment on-chain, cash out through verified partners.",
      sameAs: ["https://github.com/klaro-labs/klaro"],
    },
    {
      "@type": "WebSite",
      "@id": "https://klaro.so/#site",
      url: "https://klaro.so",
      name: "Klaro",
      publisher: { "@id": "https://klaro.so/#org" },
    },
  ],
};

// next/font self-hosts the families with `display: swap` + preload. The
// `variable` outputs feed the `--font-*` CSS variables declared in
// globals.css so Tailwind utility classes (`font-display`, `font-sans`,
// `font-mono`) resolve to the real designer-spec families instead of
// system fallbacks. Source of truth: designer/brand-kit/index.html.
const interTight = Inter_Tight({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Klaro — Get paid in seconds. Not weeks.",
  description:
    "Klaro helps vendors invoice in USDC, preview verifiable receipts, and simulate controlled cashout flows. Built for Arc testnet.",
  metadataBase: new URL("https://klaro.so"),
  openGraph: {
    title: "Klaro — Get paid in seconds.",
    description:
      "Arc-native payment OS for global vendors. Invoice in USDC. Cash out locally. Prove every payment.",
    url: "https://klaro.so",
    siteName: "Klaro",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Klaro — Get paid in seconds.",
    description:
      "Arc-native payment OS for global vendors. Demo flows built for Arc testnet.",
  },
  robots: { index: true, follow: true },
  manifest: "/manifest.json",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const cookieStore = await cookies();
  const locale = parseLocale(cookieStore.get(LOCALE_COOKIE)?.value);
  return (
    <html
      lang={locale}
      dir={isRtl(locale) ? "rtl" : "ltr"}
      className={`${interTight.variable} ${inter.variable} ${jetbrainsMono.variable}`}
    >
      <body>
        <JsonLd data={SITE_JSON_LD} />
        <Web3Provider>{children}</Web3Provider>
        <CookieConsent />
        <ServiceWorkerInit />
      </body>
    </html>
  );
}
