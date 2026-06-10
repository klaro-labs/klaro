# Security policy

Klaro takes vulnerability reports seriously. Please disclose privately — do not open public GitHub issues for security findings.

## Reporting

- **Email:** `prateek@myklaro.app` (subject prefix `[SECURITY]`)

Please include reproducible steps, an impact assessment, and (if known) a suggested mitigation. We acknowledge every report within one business day.

## Scope

In scope:

- All contracts under `packages/contracts/src/` deployed to Arc testnet (addresses in [`DEPLOYMENT.md`](DEPLOYMENT.md))
- The hosted web app at `myklaro.app` (including the testnet deployment at `klaro-peach.vercel.app`) and all app surfaces (`/vendor`, `/i`, `/receipt`, `/admin`, `/lp`, `/fx`, `/internal`, `/pay`, `/status`, `/docs`)
- The daemon's outbound surface — webhook deliveries, notification routes, RPC interactions
- The published SDK packages: `@klaro/sdk`, `@klaro/cli`, `@klaro/receipt-badge`, `@klaro/invoice-embed`

Out of scope:

- Third-party providers (Circle, Arc L1, Supabase, Vercel, Sentry, PostHog, Resend, Sumsub, Chainalysis, TRM, MoonPay) — please report directly to them
- Social engineering of Klaro team members
- Volumetric DoS / DDoS

## What we consider critical

- Direct loss of user funds (USDC, fiat at LPs, agent job escrow)
- Authentication bypass on operator surfaces (`/admin/*`, `/internal/*`)
- Cross-tenant data leak (one vendor reads another's invoices, customers, or evidence)
- Webhook signature forgery enabling state mutation
- Smart-contract logic that allows replay of an EIP-712 acceptance, double-spend of an escrowed invoice, or settlement bypass

## Bug bounty

A public Immunefi programme will open once SOC 2 Type I lands. Until then, qualifying findings receive coordinated-disclosure credit and early access to future programmes. Critical findings with researcher consent may be eligible for discretionary bounty payment.

## Coordinated disclosure

Default 90-day window from acknowledgment to public disclosure. Findings affecting live funds may extend the window with researcher consent. Public credit is posted on the trust centre unless researcher requests anonymity.
