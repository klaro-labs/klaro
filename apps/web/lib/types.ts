/**
 * Core domain types for Klaro M3. Mirrors what `InvoiceEscrow` + `AuditReceipt`
 * store on-chain plus the off-chain metadata never persisted onchain
 * (line items, customer name, etc. — PII rules).
 * Single source of truth for both client + server. Swap mock data sources
 * for real ones (Supabase + viem reads) without changing call sites.
 */

export type Hex = `0x${string}`;

/** Mirror of `InvoiceEscrow.Status` enum on-chain. */
export const InvoiceStatus = {
  CREATED: "CREATED",
  ACCEPTED: "ACCEPTED",
  PAID: "PAID",
  SETTLED: "SETTLED",
  REFUNDED: "REFUNDED",
  CANCELLED: "CANCELLED",
} as const;
export type InvoiceStatus = (typeof InvoiceStatus)[keyof typeof InvoiceStatus];

/** Per-vendor 6-balance breakdown (v2 §17A). UI MUST never collapse these
 * into a single number — vendors need to know what's actually theirs vs
 * locked / pending. */
export interface VendorBalances {
  available: bigint; // ready to cash out
  pending: bigint; // invoices PAID but not yet SETTLED
  locked: bigint; // in cashout escrow
  held: bigint; // dispute-frozen
  cashoutable: bigint; // confirmed cashout queue
  simulated: bigint; // testnet-only earnings, never real
}

export interface LineItem {
  description: string;
  amount: bigint; // 6-decimal USDC (Arc ERC-20 interface)
}

export interface CustomerSnapshot {
  /** Email is the minimum to ping the buyer; address optional. */
  email: string;
  name?: string;
  walletHint?: Hex; // if buyer prefilled a wallet; never required
}

export interface Invoice {
  id: Hex; // 32-byte invoiceId used on-chain
  vendorId: string; // Supabase row id (off-chain identity)
  // live mode hydrates this from a vendors-table join
  // (invoices table has no vendor_wallet column, only vendor_id FK).
  // When the joined vendor row is missing OR the vendor's wallet
  // hasn't been provisioned, this is null. Consumers MUST handle
  // null (PayWithUSDC, hosted invoice page, receipt page) instead
  // of signing/displaying zero-address.
  vendorWallet: Hex | null;
  token: Hex; // USDC or EURC on Arc
  amount: bigint; // 6-decimal USDC ERC-20 units (Arc dual-interface: app side = 6 dec)
  dueAt: Date;
  status: InvoiceStatus;
  customer: CustomerSnapshot;
  lineItems: LineItem[];
  metadataHash: Hex; // keccak256 of the JSON blob {customer, lineItems, notes}
  splitsHash?: Hex; // 0x0 => sole-vendor payout; non-zero => multi-payee splits[]
  acceptanceSig?: Hex; // present once buyer signed
  acceptedBy?: Hex;
  acceptedAt?: Date;
  paidTx?: Hex;
  settledTx?: Hex;
  publishedTx?: Hex; // QA-020: vendor-signed createInvoice publish tx; undefined until published on-chain
  receiptHash?: Hex;
  createdAt: Date;
}

export interface ReceiptAnchor {
  invoiceId: Hex;
  invoiceHash: Hex;
  acceptanceHash: Hex;
  screeningHash: Hex;
  settlementTx: Hex;
  settledAt: Date;
  sourceChainId: number;
  vendor: Hex;
}

export interface Vendor {
  id: string;
  email: string;
  displayName: string;
  country?: string;
  // previously `Hex`; vendors.ts fromRow silently
  // filled `0x000…0` when the DB column was null (vendor still
  // mid-Circle-Wallets provisioning). Consumers printed/signed
  // the zero address as if real — same class as W88-1 P0 on
  // Invoice.vendorWallet. Now: null is honest "not yet provisioned";
  // every consumer must either assert via assertVendorWalletProvisioned
  // before using OR render a "Not yet provisioned" state.
  wallet: Hex | null;
  createdAt: Date;
  /** M9 branding — hex color (e.g. "#1B6BFF"); falls back to brand default. */
  brandColor?: string;
  /** M9 branding — public URL or data: URI for the logo shown on hosted invoice + receipt. */
  brandLogoUrl?: string;
  /** M9 branding — versioned template id; bump when changing legal copy on invoices. */
  invoiceTemplateVersion?: number;
}

/** Mirror of `CashoutOrderProcessor.Status` enum on-chain. */
export const CashoutStatus = {
  REQUESTED: "REQUESTED",
  LOCKED: "LOCKED",
  CLAIMED: "CLAIMED",
  PROOF_SUBMITTED: "PROOF_SUBMITTED",
  CONFIRMED: "CONFIRMED",
  RELEASED: "RELEASED",
  DISPUTED: "DISPUTED",
  RESOLVED_LP_PAYS: "RESOLVED_LP_PAYS",
  RESOLVED_VENDOR_PAYS: "RESOLVED_VENDOR_PAYS",
  EXPIRED: "EXPIRED",
  CANCELLED: "CANCELLED",
} as const;
export type CashoutStatus = (typeof CashoutStatus)[keyof typeof CashoutStatus];

export interface CashoutTimelineEvent {
  kind:
    | "locked"
    | "lp_assigned"
    | "proof_submitted"
    | "confirmed"
    | "released"
    | "disputed"
    | "resolved";
  at: Date;
  detail?: string;
}

export interface CashoutOrder {
  id: Hex;
  vendorId: string;
  vendorWallet: Hex;
  usdcAmount: bigint; // 6-dec USDC
  payoutMinor: bigint; // currency × 100
  currency: string; // ISO code, e.g. "INR"
  status: CashoutStatus;
  klaroFeeUsdc: bigint;
  lpSpreadUsdc: bigint;
  quoteRate: number;
  quoteHash: Hex;
  requestedAt: Date;
  quoteExpiresAt: Date;
  lpId?: string; // assigned LP entity id
  lpName?: string;
  proofHash?: Hex;
  utrReference?: string; // off-chain UTR string (shown in dashboard, hashed on-chain)
  timeline: CashoutTimelineEvent[];
}
