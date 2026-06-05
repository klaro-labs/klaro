import type { MetadataRoute } from "next";

const BASE = "https://www.myklaro.app";

/** Public-indexable routes. Audit fix (loop iter 4, 2026-05-25): legal pages,
 * docs, help, status, brand-kit, fx, agents were all missing — regulator
 * crawlers + GDPR compliance scrapers couldn't find them. Adding now. */
const ROUTES: {
  path: string;
  changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"];
  priority: number;
}[] = [
  // Marketing core
  { path: "", changeFrequency: "weekly", priority: 1.0 },
  { path: "/product", changeFrequency: "monthly", priority: 0.8 },
  { path: "/product/invoicing", changeFrequency: "monthly", priority: 0.7 },
  { path: "/product/cashout", changeFrequency: "monthly", priority: 0.7 },
  { path: "/product/receipts", changeFrequency: "monthly", priority: 0.7 },
  { path: "/product/reputation", changeFrequency: "monthly", priority: 0.7 },
  { path: "/product/stablefx", changeFrequency: "monthly", priority: 0.7 },
  { path: "/developers", changeFrequency: "monthly", priority: 0.8 },
  { path: "/build", changeFrequency: "monthly", priority: 0.8 },
  { path: "/pricing", changeFrequency: "monthly", priority: 0.8 },
  { path: "/company", changeFrequency: "monthly", priority: 0.7 },
  { path: "/company/contact", changeFrequency: "yearly", priority: 0.5 },
  { path: "/roadmap", changeFrequency: "weekly", priority: 0.7 },
  { path: "/docs", changeFrequency: "weekly", priority: 0.8 },
  { path: "/brand-kit", changeFrequency: "monthly", priority: 0.5 },
  { path: "/resources", changeFrequency: "monthly", priority: 0.6 },
  { path: "/resources/flows", changeFrequency: "monthly", priority: 0.6 },

  // Trust + ops
  { path: "/trust", changeFrequency: "monthly", priority: 0.7 },
  { path: "/status", changeFrequency: "daily", priority: 0.6 },
  { path: "/help", changeFrequency: "monthly", priority: 0.5 },

  // Product surfaces (deep-linkable to lists)
  { path: "/fx", changeFrequency: "weekly", priority: 0.6 },
  { path: "/agents", changeFrequency: "weekly", priority: 0.6 },
  // x402-demo is a public developer-facing demo of the x402
  // nanopayment flow; was discoverable from /developers but not indexed.
  { path: "/x402-demo", changeFrequency: "monthly", priority: 0.5 },

  // Sign-in
  { path: "/signin", changeFrequency: "yearly", priority: 0.4 },

  // Legal — required for regulator + GDPR compliance crawls
  { path: "/legal/terms", changeFrequency: "yearly", priority: 0.4 },
  { path: "/legal/privacy", changeFrequency: "yearly", priority: 0.4 },
  { path: "/legal/dpa", changeFrequency: "yearly", priority: 0.4 },
  { path: "/legal/subprocessors", changeFrequency: "monthly", priority: 0.4 },
  { path: "/legal/cookies", changeFrequency: "yearly", priority: 0.4 },
  { path: "/legal/acceptable-use", changeFrequency: "yearly", priority: 0.4 },
  { path: "/legal/disclosures", changeFrequency: "monthly", priority: 0.4 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return ROUTES.map(({ path, changeFrequency, priority }) => ({
    url: `${BASE}${path}`,
    lastModified: now,
    changeFrequency,
    priority,
  }));
}
