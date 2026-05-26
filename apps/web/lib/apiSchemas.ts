/**
 * Canonical zod schemas for the public Klaro REST API.
 * Reused by routes + OpenAPI generator + SDK type emission.
 */
import { z } from "zod";

export const Hex32 = z.string().regex(/^0x[0-9a-fA-F]{64}$/);
export const Addr = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
export const Iso = z.string().datetime();

export const CreateInvoice = z.object({
  amountUsdc: z.string().regex(/^\d+(\.\d{1,6})?$/), // dollars with up to 6-dec USDC precision
  dueAt: Iso,
  customer: z.object({
    email: z.string().email(),
    name: z.string().optional(),
  }),
  lineItems: z
    .array(
      z.object({
        description: z.string().min(1),
        // parity with top-level `amountUsdc` regex — without
        // this, a bad input ("abc") sailed through to dollarsToUSDC →
        // NaN → bigint conversion threw → 500 not 400.
        amountUsdc: z.string().regex(/^\d+(\.\d{1,6})?$/),
      }),
    )
    .min(1),
  notesMd: z.string().optional(),
  privacyMode: z
    .enum(["public", "hide_amount", "hide_customer"])
    .default("public"),
  splitsHash: Hex32.optional(),
});

export const InvoiceQuery = z.object({
  status: z
    .enum(["CREATED", "ACCEPTED", "PAID", "SETTLED", "REFUNDED", "CANCELLED"])
    .optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).default(25),
});

export const CashoutQuoteReq = z.object({
  usdcAmount: z.string().regex(/^\d+(\.\d{1,6})?$/),
  currency: z.string().min(3).max(8),
  ttlSeconds: z.coerce.number().min(30).max(600).default(120),
});

export const CashoutCreateReq = z.object({
  // Quote already negotiated server-side (via /v1/cashouts/quotes). Caller
  // echoes the full payload back so we can persist amounts + verify the hash.
  quoteHash: Hex32,
  usdcAmount: z.string().regex(/^\d+$/), // bigint string (6-dec wei)
  payoutMinor: z.string().regex(/^\d+$/), // bigint string (currency minor units, e.g. paise)
  currency: z.string().min(3).max(8),
  klaroFeeUsdc: z.string().regex(/^\d+$/),
  lpSpreadUsdc: z.string().regex(/^\d+$/),
  quoteRate: z.number().positive(),
  quoteExpiresAtIso: Iso,
});

export const FxQuoteReq = z.object({
  src: z.enum(["USDC", "EURC", "USYC"]),
  dst: z.enum(["USDC", "EURC", "USYC"]),
  amount: z.string().regex(/^\d+(\.\d{1,6})?$/),
});

export const DisputeOpenReq = z.object({
  source: z.enum(["cashout", "agent", "retainer"]),
  sourceId: z.string(),
  evidenceMd: z.string().min(10),
});

export const WebhookCreateReq = z.object({
  url: z.string().url(),
  events: z
    .array(
      z.enum([
        "invoice.created",
        "invoice.accepted",
        "invoice.paid",
        "invoice.settled",
        "invoice.cancelled",
        "cashout.requested",
        "cashout.released",
        "cashout.disputed",
        "refund.executed",
        "agent.job.completed",
        "dispute.opened",
        "dispute.decided",
      ]),
    )
    .min(1),
});

export const InboundStripeWebhook = z.object({
  type: z.string(),
  data: z.record(z.unknown()),
});
export const InboundCircleWebhook = z.object({
  notification: z.object({ type: z.string(), data: z.record(z.unknown()) }),
});

export type CreateInvoiceInput = z.infer<typeof CreateInvoice>;
export type CashoutQuoteInput = z.infer<typeof CashoutQuoteReq>;
export type CashoutCreateInput = z.infer<typeof CashoutCreateReq>;
export type FxQuoteInput = z.infer<typeof FxQuoteReq>;
export type DisputeOpenInput = z.infer<typeof DisputeOpenReq>;
export type WebhookCreateInput = z.infer<typeof WebhookCreateReq>;
