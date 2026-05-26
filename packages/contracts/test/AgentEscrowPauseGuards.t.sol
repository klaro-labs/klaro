// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import { Test } from "forge-std/Test.sol";
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { Pausable } from "@openzeppelin/contracts/utils/Pausable.sol";

import { AgentEscrow } from "../src/AgentEscrow.sol";
import { AgentRegistry } from "../src/AgentRegistry.sol";
import { DisputeManager } from "../src/DisputeManager.sol";
import { NoopACPHook } from "../src/IACPHook.sol";
import { KlaroConfig } from "../src/KlaroConfig.sol";

/// @notice Regression for loop — emergency pause must freeze the
/// full AgentEscrow lifecycle, not only the entry points. Without
/// these modifiers a paused contract still let principals open
/// disputes, agents advance state, and the operator move funds.

contract MockUSDC is ERC20 {
    constructor() ERC20("Mock USDC", "USDC") { }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amt) external {
        _mint(to, amt);
    }
}

contract AgentEscrowPauseGuardsTest is Test {
    AgentEscrow esc;
    AgentRegistry reg;
    MockUSDC usdc;
    NoopACPHook noop;
    DisputeManager dm;

    // keyed operator for AgentRegistry signed auth.
    address operator;
    uint256 operatorPk;
    address principal = address(0xB2);
    address agentOwner = address(0xC3);
    address agentWallet = address(0xC4);
    address feeReceiver = address(0xFE);

    bytes32 constant AID = keccak256("agent.pause");
    bytes32 constant JID = keccak256("job-pause");
    uint256 constant AMOUNT = 1_000_000_000;
    uint256 constant FEE_BPS = 500;
    uint256 constant FEE = (AMOUNT * FEE_BPS) / 10_000;

    function setUp() public {
        vm.chainId(KlaroConfig.ARC_TESTNET_CHAIN_ID);
        (operator, operatorPk) = makeAddrAndKey("ae-pause-operator");
        reg = new AgentRegistry(operator);
        usdc = new MockUSDC();
        noop = new NoopACPHook();
        esc = new AgentEscrow(address(usdc), reg, feeReceiver, operator);

        uint64 deadline = uint64(block.timestamp + 10 minutes);
        uint256 nonce = reg.registerNonce(AID);
        bytes32 structHash =
            keccak256(abi.encode(reg.REGISTER_TYPEHASH(), AID, agentOwner, deadline, nonce));
        bytes32 digest =
            keccak256(abi.encodePacked("\x19\x01", reg.registrationDomainSeparator(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(operatorPk, digest);
        bytes memory auth = abi.encodePacked(r, s, v);
        vm.prank(agentOwner);
        reg.registerAgent(
            AID, agentOwner, "Aki", "https://aki.dev/p", uint16(FEE_BPS), deadline, auth
        );

        usdc.mint(principal, AMOUNT * 10);
        vm.prank(principal);
        usdc.approve(address(esc), type(uint256).max);

        dm = new DisputeManager(address(this));
        dm.setTrustedCaller(address(esc), true);
        esc.setDisputes(dm);
    }

    function _funded() internal {
        vm.prank(principal);
        esc.createJob(JID, AID, agentWallet, AMOUNT, noop);
        vm.prank(principal);
        esc.fundJob(JID);
    }

    function _started() internal {
        _funded();
        vm.prank(agentWallet);
        esc.startJob(JID);
    }

    function test_Pause_BlocksStartJob() public {
        _funded();
        esc.pause();
        vm.prank(agentWallet);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        esc.startJob(JID);
    }

    function test_Pause_BlocksSubmitDeliverable() public {
        _started();
        esc.pause();
        vm.prank(agentWallet);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        esc.submitDeliverable(JID, keccak256("d"));
    }

    function test_Pause_BlocksMarkCompleted() public {
        _started();
        vm.prank(agentWallet);
        esc.submitDeliverable(JID, keccak256("d"));
        esc.pause();
        vm.prank(principal);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        esc.markCompleted(JID);
    }

    function test_Pause_BlocksCancel() public {
        _funded();
        esc.pause();
        vm.prank(principal);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        esc.cancel(JID);
    }

    function test_Pause_BlocksOpenDispute() public {
        _started();
        esc.pause();
        vm.prank(principal);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        esc.openDispute(JID, keccak256("ev"));
    }

    function test_Pause_BlocksResolveDispute() public {
        _started();
        vm.prank(principal);
        esc.openDispute(JID, keccak256("ev"));
        dm.assignToReview(JID);
        dm.decide(
            JID,
            DisputeManager.Outcome.RELEASE_TO_CLAIMANT,
            keccak256("klaro.reason.DISPUTE_AGENT_FAULT"),
            bytes32(0)
        );
        esc.pause();
        vm.prank(operator);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        esc.resolveDispute(JID, false);
    }
}
