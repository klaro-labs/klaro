// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import { Test } from "forge-std/Test.sol";
import { ReputationManager } from "../src/ReputationManager.sol";
import { VendorReputation } from "../src/VendorReputation.sol";
import { KlaroConfig } from "../src/KlaroConfig.sol";

contract ReputationManagerTest is Test {
    ReputationManager mgr;
    VendorReputation rep;

    address operator = address(0xA11CE);
    address rando = address(0xBEEF);
    address vendorAddr = address(0xCAFE);

    bytes32 constant V = keccak256("vendor-asha");

    function setUp() public {
        vm.chainId(KlaroConfig.ARC_TESTNET_CHAIN_ID);
        rep = new VendorReputation(operator);
        mgr = new ReputationManager(rep, operator);
    }

    function _record(int32 w, VendorReputation.Kind k) internal {
        vm.prank(operator);
        rep.record(V, k, w, bytes32(0), bytes32(0));
    }

    function test_ZeroEvents_ReturnsZero() public view {
        (uint16 s, ReputationManager.Tier t, int256 sum) = mgr.computeScore(V);
        assertEq(s, 0);
        assertEq(sum, 0);
        assertEq(uint8(t), uint8(ReputationManager.Tier.EMERGING));
    }

    function test_PositiveEvents_LiftScore() public {
        _record(50, VendorReputation.Kind.INVOICE_SETTLED);
        (uint16 s, ReputationManager.Tier t,) = mgr.computeScore(V);
        assertGt(s, 0);
        // 50 * 10 (base multiplier) = 500 → ACTIVE
        assertEq(s, 500);
        assertEq(uint8(t), uint8(ReputationManager.Tier.ACTIVE));
    }

    function test_NegativeEventsCapToZero() public {
        _record(-100, VendorReputation.Kind.SLASH_PENALTY);
        (uint16 s, ReputationManager.Tier t,) = mgr.computeScore(V);
        assertEq(s, 0);
        assertEq(uint8(t), uint8(ReputationManager.Tier.EMERGING));
    }

    function test_HighScore_LandsInPriority() public {
        _record(120, VendorReputation.Kind.INVOICE_SETTLED);
        (uint16 s, ReputationManager.Tier t,) = mgr.computeScore(V);
        // 120 * 10 = 1200 → clamped to 1000 → PRIORITY
        assertEq(s, 1000);
        assertEq(uint8(t), uint8(ReputationManager.Tier.PRIORITY));
    }

    function test_TierBoundaries() public {
        // ACTIVE upper boundary (650)
        _record(64, VendorReputation.Kind.INVOICE_SETTLED);
        (uint16 s, ReputationManager.Tier t,) = mgr.computeScore(V);
        assertEq(s, 640);
        assertEq(uint8(t), uint8(ReputationManager.Tier.ACTIVE));

        // Push to ESTABLISHED
        _record(2, VendorReputation.Kind.INVOICE_SETTLED);
        (s, t,) = mgr.computeScore(V);
        assertEq(s, 660);
        assertEq(uint8(t), uint8(ReputationManager.Tier.ESTABLISHED));
    }

    function test_Snapshot_StoresHistory_AndFormulaVersion() public {
        _record(50, VendorReputation.Kind.INVOICE_SETTLED);
        vm.prank(operator);
        mgr.snapshot(V);
        assertEq(mgr.snapshotCount(V), 1);
        ReputationManager.Snapshot memory s = mgr.latestSnapshot(V);
        assertEq(s.score, 500);
        assertEq(s.formulaVersion, 1);
    }

    /// @notice regression: snapshot was permissionless with a
    /// caller-supplied vendorAddress for the self-rate check —
    /// attacker passed any other address and storage-grew the
    /// history. Now operator-only.
    function test_Snapshot_NonOperator_Reverts() public {
        _record(10, VendorReputation.Kind.INVOICE_SETTLED);
        vm.prank(vendorAddr);
        vm.expectRevert(ReputationManager.NotOperator.selector);
        mgr.snapshot(V);
    }

    function test_FormulaVersion_BumpsOnMultiplierChange() public {
        uint32 v0 = mgr.formulaVersion();
        vm.prank(operator);
        mgr.setKindMultiplier(VendorReputation.Kind.SLASH_PENALTY, 10);
        assertEq(mgr.formulaVersion(), v0 + 1);
    }

    /// @notice Regression for loop : `setKindMultiplier` used to
    /// bump `formulaVersion` without changing the computed
    /// score. Now the multiplier is actually applied. Same
    /// event log, different multiplier ⇒ different score.
    function test_KindMultiplier_AppliedToComputeScore() public {
        // Baseline: 30 weight INVOICE_SETTLED at default multiplier 1.
        _record(30, VendorReputation.Kind.INVOICE_SETTLED);
        (uint16 baseScore,,) = mgr.computeScore(V);
        assertEq(baseScore, 300, "baseline 30 * 1 * 10 = 300");

        // Crank the INVOICE_SETTLED multiplier to 3x. No new events,
        // same vendor — score must move.
        vm.prank(operator);
        mgr.setKindMultiplier(VendorReputation.Kind.INVOICE_SETTLED, 3);
        (uint16 amplified, ReputationManager.Tier t,) = mgr.computeScore(V);
        assertEq(amplified, 900, "amplified 30 * 3 * 10 = 900");
        // 900 >= establishedMax (850) → PRIORITY tier
        assertEq(uint8(t), uint8(ReputationManager.Tier.PRIORITY));
    }

    /// @notice Different kinds with different multipliers must combine
    /// correctly. Catches the case where the manager reads only
    /// one bucket from the per-kind array.
    function test_KindMultiplier_TwoKindsCombineCorrectly() public {
        // 20 weight INVOICE_SETTLED (mult 1) → 20
        _record(20, VendorReputation.Kind.INVOICE_SETTLED);
        // 10 weight DISPUTE_WON (mult 2) → 20
        _record(10, VendorReputation.Kind.DISPUTE_WON);
        // amplified = 40 → base = 400
        (uint16 s,,) = mgr.computeScore(V);
        assertEq(s, 400);

        // Bump DISPUTE_WON to 5x → 10*5 = 50; total amplified = 70; base 700
        vm.prank(operator);
        mgr.setKindMultiplier(VendorReputation.Kind.DISPUTE_WON, 5);
        (s,,) = mgr.computeScore(V);
        assertEq(s, 700);
    }

    function test_SetTierThresholds_RejectsBadOrder() public {
        vm.prank(operator);
        vm.expectRevert(ReputationManager.BadThresholds.selector);
        mgr.setTierThresholds(500, 400, 900); // active < emerging
    }

    function test_NonOperator_CannotMutate() public {
        vm.prank(rando);
        vm.expectRevert(ReputationManager.NotOperator.selector);
        mgr.setKindMultiplier(VendorReputation.Kind.INVOICE_SETTLED, 1);
    }
}
