// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import { Test } from "forge-std/Test.sol";
import { LPRegistry } from "../src/LPRegistry.sol";
import { KlaroConfig } from "../src/KlaroConfig.sol";

/// @notice bump LPRegistry branch
/// coverage from 38.89% (7/18). Existing LPRegistry.t.sol covers
/// the lifecycle happy paths. This file targets every uncovered
/// revert branch: WrongStateForOp on admit/revoke from wrong
/// states, UnknownLP on every state-mutating + read-validation
/// path, BadTier on setTier, ZeroWallet on setWallet, NotOperator
/// on every operator-only mutator, plus the assertTierAtLeast
/// dual-revert branches.
contract LPRegistryRevertsTest is Test {
    LPRegistry reg;
    address operator = address(0xC0FFEE);
    address owner;
    bytes32 LP_A = keccak256("lp-a");
    bytes32 LP_NONE = keccak256("lp-never-registered");
    // LP_SUSPENDED_RISK is now registered — semantically correct
    // for both suspend (active LP marked risky) and revoke (terminal kick).
    bytes32 REASON = keccak256("klaro.reason.LP_SUSPENDED_RISK");
    bytes32 KYB = keccak256("lp-a:kyb");
    bytes32 PAYOUT = keccak256("lp-a:payout");
    address WALLET_A = address(0xAAA1);
    address WALLET_B = address(0xAAA2);

    function setUp() public {
        vm.chainId(KlaroConfig.ARC_TESTNET_CHAIN_ID);
        owner = address(this);
        reg = new LPRegistry(operator);
        vm.prank(operator);
        reg.registerLP(LP_A, WALLET_A, 2, KYB, PAYOUT);
    }

    // ─── admit (wrong state) ─────────────────────────────────────────

    function test_Admit_FromAdmitted_Reverts() public {
        vm.startPrank(operator);
        reg.admit(LP_A);
        vm.expectRevert(
            abi.encodeWithSelector(
                LPRegistry.WrongStateForOp.selector,
                LPRegistry.Status.PENDING,
                LPRegistry.Status.ADMITTED
            )
        );
        reg.admit(LP_A);
        vm.stopPrank();
    }

    function test_Admit_FromUnknownLP_Reverts() public {
        vm.prank(operator);
        vm.expectRevert(
            abi.encodeWithSelector(
                LPRegistry.WrongStateForOp.selector,
                LPRegistry.Status.PENDING,
                LPRegistry.Status.NONE
            )
        );
        reg.admit(LP_NONE);
    }

    function test_Admit_FromRevoked_Reverts() public {
        vm.startPrank(operator);
        reg.admit(LP_A);
        reg.revoke(LP_A, REASON);
        vm.expectRevert(
            abi.encodeWithSelector(
                LPRegistry.WrongStateForOp.selector,
                LPRegistry.Status.PENDING,
                LPRegistry.Status.REVOKED
            )
        );
        reg.admit(LP_A);
        vm.stopPrank();
    }

    // ─── revoke ──────────────────────────────────────────────────────

    function test_Revoke_UnknownLP_Reverts() public {
        vm.prank(operator);
        vm.expectRevert(LPRegistry.UnknownLP.selector);
        reg.revoke(LP_NONE, REASON);
    }

    function test_Revoke_AlreadyRevoked_Reverts() public {
        vm.startPrank(operator);
        reg.admit(LP_A);
        reg.revoke(LP_A, REASON);
        vm.expectRevert(
            abi.encodeWithSelector(
                LPRegistry.WrongStateForOp.selector,
                LPRegistry.Status.ADMITTED,
                LPRegistry.Status.REVOKED
            )
        );
        reg.revoke(LP_A, REASON);
        vm.stopPrank();
    }

    function test_Revoke_FromPending_Allowed() public {
        // PENDING → REVOKED is allowed per the contract (status != NONE
        // && status != REVOKED). Documenting the branch.
        vm.prank(operator);
        reg.revoke(LP_A, REASON);
        assertEq(uint256(reg.statusOf(LP_A)), uint256(LPRegistry.Status.REVOKED));
    }

    // ─── setTier ────────────────────────────────────────────────────

    function test_SetTier_BadTier_Reverts() public {
        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(LPRegistry.BadTier.selector, uint8(5)));
        reg.setTier(LP_A, 5);
    }

    function test_SetTier_UnknownLP_Reverts() public {
        vm.prank(operator);
        vm.expectRevert(LPRegistry.UnknownLP.selector);
        reg.setTier(LP_NONE, 3);
    }

    // ─── setWallet ───────────────────────────────────────────────────

    function test_SetWallet_Zero_Reverts() public {
        vm.prank(operator);
        vm.expectRevert(LPRegistry.ZeroWallet.selector);
        reg.setWallet(LP_A, address(0));
    }

    function test_SetWallet_UnknownLP_Reverts() public {
        vm.prank(operator);
        vm.expectRevert(LPRegistry.UnknownLP.selector);
        reg.setWallet(LP_NONE, WALLET_B);
    }

    function test_SetWallet_Happy_UpdatesWallet() public {
        vm.prank(operator);
        reg.setWallet(LP_A, WALLET_B);
        assertEq(reg.walletOf(LP_A), WALLET_B);
    }

    // ─── updateKYBHash / updatePayoutAccountHash ─────────────────────

    function test_UpdateKYBHash_UnknownLP_Reverts() public {
        vm.prank(operator);
        vm.expectRevert(LPRegistry.UnknownLP.selector);
        reg.updateKYBHash(LP_NONE, keccak256("new"));
    }

    function test_UpdatePayoutAccountHash_UnknownLP_Reverts() public {
        vm.prank(operator);
        vm.expectRevert(LPRegistry.UnknownLP.selector);
        reg.updatePayoutAccountHash(LP_NONE, keccak256("new"));
    }

    // ─── assertTierAtLeast ───────────────────────────────────────────

    function test_AssertTierAtLeast_NotAdmitted_Reverts() public {
        // LP_A is PENDING in setUp, never admitted in this test.
        vm.expectRevert(
            abi.encodeWithSelector(LPRegistry.NotActive.selector, LP_A, LPRegistry.Status.PENDING)
        );
        reg.assertTierAtLeast(LP_A, 1);
    }

    function test_AssertTierAtLeast_TooLowTier_Reverts() public {
        vm.prank(operator);
        reg.admit(LP_A);
        vm.expectRevert(abi.encodeWithSelector(LPRegistry.BadTier.selector, uint8(2)));
        reg.assertTierAtLeast(LP_A, 4);
    }

    function test_AssertTierAtLeast_Happy_DoesNotRevert() public {
        vm.prank(operator);
        reg.admit(LP_A);
        reg.assertTierAtLeast(LP_A, 1);
    }

    // ─── non-operator paths ──────────────────────────────────────────

    function test_NonOperator_CannotAdmit() public {
        vm.prank(address(0xBAD));
        vm.expectRevert(LPRegistry.NotOperator.selector);
        reg.admit(LP_A);
    }

    function test_NonOperator_CannotSuspend() public {
        vm.prank(address(0xBAD));
        vm.expectRevert(LPRegistry.NotOperator.selector);
        reg.suspend(LP_A, REASON);
    }

    function test_NonOperator_CannotRevoke() public {
        vm.prank(address(0xBAD));
        vm.expectRevert(LPRegistry.NotOperator.selector);
        reg.revoke(LP_A, REASON);
    }

    function test_NonOperator_CannotSetTier() public {
        vm.prank(address(0xBAD));
        vm.expectRevert(LPRegistry.NotOperator.selector);
        reg.setTier(LP_A, 3);
    }

    function test_NonOperator_CannotSetWallet() public {
        vm.prank(address(0xBAD));
        vm.expectRevert(LPRegistry.NotOperator.selector);
        reg.setWallet(LP_A, WALLET_B);
    }

    function test_NonOperator_CannotUpdateHashes() public {
        vm.startPrank(address(0xBAD));
        vm.expectRevert(LPRegistry.NotOperator.selector);
        reg.updateKYBHash(LP_A, keccak256("x"));
        vm.expectRevert(LPRegistry.NotOperator.selector);
        reg.updatePayoutAccountHash(LP_A, keccak256("x"));
        vm.stopPrank();
    }

    // ─── setOperator (owner-only) ────────────────────────────────────

    function test_SetOperator_NonOwner_Reverts() public {
        vm.prank(address(0xBAD));
        vm.expectRevert();
        reg.setOperator(address(0xFEED));
    }

    function test_SetOperator_OwnerHappy() public {
        address next = address(0xC0FFEE2);
        vm.prank(owner);
        reg.setOperator(next);
        assertEq(reg.klaroOperator(), next);
    }
}
