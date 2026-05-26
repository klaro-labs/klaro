// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import { Test } from "forge-std/Test.sol";
import { AgentRegistry } from "../src/AgentRegistry.sol";
import { ReasonCodes } from "../src/lib/ReasonCodes.sol";
import { KlaroConfig } from "../src/KlaroConfig.sol";

contract AgentRegistryTest is Test {
    AgentRegistry reg;
    // operator must hold a private key now (registerAgent
    // gates on EIP-712 signed auth, same as LPStaking pattern).
    address operator;
    uint256 operatorPk;
    address owner_ = address(0xB2);
    address rando = address(0xBEEF);

    bytes32 constant AID = keccak256("agent.aki.gpt");

    function setUp() public {
        vm.chainId(KlaroConfig.ARC_TESTNET_CHAIN_ID);
        (operator, operatorPk) = makeAddrAndKey("agent-registry-operator");
        reg = new AgentRegistry(operator);
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

    function _register() internal {
        uint64 deadline = uint64(block.timestamp + 10 minutes);
        bytes memory auth = _signAuth(AID, owner_, deadline);
        vm.prank(owner_);
        reg.registerAgent(AID, owner_, "Aki GPT", "https://aki.dev/pricing", 500, deadline, auth);
    }

    function test_RegisterByOwner_Stores() public {
        _register();
        AgentRegistry.Agent memory a = reg.getAgent(AID);
        assertEq(a.owner, owner_);
        assertEq(a.feeBps, 500);
        assertTrue(a.active);
    }

    function test_RegisterByRando_Reverts() public {
        uint64 deadline = uint64(block.timestamp + 10 minutes);
        bytes memory auth = _signAuth(AID, owner_, deadline);
        vm.prank(rando);
        // rando cannot register on owner_'s behalf even
        // with a valid operator signature — auth binds the wallet.
        vm.expectRevert(
            abi.encodeWithSelector(AgentRegistry.CallerNotAuthorizedOwner.selector, owner_)
        );
        reg.registerAgent(AID, owner_, "Aki GPT", "https://aki.dev/pricing", 500, deadline, auth);
    }

    function test_RegisterDuplicate_Reverts() public {
        _register();
        uint64 deadline = uint64(block.timestamp + 10 minutes);
        bytes memory auth = _signAuth(AID, owner_, deadline);
        vm.prank(owner_);
        vm.expectRevert(AgentRegistry.AlreadyRegistered.selector);
        reg.registerAgent(AID, owner_, "Aki GPT", "https://aki.dev/pricing", 500, deadline, auth);
    }

    function test_RegisterAboveFeeCap_Reverts() public {
        uint64 deadline = uint64(block.timestamp + 10 minutes);
        bytes memory auth = _signAuth(AID, owner_, deadline);
        vm.prank(owner_);
        vm.expectRevert(abi.encodeWithSelector(AgentRegistry.FeeBpsTooHigh.selector, 5000, 2000));
        reg.registerAgent(AID, owner_, "Aki GPT", "https://aki.dev/pricing", 5000, deadline, auth);
    }

    // regression: a forged auth (wrong signer) is rejected.
    function test_RegisterBadAuth_Reverts() public {
        (, uint256 attackerPk) = makeAddrAndKey("attacker");
        uint64 deadline = uint64(block.timestamp + 10 minutes);
        uint256 nonce = reg.registerNonce(AID);
        bytes32 structHash =
            keccak256(abi.encode(reg.REGISTER_TYPEHASH(), AID, owner_, deadline, nonce));
        bytes32 digest =
            keccak256(abi.encodePacked("\x19\x01", reg.registrationDomainSeparator(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(attackerPk, digest);
        bytes memory badAuth = abi.encodePacked(r, s, v);
        vm.prank(owner_);
        vm.expectRevert(AgentRegistry.BadOperatorAuth.selector);
        reg.registerAgent(AID, owner_, "Aki GPT", "https://aki.dev/pricing", 500, deadline, badAuth);
    }

    function test_RegisterExpiredAuth_Reverts() public {
        uint64 deadline = uint64(block.timestamp + 1);
        bytes memory auth = _signAuth(AID, owner_, deadline);
        vm.warp(block.timestamp + 10);
        vm.prank(owner_);
        vm.expectRevert(AgentRegistry.BadOperatorAuth.selector);
        reg.registerAgent(AID, owner_, "Aki GPT", "https://aki.dev/pricing", 500, deadline, auth);
    }

    function test_UpdateByOwner_Works() public {
        _register();
        vm.prank(owner_);
        reg.updateAgent(AID, "Aki GPT v2", "https://aki.dev/pricing/v2", 750);
        AgentRegistry.Agent memory a = reg.getAgent(AID);
        assertEq(a.feeBps, 750);
    }

    function test_UpdateByOther_Reverts() public {
        _register();
        vm.prank(rando);
        vm.expectRevert(AgentRegistry.NotAgentOwner.selector);
        reg.updateAgent(AID, "rug", "https://evil.com", 1000);
    }

    function test_DeactivateByOperator_RequiresValidReason() public {
        _register();
        bytes32 fake = keccak256("klaro.reason.NOPE");
        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(ReasonCodes.UnknownReason.selector, fake));
        reg.deactivate(AID, fake);

        vm.prank(operator);
        reg.deactivate(AID, ReasonCodes.KILL_FRAUD);
        assertFalse(reg.getAgent(AID).active);
    }

    function test_DeactivateByOwner_NoReasonRequired() public {
        _register();
        vm.prank(owner_);
        reg.deactivate(AID, bytes32(0));
        assertFalse(reg.getAgent(AID).active);
    }

    function test_ReactivateAndAssertActive() public {
        _register();
        vm.prank(owner_);
        reg.deactivate(AID, bytes32(0));
        vm.prank(owner_);
        reg.reactivate(AID);
        reg.assertActive(AID); // no revert
    }

    function test_AssertActiveOnInactive_Reverts() public {
        _register();
        vm.prank(owner_);
        reg.deactivate(AID, bytes32(0));
        vm.expectRevert(abi.encodeWithSelector(AgentRegistry.AgentNotActive.selector, AID));
        reg.assertActive(AID);
    }

    function test_TransferOwner_Works() public {
        _register();
        vm.prank(owner_);
        reg.transferOwner(AID, rando);
        assertEq(reg.ownerOf(AID), rando);
    }

    function test_SetMaxAgentFeeBps_OperatorOnly() public {
        vm.prank(rando);
        vm.expectRevert(AgentRegistry.NotOperator.selector);
        reg.setMaxAgentFeeBps(5000);
        vm.prank(operator);
        reg.setMaxAgentFeeBps(5000);
        assertEq(reg.maxAgentFeeBps(), 5000);
    }

    // hard ceiling on the cap itself.
    function test_SetMaxAgentFeeBps_RejectsAboveHardCap() public {
        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(AgentRegistry.FeeBpsTooHigh.selector, 5001, 5000));
        reg.setMaxAgentFeeBps(5001);
    }
}
