/**
 * Klaro event taxonomy. v2 §29A + .
 * Every product event flows through this enum so we never have drift between
 * dashboard, funnel, alert, and code. Renaming = one place.
 */

export const KLARO_EVENTS = {
  // Vendor onboarding
  vendor_signed_in: "vendor_signed_in",
  vendor_branding_updated: "vendor_branding_updated",

  // Invoice + receipt flow
  invoice_created: "invoice_created",
  invoice_link_copied: "invoice_link_copied",
  invoice_settled: "invoice_settled",
  invoice_refunded: "invoice_refunded",
  invoice_cancelled: "invoice_cancelled",
  receipt_viewed: "receipt_viewed",
  receipt_pkpass_downloaded: "receipt_pkpass_downloaded",

  // Buyer / hosted page
  hosted_invoice_viewed: "hosted_invoice_viewed",
  pay_with_usdc_clicked: "pay_with_usdc_clicked",
  moonpay_card_to_usdc_started: "moonpay_card_to_usdc_started",

  // Cashout
  cashout_quote_viewed: "cashout_quote_viewed",
  cashout_requested: "cashout_requested",
  cashout_confirmed_received: "cashout_confirmed_received",
  cashout_dispute_opened: "cashout_dispute_opened",

  // Disputes
  dispute_evidence_added: "dispute_evidence_added",
  dispute_decided: "dispute_decided",

  // LP
  lp_invite_sent: "lp_invite_sent",
  lp_application_submitted: "lp_application_submitted",
  lp_admitted: "lp_admitted",
  lp_staked: "lp_staked",
  lp_order_claimed: "lp_order_claimed",

  // Agents + x402
  agent_listed: "agent_listed",
  agent_job_created: "agent_job_created",
  agent_job_funded: "agent_job_funded",
  agent_job_completed: "agent_job_completed",
  x402_402_returned: "x402_402_returned",
  x402_settled: "x402_settled",

  // FX
  fx_quote_requested: "fx_quote_requested",
  fx_swap_executed: "fx_swap_executed",

  // Privacy + exports
  tax_pack_downloaded: "tax_pack_downloaded",
  audit_pack_downloaded: "audit_pack_downloaded",
  privacy_export_requested: "privacy_export_requested",
  privacy_delete_requested: "privacy_delete_requested",
} as const;

export type KlaroEvent = (typeof KLARO_EVENTS)[keyof typeof KLARO_EVENTS];
