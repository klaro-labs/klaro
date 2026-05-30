// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import { Test } from "forge-std/Test.sol";
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { AgentEscrow } from "../src/AgentEscrow.sol";
import { AgentRegistry } from "../src/AgentRegistry.sol";
import { DisputeManager } from "../src/DisputeManager.sol";
import { IACPHook, NoopACPHook } from "../src/IACPHook.sol";
import { KlaroConfig } from "../src/KlaroConfig.sol";

contract MockUSDC is ERC20 {
    constructor() ERC20("Mock USDC", "USDC") { }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amt) external {
        _mint(to, amt);
    }
}

contract RevertingBeforeHook is IACPHook {
    bool public revertBefore = true;

    function setRevert(bool r) external {
        revertBefore = r;
    }

    function beforeAction(bytes4, bytes32, address, address, uint256) external view {
        if (revertBefore) revert("ACP block");
    }
    function afterAction(bytes4, bytes32, address, address, uint256) external pure { }
}

contract AgentEscrowTest is Test {
    AgentEscrow esc;
    AgentRegistry reg;
    MockUSDC usdc;
    NoopACPHook noop;

    // operator keyed for AgentRegistry register auth.
    address operator;
    uint256 operatorPk;
    address principal = address(0xB2);
    address agentOwner = address(0xC3);
    address agentWallet = address(0xC4);
    address feeReceiver = address(0xFE);

    bytes32 constant AID = keccak256("agent.test");
    bytes32 constant JID = keccak256("job-001");
    uint256 constant AMOUNT = 1_000_000_000; // 1k USDC, 6-dec
    uint256 constant FEE_BPS = 500; // 5%
    uint256 constant FEE = (AMOUNT * FEE_BPS) / 10_000;

    function setUp() public {
        vm.chainId(KlaroConfig.ARC_TESTNET_CHAIN_ID);
        (operator, operatorPk) = makeAddrAndKey("ae-test-operator");
        reg = new AgentRegistry(operator);
        usdc = new MockUSDC();
        noop = new NoopACPHook();
        esc = new AgentEscrow(address(usdc), reg, feeReceiver, operator);

        // Register the agent in the registry (: signed).
        uint64 deadline = uint64(block.timestamp + 10 minutes);
        bytes memory auth = _signAgentAuth(AID, agentOwner, deadline);
        vm.prank(agentOwner);
        reg.registerAgent(
            AID, agentOwner, "Aki", "https://aki.dev/pricing", uint16(FEE_BPS), deadline, auth
        );

        // Principal funded + approved
        usdc.mint(principal, AMOUNT * 10);
        vm.prank(principal);
        usdc.approve(address(esc), type(uint256).max);
    }

    function _signAgentAuth(bytes32 agentId, address ownerAddr, uint64 deadline)
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

    function _create() internal {
        vm.prank(principal);
        esc.createJob(JID, AID, agentWallet, AMOUNT, noop);
    }

    function test_CreateJob_StoresAndDerivesFee() public {
        _create();
        AgentEscrow.Job memory j = esc.getJob(JID);
        assertEq(j.principal, principal);
        assertEq(j.agent, agentWallet);
        assertEq(j.amountUsdc, AMOUNT);
        assertEq(j.feeUsdc, FEE);
        assertEq(uint8(j.status), uint8(AgentEscrow.Status.CREATED));
    }

    function test_CreateJob_OnInactiveAgent_Reverts() public {
        vm.prank(agentOwner);
        reg.deactivate(AID, bytes32(0));
        vm.prank(principal);
        vm.expectRevert(abi.encodeWithSelector(AgentRegistry.AgentNotActive.selector, AID));
        esc.createJob(JID, AID, agentWallet, AMOUNT, noop);
    }

    function test_FundJob_PullsTokens() public {
        _create();
        uint256 before = usdc.balanceOf(address(esc));
        vm.prank(principal);
        esc.fundJob(JID);
        assertEq(usdc.balanceOf(address(esc)), before + AMOUNT + FEE);
        assertEq(uint8(esc.getJob(JID).status), uint8(AgentEscrow.Status.FUNDED));
    }

    function test_StartJob_OnlyAgent() public {
        _create();
        vm.prank(principal);
        esc.fundJob(JID);
        vm.prank(principal);
        vm.expectRevert(AgentEscrow.NotAgent.selector);
        esc.startJob(JID);
        vm.prank(agentWallet);
        esc.startJob(JID);
        assertEq(uint8(esc.getJob(JID).status), uint8(AgentEscrow.Status.STARTED));
    }

    function test_SubmitDeliverable_OnlyAgent() public {
        _create();
        vm.prank(principal);
        esc.fundJob(JID);
        vm.prank(agentWallet);
        esc.startJob(JID);
        vm.prank(agentWallet);
        esc.submitDeliverable(JID, keccak256("deliverable-bundle"));
        assertEq(esc.getJob(JID).deliverableHash, keccak256("deliverable-bundle"));
    }

    function test_MarkCompleted_PaysAgent_AndFee_AndCloses() public {
        _create();
        vm.prank(principal);
        esc.fundJob(JID);
        vm.prank(agentWallet);
        esc.startJob(JID);
        vm.prank(agentWallet);
        esc.submitDeliverable(JID, keccak256("deliverable"));

        uint256 agentBefore = usdc.balanceOf(agentWallet);
        uint256 feeBefore = usdc.balanceOf(feeReceiver);

        vm.prank(principal);
        esc.markCompleted(JID);

        assertEq(usdc.balanceOf(agentWallet), agentBefore + AMOUNT);
        assertEq(usdc.balanceOf(feeReceiver), feeBefore + FEE);
        assertEq(uint8(esc.getJob(JID).status), uint8(AgentEscrow.Status.CLOSED));
    }

    function test_MarkCompleted_BeforeDeliverable_Reverts() public {
        _create();
        vm.prank(principal);
        esc.fundJob(JID);
        vm.prank(agentWallet);
        esc.startJob(JID);
        vm.prank(principal);
        vm.expectRevert();
        esc.markCompleted(JID); // deliverableHash still 0
    }

    function test_Cancel_BeforeStart_Refunds_IfFunded() public {
        _create();
        vm.prank(principal);
        esc.fundJob(JID);
        uint256 before = usdc.balanceOf(principal);
        vm.prank(principal);
        esc.cancel(JID);
        assertEq(usdc.balanceOf(principal), before + AMOUNT + FEE);
        assertEq(uint8(esc.getJob(JID).status), uint8(AgentEscrow.Status.CANCELLED));
    }

    function test_Cancel_AfterStart_Reverts() public {
        _create();
        vm.prank(principal);
        esc.fundJob(JID);
        vm.prank(agentWallet);
        esc.startJob(JID);
        vm.prank(principal);
        vm.expectRevert();
        esc.cancel(JID);
    }

    function test_OpenDispute_WiresDisputeManager_WhenSet() public {
        // Use this test contract as DM operator so we can call setTrustedCaller directly.
        DisputeManager dm = new DisputeManager(address(this));
        dm.setTrustedCaller(address(esc), true);
        esc.setDisputes(dm);

        _create();
        vm.prank(principal);
        esc.fundJob(JID);
        vm.prank(agentWallet);
        esc.startJob(JID);

        bytes32 ev = keccak256("ev-bundle");
        vm.prank(principal);
        esc.openDispute(JID, ev);

        assertEq(uint8(esc.getJob(JID).status), uint8(AgentEscrow.Status.DISPUTED));
        DisputeManager.Case memory c = dm.getCase(JID);
        assertEq(c.claimant, principal);
        assertEq(c.respondent, agentWallet);
        assertEq(c.openingEvidenceHash, ev);
    }

    function test_BeforeHook_RevertBlocks_CreateOnly() public {
        // createJob's hook calls stay direct (no try/catch wrap) — if a
        // principal supplies a bad hook at create, the create should fail
        // loudly so the principal doesn't fund a job with a broken hook.
        RevertingBeforeHook hook = new RevertingBeforeHook();
        vm.prank(principal);
        vm.expectRevert("ACP block");
        esc.createJob(JID, AID, agentWallet, AMOUNT, hook);

        hook.setRevert(false);
        vm.prank(principal);
        esc.createJob(JID, AID, agentWallet, AMOUNT, hook);
        assertEq(uint8(esc.getJob(JID).status), uint8(AgentEscrow.Status.CREATED));
    }

    /// @notice regression: a principal-supplied hook that
    /// starts honest at create + fund, then flips hostile,
    /// must NOT be able to block the agent's downstream
    /// transitions. Funds would otherwise be stranded in
    /// escrow forever (agent can't deliver, can't dispute,
    /// cancel rejects post-STARTED). closure wraps
    /// every post-create hook call in try/catch + emits
    /// `HookReverted` for observability.
    function test_HostileHook_CannotBlockAgentTransitions() public {
        RevertingBeforeHook hook = new RevertingBeforeHook();
        hook.setRevert(false);

        vm.prank(principal);
        esc.createJob(JID, AID, agentWallet, AMOUNT, hook);
        vm.prank(principal);
        esc.fundJob(JID);

        hook.setRevert(true);

        vm.prank(agentWallet);
        esc.startJob(JID);
        assertEq(uint8(esc.getJob(JID).status), uint8(AgentEscrow.Status.STARTED));

        vm.prank(agentWallet);
        esc.submitDeliverable(JID, keccak256("d"));
        assertEq(esc.getJob(JID).deliverableHash, keccak256("d"));

        // openDispute now requires a wired DisputeManager (so the escrow can't
        // be stranded in DISPUTED). The hostile hook still must not block it.
        DisputeManager dm = new DisputeManager(address(this));
        dm.setTrustedCaller(address(esc), true);
        esc.setDisputes(dm);
        vm.prank(agentWallet);
        esc.openDispute(JID, keccak256("ev"));
        assertEq(uint8(esc.getJob(JID).status), uint8(AgentEscrow.Status.DISPUTED));
    }

    function test_Pause_BlocksCreateAndFund() public {
        esc.pause();
        vm.prank(principal);
        vm.expectRevert();
        esc.createJob(JID, AID, agentWallet, AMOUNT, noop);
    }

    // ─── AgentEscrow.resolveDispute ─────────

    function _arriveDisputed() internal returns (DisputeManager) {
        DisputeManager dm = new DisputeManager(address(this));
        dm.setTrustedCaller(address(esc), true);
        esc.setDisputes(dm);
        _create();
        vm.prank(principal);
        esc.fundJob(JID);
        vm.prank(agentWallet);
        esc.startJob(JID);
        vm.prank(principal);
        esc.openDispute(JID, keccak256("ev"));
        dm.assignToReview(JID);
        return dm;
    }

    function test_resolveDispute_payToAgent_releasesAndCloses() public {
        // principal opened → claimant=principal, respondent=agent.
        // REFUND_TO_RESPONDENT therefore pays the agent (respondent).
        DisputeManager dm = _arriveDisputed();
        dm.decide(
            JID,
            DisputeManager.Outcome.REFUND_TO_RESPONDENT,
            keccak256("klaro.reason.DISPUTE_USER_FAULT"),
            bytes32(0)
        );

        uint256 agentBefore = usdc.balanceOf(agentWallet);
        uint256 feeBefore = usdc.balanceOf(feeReceiver);
        vm.prank(operator);
        esc.resolveDispute(JID, true);

        assertEq(usdc.balanceOf(agentWallet), agentBefore + AMOUNT);
        assertEq(usdc.balanceOf(feeReceiver), feeBefore + FEE);
        assertEq(uint8(esc.getJob(JID).status), uint8(AgentEscrow.Status.CLOSED));
    }

    function test_resolveDispute_payToPrincipal_refundsAndCloses() public {
        // principal opened → claimant=principal, respondent=agent.
        // RELEASE_TO_CLAIMANT therefore refunds the principal (claimant).
        DisputeManager dm = _arriveDisputed();
        dm.decide(
            JID,
            DisputeManager.Outcome.RELEASE_TO_CLAIMANT,
            keccak256("klaro.reason.DISPUTE_AGENT_FAULT"),
            bytes32(0)
        );

        uint256 principalBefore = usdc.balanceOf(principal);
        vm.prank(operator);
        esc.resolveDispute(JID, false);

        assertEq(usdc.balanceOf(principal), principalBefore + AMOUNT + FEE);
        assertEq(uint8(esc.getJob(JID).status), uint8(AgentEscrow.Status.CLOSED));
    }

    function test_resolveDispute_revertsIfOperatorContradictsDecision() public {
        DisputeManager dm = _arriveDisputed();
        dm.decide(
            JID,
            DisputeManager.Outcome.RELEASE_TO_CLAIMANT,
            keccak256("klaro.reason.DISPUTE_AGENT_FAULT"),
            bytes32(0)
        );

        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(AgentEscrow.OutcomeMismatch.selector, false));
        esc.resolveDispute(JID, true);
    }

    function test_resolveDispute_nonOperator_reverts() public {
        _arriveDisputed();
        vm.prank(address(0xBAD));
        vm.expectRevert(AgentEscrow.NotOperator.selector);
        esc.resolveDispute(JID, true);
    }

    function test_resolveDispute_revertsWhenNotDisputed() public {
        _create();
        vm.prank(operator);
        vm.expectRevert();
        esc.resolveDispute(JID, true);
    }
}
