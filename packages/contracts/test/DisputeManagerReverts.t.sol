// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import { Test } from "forge-std/Test.sol";
import { DisputeManager } from "../src/DisputeManager.sol";
import { ReasonCodes } from "../src/lib/ReasonCodes.sol";
import { KlaroConfig } from "../src/KlaroConfig.sol";

/// @notice bump DisputeManager branch
/// coverage from 50% (7/14). Existing DisputeManager.t.sol covers
/// happy paths + several reverts; this file targets remaining
/// uncovered branches:
/// - open: trustedCallers[msg.sender] auth path (4-way OR fork)
/// - submitEvidence: UnknownCase + DECIDED paths
/// - assignToReview: UnknownCase + DECIDED paths
/// - decide: UnknownCase (the case-id never opened)
/// - setOperator: non-owner
/// - setTrustedCaller: non-operator
/// - view helpers (outcomeOf / isDecided / getCase) on unknown id
contract DisputeManagerRevertsTest is Test {
    DisputeManager dm;

    address operator = address(0xC0FFEE);
    address claimant = address(0xA1);
    address respondent = address(0xA2);
    address trusted = address(0xB1);
    address rando = address(0xBAD);
    address owner;

    bytes32 constant CASE = keccak256("case-001");
    bytes32 constant CTX = keccak256("klaro.dispute.invoice");
    bytes32 constant REF = keccak256("invoice-ref-001");
    bytes32 constant EV = keccak256("evidence-001");

    function setUp() public {
        vm.chainId(KlaroConfig.ARC_TESTNET_CHAIN_ID);
        owner = address(this);
        dm = new DisputeManager(operator);
        // setTrustedCaller owner-only.
        dm.setTrustedCaller(trusted, true);
    }

    function _open() internal {
        // namespaced contexts require authority — operator opens.
        vm.prank(operator);
        dm.open(CASE, claimant, respondent, CTX, REF, EV);
    }

    // ─── open: 4-way auth fork ─────────────────────────────────────

    function test_Open_ByTrustedCaller_Works() public {
        // Trusted-caller branch — never tested before.
        vm.prank(trusted);
        dm.open(CASE, claimant, respondent, CTX, REF, EV);
        assertEq(uint8(dm.statusOf(CASE)), uint8(DisputeManager.Status.OPENED));
    }

    // ─── submitEvidence guard branches ─────────────────────────────

    function test_SubmitEvidence_UnknownCase_Reverts() public {
        vm.prank(claimant);
        vm.expectRevert(DisputeManager.UnknownCase.selector);
        dm.submitEvidence(CASE, EV);
    }

    function test_SubmitEvidence_PostDecided_Reverts() public {
        _open();
        vm.prank(operator);
        dm.assignToReview(CASE);
        vm.prank(operator);
        dm.decide(
            CASE,
            DisputeManager.Outcome.RELEASE_TO_CLAIMANT,
            ReasonCodes.DISPUTE_MUTUAL_RESOLVED,
            bytes32(0)
        );
        vm.prank(claimant);
        vm.expectRevert(
            abi.encodeWithSelector(
                DisputeManager.WrongState.selector,
                DisputeManager.Status.EVIDENCE_REQUESTED,
                DisputeManager.Status.DECIDED
            )
        );
        dm.submitEvidence(CASE, keccak256("late"));
    }

    function test_SubmitEvidence_ByTrustedCallerNotParty_Reverts() public {
        _open();
        // trustedCallers can OPEN but not submit on behalf of parties.
        vm.prank(trusted);
        vm.expectRevert(DisputeManager.NotParty.selector);
        dm.submitEvidence(CASE, EV);
    }

    // ─── assignToReview guard branches ─────────────────────────────

    function test_AssignToReview_UnknownCase_Reverts() public {
        vm.prank(operator);
        vm.expectRevert(DisputeManager.UnknownCase.selector);
        dm.assignToReview(CASE);
    }

    function test_AssignToReview_PostDecided_Reverts() public {
        _open();
        vm.startPrank(operator);
        dm.assignToReview(CASE);
        dm.decide(
            CASE,
            DisputeManager.Outcome.RELEASE_TO_CLAIMANT,
            ReasonCodes.DISPUTE_MUTUAL_RESOLVED,
            bytes32(0)
        );
        vm.stopPrank();
        vm.prank(operator);
        vm.expectRevert(
            abi.encodeWithSelector(
                DisputeManager.WrongState.selector,
                DisputeManager.Status.EVIDENCE_SUBMITTED,
                DisputeManager.Status.DECIDED
            )
        );
        dm.assignToReview(CASE);
    }

    function test_AssignToReview_NonOperator_Reverts() public {
        _open();
        vm.prank(rando);
        vm.expectRevert(DisputeManager.NotOperator.selector);
        dm.assignToReview(CASE);
    }

    // ─── decide guard branches ─────────────────────────────────────

    function test_Decide_UnknownCase_Reverts() public {
        vm.prank(operator);
        vm.expectRevert(DisputeManager.UnknownCase.selector);
        dm.decide(
            CASE,
            DisputeManager.Outcome.RELEASE_TO_CLAIMANT,
            ReasonCodes.DISPUTE_MUTUAL_RESOLVED,
            bytes32(0)
        );
    }

    function test_Decide_TwiceOnSameCase_Reverts() public {
        _open();
        vm.startPrank(operator);
        dm.assignToReview(CASE);
        dm.decide(
            CASE,
            DisputeManager.Outcome.RELEASE_TO_CLAIMANT,
            ReasonCodes.DISPUTE_MUTUAL_RESOLVED,
            bytes32(0)
        );
        vm.expectRevert(
            abi.encodeWithSelector(
                DisputeManager.WrongState.selector,
                DisputeManager.Status.UNDER_REVIEW,
                DisputeManager.Status.DECIDED
            )
        );
        dm.decide(
            CASE,
            DisputeManager.Outcome.RELEASE_TO_CLAIMANT,
            ReasonCodes.DISPUTE_USER_FAULT,
            bytes32(0)
        );
        vm.stopPrank();
    }

    // ─── Admin: setOperator + setTrustedCaller auth ────────────────

    function test_SetOperator_NonOwner_Reverts() public {
        vm.prank(rando);
        vm.expectRevert();
        dm.setOperator(address(0xFEED));
    }

    function test_SetOperator_OwnerHappy() public {
        vm.prank(owner);
        dm.setOperator(address(0xC0FFEE2));
        assertEq(dm.klaroOperator(), address(0xC0FFEE2));
    }

    function test_SetTrustedCaller_NonOwner_Reverts() public {
        // was NonOperator; now NonOwner.
        vm.prank(rando);
        vm.expectRevert(); // OZ Ownable.OwnableUnauthorizedAccount(rando)
        dm.setTrustedCaller(address(0xFEED), true);
    }

    function test_SetTrustedCaller_OwnerCanRevoke() public {
        // owner-only (was operator-only).
        dm.setTrustedCaller(trusted, false);
        assertFalse(dm.trustedCallers(trusted));
    }

    // ─── View helpers on unknown id (should return zero / false) ──

    function test_View_UnknownCase_ReturnsZeros() public view {
        assertEq(uint8(dm.statusOf(CASE)), uint8(DisputeManager.Status.NONE));
        assertEq(uint8(dm.outcomeOf(CASE)), uint8(DisputeManager.Outcome.NONE));
        assertFalse(dm.isDecided(CASE));
        DisputeManager.Case memory c = dm.getCase(CASE);
        assertEq(c.claimant, address(0));
    }
}
