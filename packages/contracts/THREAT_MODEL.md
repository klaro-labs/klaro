# Klaro contract threat model

Smart-contract attack surface for the Klaro protocol. Thirteen vectors documented; each names the concrete mitigation and the test case that exercises it. Every pull request that changes a contract MUST update this document if it touches any vector below or introduces a new one.

**In scope:** all contracts under [`src/`](src/).
**Out of scope:** Arc L1 consensus, Circle's USDC + CCTP + Gateway contracts (Circle's threat model applies). The system-level threat model (web + daemon + Supabase + third-parties) lives in [`THREAT_MODEL.md`](../../THREAT_MODEL.md) at the repository root.

---

## 1. Signature replay against `InvoiceEscrow.acceptAndPay`

**Vector:** Buyer signs an EIP-712 acceptance once; attacker re-submits the
same signature against the same invoice or a different one with matching
amount/vendor/etc.

**Mitigation:**

- `invoiceId` is bound into the typed-data + the on-chain status check
  `inv.status != Status.CREATED` prevents double-accept on the same id.
- Cross-invoice replay impossible: `invoiceId` is unique + bound into the digest.
- Cross-chain replay impossible: `EIP-712.chainId` bound into the domain.

**Tests:** `InvoiceEscrow.t.sol::test_acceptAndPay_badSig_reverts_andRefundsNothing`,
`test_acceptAndPayWithSplits_buyerMustSignSplitsHash`.

---

## 2. Splits-hash rug by vendor

**Vector:** Vendor creates invoice with `splits = [{vendor, 10000}]`, buyer
signs, vendor swaps splits to `[{evilActor, 9999}, {vendor, 1}]` before settle.

**Mitigation:** `splitsHash = keccak256(abi.encode(splits))` baked into the
EIP-712 typed data buyer signs. Any post-sign mutation breaks the signature.
`_invoiceSplits[id]` is set on `createInvoiceWithSplits` + never mutated.

**Tests:** `InvoiceEscrow.t.sol::test_acceptAndPayWithSplits_buyerMustSignSplitsHash`.

---

## 3. Fee splitter dust/over-allocation

**Vector:** Adversary configures a split with `sum(bps) != 10_000` to either
under-pay one party or skim the dust.

**Mitigation:** `FeeSplitter.setSplit` reverts with `BadBpsSum` unless sum is
exactly 10_000. Last-payee absorbs any rounding dust so `sum(payouts) == amount`
(conservation invariant). 256-run fuzz proves this.

**Tests:** `FeeSplitter.t.sol::testFuzz_ConservationInvariant`,
`test_DustGoesToLastPayee`, `test_SetSplit_RejectsBadBpsSum`.

---

## 4. LP slashes vendor's locked USDC

**Vector:** Compromised operator slashes more than the vendor's vested cashout
USDC, or slashes an unsigned LP.

**Mitigation:**

- `CashoutOrderProcessor.resolveDispute` slashes via `LPStaking.slash(lpId,
amount, reason)` — bound to `lpId` not vendor.
- `LPRegistry.assertActive(lpId)` gates `claimByLP` so only KYB-passed LPs
  can ever be slash targets.
- Owner-only `setOperator` with multisig in M12.

**Tests:** `CashoutOrderProcessor.t.sol::test_openDispute_blocksRelease_thenResolveSlashesLP`,
`test_claimByLP_revertsForSuspendedLP`.

---

## 5. Re-entrancy on settle/release paths

**Vector:** Malicious token/recipient contract re-enters `settle`,
`confirmReceived`, `withdraw`, or `distribute` to drain escrow.

**Mitigation:** `ReentrancyGuard` on every state-changing money function in
InvoiceEscrow, CashoutOrderProcessor, RefundProtocol, FeeSplitter,
RetainerStream, StableFXAdapterRegistry, AgentEscrow, AgentBudgetWallet.
SafeERC20 used everywhere.

**Tests:** Implicit — all happy-path tests run with the guard active; explicit
re-entrancy hostile-token test deferred to Echidna 5M-run pre-mainnet.

---

## 6. Dispute manager hijack

**Vector:** Random caller opens a dispute case naming arbitrary
claimant/respondent addresses, then submits forged evidence.

**Mitigation:** `DisputeManager.open` requires `msg.sender` to be operator,
claimant, respondent, OR an allow-listed trusted-caller (only consumer escrow
contracts). `submitEvidence` similarly party-gated. `decide` is operator-only +
ReasonCodes-validated.

**Tests:** `DisputeManager.t.sol::test_OpenByRando_Reverts`,
`test_SubmitEvidence_ByRando_Reverts`, `test_Decide_NonOperator_Reverts`.

---

## 7. Reputation self-rate

**Vector:** Vendor calls `ReputationManager.snapshot(vendorId, vendorAddress)`
on themselves to lock in a favourable score before fraud is detected.

**Mitigation:** `snapshot` reverts if `msg.sender == vendorAddress`.
Caller must be a distinct operator or trusted oracle.

**Tests:** `ReputationManager.t.sol::test_Snapshot_VendorSelfRate_Reverts`.

---

## 8. Retainer stream over-withdraw / clock jump

**Vector:** Recipient withdraws more than vested, or clock-rollback via
malicious chain re-org (not applicable on Arc — deterministic finality).

**Mitigation:**

- `RetainerStream.withdrawable = vested - withdrawn` clamped non-negative.
- `withdraw` reverts if `amount > withdrawable`.
- Cancel-then-claim path uses `cancelledVested` snapshot — no time-travel.
- Conservation invariant proven by 256-run fuzz.

**Tests:** `RetainerStream.t.sol::testFuzz_ConservationOnCancel`,
`test_Withdraw_OverWithdrawable_Reverts`.

---

## 9. Agent escrow fee manipulation

**Vector:** Agent owner sets `feeBps = 10_000` (100%) on `AgentRegistry` →
takes the entire job payment, leaves principal with nothing.

**Mitigation:** `AgentRegistry.maxAgentFeeBps` (default 2_000 = 20%) caps
fees. `setMaxAgentFeeBps` is operator-only. AgentEscrow re-asserts cap at
create time.

**Tests:** `AgentRegistry.t.sol::test_RegisterAboveFeeCap_Reverts`,
`test_SetMaxAgentFeeBps_OperatorOnly`.

---

## 10. ACPHook DOS or upgrade-griefing

**Vector:** Per-job IACPHook reverts unconditionally to brick the job, or is
swapped post-creation to a different implementation.

**Mitigation:**

- Hook is bound at `createJob` time + stored in the Job struct — immutable
  per job.
- If beforeHook reverts, principal can `cancel` (pre-START) for a full
  refund; post-START, `openDispute` routes to DisputeManager.
- Test proves a reverting hook blocks the action but doesn't trap funds.

**Tests:** `AgentEscrow.t.sol::test_BeforeHook_RevertBlocks_Action`,
`test_Cancel_BeforeStart_Refunds_IfFunded`.

---

## 11. AgentBudgetWallet allowlist bypass

**Vector:** Adversary tricks the agent (owner) into sending USDC to an
attacker address that isn't allow-listed.

**Mitigation:** `spend(to, amount)` reverts with `NotAllowed` unless
`allowlist[to] == true`. Daily-cap enforcement provides defense in depth.
Owner-only mutations + pause switch.

**Tests:** `AgentBudgetWallet.t.sol::test_Spend_NonAllowlisted_Reverts`,
`test_Spend_AboveDailyCap_Reverts`, `test_Window_RollsAfter24h_CapResets`.

---

## 12. Stale corridor / chain config

**Vector:** Arc/Circle update an address (Gateway, CCTP, ERC-8004, FxEscrow,
ERC-8183). Klaro continues writing to the old address; funds lost.

**Mitigation:**

- `KlaroConfig.sol` is the single source of truth for every verified Arc / Circle address Klaro depends on.
- CI runs a drift-check job that fetches every page referenced by `docs.arc.io/llms.txt` and confirms every pinned address still appears in the live corpus. PRs that touch the config and break drift fail their build.

**Tests:** `KlaroConfig.t.sol::test_addressRegistry`, plus the CI drift-check workflow at `.github/workflows/ci.yml`.

---

## 13. Unauthorized operator action

**Vector:** Compromised operator key triggers slash, refund, pause, or
admit on behalf of users without the proper runbook + countersign.

**Mitigation:**

- Every operator action stamps a `ReasonCodes` hash + audit-log entry
  (`lib/auditLog.ts`).
- Operator role is a single address today; M12 → multisig (Gnosis Safe on
  Arc) so high-value actions require ≥ 2 signatures.
- Runbooks in `docs/runbooks/` define which actions need which countersigns.
- Sentry breadcrumb mirrors every audit entry so post-incident review is
  trivial.

**Tests:** Per-contract operator-only revert tests (every contract has
`test_*_NonOperator_Reverts`). Multisig wiring tested at M12 deploy.

---

## Audit checklist (M12 pre-mainnet)

- [ ] Slither pass with zero high findings
- [ ] Mythril deep-search on every contract
- [ ] Echidna 5M-run on `FeeSplitter` conservation + `RetainerStream`
      conservation + `LPStaking` slash bounds
- [ ] Halmos formal verification on `InvoiceEscrow.settle`,
      `AuditReceipt.mint`, `DisputeManager.decide`
- [ ] OpenZeppelin / Trail of Bits / Spearbit external audit (1 of 3)
- [ ] Immunefi public bounty live (see `docs/bug-bounty/immunefi.md`)
- [ ] Two-owner operator multisig deployed via Safe
- [ ] Pause drill executed (every Pausable contract) per v2 §33
- [ ] Drift check: all 18 `KlaroConfig` addresses re-verified < 48h before
      mainnet deploy

Last reviewed: 2026-05-24. Next review: pre-mainnet deploy.
