# D13 — Compliance / Legal / Docs Audit

**Auditor lens:** KYB/AML posture, sanctions screening fail-open vs fail-closed, disclaimers, PII-on-chain claims, ToS/privacy coverage, threat-model accuracy, SECURITY.md completeness, README overclaiming.

**Date:** 2026-05-31

## Summary

Klaro's compliance posture is **strong for a testnet-stage product** — honest-mode labelling is pervasive, legal pages exist and are well-structured, the "not a bank" disclaimer appears on every money-adjacent surface, and the financing readiness page carries a verbatim disclaimer. The screening architecture is correctly fail-closed (simulated results never auto-settle). However, several material gaps exist:

1. **README overclaims** — states "every dollar of value is escrowed, screened, and traceable end to end" when screening is 100% simulated today.
2. **On-chain screening gate is fail-open by default** — `counterpartyStrict = false` means unknown buyers (no cached decision) pass through; only denylisted buyers are blocked.
3. **AgentRegistry stores `displayName` (a string) on-chain** — contradicts the "no PII on-chain" claim if agents use real names.
4. **No live KYB enforcement exists anywhere in the codebase** — the ToS says "KYB is required on mainnet; testnet is permissionless" but there's no code path that would enforce it.
5. **SECURITY.md PGP URL inconsistency** with bug-bounty doc.
6. **DPA is explicitly a draft** — not signed, not binding.

---

## Findings

### [HIGH] README overclaims screening capability

- file: README.md:41
- lens: compliance
- what: README states "Every dollar of value is escrowed, screened, and traceable end to end." In reality, all three screening providers (Chainalysis, Sumsub, Elliptic/TRM) are simulated stubs that always return `"review"` and never auto-settle.
- why: This language implies live sanctions/AML screening is operational. A regulator, investor, or partner reading the README would reasonably conclude screening is functional. The daemon's `screenAndSettle.ts:41` explicitly states "There is no live screening-provider integration yet."
- fix: Amend README line 41 to: "Every dollar of value is escrowed, screened (simulated on testnet — live providers wire at mainnet), and traceable end to end." Or add a `[testnet: simulated]` badge inline.
- confidence: High — code at `apps/daemon/src/workers/screenAndSettle.ts:41-55` confirms zero live providers.

---

### [HIGH] On-chain counterparty gate is fail-open for unknown buyers

- file: packages/contracts/src/InvoiceEscrow.sol:342-345
- lens: compliance
- what: Deploy script sets `counterpartyStrict = false` (file: `packages/contracts/script/Deploy.s.sol:207-210`). In non-strict mode, the contract only rejects buyers who are explicitly on the denylist. Any buyer with no cached screening decision passes through unchecked. This is a fail-open posture for unknown wallets.
- why: For a protocol that claims sanctions screening, fail-open means a sanctioned wallet that hasn't been previously screened can pay an invoice and have funds escrowed. The daemon will catch it post-payment (screen-and-settle worker), but funds are already locked in escrow at that point — creating a regulatory exposure where sanctioned funds touch the protocol.
- fix: (1) Document this as an accepted risk for testnet in the threat model. (2) For mainnet, flip to `counterpartyStrict = true` once screening lead time is short enough, OR add a pre-payment screening call before `acceptAndPay` at the frontend/daemon level. (3) Add a threat-model row for "sanctioned buyer pays before screening completes."
- confidence: High — `Deploy.s.sol:209` sets `false`; `RedeployEscrowForLinks.s.sol:43` also sets `false`.

---

### [MEDIUM] AgentRegistry stores displayName string on-chain — PII risk

- file: packages/contracts/src/AgentRegistry.sol:26
- lens: compliance
- what: `AgentRegistry` stores `string displayName` in the `Agent` struct on-chain and emits it in events (`AgentRegistered`, `AgentUpdated`). The trust page and privacy policy claim "No PII on-chain" and "only required hashes and wallet references may reach Arc."
- why: If an agent operator uses their real name or business name as `displayName`, that's PII permanently stored on a public chain. The `AuditReceipt` contract correctly stores only hashes, but `AgentRegistry` breaks this invariant.
- fix: (1) Replace `string displayName` with `bytes32 displayNameHash` and resolve the name off-chain. (2) Or document that `displayName` is explicitly NOT PII (must be a pseudonym/brand) and enforce this in the registration UI with a disclaimer. (3) Update trust page to say "no PII on-chain except agent display names which are user-chosen labels."
- confidence: High — the struct definition is at line 26; events at lines 40, 43.

---

### [MEDIUM] No KYB enforcement code path exists for mainnet readiness

- file: apps/web/app/legal/terms/page.tsx:30
- lens: compliance
- what: ToS states "KYB is required on mainnet; testnet is permissionless." However, grep for `kyb.*required|require.*kyb|kyb.*gate|kyb.*check` across the entire web app returns zero results. There is no code that would gate vendor operations behind KYB completion. The `LPRegistry` contract has KYB status tracking but no vendor-side enforcement exists.
- why: When mainnet launches, there's no mechanism to enforce the ToS promise. A vendor could create invoices, accept payments, and request cashout without completing KYB. This is a regulatory gap — MSB/PSP regulations in most jurisdictions require KYB before processing payments.
- fix: (1) Add a `requireKYB()` guard to server actions that create invoices or initiate cashout on mainnet. (2) Add a feature flag (`REQUIRE_KYB=true` for mainnet) that gates money-moving operations. (3) Track this as a pre-mainnet blocker in the roadmap.
- confidence: High — exhaustive grep confirms no enforcement code exists.

---

### [MEDIUM] Sanctions refresh worker is a no-op stub

- file: apps/daemon/src/workers/sanctionsRefresh.ts:14-31
- lens: compliance
- what: The daily sanctions list refresh worker (OFAC/EU/UN) is a complete stub. It logs `[SIMULATED] sanctions.refresh.skipped` and writes a "simulated" status row. No actual list is fetched, no Bloom filter is built, no `counterparty_screen_cache` is populated with real data.
- why: The admin UI (`apps/web/app/admin/sanctions/page.tsx`) and the `CounterpartyRegistry` contract both depend on cached screening decisions. With no real data flowing in, the denylist is empty and the cache is unpopulated — meaning the on-chain `isAllowed()` check always returns `false` for unknown buyers (which is actually safe in strict mode, but in non-strict mode it's irrelevant since unknown buyers pass through).
- fix: (1) This is acceptable for testnet IF clearly documented. Add a row to the system threat model table: "Sanctions refresh is simulated — no real OFAC/EU/UN data ingested." (2) Pre-mainnet: wire Chainalysis/TRM API keys and validate the refresh pipeline end-to-end.
- confidence: High — the worker body at lines 14-31 is entirely a stub.

---

### [MEDIUM] SECURITY.md PGP key URL inconsistency

- file: SECURITY.md:8 vs docs/bug-bounty/immunefi.md:48
- lens: compliance
- what: SECURITY.md references `https://klaro.so/.well-known/klaro-security.asc` while the bug-bounty doc references `/.well-known/klaro-security.asc` (relative). The trust page links to `/.well-known/security.txt`. There is no `klaro-security.asc` file in the `public/.well-known/` directory — only `security.txt` exists there.
- why: A security researcher attempting encrypted disclosure cannot find the PGP key. This undermines the coordinated disclosure process.
- fix: (1) Add the actual PGP public key file at `apps/web/public/.well-known/klaro-security.asc`. (2) Ensure all references use the same canonical URL.
- confidence: High — `apps/web/public/.well-known/` contains only `security.txt`.

---

### [MEDIUM] DPA is explicitly a draft — not a binding agreement

- file: apps/web/app/legal/dpa/page.tsx:14-15
- lens: compliance
- what: The DPA page states "This draft Data Processing Agreement (DPA) is provided for testnet review and is not represented as a signed production agreement." However, the privacy policy links to it as if it's operative, and the subprocessors page references "per the DPA" as if it's binding.
- why: Under GDPR Article 28, a processor must have a binding DPA before processing personal data. If any real personal data is processed (even on testnet — email addresses, wallet addresses, display names), the draft DPA provides no legal basis.
- fix: (1) For testnet: add a disclaimer on the privacy page that the DPA is draft-only and no real personal data processing occurs. (2) For mainnet: execute the DPA as a binding addendum to the ToS. (3) Remove "per the DPA" language from subprocessors page until it's signed.
- confidence: Medium — testnet may not process "real" personal data, but email addresses collected at signup are personal data under GDPR.

---

### [LOW] README badge says "500 tests" — actual count is 517

- file: README.md:8
- lens: compliance (accuracy of public claims)
- what: The README badge states "500 tests" but grep for `function test` across all `.t.sol` files returns 517 matches.
- why: Minor inaccuracy. Not a compliance risk but undermines trust in stated metrics.
- fix: Update badge to "500+" or the actual count. Consider generating this from CI output.
- confidence: High — grep count is 517.

---

### [LOW] README says "20 deployed contracts" — actual count is 21 (or 22 with adapter)

- file: README.md:5
- lens: compliance (accuracy of public claims)
- what: README states "20 deployed contracts" in the stats table. The `src/` directory contains 21 contract files (excluding the `adapters/` subdirectory which has `MockStableFXAdapter`). Including the interface `IACPHook`, it's 21. The contracts table in the README lists 20 named contracts (excluding `KlaroConfig` which is a library).
- why: Minor discrepancy. The body text says "Twenty contracts" which is approximately correct depending on how you count libraries vs deployable contracts.
- fix: Reconcile the count or add "(+ libraries)" qualifier.
- confidence: Medium — depends on counting methodology.

---

### [LOW] Trust page claims "11 things we promise + prove" but several are aspirational

- file: apps/web/app/trust/page.tsx:15-80
- lens: compliance
- what: Trust page items like "Tested like money is real" (id: `tested`), "External audits before mainnet" (id: `audits`), and "Operator audit log" (id: `operator-audit`) are tagged with Badge `tone="info"` and text "Required" — but the heading "11 things we promise + prove" implies they're already proven.
- why: A user reading the trust page could interpret "promise + prove" as current state rather than aspirational. The individual items do say "Required before live funds" but the heading overclaims.
- fix: Change heading to "11 invariants we enforce or require before mainnet" or split into "Proven today" vs "Required before mainnet" sections.
- confidence: Medium — the individual item text is honest, but the heading is misleading.

---

### [LOW] Threat model missing row for "simulated screening auto-settles if code changes"

- file: THREAT_MODEL.md (table)
- lens: compliance
- what: The system threat model has 15 rows but none covers the risk that a code change could accidentally make simulated screening results auto-settle invoices. The `screenAndSettle.ts` worker has a comment-level guard ("This branch is reachable only after live providers are wired") but no programmatic assertion that prevents simulated results from reaching the settle path.
- why: A regression (e.g., changing `"review"` to `"pass"` in the stub) would cause invoices to auto-settle without real screening. This is a critical money-flow risk that should be in the threat model.
- fix: (1) Add a threat-model row: "Simulated screening accidentally auto-settles — control: stub always returns 'review'; CI test asserts stub never returns 'pass'." (2) Add a unit test that asserts `runScreen()` never returns `"pass"` when `CHAINALYSIS_API_KEY` is unset.
- confidence: High — the code path exists at `screenAndSettle.ts:108-115` and has no programmatic guard.

---

### [LOW] Acceptable-use policy references sanctions but doesn't define consequences

- file: apps/web/app/legal/acceptable-use/page.tsx:26
- lens: compliance
- what: The acceptable-use policy mentions "Money laundering, terrorist financing, sanctions evasion" as prohibited but doesn't specify what happens when detected (account freeze? fund seizure? law enforcement referral?).
- why: Regulatory frameworks (BSA/AML, EU 6AMLD) require documented procedures for handling detected violations. The ToS mentions "pause individual contracts or your account" but doesn't tie it to the AML-specific consequences.
- fix: Add a section to the acceptable-use policy or ToS that specifies: (1) immediate account suspension, (2) fund freeze pending investigation, (3) SAR filing where required, (4) law enforcement cooperation.
- confidence: Medium — this is a documentation gap, not a code gap.

---

### [INFO] Screening architecture is correctly fail-closed for settlement

- file: apps/daemon/src/workers/screenAndSettle.ts:42
- lens: compliance (positive finding)
- what: The screening worker correctly fails closed — simulated results return `"review"` which routes to manual admin review and never triggers on-chain settlement. The comment at line 42 states "fail closed into manual review" and the code path at lines 100-115 confirms that only `"pass"` results (unreachable with simulated providers) trigger settlement.
- why: This is the correct posture. Even if the on-chain gate is fail-open (non-strict mode), the off-chain settlement path is fail-closed.
- fix: None needed — document this as a positive control in the threat model.
- confidence: High.

---

### [INFO] Legal page coverage is comprehensive for testnet stage

- file: apps/web/app/legal/ (7 pages)
- lens: compliance (positive finding)
- what: Klaro has: Terms of Service, Privacy Policy, Disclosures, DPA (draft), Subprocessors list, Acceptable Use Policy, and Cookie Policy. All are dated 2026-05-24. The trust page links to disclosures and privacy. The footer carries "not a bank" disclaimer on every page.
- why: This exceeds typical testnet-stage legal coverage. The subprocessors list is particularly thorough.
- fix: None for testnet. Pre-mainnet: execute the DPA, add jurisdiction-specific terms, add a cookie consent banner if not already present.
- confidence: High.

---

### [INFO] "Not a bank" / "Not a loan" disclaimers are pervasive and well-placed

- file: Multiple (19 files)
- lens: compliance (positive finding)
- what: The "Klaro is not a bank" disclaimer appears in: Footer (every page), Terms, Disclosures, Trust page, Cashout page, Cashout detail, Pricing, Signin, Corridors section, PartnerCashout section. The financing readiness page carries a mandatory `VERBATIM_DISCLAIMER` that explicitly states "This is not a loan offer."
- why: This is excellent compliance posture. The `financingReadiness.ts` module even has a code comment stating the disclaimer "must appear verbatim on every surface that shows the score."
- fix: None needed.
- confidence: High.

---

### [INFO] Honest-mode labelling is consistently applied

- file: 60+ files across apps/web
- lens: compliance (positive finding)
- what: Grep for honest-mode labels (`simulated`, `access pending`, `partner-pending`, `mainnet only`) returns 206 matches across 60 files. Every money-adjacent surface (cashout, FX, LP queue, receipts, screening) carries explicit mode badges.
- why: This is the strongest compliance control in the codebase — it prevents users from being misled about what's real vs simulated.
- fix: None needed.
- confidence: High.
