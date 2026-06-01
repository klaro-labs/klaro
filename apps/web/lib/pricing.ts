/**
 * Single source of truth for Klaro pricing. Page + backend fee calc both
 * import from here so docs can never drift from runtime billing.
 *
 * Testnet today. Mainnet target labelled `mainnet-future` per principle 8.
 */

export type TierId = "testnet" | "standard" | "scale";

export interface Tier {
  id: TierId;
  name: string;
  price: string;
  /** Short label rendered next to price. */
  unit: string;
  sub: string;
  /** Per-row feature list shown on the card. */
  features: string[];
  cta: { label: string; href: string };
  /** Visual emphasis — middle tier is the mainnet target. */
  highlight: boolean;
  /** principle 8 label. */
  status: "live testnet" | "mainnet-future" | "custom";
}

export const FEE_BPS = {
  /** Invoice settlement fee in basis points, mainnet only. */
  invoice: 100,
  /** Klaro cashout fee in basis points, on top of LP spread. */
  cashout: 30,
} as const;

export const TIERS: readonly Tier[] = [
  {
    id: "testnet",
    name: "Testnet",
    price: "Free",
    unit: "forever",
    sub: "All features. No caps. Testnet tokens only.",
    features: [
      "Unlimited invoices",
      "On-chain receipts",
      "Cashout simulation",
      "Reputation scoring",
      "Multi-chain receive",
      "Community support",
    ],
    cta: { label: "Open workspace", href: "/signin" },
    highlight: false,
    status: "live testnet",
  },
  {
    id: "standard",
    name: "Standard",
    price: "1.0%",
    unit: "of settled volume",
    sub: "Flat on settled volume. No monthly fee. Partner-payout fees passed through.",
    features: [
      "Everything in Testnet",
      "Live USDC settlement",
      "Partner cashout corridors",
      "Webhook delivery + retries",
      "Priority support · 4h response",
      "Audit log retention · 2 years",
    ],
    cta: { label: "Open workspace", href: "/signin" },
    highlight: true,
    status: "mainnet-future",
  },
  {
    id: "scale",
    name: "Scale",
    price: "Custom",
    unit: "volume-tiered",
    sub: "For platforms reselling Klaro or LPs running large payout networks.",
    features: [
      "Everything in Standard",
      "White-label invoicing",
      "Dedicated infrastructure",
      "Custom screening rules",
      "24×7 on-call rotation",
      "Named CSM + SOC reporting",
    ],
    cta: { label: "Talk to sales", href: "mailto:sales@klaro.so" },
    highlight: false,
    status: "custom",
  },
] as const;

/** Comparison-matrix rows. Each row is what the tier actually gives you. */
export interface CompareRow {
  feature: string;
  testnet: string;
  standard: string;
  scale: string;
}

export const COMPARE_ROWS: readonly CompareRow[] = [
  {
    feature: "Per-invoice fee",
    testnet: "Free",
    standard: "1.0% of settled USDC",
    scale: "Negotiated",
  },
  {
    feature: "Cashout fee (Klaro)",
    testnet: "0.3% withheld on-chain (fiat payout simulated)",
    standard: "0.3% + LP spread",
    scale: "Negotiated",
  },
  {
    feature: "Monthly minimum",
    testnet: "None",
    standard: "None",
    scale: "None",
  },
  { feature: "Per-seat fee", testnet: "None", standard: "None", scale: "None" },
  {
    feature: "Supported settlement assets",
    testnet: "USDC, EURC (Arc testnet)",
    standard: "USDC, EURC (Arc mainnet)",
    scale: "USDC, EURC + new corridors on request",
  },
  {
    feature: "Cross-chain receive",
    testnet: "CCTP V2 + App Kit",
    standard: "CCTP V2 + App Kit",
    scale: "Same + private routing rules",
  },
  {
    feature: "Webhook delivery",
    testnet: "HMAC + retries",
    standard: "HMAC + retries + DLQ replay",
    scale: "Same + custom delivery SLAs",
  },
  {
    feature: "ERP sync",
    testnet: "Tally / Xero (read-only beta)",
    standard: "Tally / QuickBooks / Xero / Zoho",
    scale: "Same + custom mapping",
  },
  {
    feature: "Dispute support",
    testnet: "Self-serve console",
    standard: "Operator-assisted · 4h response",
    scale: "Operator-assisted · 1h response",
  },
  {
    feature: "Audit log retention",
    testnet: "90 days",
    standard: "2 years",
    scale: "7 years",
  },
  {
    feature: "SOC 2 evidence pack",
    testnet: "Public Trust Center",
    standard: "Public Trust Center",
    scale: "On-request, NDA-gated",
  },
  {
    feature: "Support channel",
    testnet: "Community + email",
    standard: "Priority email + Slack Connect",
    scale: "Dedicated Slack + 24×7 on-call",
  },
];

export const FAQ = [
  {
    q: "When does mainnet pricing start?",
    a: "After the external security audit completes and Arc mainnet deploys. Until then invoices settle free on testnet; the cashout flow already withholds Klaro's 0.3% fee on-chain (its fiat payout leg is simulated).",
  },
  {
    q: "What counts as settled volume?",
    a: "USDC that moves through InvoiceEscrow and reaches the vendor's wallet. Refunded, disputed, and held amounts are excluded.",
  },
  {
    q: "Are there per-invoice or per-seat fees?",
    a: "No. The 1% mainnet fee is the only charge. No monthly minimum, no per-user pricing, no hidden FX markup.",
  },
  {
    q: "What about cashout fees?",
    a: "LP spread and Klaro's 0.3% cashout fee are separate from the 1% invoice fee. Both are shown before you confirm the cashout, and the published spread for every corridor is live on /product/cashout.",
  },
  {
    q: "Can I try before committing?",
    a: "Yes. Testnet is free and unlimited. Create invoices, simulate cashouts, and test the full flow without spending anything.",
  },
  {
    q: "Do you offer discounts for high volume?",
    a: "The Scale tier is custom-priced. Email sales@klaro.so with your expected monthly volume.",
  },
] as const;
