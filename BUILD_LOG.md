# BUILD LOG

## M3 — Pre-launch hardening

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
