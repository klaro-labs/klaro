# BUILD LOG

## M3 — Pre-launch hardening

- ✅ Agents persistence (base gap #2): `lib/repo/agentJobs.ts` dual-mode; `createJobAction`/`advanceJobAction` + agent read pages now persist to `agent_jobs` (dropped `agents_not_yet_persistent` gates); state-machine guards retained; schema aligned (0033). Gate-verified green (105 web tests).

- ✅ Disputes persistence (base gap #1): dual-mode `lib/repo/disputes.ts`; vendor/LP/admin/API open + evidence now persist to Supabase (dropped `disputes_not_yet_persistent` gates); all read paths live; daemon flips the row to DECIDED from the on-chain `Decided` event (proof-beats-claims); schema aligned (0032) + repo round-trip test. Gate-verified green; live multi-wallet E2E pending env (see HUMAN_ACTIONS_NEEDED).

- ✅ Suite green at `efa5b91`+: fixed 7 stale web tests (agent state-machine now behind the `supabaseLive()` M11 gate → forced sim mode; invoice-PII route hardened to vendor-auth → mocked matching session). 517 forge / 103 web / 11 daemon all green. `1e3ada5`

## M2 — Lovable Port

- ✅ Step 1: Foundation primitives (PageHero, FeatureCard, MockBrowserChrome, CTAPair, StatTile, MegaMenu) + tile tokens
- ✅ Step 2: Nav rewrite (5 items, mega-menu on Product + Resources) + Footer link update (Build, Resources sections)
- ✅ Step 3: /product overview rewrite — 5 surface cards, PageHero, TrustStrip, FinalCta
- ✅ Step 4: Product sub-pages — /product/invoicing, /product/receipts, /product/cashout, /product/stablefx, /product/reputation
- ✅ Step 5: /pricing rewrite — 3-tier cards, FAQ, honest values (Free / 1.0% / Custom)
- ✅ Step 6: /build page created + 301 redirect from /developers
- ✅ Step 7: /resources hub + /resources/flows (8 canonical flows with state machines)
- ✅ Step 8: /brand-kit alias (/resources/brand → /brand-kit redirect)
- ✅ Step 9: /company/contact page with form + email directory
- ✅ Step 10: /signin quiet rewrite — reduced glow, passkey CTA, fixed hover + error copy
- ✅ Step 11: /onboarding — 4-step flow (business, wallet, verification, first invoice)
- ✅ Step 12: AppShell — VendorNav (5 items), MobileShell (Lucide icons + safe-area) already adopted in PREMIUM_FIX_PLAN; vendor pages use consistent layout
