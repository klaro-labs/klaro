# Demo guide — reproduce the full flow in five minutes

For reviewers, partners, and anyone who wants to see Klaro work end to end
without any credentials. Everything below runs in **labelled simulator
mode**: no chain writes, no real funds, no external services.

## Option A: hosted testnet

Open <https://klaro-peach.vercel.app>. The deployment runs against live Arc
testnet contracts; surfaces that depend on unconfigured providers show their
honest `SIMULATED` / `ACCESS PENDING` labels.

## Option B: fresh clone, zero config

```bash
git clone https://github.com/klaro-labs/klaro && cd klaro
pnpm install
KLARO_ALLOW_MOCK_AUTH=1 NEXT_PUBLIC_KLARO_DEMO_MODE=1 pnpm dev
# → http://localhost:3000
```

With no env vars set, every adapter falls back to a labelled simulator and
you are signed in as the seeded demo vendor (Asha). `KLARO_ALLOW_MOCK_AUTH`
is refused in production builds — it exists for exactly this walkthrough.

## The five-minute walkthrough

1. **Vendor dashboard** — `/vendor`. Note the `Simulated` badge: the UI never
   hides which mode it is in.
2. **Create an invoice** — `/vendor/invoices/new`. Amount, description,
   customer email; submit. You land on the invoice detail page with a hosted
   payment link.
3. **Pay as the buyer** — open the `/i/<invoiceId>` link (new tab works).
   Press "Pay invoice in USDC". In demo mode this simulates the payment and
   redirects to the receipt.
4. **Verify the receipt** — `/receipt/<invoiceId>` renders the shareable
   receipt with its simulation labels. In live-contract mode this page
   verifies the hash against `AuditReceipt` on Arc.
5. **Cash out** — `/vendor/cashout?new=1`. Quote 10 USDC to INR, confirm the
   simulated order, and watch the order timeline (lock → LP assign → proof →
   release).
6. **Open a dispute** — `/vendor/disputes`, entry point "cashout", paste the
   order id. The case page shows the dispute state machine.

The same flow is scripted: `pnpm --filter @klaro/web e2e:demo` drives steps
1–6 with Playwright against `KLARO_E2E_BASE_URL` (default
`http://127.0.0.1:3004`).

## Resetting demo state

Demo invoices persist to `.next/klaro-demo-state.json` so the flow survives
server-action bundle reloads. To reset to the seeded fixtures:

```bash
rm -f apps/web/.next/klaro-demo-state.json   # then restart `pnpm dev`
```

## With a real database (optional)

If Supabase env vars are set, auth and persistence go live and the simulator
fixtures step aside. Reset and reseed with:

```bash
pnpm --filter @klaro/web db:reset   # supabase db reset
pnpm --filter @klaro/web db:seed    # tsx scripts/seed.ts
```

## What you are NOT seeing in demo mode

Real chain writes, real screening verdicts, real INR payout, or real email.
The truth table in `README.md` ("Honest mode labelling") and the trust page
(`/trust`) state exactly which legs are live testnet, simulated, or
partner-pending.
