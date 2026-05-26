// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import { Test } from "forge-std/Test.sol";
import { AgentRegistry } from "../src/AgentRegistry.sol";
import { KlaroConfig } from "../src/KlaroConfig.sol";

/// @notice bump AgentRegistry branch
/// coverage from 44.44% (8/18). Existing tests cover happy paths
/// + a few reverts. This file targets every uncovered branch:
/// - registerAgent: ZeroAddress / AlreadyRegistered / FeeTooHigh
/// / NotAgentOwner (caller is neither owner nor operator)
/// - registerAgent: operator-spoof branch (operator registers on
/// behalf of owner) — separate auth fork
/// - updateAgent: UnknownAgent / NotAgentOwner / FeeTooHigh
/// - transferOwner: UnknownAgent / NotAgentOwner / ZeroAddress
/// - deactivate: UnknownAgent / NotAgentOwner (third-party) /
/// operator-with-bad-reason
/// - reactivate: UnknownAgent / NotAgentOwner
/// - setMaxAgentFeeBps: above-hard-cap / non-operator
/// - setOperator: non-owner
/// - assertActive: zero-owner / inactive-flag
contract AgentRegistryRevertsTest is Test {
    AgentRegistry reg;

    // keyed operator for EIP-712 register auth.
    address operator;
    uint256 operatorPk;
    address ownerA = address(0xA1);
    address ownerB = address(0xA2);
    address other = address(0xBAD);
    address self;

    bytes32 constant AID_A = keccak256("agent.a");
    bytes32 constant AID_B = keccak256("agent.b");
    bytes32 constant AID_NONE = keccak256("agent.never-registered");
    // now that AGENT_DEACTIVATED_ABUSE is in the registry the test
    // can use the semantically-correct code instead of borrowing
    // DISPUTE_AGENT_FAULT.
    bytes32 constant GOOD_REASON = keccak256("klaro.reason.AGENT_DEACTIVATED_ABUSE");
    bytes32 constant BAD_REASON = keccak256("klaro.reason.NOT_REGISTERED");

    function setUp() public {
        vm.chainId(KlaroConfig.ARC_TESTNET_CHAIN_ID);
        self = address(this);
        (operator, operatorPk) = makeAddrAndKey("agent-registry-operator");
        reg = new AgentRegistry(operator);
        _registerSigned(AID_A, ownerA, "Aki", "https://aki.dev/p", 500);
    }

    function _signAuth(bytes32 agentId, address ownerAddr, uint64 deadline)
        internal
        view
        returns (bytes memory)
    {
        uint256 nonce = reg.registerNonce(agentId);
        bytes32 structHash =
            keccak256(abi.encode(reg.REGISTER_TYPEHASH(), agentId, ownerAddr, deadline, nonce));
        bytes32 digest =
            keccak256(abi.encodePacked("\x19\x01", reg.registrationDomainSeparator(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(operatorPk, digest);
        return abi.encodePacked(r, s, v);
    }

    function _registerSigned(
        bytes32 agentId,
        address ownerAddr,
        string memory name,
        string memory url,
        uint16 feeBps
    ) internal {
        uint64 deadline = uint64(block.timestamp + 10 minutes);
        bytes memory auth = _signAuth(agentId, ownerAddr, deadline);
        vm.prank(ownerAddr);
        reg.registerAgent(agentId, ownerAddr, name, url, feeBps, deadline, auth);
    }

    // ─── registerAgent ───────────────────────────────────────────────

    function test_RegisterAgent_ZeroOwner_Reverts() public {
        uint64 deadline = uint64(block.timestamp + 10 minutes);
        bytes memory auth = _signAuth(AID_B, address(0), deadline);
        vm.prank(other);
        vm.expectRevert(AgentRegistry.ZeroAddress.selector);
        reg.registerAgent(AID_B, address(0), "x", "x", 100, deadline, auth);
    }

    function test_RegisterAgent_AlreadyRegistered_Reverts() public {
        uint64 deadline = uint64(block.timestamp + 10 minutes);
        bytes memory auth = _signAuth(AID_A, ownerA, deadline);
        vm.prank(ownerA);
        vm.expectRevert(AgentRegistry.AlreadyRegistered.selector);
        reg.registerAgent(AID_A, ownerA, "x", "x", 100, deadline, auth);
    }

    function test_RegisterAgent_FeeAboveMax_Reverts() public {
        uint64 deadline = uint64(block.timestamp + 10 minutes);
        bytes memory auth = _signAuth(AID_B, ownerB, deadline);
        vm.prank(ownerB);
        vm.expectRevert(
            abi.encodeWithSelector(AgentRegistry.FeeBpsTooHigh.selector, uint16(2500), uint16(2000))
        );
        reg.registerAgent(AID_B, ownerB, "x", "x", 2500, deadline, auth);
    }

    function test_RegisterAgent_CallerNotOwner_Reverts() public {
        // signed auth is bound to (agentId, owner) — even
        // a valid signature can't be relayed from a non-owner caller.
        uint64 deadline = uint64(block.timestamp + 10 minutes);
        bytes memory auth = _signAuth(AID_B, ownerB, deadline);
        vm.prank(other);
        vm.expectRevert(
            abi.encodeWithSelector(AgentRegistry.CallerNotAuthorizedOwner.selector, ownerB)
        );
        reg.registerAgent(AID_B, ownerB, "x", "x", 100, deadline, auth);
    }

    function test_RegisterAgent_OwnerWithSignedAuth_OK() public {
        _registerSigned(AID_B, ownerB, "x", "x", 100);
        assertEq(reg.ownerOf(AID_B), ownerB);
    }

    // ─── updateAgent ────────────────────────────────────────────────

    function test_UpdateAgent_UnknownAgent_Reverts() public {
        vm.prank(ownerA);
        vm.expectRevert(AgentRegistry.UnknownAgent.selector);
        reg.updateAgent(AID_NONE, "x", "x", 100);
    }

    function test_UpdateAgent_NotAgentOwner_Reverts() public {
        vm.prank(other);
        vm.expectRevert(AgentRegistry.NotAgentOwner.selector);
        reg.updateAgent(AID_A, "x", "x", 100);
    }

    function test_UpdateAgent_FeeAboveMax_Reverts() public {
        vm.prank(ownerA);
        vm.expectRevert(
            abi.encodeWithSelector(AgentRegistry.FeeBpsTooHigh.selector, uint16(2500), uint16(2000))
        );
        reg.updateAgent(AID_A, "x", "x", 2500);
    }

    // ─── transferOwner ──────────────────────────────────────────────

    function test_TransferOwner_UnknownAgent_Reverts() public {
        vm.prank(ownerA);
        vm.expectRevert(AgentRegistry.UnknownAgent.selector);
        reg.transferOwner(AID_NONE, ownerB);
    }

    function test_TransferOwner_NotAgentOwner_Reverts() public {
        vm.prank(other);
        vm.expectRevert(AgentRegistry.NotAgentOwner.selector);
        reg.transferOwner(AID_A, ownerB);
    }

    function test_TransferOwner_ZeroAddress_Reverts() public {
        vm.prank(ownerA);
        vm.expectRevert(AgentRegistry.ZeroAddress.selector);
        reg.transferOwner(AID_A, address(0));
    }

    function test_TransferOwner_Happy() public {
        vm.prank(ownerA);
        reg.transferOwner(AID_A, ownerB);
        assertEq(reg.ownerOf(AID_A), ownerB);
    }

    // ─── deactivate ─────────────────────────────────────────────────

    function test_Deactivate_UnknownAgent_Reverts() public {
        vm.prank(ownerA);
        vm.expectRevert(AgentRegistry.UnknownAgent.selector);
        reg.deactivate(AID_NONE, GOOD_REASON);
    }

    function test_Deactivate_ThirdParty_Reverts() public {
        vm.prank(other);
        vm.expectRevert(AgentRegistry.NotAgentOwner.selector);
        reg.deactivate(AID_A, GOOD_REASON);
    }

    function test_Deactivate_OperatorBadReason_Reverts() public {
        vm.prank(operator);
        vm.expectRevert();
        reg.deactivate(AID_A, BAD_REASON);
    }

    function test_Deactivate_OperatorGoodReason_OK() public {
        vm.prank(operator);
        reg.deactivate(AID_A, GOOD_REASON);
        assertFalse(reg.getAgent(AID_A).active);
    }

    function test_Deactivate_OwnerNoReasonNeeded_OK() public {
        vm.prank(ownerA);
        reg.deactivate(AID_A, bytes32(0));
        assertFalse(reg.getAgent(AID_A).active);
    }

    // ─── reactivate ─────────────────────────────────────────────────

    function test_Reactivate_UnknownAgent_Reverts() public {
        vm.prank(ownerA);
        vm.expectRevert(AgentRegistry.UnknownAgent.selector);
        reg.reactivate(AID_NONE);
    }

    function test_Reactivate_NotAgentOwner_Reverts() public {
        vm.prank(other);
        vm.expectRevert(AgentRegistry.NotAgentOwner.selector);
        reg.reactivate(AID_A);
    }

    // ─── setMaxAgentFeeBps ──────────────────────────────────────────

    function test_SetMaxAgentFeeBps_AboveHardCap_Reverts() public {
        vm.prank(operator);
        vm.expectRevert(
            abi.encodeWithSelector(AgentRegistry.FeeBpsTooHigh.selector, uint16(6000), uint16(5000))
        );
        reg.setMaxAgentFeeBps(6000);
    }

    function test_SetMaxAgentFeeBps_NonOperator_Reverts() public {
        vm.prank(other);
        vm.expectRevert(AgentRegistry.NotOperator.selector);
        reg.setMaxAgentFeeBps(1500);
    }

    // ─── setOperator (owner-only) ───────────────────────────────────

    function test_SetOperator_NonOwner_Reverts() public {
        vm.prank(other);
        vm.expectRevert();
        reg.setOperator(address(0xFEED));
    }

    function test_SetOperator_OwnerHappy() public {
        vm.prank(self);
        reg.setOperator(address(0xC0FFEE2));
        assertEq(reg.klaroOperator(), address(0xC0FFEE2));
    }

    // ─── assertActive ───────────────────────────────────────────────

    function test_AssertActive_Unknown_Reverts() public {
        vm.expectRevert(abi.encodeWithSelector(AgentRegistry.AgentNotActive.selector, AID_NONE));
        reg.assertActive(AID_NONE);
    }

    function test_AssertActive_DeactivatedFlag_Reverts() public {
        vm.prank(ownerA);
        reg.deactivate(AID_A, bytes32(0));
        vm.expectRevert(abi.encodeWithSelector(AgentRegistry.AgentNotActive.selector, AID_A));
        reg.assertActive(AID_A);
    }
}
