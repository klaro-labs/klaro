import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Inter, Inter_Tight, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Web3Provider } from "@/components/providers/Web3Provider";
import { CookieConsent } from "@/components/klaro/CookieConsent";
import { ServiceWorkerInit } from "@/components/klaro/ServiceWorkerInit";
import { LOCALE_COOKIE, parseLocale, isRtl } from "@/lib/i18n";

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
        <Web3Provider>{children}</Web3Provider>
        <CookieConsent />
        <ServiceWorkerInit />
      </body>
    </html>
  );
}
