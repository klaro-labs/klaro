// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import { Test } from "forge-std/Test.sol";
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { AgentEscrow } from "../src/AgentEscrow.sol";
import { AgentRegistry } from "../src/AgentRegistry.sol";
import { DisputeManager } from "../src/DisputeManager.sol";
import { IACPHook, NoopACPHook } from "../src/IACPHook.sol";
import { KlaroConfig } from "../src/KlaroConfig.sol";

/// @notice bump AgentEscrow branch
/// coverage from 44.44% (12/27). Existing AgentEscrow.t.sol covers
/// happy paths and a handful of reverts; this file targets every
/// uncovered branch — guard reverts on every state transition,
/// dispute-without-DisputeManager + agent-side initiator,
/// cancel-from-CREATED (wasFunded=false) refund branch,
/// resolveDispute fee-receiver-zero branch, all admin setters,
/// pause-block on lifecycle.
contract MockUSDC is ERC20 {
    constructor() ERC20("Mock USDC", "USDC") { }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amt) external {
        _mint(to, amt);
    }
}

contract AgentEscrowRevertsTest is Test {
    AgentEscrow esc;
    AgentRegistry reg;
    MockUSDC usdc;
    NoopACPHook noop;

    // keyed operator for AgentRegistry signed auth.
    address operator;
    uint256 operatorPk;
    address principal = address(0xB2);
    address other = address(0xBAD);
    address agentOwner = address(0xC3);
    address agentWallet = address(0xC4);
    address feeReceiver = address(0xFE);
    address owner;

    bytes32 constant AID = keccak256("agent.test");
    bytes32 constant JID = keccak256("job-001");
    uint256 constant AMOUNT = 1_000_000_000;
    uint256 constant FEE_BPS = 500;

    function setUp() public {
        vm.chainId(KlaroConfig.ARC_TESTNET_CHAIN_ID);
        owner = address(this);
        (operator, operatorPk) = makeAddrAndKey("ae-reverts-operator");
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
            AID, agentOwner, "Aki", "https://aki.dev/pricing", uint16(FEE_BPS), deadline, auth
        );

        usdc.mint(principal, AMOUNT * 10);
        vm.prank(principal);
        usdc.approve(address(esc), type(uint256).max);
    }

    function _create() internal {
        vm.prank(principal);
        esc.createJob(JID, AID, agentWallet, AMOUNT, noop);
    }

    function _fund() internal {
        _create();
        vm.prank(principal);
        esc.fundJob(JID);
    }

    function _start() internal {
        _fund();
        vm.prank(agentWallet);
        esc.startJob(JID);
    }

    // ─── createJob guards ────────────────────────────────────────────

    function test_CreateJob_AmountZero_Reverts() public {
        vm.prank(principal);
        vm.expectRevert(AgentEscrow.AmountZero.selector);
        esc.createJob(JID, AID, agentWallet, 0, noop);
    }

    function test_CreateJob_NoAgent_Reverts() public {
        vm.prank(principal);
        vm.expectRevert(AgentEscrow.NoAgent.selector);
        esc.createJob(JID, AID, address(0), AMOUNT, noop);
    }

    function test_CreateJob_Duplicate_Reverts() public {
        _create();
        vm.prank(principal);
        vm.expectRevert(AgentEscrow.AlreadyExists.selector);
        esc.createJob(JID, AID, agentWallet, AMOUNT, noop);
    }

    function test_CreateJob_HookZeroAddress_AutoDeploysNoop() public {
        // hook == address(0) → contract synthesizes a NoopACPHook.
        // Confirms the ternary fallback branch executes without revert.
        vm.prank(principal);
        esc.createJob(JID, AID, agentWallet, AMOUNT, IACPHook(address(0)));
        AgentEscrow.Job memory j = esc.getJob(JID);
        assertTrue(address(j.hook) != address(0));
    }

    // ─── fundJob guards ──────────────────────────────────────────────

    function test_FundJob_NotPrincipal_Reverts() public {
        _create();
        vm.prank(other);
        vm.expectRevert(AgentEscrow.NotPrincipal.selector);
        esc.fundJob(JID);
    }

    function test_FundJob_WrongStatus_Reverts() public {
        // The NotPrincipal check runs first, so to reach the status branch
        // we need a job that exists + is owned by msg.sender + already past
        // CREATED. Re-fund an already-FUNDED job.
        _fund();
        vm.prank(principal);
        vm.expectRevert(
            abi.encodeWithSelector(
                AgentEscrow.InvalidStatus.selector,
                AgentEscrow.Status.CREATED,
                AgentEscrow.Status.FUNDED
            )
        );
        esc.fundJob(JID);
    }

    // ─── startJob guards ─────────────────────────────────────────────

    function test_StartJob_NotAgent_Reverts() public {
        _fund();
        vm.prank(other);
        vm.expectRevert(AgentEscrow.NotAgent.selector);
        esc.startJob(JID);
    }

    function test_StartJob_WrongStatus_Reverts() public {
        _create(); // CREATED, not FUNDED
        vm.prank(agentWallet);
        vm.expectRevert(
            abi.encodeWithSelector(
                AgentEscrow.InvalidStatus.selector,
                AgentEscrow.Status.FUNDED,
                AgentEscrow.Status.CREATED
            )
        );
        esc.startJob(JID);
    }

    // ─── submitDeliverable + markCompleted guards ────────────────────

    function test_SubmitDeliverable_NotAgent_Reverts() public {
        _start();
        vm.prank(other);
        vm.expectRevert(AgentEscrow.NotAgent.selector);
        esc.submitDeliverable(JID, keccak256("d"));
    }

    function test_SubmitDeliverable_WrongStatus_Reverts() public {
        _fund(); // FUNDED, not STARTED
        vm.prank(agentWallet);
        vm.expectRevert(
            abi.encodeWithSelector(
                AgentEscrow.InvalidStatus.selector,
                AgentEscrow.Status.STARTED,
                AgentEscrow.Status.FUNDED
            )
        );
        esc.submitDeliverable(JID, keccak256("d"));
    }

    function test_MarkCompleted_NotPrincipal_Reverts() public {
        _start();
        vm.prank(agentWallet);
        esc.submitDeliverable(JID, keccak256("d"));
        vm.prank(other);
        vm.expectRevert(AgentEscrow.NotPrincipal.selector);
        esc.markCompleted(JID);
    }

    function test_MarkCompleted_WrongStatus_Reverts() public {
        _fund(); // not yet STARTED
        vm.prank(principal);
        vm.expectRevert(
            abi.encodeWithSelector(
                AgentEscrow.InvalidStatus.selector,
                AgentEscrow.Status.STARTED,
                AgentEscrow.Status.FUNDED
            )
        );
        esc.markCompleted(JID);
    }

    // ─── openDispute branches ────────────────────────────────────────

    function test_OpenDispute_NotPartyToJob_Reverts() public {
        _start();
        vm.prank(other);
        vm.expectRevert(AgentEscrow.NotPrincipal.selector);
        esc.openDispute(JID, keccak256("e"));
    }

    function test_OpenDispute_FromCreated_Reverts() public {
        _create(); // CREATED, not STARTED/FUNDED
        vm.prank(principal);
        vm.expectRevert(
            abi.encodeWithSelector(
                AgentEscrow.InvalidStatus.selector,
                AgentEscrow.Status.STARTED,
                AgentEscrow.Status.CREATED
            )
        );
        esc.openDispute(JID, keccak256("e"));
    }

    function test_OpenDispute_NoDisputeManager_Reverts() public {
        // Audit 2026-05-30: opening a dispute with no DisputeManager wired would
        // strand the escrow (DISPUTED can only exit via resolveDispute, which
        // needs a decided case). It now reverts instead of "still opening".
        _fund();
        vm.prank(principal);
        vm.expectRevert(AgentEscrow.DisputesNotConfigured.selector);
        esc.openDispute(JID, keccak256("e"));
        assertEq(uint256(esc.getJob(JID).status), uint256(AgentEscrow.Status.FUNDED));
    }

    function test_OpenDispute_AgentInitiator_RespondentIsPrincipal() public {
        _start();
        DisputeManager dm = new DisputeManager(address(this));
        dm.setTrustedCaller(address(esc), true);
        esc.setDisputes(dm);
        vm.prank(agentWallet);
        esc.openDispute(JID, keccak256("e"));
        AgentEscrow.Job memory j = esc.getJob(JID);
        assertEq(uint256(j.status), uint256(AgentEscrow.Status.DISPUTED));
    }

    // ─── cancel branches ─────────────────────────────────────────────

    function test_Cancel_NotPrincipal_Reverts() public {
        _create();
        vm.prank(other);
        vm.expectRevert(AgentEscrow.NotPrincipal.selector);
        esc.cancel(JID);
    }

    function test_Cancel_AfterStarted_Reverts() public {
        _start();
        vm.prank(principal);
        vm.expectRevert(
            abi.encodeWithSelector(
                AgentEscrow.InvalidStatus.selector,
                AgentEscrow.Status.FUNDED,
                AgentEscrow.Status.STARTED
            )
        );
        esc.cancel(JID);
    }

    function test_Cancel_FromCreated_NoRefund_BecauseUnfunded() public {
        _create();
        uint256 balBefore = usdc.balanceOf(principal);
        vm.prank(principal);
        esc.cancel(JID);
        // No funding ever happened → balance unchanged (covers wasFunded=false branch).
        assertEq(usdc.balanceOf(principal), balBefore);
        AgentEscrow.Job memory j = esc.getJob(JID);
        assertEq(uint256(j.status), uint256(AgentEscrow.Status.CANCELLED));
    }

    // ─── resolveDispute branches ─────────────────────────────────────

    function test_ResolveDispute_FeeReceiverZero_Reverts() public {
        // previously this test verified the BUGGY
        // behavior — resolveDispute silently no-op'd the fee transfer
        // when feeReceiver==0, stranding fee USDC in the contract.
        // Now it must revert FeeReceiverUnset so operator is forced to
        // set the receiver before resolving a fee-bearing job.
        vm.prank(owner);
        esc.setFeeReceiver(address(0));

        DisputeManager dm = new DisputeManager(address(this));
        dm.setTrustedCaller(address(esc), true);
        vm.prank(owner);
        esc.setDisputes(dm);

        _fund();
        vm.prank(agentWallet);
        esc.startJob(JID);
        vm.prank(agentWallet);
        esc.openDispute(JID, keccak256("e"));
        dm.assignToReview(JID);
        dm.decide(
            JID,
            DisputeManager.Outcome.RELEASE_TO_CLAIMANT,
            keccak256("klaro.reason.DISPUTE_USER_FAULT"),
            bytes32(0)
        );

        vm.prank(operator);
        vm.expectRevert(AgentEscrow.FeeReceiverUnset.selector);
        esc.resolveDispute(JID, true);
    }

    // ─── Admin setters / pause ───────────────────────────────────────

    function test_SetDisputes_NonOwner_Reverts() public {
        vm.prank(other);
        vm.expectRevert();
        esc.setDisputes(DisputeManager(address(0)));
    }

    function test_SetFeeReceiver_NonOwner_Reverts() public {
        vm.prank(other);
        vm.expectRevert();
        esc.setFeeReceiver(address(0xFEED));
    }

    function test_SetOperator_NonOwner_Reverts() public {
        vm.prank(other);
        vm.expectRevert();
        esc.setOperator(address(0xFEED));
    }

    function test_SetOperator_OwnerHappy_UpdatesOperator() public {
        vm.prank(owner);
        esc.setOperator(address(0xC0FFEE2));
        assertEq(esc.klaroOperator(), address(0xC0FFEE2));
    }

    function test_Pause_NonOwner_Reverts() public {
        vm.prank(other);
        vm.expectRevert();
        esc.pause();
    }

    function test_Unpause_NonOwner_Reverts() public {
        vm.prank(owner);
        esc.pause();
        vm.prank(other);
        vm.expectRevert();
        esc.unpause();
    }
}
