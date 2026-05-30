// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import { Test } from "forge-std/Test.sol";
import { DisputeManager } from "../src/DisputeManager.sol";
import { ReasonCodes } from "../src/lib/ReasonCodes.sol";
import { KlaroConfig } from "../src/KlaroConfig.sol";

/// @notice Regression for loop — the v2 §25 5-state machine
/// (OPENED → EVIDENCE_REQUESTED → EVIDENCE_SUBMITTED →
/// UNDER_REVIEW → DECIDED) is enforced on-chain. Before the fix
/// every state guard only rejected NONE + DECIDED, so a
/// compromised operator could jump straight from OPENED to
/// DECIDED, bypassing any review or evidence at all.
contract DisputeManagerStateMachineTest is Test {
    DisputeManager dm;
    address operator = address(0xA11CE);
    address claimant = address(0xC1);
    address respondent = address(0xC2);

    bytes32 constant CASE = keccak256("case-state-machine");
    bytes32 constant CTX = keccak256("klaro.dispute.cashout");
    bytes32 constant REF = keccak256("cashout-1");
    bytes32 constant OPENING_EV = keccak256("opening-ev");

    function setUp() public {
        vm.chainId(KlaroConfig.ARC_TESTNET_CHAIN_ID);
        dm = new DisputeManager(operator);
        // hijack fix: namespaced contexts (e.g. CTX != 0) require
        // authority (operator or trustedCaller). The state-machine tests
        // open via the operator path; party-direct opens are covered in
        // the dedicated hijack test (`test_PartyCannotOpen_NamespacedContext_Reverts`).
        vm.prank(operator);
        dm.open(CASE, claimant, respondent, CTX, REF, OPENING_EV);
    }

    // ─── hijack closure regression ──────────────────────────────

    function test_PartyCannotOpen_NamespacedContext_Reverts() public {
        // Attacker calls open for an unrelated case with a namespaced
        // context — must revert. Previously this succeeded because any
        // address self-declaring as `claimant` was accepted.
        bytes32 attackerCase = keccak256("attacker-preempt");
        vm.prank(claimant);
        vm.expectRevert(DisputeManager.NotParty.selector);
        dm.open(attackerCase, claimant, respondent, CTX, REF, OPENING_EV);
    }

    function test_OperatorOpens_NamespacedContext_Allowed() public {
        bytes32 c = keccak256("op-opened");
        vm.prank(operator);
        dm.open(c, claimant, respondent, CTX, REF, OPENING_EV);
        assertEq(uint8(dm.statusOf(c)), uint8(DisputeManager.Status.OPENED));
    }

    function test_TrustedCallerOpens_NamespacedContext_Allowed() public {
        // Mimic what CashoutOrderProcessor does: the escrow contract is
        // a trustedCaller and opens a case keyed off its own bytes32 id.
        address escrow = address(0xE5C70);
        // owner-only setTrustedCaller.
        dm.setTrustedCaller(escrow, true);
        bytes32 c = keccak256("trusted-opened");
        vm.prank(escrow);
        dm.open(c, claimant, respondent, CTX, REF, OPENING_EV);
        assertEq(uint8(dm.statusOf(c)), uint8(DisputeManager.Status.OPENED));
    }

    function test_PartyOpens_EmptyContext_Allowed() public {
        // Ad-hoc party-to-party disputes (no escrow namespace) still
        // work — the party-direct path is reserved for context==0.
        bytes32 c = keccak256("party-ad-hoc");
        vm.prank(claimant);
        dm.open(c, claimant, respondent, bytes32(0), bytes32(0), OPENING_EV);
        assertEq(uint8(dm.statusOf(c)), uint8(DisputeManager.Status.OPENED));
    }

    function test_Decide_FromOpened_Reverts() public {
        // The critical regression: operator must NOT be able to short-cut
        // OPENED → DECIDED. UNDER_REVIEW must come first.
        vm.prank(operator);
        vm.expectRevert(
            abi.encodeWithSelector(
                DisputeManager.WrongState.selector,
                DisputeManager.Status.UNDER_REVIEW,
                DisputeManager.Status.OPENED
            )
        );
        dm.decide(
            CASE,
            DisputeManager.Outcome.RELEASE_TO_CLAIMANT,
            ReasonCodes.DISPUTE_AGENT_FAULT,
            bytes32(0)
        );
    }

    function test_Decide_FromEvidenceSubmitted_Reverts() public {
        vm.prank(operator);
        dm.requestEvidence(CASE);
        vm.prank(claimant);
        dm.submitEvidence(CASE, keccak256("ev"));
        // EVIDENCE_SUBMITTED is one step before UNDER_REVIEW. decide must
        // still reject — operator has to call assignToReview first.
        vm.prank(operator);
        vm.expectRevert(
            abi.encodeWithSelector(
                DisputeManager.WrongState.selector,
                DisputeManager.Status.UNDER_REVIEW,
                DisputeManager.Status.EVIDENCE_SUBMITTED
            )
        );
        dm.decide(
            CASE,
            DisputeManager.Outcome.RELEASE_TO_CLAIMANT,
            ReasonCodes.DISPUTE_AGENT_FAULT,
            bytes32(0)
        );
    }

    function test_AssignToReview_AcceptsOpened_FastTrack() public {
        // Operator may fast-track a case with sufficient opening evidence
        // by going OPENED → UNDER_REVIEW directly.
        vm.prank(operator);
        dm.assignToReview(CASE);
        assertEq(uint8(dm.statusOf(CASE)), uint8(DisputeManager.Status.UNDER_REVIEW));
    }

    function test_AssignToReview_RejectsDecided() public {
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
                DisputeManager.Status.EVIDENCE_SUBMITTED,
                DisputeManager.Status.DECIDED
            )
        );
        dm.assignToReview(CASE);
        vm.stopPrank();
    }

    function test_RequestEvidence_RejectsDecided() public {
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
                DisputeManager.Status.OPENED,
                DisputeManager.Status.DECIDED
            )
        );
        dm.requestEvidence(CASE);
        vm.stopPrank();
    }

    function test_FullHappyPath_LandsAtDecided() public {
        vm.prank(operator);
        dm.requestEvidence(CASE);
        vm.prank(claimant);
        dm.submitEvidence(CASE, keccak256("ev1"));
        vm.prank(operator);
        dm.assignToReview(CASE);
        vm.prank(operator);
        dm.decide(
            CASE,
            DisputeManager.Outcome.RELEASE_TO_CLAIMANT,
            ReasonCodes.DISPUTE_AGENT_FAULT,
            bytes32(0)
        );
        assertTrue(dm.isDecided(CASE));
    }
}
