# Klaro

Arc-native USDC invoicing, on-chain receipts, vendor reputation, and partner
cashout. Testnet only. pnpm monorepo (Node >= 22, pnpm >= 10).

## Source of truth

- `internal/New folder/Klaro_Final_Testnet_Complete_Full_Flow_Design_v2.md` is
  the canonical user-flow spec. Every built flow must trace back to a numbered
  section of it. Where older docs (e.g. `internal/KLARO_TESTNET_PRD.md`)
  conflict, v2 governs.
- Deployed contract addresses live in `DEPLOYMENT.md`. Operator runbooks in
  `docs/runbooks/`.

## Commands

```bash
pnpm dev                  # web app (apps/web) on :3000
pnpm build                # all workspaces
pnpm typecheck            # all workspaces (tsc --noEmit)
pnpm lint                 # all workspaces
pnpm contracts:test       # forge tests (packages/contracts)
pnpm --filter @klaro/web test     # web vitest suite
pnpm --filter @klaro/daemon test  # daemon vitest suite
pnpm --filter @klaro/web e2e:smoke   # Playwright smoke (needs running app)
```

## Layout

- `apps/web` — Next.js 15 App Router. Marketing at apex; vendor portal under
  `app/(wallet)/vendor/*`; LP portal `app/lp/*`; admin `app/admin/*`; public
  money pages `i/[id]`, `pay/[slug]`, `receipt/[hash]`. Subdomain→path
  rewrites + CSP + rate limiting in `middleware.ts`. Domain logic in `lib/`,
  Supabase data access in `lib/repo/`.
- `apps/daemon` — BullMQ operator process: Arc event listener
  (`src/listener/arcSubscriber.ts`) + workers in `src/workers/`. Holds the
  operator signing key; the web app never signs operator transactions.
- `packages/contracts` — Foundry, Solidity 0.8.28, Arc testnet
  (chainId 5042002). `packages/sdk`, `packages/cli`, `packages/receipt-badge`,
  `packages/invoice-embed`.
- DB: Supabase Postgres, raw SQL migrations in `apps/web/supabase/migrations/`
  (append-only; RLS on every table via `current_vendor_id()`).
- `resources/repos/` contains unrelated Arc reference repos — not Klaro code.

## Working rules

- **Commits**: no author/co-author attribution lines (no `Co-Authored-By`,
  no "Generated with" footers). Plain conventional commit messages only.
- **No compromises**: when choosing between approaches, always pick the best
  possible solution — never the expedient one. No half-baked building, no
  half-baked auditing, no half-baked testing. Everything ships complete,
  end to end.
- **Ask before deviating**: if you are about to skip, partially do, or
  compromise on something that was asked, STOP and ask permission first.
  Never silently downgrade the request.
- **Intent over words**: figure out what was actually meant, not just what
  was literally typed, and finish the whole ask.
- **Do what was asked — upward deviations only**: when Prateek asks for
  something, do that thing. Improving on it or doing it better is welcome;
  doing less, going low-effort, or substituting something easier is never
  acceptable.
- **Talk before testing**: before running any test pass (e2e, Playwright,
  manual QA, anything that exercises the app), discuss the plan with Prateek
  first — what will be tested, how, and why. Do not just start testing.
- **Writing quality**: no AI slop. Every piece of copy, doc, or commit
  message should read like the best version a careful human would write.
- **Docs knowledge**: for anything Arc or Circle related (chain params, CCTP,
  Gateway, Circle Wallets, StableFX, APIs), use the `arc-docs` and `circle`
  MCP servers — never guess from memory.
- **Testing**: test like a human QA auditor — drive the real app with
  Playwright, use a real wallet for wallet flows, walk every flow end to end,
  and capture a screenshot at every step. Unit tests alone are not "tested".

## Hard rules

- **Honest mode**: every surface is labelled live / simulated / access-pending.
  Never present a mocked integration as live. No fake controls — a button that
  does nothing must not ship; either wire it or replace it with honest copy.
- **No PII on-chain.** Hashes, addresses, IDs, and status events only.
- **Arc accounting**: gas is USDC. App balances use ERC-20 USDC with
  6 decimals; never mix with the 18-decimal native representation.
- **Cross-chain**: CCTP V2 only, never V1.
- **Brand**: domain is `myklaro.app`, contact `prateek@myklaro.app`. Older
  domains (`klaro.so`, `klaro.me`) appear in design mockups under
  `internal/designer/` — do not copy them into product code.
- Brand color is Klaro blue `#1B6BFF` (the `--color-klaro-orange` token names
  are legacy aliases that resolve to blue).
- Env vars are all optional by design (`apps/web/lib/env.ts`); unset
  integrations fall back to labelled mock/simulator mode. Production
  fail-closed gates live in `lib/auth.ts` and the daemon's
  `assertBootConfig()`.
- Line endings are LF everywhere (enforced by `.gitattributes`).

## Auth model

Supabase SSR sessions (Google OAuth + magic link); roles vendor / operator /
LP via `requireVendor` / `requireOperator` / `requireLp` in `lib/auth.ts`.
`app/api/v1/*` uses session cookies, not API keys; `receipts/[hash]` is the
only public endpoint. WebAuthn passkeys verify cryptographically but do not
issue sessions yet — don't document otherwise.
