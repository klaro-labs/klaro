-- Klaro Link on-chain authorization: the vendor signs a LinkInvoiceAuthorization
-- (EIP-712) once at link creation. At pay time the operator publishes each
-- payment's invoice on-chain via InvoiceEscrow.createInvoiceFor using this
-- signature, so the vendor needn't be present. The recovered signer becomes
-- the on-chain invoice vendor — funds always settle to the vendor.

alter table payment_links add column if not exists link_chain_id  text;       -- bytes32 hex, the on-chain linkId the auth is bound to
alter table payment_links add column if not exists vendor_auth_sig text;      -- EIP-712 signature bytes (hex)
alter table payment_links add column if not exists auth_deadline   bigint;    -- unix seconds the authorization is valid until

-- get_public_link is intentionally NOT extended with the auth columns: the
-- public pay page never needs the signature. The pay-time publish reads them
-- via the service-role client (server-only). Drop+recreate not required.
