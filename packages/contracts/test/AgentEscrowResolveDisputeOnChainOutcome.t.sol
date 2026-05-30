// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import { Test } from "forge-std/Test.sol";
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import { AgentEscrow } from "../src/AgentEscrow.sol";
import { AgentRegistry } from "../src/AgentRegistry.sol";
import { DisputeManager } from "../src/DisputeManager.sol";
import { NoopACPHook } from "../src/IACPHook.sol";
import { KlaroConfig } from "../src/KlaroConfig.sol";

/// @notice Regression for loop fix: AgentEscrow.resolveDispute used
/// to trust the operator's `payToAgent` parameter even when the
/// wired DisputeManager said the opposite. A compromised operator
/// could pay the wrong party while on-chain truth said otherwise.
/// Closure: the contract now derives the direction from
/// (outcome, claimant identity) and reverts on operator/on-chain
/// mismatch. MUTUAL_RESOLVED accepts either bool (parties agreed
/// off-chain). SLASH_LP/PENALIZE_VENDOR/NONE revert as
/// not-applicable for the agent escrow context.

contract MockUSDC is ERC20 {
    constructor() ERC20("Mock USDC", "USDC") { }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amt) external {
        _mint(to, amt);
    }
}

contract AgentEscrowResolveDisputeOnChainOutcomeTest is Test {
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

    bytes32 constant AID = keccak256("agent.test");
    bytes32 constant JID = keccak256("job-trust-gap");
    uint256 constant AMOUNT = 1_000_000_000;
    uint256 constant FEE_BPS = 500;
    uint256 constant FEE = (AMOUNT * FEE_BPS) / 10_000;

    function setUp() public {
        vm.chainId(KlaroConfig.ARC_TESTNET_CHAIN_ID);
        (operator, operatorPk) = makeAddrAndKey("ae-rd-operator");
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

        dm = new DisputeManager(address(this));
        dm.setTrustedCaller(address(esc), true);
        esc.setDisputes(dm);
    }

    function _arriveDisputed(address opener) internal {
        vm.prank(principal);
        esc.createJob(JID, AID, agentWallet, AMOUNT, noop);
        vm.prank(principal);
        esc.fundJob(JID);
        vm.prank(agentWallet);
        esc.startJob(JID);
        vm.prank(opener);
        esc.openDispute(JID, keccak256("ev"));
        dm.assignToReview(JID);
    }

    // ─── Trust-gap closure: operator/on-chain disagreement reverts ─────

    function test_OperatorBoolMismatch_PrincipalClaimant_Release_Reverts() public {
        // principal opens → claimant=principal. RELEASE_TO_CLAIMANT means
        // refund principal → derived payToAgent = false. Operator passing
        // `true` would route funds to the agent — exactly the trust-gap
        // attack the fix closes.
        _arriveDisputed(principal);
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

    function test_OperatorBoolMismatch_AgentClaimant_Refund_Reverts() public {
        // agent opens (e.g. non-payment) → claimant=agent. REFUND_TO_RESPONDENT
        // means refund principal (respondent) → derived payToAgent = false.
        // Operator passing `true` would still pay the agent — closed.
        _arriveDisputed(agentWallet);
        dm.decide(
            JID,
            DisputeManager.Outcome.REFUND_TO_RESPONDENT,
            keccak256("klaro.reason.DISPUTE_USER_FAULT"),
            bytes32(0)
        );

        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(AgentEscrow.OutcomeMismatch.selector, false));
        esc.resolveDispute(JID, true);
    }

    function test_AgentClaimant_Release_PaysAgent_HappyPath() public {
        _arriveDisputed(agentWallet);
        dm.decide(
            JID,
            DisputeManager.Outcome.RELEASE_TO_CLAIMANT,
            keccak256("klaro.reason.DISPUTE_USER_FAULT"),
            bytes32(0)
        );

        uint256 agentBefore = usdc.balanceOf(agentWallet);
        uint256 feeBefore = usdc.balanceOf(feeReceiver);
        vm.prank(operator);
        esc.resolveDispute(JID, true);

        assertEq(usdc.balanceOf(agentWallet), agentBefore + AMOUNT);
        assertEq(usdc.balanceOf(feeReceiver), feeBefore + FEE);
    }

    // ─── MUTUAL_RESOLVED: ambiguous direction → rejected ──────────────
    // The stricter linter pass folded MUTUAL_RESOLVED into OutcomeNotApplicable
    // because the on-chain enum carries no recipient information. Off-chain
    // mutual settlements must instead be encoded as RELEASE_TO_CLAIMANT or
    // REFUND_TO_RESPONDENT before this contract will move funds.

    function test_MutualResolved_Reverts_NotApplicable() public {
        _arriveDisputed(principal);
        // Audit 2026-05-30: MUTUAL_RESOLVED has no consumer resolver, so it is
        // now rejected at decide() — before the case is committed — instead of
        // being decided and then stranding the escrow when resolveDispute reverts.
        vm.expectRevert(
            abi.encodeWithSelector(
                DisputeManager.OutcomeNotValidForContext.selector,
                DisputeManager.Outcome.MUTUAL_RESOLVED,
                keccak256("klaro.dispute.agent")
            )
        );
        dm.decide(
            JID,
            DisputeManager.Outcome.MUTUAL_RESOLVED,
            keccak256("klaro.reason.DISPUTE_MUTUAL_RESOLVED"),
            bytes32(0)
        );
    }

    // ─── DisputesNotConfigured: production stance, no operator-trust fallback ─

    function test_DisputesUnwired_Reverts() public {
        // Fresh escrow with no DisputeManager attached. Arrive at DISPUTED via
        // the operator path (no on-chain case opened — the optional wiring in
        // openDispute skips when disputes is address(0)).
        AgentEscrow fresh = new AgentEscrow(address(usdc), reg, feeReceiver, operator);
        usdc.mint(principal, AMOUNT * 10);
        vm.prank(principal);
        usdc.approve(address(fresh), type(uint256).max);

        vm.prank(principal);
        fresh.createJob(JID, AID, agentWallet, AMOUNT, noop);
        vm.prank(principal);
        fresh.fundJob(JID);
        vm.prank(agentWallet);
        fresh.startJob(JID);
        // openDispute itself now reverts with no DisputeManager — the job can't
        // enter DISPUTED without a registry to hold the case, so the escrow is
        // never stranded (was: openDispute "succeeded" then resolveDispute
        // reverted forever).
        vm.prank(principal);
        vm.expectRevert(AgentEscrow.DisputesNotConfigured.selector);
        fresh.openDispute(JID, keccak256("ev"));
    }

    // ─── Outcomes not defined for the agent escrow context revert ─────

    function test_SlashLp_Reverts_NotApplicable() public {
        _arriveDisputed(principal);
        // SLASH_LP is only resolvable in the cashout context; for an agent case
        // it is now rejected at decide() (was: decided then resolveDispute reverts).
        vm.expectRevert(
            abi.encodeWithSelector(
                DisputeManager.OutcomeNotValidForContext.selector,
                DisputeManager.Outcome.SLASH_LP,
                keccak256("klaro.dispute.agent")
            )
        );
        dm.decide(
            JID,
            DisputeManager.Outcome.SLASH_LP,
            keccak256("klaro.reason.SLASH_LP_DISPUTE_LOSS"),
            bytes32(0)
        );
    }

    function test_PenalizeVendor_Reverts_NotApplicable() public {
        _arriveDisputed(principal);
        // PENALIZE_VENDOR has no consumer resolver → rejected at decide().
        vm.expectRevert(
            abi.encodeWithSelector(
                DisputeManager.OutcomeNotValidForContext.selector,
                DisputeManager.Outcome.PENALIZE_VENDOR,
                keccak256("klaro.dispute.agent")
            )
        );
        dm.decide(
            JID,
            DisputeManager.Outcome.PENALIZE_VENDOR,
            keccak256("klaro.reason.PENALIZE_VENDOR_FRAUD"),
            bytes32(0)
        );
    }
}
