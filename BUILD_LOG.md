# BUILD LOG

## M3 — Pre-launch hardening

- ✅ Delegations persistence (T1 honest-mode #1): session-key issue/revoke wrote
  to `mockData` only — keys looked issued but vanished on a cold start in live
  mode. New `lib/repo/delegations.ts` dual-mode wrapper persists to a new
  `session_keys` table (**0040**, RLS-scoped to the owning vendor); the page now
  reads from the repo and gained a real **Revoke** button (`RevokeSessionKeyButton`,
  ownership-checked in the action). Also fixed an honesty bug — the badge claimed
  "Circle Modular Wallets" whenever `NEXT_PUBLIC_CIRCLE_CLIENT_KEY` was merely
  present, implying live ERC-6900 enforcement that isn't built; it now always
  reads "Recorded · Circle enforcement pending" with a "not yet an enforced grant"
  note (enforcement is genuinely partner-pending). **Verified like a real user**
  (`pb-delegations.ts`, magic-link login on :3100): issue a `CASHOUT_REQUEST` key →
  asserted the `session_keys` row persists (`revoked_at` null) → reload shows it →
  Revoke → asserted `revoked_at` set + drops off the active list (`DELEGATIONS_E2E_OK`).
  Web typecheck green.

- ✅ Contract safety pass (sandbox, forge-verified 519 green): bounded LP `slashAmount` to the disputed order value (+test); `RetainerStream.pause/unpause` → owner-only (was hot operator key, +test update); `DisputeManager.setOperator(0)` guard. Investigated + DISPROVEN as non-bugs: `AgentEscrow.createJob` hook-revert-blocks-create is intentional (no funds escrowed at create; tested invariant) — left as-is with a doc note. REMAINING contract items (handed to follow-up, not rushed): `setOperator(0)` guard on the other 15 contracts (mechanical MEDIUM — each needs a ZeroAddress error added); `InvoiceEscrow` link-auth nonce/cap (HIGH, signature-scheme change). Coordination: contract work is isolated to packages/contracts; the other agent owns apps/web live-feature work in parallel.

- ✅ Agents live UI + verified like a user (base gap #2 follow-through): removed
  the page-level `supabaseLive()` M11 gate that hid the now-persisted `agent_jobs`
  lifecycle behind a placeholder, and replaced the false "Live mode calls
  AgentEscrow.fundJob()" button labels with honest "on-chain escrow
  partner-pending · no USDC moves" labels + a banner. **Verified like a real
  user** (`pb-agents.ts`, magic-link login on :3100): hire → Fund → Agent starts
  → Submit deliverable → Accept+release, asserting `agent_jobs.status` + each
  stage timestamp in the LIVE Supabase DB at every transition + the deliverable
  hash anchored (`AGENTS_E2E_OK`). Applied **0033** to the live DB (was missing —
  PGRST204 on `agent_label`). On-chain AgentEscrow custody stays partner-pending:
  the mock agent registry has no agent wallets / ERC-8004 identity to escrow
  against, and `startJob`/`submitDeliverable` need the agent to sign; the daemon
  `JobCompleted`→CLOSED mirror handler already exists for when real agents
  onboard. Lint + web typecheck green.

- ✅ Company audit complete (13/13 departments, 20 agents) + fix pass. Fixed gate-verified: RLS write gaps (0036), agent-advance TOCTOU, live agent dispute-ownership, MUTUAL_RESOLVED map (0037), Decided notify ordering, middleware CSP allowlist, timing-safe cron, distinct LP/retainer audit codes, DisputeManager zero-operator guard. CRITICAL RetainerStream "drain" disproven with a regression test (518 forge green). Deferred (documented in HUMAN_ACTIONS): T1 systemic mock-only write paths, daemon dispute→escrow fan-out, remaining contract HIGHs, README overclaims.

- ✅ Agent on-chain payments (base gap #5): daemon `JobCompleted` handler now flips the `agent_jobs` row to CLOSED from on-chain truth (proof-beats-claims), parallel to the disputes `Decided` handler. Daemon typecheck + 11 tests green. (Web→on-chain `createJob` remains the M11 client-signing piece, live-untested.)
- ✅ RLS write-policy fix (migration 0036): added the INSERT/UPDATE policies for `vendor_team_members`, `disputes` (UPDATE), and `webhook_deliveries` (INSERT). **These were a real bug in this session's own disputes/team/webhooks repos** — the writes go through the RLS-scoped client but the policies were missing, so they silently failed live while mock-mode tests passed. Surfaced by the company-level audit (D6/D7 converged). Live-untested (pooler blocked).
- ✅ Company-level codebase audit: 16-agent org-structured fleet (4 batches of ≤4), 8/13 departments (all high/critical-risk). Artifacts + `MASTER_AUDIT.md` in `.kiro/workflows/audit/`. Headline findings: CRITICAL RetainerStream cross-stream refund drain; systemic honest-mode breach (many write paths are mock-only and silently fail live); operator hot-key blast radius. 5 lower-risk departments queued.

- ✅ Webhook persistence (base gap #4): `lib/repo/webhooks.ts` dual-mode; create/list/get/test-ping now persist to `webhooks` (+ best-effort `webhook_deliveries`). Per-endpoint secret generated + `pgp_sym_encrypt`-ed with the `WEBHOOK_ENC_KEY` vault secret via the `webhook_create` security-definer RPC (0035), revealed once; ownership enforced against `vendors.supabase_user_id = auth.uid()`. Delivery still signs with the global `WEBHOOK_HMAC_SECRET` (per-endpoint routing is M11). Gate-verified green (105 web tests). **Live-untested: the RPC/vault/pgcrypto path needs 0035 applied + one pooler run to confirm.**

- ✅ Team persistence (base gap #3): `lib/repo/team.ts` dual-mode; invite/role/remove + team page now persist to `vendor_team_members` (klaro_role case-mapped; status from accepted_at/removed_at); migration 0034 makes `supabase_user_id` nullable for pending invites. Gate-verified green (105 web tests).

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
