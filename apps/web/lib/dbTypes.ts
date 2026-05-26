/**
 * Hand-written types for Klaro Supabase tables. Mirrors the migrations under
 * `apps/web/supabase/migrations/`. Generated types from `supabase gen types`
 * can replace this once the project is provisioned; until then this gives
 * server-action callers concrete shapes to work against.
 */

export type InvoiceStatus =
  | "CREATED"
  | "ACCEPTED"
  | "PAID"
  | "SETTLED"
  | "REFUNDED"
  | "CANCELLED";
export type CashoutStatus =
  | "REQUESTED"
  | "LOCKED"
  | "CLAIMED"
  | "PROOF_SUBMITTED"
  | "CONFIRMED"
  | "RELEASED"
  | "DISPUTED"
  | "RESOLVED_LP_PAYS"
  | "RESOLVED_VENDOR_PAYS"
  | "EXPIRED"
  | "CANCELLED";
export type LPStatus =
  | "INVITED"
  | "APPLIED"
  | "UNDER_REVIEW"
  | "APPROVED"
  | "STAKED"
  | "SUSPENDED"
  | "REVOKED";
export type AgentJobStatus =
  | "CREATED"
  | "FUNDED"
  | "STARTED"
  | "DELIVERED"
  | "CLOSED"
  | "DISPUTED"
  | "CANCELLED";
export type ActorKind = "vendor" | "admin" | "lp" | "system" | "daemon";

export interface DbVendor {
  id: string;
  supabase_user_id: string | null;
  display_name: string;
  email: string;
  country: string | null;
  brand_color: string | null;
  brand_logo_url: string | null;
  invoice_template_version: number;
  wallet: string | null;
  circle_wallet_id: string | null;
  wallet_provisioned_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbInvoice {
  id: string; // bytes32 hex
  vendor_id: string;
  customer_id: string | null;
  customer_email: string | null;
  customer_name: string | null;
  amount_usdc: string; // numeric — returned as string by pg
  token: string;
  due_at: string;
  notes_md: string | null;
  privacy_mode: "public" | "hide_amount" | "hide_customer";
  status: InvoiceStatus;
  metadata_hash: string;
  splits_hash: string | null;
  acceptance_sig: string | null;
  accepted_by: string | null;
  accepted_at: string | null;
  paid_tx_hash: string | null;
  settled_tx_hash: string | null;
  receipt_hash: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbCashoutOrder {
  id: string;
  vendor_id: string;
  vendor_wallet: string;
  usdc_amount: string;
  payout_minor: string;
  currency: string;
  klaro_fee_usdc: string;
  lp_spread_usdc: string;
  quote_rate: string;
  quote_hash: string;
  status: CashoutStatus;
  lp_id: string | null;
  lp_name: string | null;
  proof_hash: string | null;
  utr_reference: string | null;
  requested_at: string;
  quote_expires_at: string;
  resolved_at: string | null;
  updated_at: string;
}

export interface DbAuditLog {
  id: string;
  actor_kind: ActorKind;
  actor_id: string;
  action: string;
  subject_kind: string;
  subject_id: string;
  reason_hash: string | null;
  evidence_hash: string | null;
  note_md: string | null;
  runbook_id: string | null;
  ip_hash: string | null;
  ua_hash: string | null;
  at: string;
}

export interface DbReceipt {
  id: string;
  invoice_id: string;
  receipt_hash: string;
  invoice_hash: string;
  acceptance_hash: string | null;
  screening_hash: string | null;
  settlement_tx: string;
  settled_at: string;
  source_chain_id: number | null;
  pdf_storage_path: string | null;
  reveal_amount: boolean;
  reveal_customer: boolean;
  created_at: string;
}
