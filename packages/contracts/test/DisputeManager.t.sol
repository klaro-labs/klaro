// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import { Test } from "forge-std/Test.sol";
import { DisputeManager } from "../src/DisputeManager.sol";
import { ReasonCodes } from "../src/lib/ReasonCodes.sol";
import { KlaroConfig } from "../src/KlaroConfig.sol";

contract DisputeManagerTest is Test {
    DisputeManager dm;
    address operator = address(0xA11CE);
    address claimant = address(0xC1);
    address respondent = address(0xC2);
    address rando = address(0xBEEF);

    bytes32 constant CASE_ID = keccak256("case-1");
    bytes32 constant CONTEXT = keccak256("cashout");
    bytes32 constant CTX_REF = keccak256("cashoutId-001");
    bytes32 constant OPEN_EV = keccak256("opening-evidence-bundle");

    function setUp() public {
        vm.chainId(KlaroConfig.ARC_TESTNET_CHAIN_ID);
        dm = new DisputeManager(operator);
    }

    function _open() internal {
        // hijack closure: namespaced contexts (CONTEXT != 0) now
        // require operator/trustedCaller authority. State-machine tests
        // open via operator so they don't accidentally double as the
        // party-direct test (covered separately below).
        vm.prank(operator);
        dm.open(CASE_ID, claimant, respondent, CONTEXT, CTX_REF, OPEN_EV);
    }

    function test_OpenByOperator_AndStateIsOpened() public {
        _open();
        DisputeManager.Case memory c = dm.getCase(CASE_ID);
        assertEq(c.claimant, claimant);
        assertEq(c.respondent, respondent);
        assertEq(uint8(c.status), uint8(DisputeManager.Status.OPENED));
        assertEq(c.openingEvidenceHash, OPEN_EV);
        assertEq(c.latestEvidenceHash, OPEN_EV);
    }

    /// @notice regression: party may NOT open a namespaced case.
    function test_OpenByClaimant_NamespacedContext_Reverts() public {
        vm.prank(claimant);
        vm.expectRevert(DisputeManager.NotParty.selector);
        dm.open(CASE_ID, claimant, respondent, CONTEXT, CTX_REF, OPEN_EV);
    }

    function test_OpenByOperator_Works() public {
        vm.prank(operator);
        dm.open(CASE_ID, claimant, respondent, CONTEXT, CTX_REF, OPEN_EV);
        assertEq(uint8(dm.statusOf(CASE_ID)), uint8(DisputeManager.Status.OPENED));
    }

    function test_OpenByRando_Reverts() public {
        vm.prank(rando);
        vm.expectRevert(DisputeManager.NotParty.selector);
        dm.open(CASE_ID, claimant, respondent, CONTEXT, CTX_REF, OPEN_EV);
    }

    function test_OpenWithZeroAddress_Reverts() public {
        vm.prank(operator);
        vm.expectRevert(DisputeManager.ZeroAddress.selector);
        dm.open(CASE_ID, address(0), respondent, CONTEXT, CTX_REF, OPEN_EV);
    }

    function test_OpenDuplicate_Reverts() public {
        _open();
        vm.prank(claimant);
        vm.expectRevert(DisputeManager.CaseAlreadyExists.selector);
        dm.open(CASE_ID, claimant, respondent, CONTEXT, CTX_REF, OPEN_EV);
    }

    function test_RequestEvidence_TransitionsState() public {
        _open();
        vm.prank(operator);
        dm.requestEvidence(CASE_ID);
        assertEq(uint8(dm.statusOf(CASE_ID)), uint8(DisputeManager.Status.EVIDENCE_REQUESTED));
    }

    function test_RequestEvidence_NonOperator_Reverts() public {
        _open();
        vm.prank(claimant);
        vm.expectRevert(DisputeManager.NotOperator.selector);
        dm.requestEvidence(CASE_ID);
    }

    function test_SubmitEvidence_ByParty_UpdatesLatestAndStatus() public {
        _open();
        vm.prank(operator);
        dm.requestEvidence(CASE_ID);

        bytes32 additional = keccak256("additional-evidence");
        vm.prank(claimant);
        dm.submitEvidence(CASE_ID, additional);

        DisputeManager.Case memory c = dm.getCase(CASE_ID);
        assertEq(c.latestEvidenceHash, additional);
        assertEq(uint8(c.status), uint8(DisputeManager.Status.EVIDENCE_SUBMITTED));
    }

    function test_SubmitEvidence_ByRespondent_Works() public {
        _open();
        bytes32 additional = keccak256("respondent-evidence");
        vm.prank(respondent);
        dm.submitEvidence(CASE_ID, additional);
        assertEq(dm.getCase(CASE_ID).latestEvidenceHash, additional);
    }

    function test_SubmitEvidence_ByRando_Reverts() public {
        _open();
        vm.prank(rando);
        vm.expectRevert(DisputeManager.NotParty.selector);
        dm.submitEvidence(CASE_ID, keccak256("hack"));
    }

    function test_AssignToReview_TransitionsState() public {
        _open();
        vm.prank(operator);
        dm.assignToReview(CASE_ID);
        assertEq(uint8(dm.statusOf(CASE_ID)), uint8(DisputeManager.Status.UNDER_REVIEW));
    }

    function test_Decide_StampsTerminalOutcome() public {
        _open();
        vm.prank(operator);
        dm.assignToReview(CASE_ID);

        bytes32 decisionEv = keccak256("panel-notes");
        vm.prank(operator);
        dm.decide(
            CASE_ID,
            DisputeManager.Outcome.RELEASE_TO_CLAIMANT,
            ReasonCodes.DISPUTE_AGENT_FAULT,
            decisionEv
        );

        DisputeManager.Case memory c = dm.getCase(CASE_ID);
        assertEq(uint8(c.status), uint8(DisputeManager.Status.DECIDED));
        assertEq(uint8(c.outcome), uint8(DisputeManager.Outcome.RELEASE_TO_CLAIMANT));
        assertEq(c.decisionReasonHash, ReasonCodes.DISPUTE_AGENT_FAULT);
        assertEq(c.decisionEvidenceHash, decisionEv);
        assertTrue(dm.isDecided(CASE_ID));
    }

    function test_Decide_NoneOutcome_Reverts() public {
        _open();
        vm.prank(operator);
        vm.expectRevert(
            abi.encodeWithSelector(
                DisputeManager.WrongState.selector,
                DisputeManager.Status.UNDER_REVIEW,
                DisputeManager.Status.NONE
            )
        );
        dm.decide(CASE_ID, DisputeManager.Outcome.NONE, ReasonCodes.DISPUTE_AGENT_FAULT, bytes32(0));
    }

    function test_Decide_BadReason_Reverts() public {
        _open();
        bytes32 fake = keccak256("klaro.reason.FAKE");
        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(ReasonCodes.UnknownReason.selector, fake));
        dm.decide(CASE_ID, DisputeManager.Outcome.RELEASE_TO_CLAIMANT, fake, bytes32(0));
    }

    function test_Decide_NonOperator_Reverts() public {
        _open();
        vm.prank(claimant);
        vm.expectRevert(DisputeManager.NotOperator.selector);
        dm.decide(
            CASE_ID,
            DisputeManager.Outcome.RELEASE_TO_CLAIMANT,
            ReasonCodes.DISPUTE_USER_FAULT,
            bytes32(0)
        );
    }

    function test_PostDecided_FurtherActionsRevert() public {
        _open();
        vm.prank(operator);
        dm.assignToReview(CASE_ID);
        vm.startPrank(operator);
        dm.decide(
            CASE_ID,
            DisputeManager.Outcome.RELEASE_TO_CLAIMANT,
            ReasonCodes.DISPUTE_MUTUAL_RESOLVED,
            bytes32(0)
        );
        // : requestEvidence's expected-state error now reads as OPENED
        // (the first legal predecessor in the new enumerated list).
        vm.expectRevert(
            abi.encodeWithSelector(
                DisputeManager.WrongState.selector,
                DisputeManager.Status.OPENED,
                DisputeManager.Status.DECIDED
            )
        );
        dm.requestEvidence(CASE_ID);
        vm.stopPrank();
    }

    function test_UnknownCase_ActionsRevert() public {
        vm.prank(operator);
        vm.expectRevert(DisputeManager.UnknownCase.selector);
        dm.requestEvidence(CASE_ID);
    }

    function test_EvidenceRequestCycle_CanRepeat() public {
        // EVIDENCE_REQUESTED → submitEvidence → EVIDENCE_SUBMITTED → requestEvidence again
        _open();
        vm.prank(operator);
        dm.requestEvidence(CASE_ID);
        vm.prank(claimant);
        dm.submitEvidence(CASE_ID, keccak256("ev1"));
        vm.prank(operator);
        dm.requestEvidence(CASE_ID);
        assertEq(uint8(dm.statusOf(CASE_ID)), uint8(DisputeManager.Status.EVIDENCE_REQUESTED));
        vm.prank(respondent);
        dm.submitEvidence(CASE_ID, keccak256("ev2"));
        assertEq(dm.getCase(CASE_ID).latestEvidenceHash, keccak256("ev2"));
    }

    /// @dev Property: every outcome other than NONE is a valid terminal state.
    function testFuzz_AnyValidOutcome_DecidesTerminally(uint8 outcomeIdx) public {
        // Audit 2026-05-30: decide() now rejects outcomes no consumer can resolve
        // for the case's context. CONTEXT here is a generic (non-cashout) context,
        // so only RELEASE_TO_CLAIMANT (1) and REFUND_TO_RESPONDENT (2) are valid;
        // SLASH_LP/PENALIZE_VENDOR/MUTUAL_RESOLVED would (correctly) revert.
        outcomeIdx = uint8(bound(outcomeIdx, 1, 2));
        _open();
        vm.prank(operator);
        dm.assignToReview(CASE_ID);
        vm.prank(operator);
        dm.decide(
            CASE_ID,
            DisputeManager.Outcome(outcomeIdx),
            ReasonCodes.DISPUTE_INSUFFICIENT_EV,
            bytes32(0)
        );
        assertTrue(dm.isDecided(CASE_ID));
        assertEq(uint8(dm.outcomeOf(CASE_ID)), outcomeIdx);
    }
}
