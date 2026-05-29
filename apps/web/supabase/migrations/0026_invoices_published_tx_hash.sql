-- QA-020: vendors publish their invoice to InvoiceEscrow.createInvoice from
-- their own wallet (vendor = msg.sender). published_tx_hash records that tx;
-- null until published. A buyer can only pay once the invoice exists on-chain.
alter table public.invoices add column if not exists published_tx_hash text;

comment on column public.invoices.published_tx_hash is
  'Tx hash of the vendor-signed InvoiceEscrow.createInvoice publish (QA-020). Null until the vendor publishes the invoice on-chain.';
