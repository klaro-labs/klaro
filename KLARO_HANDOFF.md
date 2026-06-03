# Klaro — Continuation Handoff

> Single source of truth for the next agent (and the workflow fleet) picking up Klaro.
> Written 2026-05-30 after the pre-launch audit + cashout work. Grounded in a fresh
> 6-agent survey of the live repo, not memory. Read this top-to-bottom once, then use
> it as a map.

Repo root: `C:\Users\prate\Downloads\arcbuild` · Web cwd: `apps/web` · Branch: `main`
Stack: Next.js 15 App Router (web) · BullMQ daemon + Redis (apps/daemon) · Foundry/Solidity on **Arc testnet** (chain `5042002`, USDC ERC-20 `0x3600…0000`, 6-dec) · Supabase (hosted `vweremdzsrsdbyfbzffj`).

---

## 0. How to use this doc

1. **§1–2** — what the mission is and the rule that governs it.
2. **§3** — what's already done (don't redo it).
3. **§4–6** — what's left, in two layers: finish the **base product** (§5) *then* the **7 expansion items** (§6). The base layer is the priority; the roadmap doc is explicitly post-production.
4. **§7–10** — the operational map: architecture, how to run it, how to test/verify like a real user, and the gotchas that will bite you.
5. **§11** — the **agent-launch / workflow plan**: how many agents to fan out, per phase, with copy-paste workflow shapes.
6. **§12** — definition of done.

The governing methodology (from the founder mandate): **design every flow + edge case + UI/UX fit first → build fully, no half-baked → test like a real user with real wallets (1/2/3 as the flow needs) → verify on-chain AND in the DB, never UI-only → choose the best option, no compromise.** Honesty rule (enforced in code): never mix mock + live silently — any unconfigured surface must show a `[SIMULATED]` badge.

---

## 1. The mission

Make Klaro **fully production-launch-ready** — every base capability flow-complete, tested end-to-end, operationally clean — and only then sequence the 7 post-production expansion features in `Downloads\check this after klaro is production ready.md`.

Klaro = an Arc-native USDC payment OS for emerging-market vendors: invoice globally in USDC, prove every payment on-chain (buyer acceptance + soulbound receipt), cash out to local currency through verified LPs.

---

## 2. The governing rule (from the roadmap doc)

> Build the current Klaro product first. Do **not** branch into the expansion roadmap until the base product is 100% flow-complete, launch-ready, tested end-to-end, operationally clean, support-ready, and production-hardened. If any base item feels unfinished, unclear, risky, or half-baked, keep focus on the base.

**Base-readiness checklist (the definition of "production ready first"):** vendor onboarding · invoice / payment-link flow · hosted checkout · cross-chain USDC intake · buyer acceptance proof · receipt generation · vendor balance · Partner Cashout (controlled payout) · LP operations · admin / support / disputes · logs, retries, monitoring, permissions, runbooks.

---

## 3. What's already DONE (committed on `main`)

| Workstream | Status | Evidence |
|---|---|---|
| **Pre-launch audit — 24/24 blockers, zero deferrals** | ✅ | `bec4831` (CRITICAL SSRF→IMDS) · `01ff95c` `0d3fc03` `6c554b7` `e17db47` (security) · `cb11bf1` (USDC precision) · `2a70a2d` (daemon Docker+CI) · `8aee9d1` (auth re-link) · `5dec951` `5c157de` (Ownable2Step ×20, bridge, LP freeze) · `afbf513` (dispute fund-stranding) · `9bce8bd` (block cursor) · `90448dd` (i18n) · ex-deferred `9ea2108` (db.ts `Database` types) + `6d45425` (Web3Provider `(wallet)` scoping). **517 forge green.** |
| **Klaro Link** (reusable USDC links) | ✅ E2E-verified | `0a39817`, `5baf7e3`, `f25e89a` (`createInvoiceFor`). pb-link green. |
| **Cashout LF-3 on-chain** (daemon advances escrow vendor→LP) | ✅ UI-verified, 3 wallets | `82bb5d0` (cashoutAdvancer `claimByLP`+`recordProof`, idempotent) + `efa5b91` (pb-cashout: vendor locks via UI → daemon → LP receives USDC, live COP `0x4047…226c`). |
| **QA honesty + a11y sweep** (QA-071…084) | ✅ | `1a59d6d` (WCAG 2.1 AA) + QA-074…083 + `86ae5cc` (on-chain publish at create). |

All gates currently green: web typecheck/lint/103 tests/build · daemon typecheck/11 tests · 517 forge.

⚠️ **Uncommitted working-tree scratch exists** (qa-*/pb-* scripts, some cashout WIP). Check `git status` before committing; commit only deliberately.

---

## 4. The full goal to continue (two layers)

**Layer A — finish the base product (PRIORITY).** Several base capabilities are still **simulated / DB-only / stubbed** (see §5). "Production ready" means converting the ones that matter for launch to real, persisted, on-chain-backed, tested flows — or making a deliberate, labelled decision that a given surface ships as simulated for the testnet launch. The contracts for most of these are **already deployed** (§7); the gap is wiring + persistence + verification.

**Layer B — the 7 expansion items (AFTER Layer A).** Recommended build order from the doc:
1. **Klaro Link** *(already built — polish/expand)*
2. **Klaro Receipt** polish — beautiful proof page + PDF audit pack *(receipts are live; this is depth)*
3. **Buyer Acceptance Proof** depth *(already a defining mechanism; deepen)*
4. **Klaro Profile** — public payment identity `klaro.me/<name>` *(net-new)*
5. **Web3 Work Reputation** — payment reputation for vendors/LPs/agencies *(contracts exist; UI is honest-simulated)*
6. **Cross-Chain USDC Checkout** expansion — pay from any chain, vendor gets clean USDC on Arc *(aligned with current design)*
7. **India Partner Cashout** production expansion — real verified-LP INR rail *(keep controlled/partner-led, not an open marketplace)*

Note overlaps: items 2/3/6/7 are *deepenings of base capabilities*, not net-new. Only **Klaro Profile** (#4) and **Web3 Reputation** (#5, UI) are substantially new surfaces.

---

## 5. Base-product status — what is LIVE vs what's LEFT

Source: 6-agent code survey. "Live" = real on-chain + persisted. Pattern: every integration is gated by a `*Live()` flag in `lib/env.ts`; unconfigured → labelled `[SIMULATED]`.

| Feature | Status | What's left to be production-ready |
|---|---|---|
| Invoices (create/publish/pay/settle) | **live** | Solid. PublishInvoiceOnChain + PayWithUSDC are real wagmi sign paths; daemon screens+settles+mints receipt. |
| Klaro Link / payment links | **live** | Strongest E2E surface. |
| Receipts / audit anchoring | **live** | `AuditReceipt.verify` on Arc; `/receipt/[hash]`. (Expansion item #2 = PDF pack + polish.) |
| Cashout (USDC→local) | **partial** | On-chain LOCK + daemon advance are REAL & verified. **Fiat leg is simulated** (no licensed LP / bank rail; `proofVerifier` logs `[SIMULATED]`). Mobile cashout screen is hardcoded demo numbers. Production = real LP marketplace + corridor-partner payout proof replacing operator auto-RELEASE. |
| Disputes (vendor side) | **simulated** | DB-only; `addEvidenceAction` returns 503 `disputes_not_yet_persistent` in live mode. **Wire to deployed RefundProtocol/DisputeManager + Supabase persistence.** |
| Agents / delegations | **simulated** | `createJobAction`/`advanceJobAction` 503 in live mode. Wire deployed **AgentEscrow** + persistence; session keys need real Circle Modular Wallet issuance. |
| Retainer (streams) | **simulated** | Fully mock; **RetainerStream contract is deployed** but UI unwired. |
| Bills (payables) | **simulated** | Mock `markBillPaid` moves no funds. Decide scope for launch. |
| Webhooks | **partial** | Outbound delivery is REAL (HMAC, SSRF-guarded, BullMQ). **Endpoint storage is mock** — won't survive restart. Persist endpoints. |
| ERP integrations | **stubbed** | Catalog of "planned" connectors; no OAuth/push. (M11.) |
| Reputation | **partial** | Live read of `ReputationManager.computeScore` when address set; else honest-simulated. (Expansion #5 = UI depth.) |
| Team (RBAC) | **simulated** | Role gates enforced, membership in-memory. Persist + tie to real invites/auth. |
| Settings (branding) | **partial→live** | Persists for real via repo when `supabaseLive()`. |
| Screening / sanctions | **partial** | `screenAndSettle` only adopts live results with a real provider key; else holds for manual review (fail-closed — correct). Wire a real provider (Chainalysis/TRM/Sumsub) for prod. |
| x402 nanopayments | **partial** | Simulated 402 unless `X402_ENABLED=1` + fee receiver. |
| Trust center / Transit / Financing | **stubbed/partial** | Informational; financing is read-only readiness score. |

**The "what's left for launch" shortlist** (highest-leverage base gaps): **disputes persistence + contract wiring**, **agents/AgentEscrow wiring**, **webhook endpoint persistence**, **team membership persistence**, **cashout fiat-leg productionization (LP marketplace + real payout proof)**, **a real screening provider**. Each is bounded; contracts mostly already exist.

Full gap list lives in the survey output if you need every detail.

---

## 6. (covered in §4 Layer B — the 7 expansion items + order)

---

## 7. Architecture map (condensed)

**Contracts (Arc testnet — all deployed):**
InvoiceEscrow `0xA76e…c4e2` · AuditReceipt `0x19d4…2B00` · RefundProtocol `0xCC4c…6339` · FeeSplitter `0x3b2E…5B66` · RoutePolicyEngine `0xb33f…E3FA` · LPRegistry `0xCF59…180b` · LPStaking `0x4b36…bD1f` · ProofRegistry `0xb0a2…bC33` · **CashoutOrderProcessor `0x4047…226c`** · MultiChainRouter `0xAF63…A241` · DisputeManager `0xee95…aE5F` · RetainerStream `0xD689…360A` · StableFXAdapterRegistry `0x9B83…A936` · MockStableFXAdapter `0xba47…ceD0` · AgentRegistry `0x3cB3…4886` · **AgentEscrow `0xedCd…AcdD`** · VendorReputation `0xb44C…7750` · ReputationManager `0xE927…8d51` · CounterpartyRegistry `0x59cE…C21A` · PrivacyVeil `0x7366…95F5`. (Full purposes in `DEPLOYMENT.md` + `packages/contracts/src/*.sol` NatSpec.)

**Daemon (apps/daemon, 12 workers + listener):** `arcSubscriber` (Arc event listener, Redis-persisted cursor, idempotent) → fans out to `screenAndSettle`, `receiptGenerate`, `cashoutAdvancer` (the LF-3 legs), `proofVerifier`, `notifications` (vendor/buyer/lp/admin), `webhookDelivery`, `erpSync`, `stableFxAdapter`, `sanctionsRefresh`, `lifecycleReminders` (cron), `adminRisk` (cron), `kpiAggregator` (cron), `_dlq`. Boot-time `abiAssert` throws if a listener event sig drifts from the canonical forge ABI.

**Web (apps/web):** App Router. `app/(wallet)/` route group holds the wallet surfaces (`vendor/*`, `pay/[slug]`, `i/[id]`) so the wagmi bundle stays off marketing pages. The only real wallet-signing components are in `components/klaro/`: `PublishInvoiceOnChain`, `PayWithUSDC`, `PayFromLink`, `RequestCashoutOnChain`, `LinkForm`, `ConnectWalletButton`. Adapter layers: `lib/repo/*` (Supabase ⟷ `lib/mockData.ts`), `lib/arcClient.ts` (live viem reads ⟷ `{source:'simulated'}`), `lib/env.ts` (every `*Live()` gate).

---

## 8. How to run everything locally

**Prereqs:** Node ≥22, pnpm ≥10. Local Redis container `klaro-redis` on `127.0.0.1:6379` (`docker run -d --name klaro-redis -p 6379:6379 redis:7-alpine`). The hoisted tsx CLI: `node_modules/.pnpm/tsx@4.22.3/node_modules/tsx/dist/cli.mjs` (no root `tsx` bin).

1. **Web dev server (mandatory for any UI E2E — harnesses hardcode `:3100`):**
   from `apps/web`: `pnpm dev -p 3100` (override the default 3000). **Restart it after editing any `NEXT_PUBLIC_*` var** — they're inlined at compile (this bites pb-cashout).
2. **Daemon (for screening/settlement/receipts/cashout fan-out):** from `apps/daemon`, with local Redis:
   `$env:REDIS_URL='redis://127.0.0.1:6379'; $env:KLARO_RUN_QUEUE_WORKER='1'; node --env-file=.env <tsx> src/index.ts`
   (the committed `.env` REDIS_URL is an exhausted Upstash; workers only drain when `KLARO_RUN_QUEUE_WORKER=1`).
3. **Supabase:** hosted. Migrations via `node scripts/db-apply.mjs supabase/migrations/<file>.sql` (Supavisor pooler `aws-1-ap-northeast-1.pooler.supabase.com:5432`, the direct host is dead). Regenerate types: run the `gen types --db-url` command then `node scripts/gen-db-types.mjs` (re-types money columns to `string`).
4. **Arc RPC:** public `https://rpc.testnet.arc.network`. No local node.

**Key env files:** root `.env.local` (DB password) · `apps/web/.env.local` (web runtime) · `apps/daemon/.env` (daemon) · `apps/web/e2e/wallets/.env.test-wallets` (`LP_TEST` = vendor `0x4743…`, `CUSTOMER_TEST` = buyer/LP `0x2a36…`). Operator key = `DAEMON_OPERATOR_PRIVATE_KEY` (`0xAD57…`). Never read `process.env` outside `lib/env.ts` / `src/env.ts`.

---

## 9. How to test & verify (like a real user, multi-wallet)

**The proven pattern: injected EIP-1193 providers** — a real private key lives in Node, real EIP-712 signatures + real on-chain txs via viem, driven through the **real app UI** in headless Chromium. (Real Rabby MV3 is too flaky under Playwright — kept only to prove the mechanism.) Copy `pb-pay.ts` (anon buyer) or `pb-cashout.ts`/`pb-link.ts` (login + vendor) as the template for a new harness.

**Gate order (cheap → expensive):**
1. Contracts: `pnpm --filter @klaro/contracts test` (forge, **517 must stay green**) · `lint` (fmt) · `check-abis`.
2. Web: `pnpm --filter @klaro/web typecheck` · `lint` · `test` (vitest, ~28 suites) · `build`.
3. Daemon: `pnpm --filter @klaro/daemon typecheck` · `test` · `build`.
4. Then the browser/on-chain drives below.

**The E2E harnesses (`apps/web/e2e/fixtures/rabby/`, run via the tsx CLI from `apps/web` with the dev server up):**
- `pb-create.ts` — invoice create form (no wallet) → DB CREATED.
- `pb-inject.ts <invoiceId>` — vendor publishes on-chain (injected) → `PUBLISH_OK`.
- `pb-pay.ts <invoiceId>` — anon buyer pays (the canonical injected pattern) → `PAY_OK`.
- `pb-link.ts` — **2-wallet** Klaro Link: vendor signs+creates link, buyer pays → `LINK_E2E_OK`.
- `pb-cashout.ts` — vendor locks USDC for cashout via UI → `CASHOUT_UI_E2E_OK`.
- `pb-pay-edge.ts` — `EDGE=double|reject|insufficient` negative paths.
- `pb-onboard.ts` / `pb-admin.ts` / `pb-vendor-view.ts` / `pb-overview.ts` — onboarding persist, operator gate, cross-user sync.
- `scripts/qa-cashout-preflight.mjs` (GO/NO-GO), `qa-cashout-daemon-legs.ts` (daemon advance legs + idempotency), `qa-cashout-drive.mjs` / `qa-dispute-drive.mjs` (viem-direct state machine), `qa-settle-*.mjs` (operator settle), `axe-contrast-scan.mjs` (WCAG AA).

**Pass criteria:** a feature is verified only when (a) gates green, (b) the matching pb-*/qa-* exits 0 with its `*_OK=true`, and (c) **both** the on-chain read (escrow/COP state) **and** the Supabase row reflect the expected state. Never UI-only.

The full step-by-step playbook (prereqs, the multi-wallet journey, how the injected bridge works, all gotchas) was captured by the survey — if you need it verbatim, re-run the survey workflow or read this section's expansions in the commit/memory trail.

---

## 10. Critical gotchas (each silently breaks a flow)

- **Bash sandbox blocks localhost/loopback** (`:3100`, `:6379`, Arc RPC, Supabase pooler, `docker`). Use `dangerouslyDisableSandbox:true` or the PowerShell tool for those.
- **Dev port:** harnesses hardcode `:3100`; `pnpm dev` defaults to 3000 — always `-p 3100`.
- **localhost vs 127.0.0.1:** Supabase auth cookies are origin-scoped. Login flows → `localhost:3100`; public pages work on either. Crossing them drops the session.
- **REDIS_URL** committed value is dead Upstash → override to local Docker redis for QA.
- **`KLARO_RUN_QUEUE_WORKER` must be exactly `"1"`** on the daemon or all 12 workers idle.
- **`NEXT_PUBLIC_*` is inlined at build** → restart the dev server after editing `.env.local`.
- **Settlement is operator-gated by screening** — a paid invoice stays PAID until you settle it (`qa-settle-*`); without a real screening key it fail-closes to manual review.
- **Lingering `next dev` holds OS file locks** on `.next` + Chromium/Rabby profile dirs → kill the node process before renaming/deleting dirs (this blocked the `(wallet)` route move until the stale dev server was stopped).
- **pnpm is a `.cmd`** on Windows; **CRLF/LF** churn; **direct Supabase DB host is dead** (use the pooler); **tsx has no root bin** (use the full `.pnpm/.../cli.mjs` path).
- **Injected-vendor flows:** drive the form on a FRESH single-navigation page (the magic-link redirect chain leaves wagmi alive-but-unsignable); detect "connected" via the lowercase `disconnect` control; trigger submit via `requestSubmit()` + click + Enter in a retry loop; verify `inputValue()` after `fill()`.

---

## 11. Agent-launch plan (workflow mode)

Klaro work parallelizes cleanly. Use the **Workflow** tool. Default cadence per the founder mandate / ultracode: **author and run a workflow for each substantive feature**, in phases, and stay in the loop between phases (read each phase's result before launching the next).

### 11.1 The canonical per-feature workflow (4 phases)

For any single base-gap or expansion feature (e.g. "persist disputes + wire DisputeManager"):

| Phase | Agents | What they do |
|---|---|---|
| **Understand** | **3–6 parallel** | Map the existing feature: trace the current mock/simulated path (actions.ts, repo, mockData), the deployed contract's interface, the UI components, the DB schema/migrations, and the related E2E harness. One agent per layer (web action / repo+schema / contract ABI / daemon worker / UI / existing tests). Return a structured map. |
| **Design** | **3-attempt judge panel** (3 generate + 3 score) | Generate 3 independent implementation approaches (e.g. persistence shape, contract-call placement, optimistic vs confirmed UX), score with parallel judges on correctness/UX-fit/migration-risk, synthesize the winner grafting the best of the runners-up. Skip for mechanical changes. |
| **Implement** | **1 per file/component** (pipeline, `isolation:'worktree'` if parallel mutation) | One agent per: migration, repo function, server action, UI component, daemon worker, contract test. Pipeline them so each verifies as it lands. |
| **Verify** | **3–5 adversarial** + the E2E drive | Spawn skeptics prompted to REFUTE ("find the silent failure / the un-persisted path / the mock leak"); kill findings only on majority-real. Then run the gates + a new/updated pb-*/qa- harness asserting on-chain AND DB. |

Rough size: **~10–25 agents** per feature depending on surface area.

### 11.2 How many agents — scale to the task

- **Mechanical wiring** (e.g. webhook endpoint persistence): Understand 2–3 · Design skip · Implement 1–3 · Verify 2–3 → **~6–10**.
- **Medium feature** (e.g. agents/AgentEscrow wiring, team persistence): the full 4-phase → **~15–25**.
- **Net-new feature** (e.g. Klaro Profile `klaro.me/<name>`): Understand 4–6 · Design judge panel 3+3 · Implement 6–10 (route group, public page, pay button, verification, DB, OG/SEO) · Verify 4–5 → **~25–35**.
- **Full base-readiness sweep** (convert all launch-critical simulated features): a **sequence of sub-workflows**, one per feature area, each in-the-loop. Use `workflow(name, args)` to nest, or run them as successive top-level Workflow calls. Total across the program: **~80–180 agents** over many phases — but launched *in waves*, never all at once.

### 11.3 Concurrency + budget

- Concurrent agents are capped at `min(16, cores−2)` per workflow; pass 100 items and they queue — fine. Lifetime cap 1000/workflow.
- Use `pipeline()` by default (each item verifies as soon as its stage completes); use a `parallel()` barrier only when a stage genuinely needs ALL prior results (dedup, "0 findings → skip").
- Use `isolation:'worktree'` ONLY when implement-agents mutate files in parallel and would conflict.
- Scale depth to a `+Nk` budget directive if given: `const FLEET = budget.total ? Math.floor(budget.total/100_000) : 6`.

### 11.4 Recommended program sequence

1. **Phase 0 — re-baseline** (1 workflow, ~6 agents): re-run the gates + the core happy-path E2E journey (create→publish→pay→settle→receipt, pb-link, pb-cashout) to confirm `main` is green before changing anything.
2. **Phase 1 — base-product hardening** (1 sub-workflow per launch-critical gap from §5, sequenced): disputes persistence+wiring → agents/AgentEscrow → webhook endpoint persistence → team persistence → cashout fiat-leg productionization → real screening provider. Each = the 4-phase per-feature workflow.
3. **Phase 2 — operational readiness** (1 workflow, ~10 agents): verify logs/retries/DLQ/monitoring/permissions/runbooks (the 11th base item) — audit each daemon worker's failure path + admin observability.
4. **Phase 3 — expansion backlog** in the doc's order: Link polish → Receipt+PDF → Buyer-Acceptance depth → **Klaro Profile** → Web3 Reputation UI → Cross-Chain Checkout → India Partner Cashout production.

After every phase: run the §9 gates + the relevant E2E, and only advance when green.

### 11.5 Workflow skeleton to copy

```js
export const meta = {
  name: 'klaro-feature',
  description: 'Understand → design → implement → verify one Klaro feature',
  phases: [{title:'Understand'},{title:'Design'},{title:'Implement'},{title:'Verify'}],
}
phase('Understand')
const map = await parallel(LAYERS.map(l => () =>
  agent(`Map the ${l} layer of <feature> in apps/web|daemon|contracts. Return current path, mock vs live, contract iface, gaps.`,
        {phase:'Understand', schema: MAP_SCHEMA})))
phase('Design')
const design = /* judge panel: 3 attempts → 3 scorers → synthesize */
phase('Implement')
const built = await pipeline(FILES, f => agent(`Implement ${f} per the design. Persist for real, no mock leak.`, {phase:'Implement', isolation:'worktree'}),
                                   r => agent(`Self-check ${r.file}: typecheck the change mentally, confirm DB+on-chain path.`, {phase:'Implement'}))
phase('Verify')
const verdicts = await parallel(built.flat().map(b => () =>
  agent(`Adversarially verify ${b.file}: find any silent failure / un-persisted path / [SIMULATED] leak. Default refuted=true if unsure.`,
        {phase:'Verify', schema: VERDICT_SCHEMA})))
return { built, verdicts }
```

Then, back in the main loop, run the gates + the matching `pb-*`/`qa-*` harness (§9) and commit only when green.

---

## 12. Definition of done

A feature ships when:
1. **No half-baked path** — the full user flow works (design → UI → on-chain → daemon → DB), edge cases handled, no silent `[SIMULATED]` leak in a surface claimed live.
2. **Gates green** — contracts (517 forge + check-abis), web (typecheck/lint/vitest/build), daemon (typecheck/test/build).
3. **Verified like a real user, multi-wallet** — the matching injected-EIP-1193 E2E exits `*_OK=true`, asserting BOTH on-chain state AND the Supabase row (1 wallet for vendor-only actions, 2 for vendor↔buyer, 3 for vendor↔operator↔LP cashout).
4. **Committed on `main`** with an honest, scoped message (no AI attribution, senior-engineer tone).

Base product done = every launch-critical item in §5 is either live+verified or a deliberate, labelled testnet-simulation. Only then open the §6 expansion backlog.

---

*Handoff prepared from a 6-agent survey of the live repo (roadmap, achievements, web feature-status, contracts/daemon, testing infra, run/deploy). Memory index: `C:\Users\prate\.claude\projects\C--Users-prate-Downloads-arcbuild\memory\` (`project_audit_remediation_progress.md`, `reference_e2e_injected_2wallet.md`).*
