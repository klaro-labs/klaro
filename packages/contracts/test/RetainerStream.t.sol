// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import { Test } from "forge-std/Test.sol";
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { RetainerStream } from "../src/RetainerStream.sol";
import { DisputeManager } from "../src/DisputeManager.sol";
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

contract RetainerStreamTest is Test {
    RetainerStream rs;
    MockUSDC usdc;

    address payer = address(0xA1);
    address recipient = address(0xA2);
    address rando = address(0xBEEF);

    bytes32 constant SID = keccak256("stream-1");
    uint256 constant DEP = 30_000_000; // 30 USDC
    uint64 constant SPAN = 30 days;
    uint64 startT;
    uint64 endT;

    address constant OPERATOR = address(0xCAFE);

    function setUp() public {
        vm.chainId(KlaroConfig.ARC_TESTNET_CHAIN_ID);
        rs = new RetainerStream(OPERATOR);
        usdc = new MockUSDC();
        usdc.mint(payer, DEP * 10);
        vm.prank(payer);
        usdc.approve(address(rs), type(uint256).max);

        // Pin "now" so vesting math is deterministic
        vm.warp(1_800_000_000);
        startT = uint64(block.timestamp);
        endT = startT + SPAN;
    }

    function _create() internal {
        vm.prank(payer);
        rs.createStream(SID, recipient, address(usdc), DEP, startT, endT);
    }

    function test_CreateLocksTheDeposit() public {
        _create();
        assertEq(usdc.balanceOf(address(rs)), DEP);
        assertEq(usdc.balanceOf(payer), DEP * 9);
        assertEq(rs.getStream(SID).deposit, DEP);
    }

    function test_Create_RejectsZeroDeposit() public {
        vm.prank(payer);
        vm.expectRevert(RetainerStream.AmountZero.selector);
        rs.createStream(SID, recipient, address(usdc), 0, startT, endT);
    }

    function test_Create_RejectsEndBeforeStart() public {
        vm.prank(payer);
        vm.expectRevert(RetainerStream.EndBeforeStart.selector);
        rs.createStream(SID, recipient, address(usdc), DEP, endT, startT);
    }

    function test_Create_RejectsZeroRecipient() public {
        vm.prank(payer);
        vm.expectRevert(RetainerStream.AmountZero.selector);
        rs.createStream(SID, address(0), address(usdc), DEP, startT, endT);
    }

    function test_Create_Duplicate_Reverts() public {
        _create();
        vm.prank(payer);
        vm.expectRevert(RetainerStream.AlreadyExists.selector);
        rs.createStream(SID, recipient, address(usdc), DEP, startT, endT);
    }

    function test_VestedAtStart_IsZero() public {
        _create();
        assertEq(rs.vestedAmount(SID), 0);
        assertEq(rs.withdrawableAmount(SID), 0);
    }

    function test_VestedHalfway_IsHalfDeposit() public {
        _create();
        vm.warp(startT + SPAN / 2);
        assertEq(rs.vestedAmount(SID), DEP / 2);
        assertEq(rs.withdrawableAmount(SID), DEP / 2);
    }

    function test_VestedAfterEnd_IsFullDeposit() public {
        _create();
        vm.warp(endT + 365 days);
        assertEq(rs.vestedAmount(SID), DEP);
        assertEq(rs.withdrawableAmount(SID), DEP);
    }

    function test_Withdraw_PaysOutAndDecrements() public {
        _create();
        vm.warp(startT + SPAN / 2);

        uint256 before = usdc.balanceOf(recipient);
        vm.prank(recipient);
        rs.withdraw(SID, DEP / 4);

        assertEq(usdc.balanceOf(recipient), before + DEP / 4);
        assertEq(rs.getStream(SID).withdrawn, DEP / 4);
        assertEq(rs.withdrawableAmount(SID), DEP / 2 - DEP / 4);
    }

    function test_Withdraw_NonRecipient_Reverts() public {
        _create();
        vm.warp(startT + SPAN / 2);
        vm.prank(rando);
        vm.expectRevert(RetainerStream.NotRecipient.selector);
        rs.withdraw(SID, 1);
    }

    function test_Withdraw_OverWithdrawable_Reverts() public {
        _create();
        vm.warp(startT + SPAN / 2);
        vm.prank(recipient);
        vm.expectRevert(
            abi.encodeWithSelector(RetainerStream.AmountExceedsWithdrawable.selector, DEP, DEP / 2)
        );
        rs.withdraw(SID, DEP);
    }

    function test_Withdraw_Zero_Reverts() public {
        _create();
        vm.warp(startT + SPAN / 2);
        vm.prank(recipient);
        vm.expectRevert(RetainerStream.AmountZero.selector);
        rs.withdraw(SID, 0);
    }

    function test_Cancel_BeforeStart_FullRefund() public {
        _create();
        uint256 payerBefore = usdc.balanceOf(payer);
        vm.prank(payer);
        rs.cancelStream(SID);
        assertEq(usdc.balanceOf(payer), payerBefore + DEP);
        assertEq(rs.vestedAmount(SID), 0);
        assertEq(rs.withdrawableAmount(SID), 0);
    }

    function test_Cancel_Midway_RecipientKeepsVested_PayerRefunded() public {
        _create();
        vm.warp(startT + SPAN / 2);

        uint256 payerBefore = usdc.balanceOf(payer);
        vm.prank(payer);
        rs.cancelStream(SID);

        assertEq(usdc.balanceOf(payer), payerBefore + DEP / 2);
        // Recipient hasn't withdrawn yet but the vested half is reserved
        assertEq(rs.withdrawableAmount(SID), DEP / 2);

        // Withdraw what's owed
        vm.prank(recipient);
        rs.withdraw(SID, DEP / 2);
        assertEq(usdc.balanceOf(recipient), DEP / 2);
    }

    function test_Cancel_NonPayer_Reverts() public {
        _create();
        vm.prank(rando);
        vm.expectRevert(RetainerStream.NotPayer.selector);
        rs.cancelStream(SID);
    }

    function test_Cancel_Twice_Reverts() public {
        _create();
        vm.startPrank(payer);
        rs.cancelStream(SID);
        vm.expectRevert(RetainerStream.AlreadyCancelled.selector);
        rs.cancelStream(SID);
        vm.stopPrank();
    }

    function test_AccountingAfterPartialWithdrawAndCancel() public {
        _create();
        vm.warp(startT + SPAN / 4); // 25% vested
        vm.prank(recipient);
        rs.withdraw(SID, DEP / 8); // withdraw half of vested

        vm.warp(startT + SPAN / 2); // now 50% vested
        vm.prank(payer);
        rs.cancelStream(SID); // cancel at 50%

        (uint256 deposit, uint256 withdrawn, uint256 vestedNow, uint256 refunded) =
            rs.accountingFor(SID);
        assertEq(deposit, DEP);
        assertEq(withdrawn, DEP / 8);
        assertEq(vestedNow, DEP / 2);
        assertEq(refunded, DEP - DEP / 2);
        // Conservation: deposit == withdrawn + remainingForRecipient + refundedToPayer
        // remainingForRecipient = vestedNow - withdrawn
        assertEq(deposit, withdrawn + (vestedNow - withdrawn) + refunded);
    }

    /// @dev Fuzz: vested amount monotonically increases until endAt then plateaus.
    function testFuzz_VestedIsMonotone(uint256 t1, uint256 t2) public {
        _create();
        t1 = bound(t1, startT, endT + 100 days);
        t2 = bound(t2, t1, endT + 100 days);

        vm.warp(t1);
        uint256 v1 = rs.vestedAmount(SID);
        vm.warp(t2);
        uint256 v2 = rs.vestedAmount(SID);

        assertGe(v2, v1, "vested must be monotonic over time");
        assertLe(v2, DEP, "vested never exceeds deposit");
    }

    /// @dev Fuzz: conservation invariant — for any (cancelTime, withdrawAmount):
    /// deposit == cumulativeWithdrawn + recipientUnclaimedRemaining + payerRefund
    function testFuzz_ConservationOnCancel(uint256 wt, uint256 ct, uint256 wAmt) public {
        _create();
        wt = bound(wt, startT, endT - 1);
        vm.warp(wt);

        uint256 wAvail = rs.withdrawableAmount(SID);
        wAmt = bound(wAmt, 0, wAvail);
        if (wAmt > 0) {
            vm.prank(recipient);
            rs.withdraw(SID, wAmt);
        }

        ct = bound(ct, wt, endT + 100 days);
        vm.warp(ct);
        vm.prank(payer);
        rs.cancelStream(SID);

        (uint256 deposit, uint256 withdrawn, uint256 vestedNow, uint256 refunded) =
            rs.accountingFor(SID);
        // remaining for recipient is vestedNow - withdrawn (claimable post-cancel)
        uint256 recipientRemaining = vestedNow - withdrawn;
        assertEq(deposit, withdrawn + recipientRemaining + refunded);
    }

    // ─── P1 (#92): operator + pause ─────────────────

    function test_Pause_BlocksCreateAndWithdraw() public {
        vm.prank(OPERATOR);
        rs.pause();
        vm.prank(payer);
        vm.expectRevert(); // EnforcedPause
        rs.createStream(keccak256("blocked"), recipient, address(usdc), DEP, startT, endT);
    }

    function test_Pause_NonOperator_Reverts() public {
        vm.prank(address(0xBAD));
        vm.expectRevert(RetainerStream.NotOperator.selector);
        rs.pause();
    }

    function test_SetOperator_OnlyOwner() public {
        vm.prank(address(0xBAD));
        vm.expectRevert();
        rs.setOperator(address(0x123));

        // Owner = address(this) (the test contract that deployed rs)
        rs.setOperator(address(0xABCD));
        assertEq(rs.klaroOperator(), address(0xABCD));
    }

    // RS1 regression: DisputeManager wiring closes original
    // AUDIT P1 #99 ("RetainerStream orphaned — no DisputeManager
    // wiring, holds 30-day retainers with no admin recovery").

    function test_OpenDispute_Reverts_WhenDisputesNotConfigured() public {
        _create();
        vm.prank(payer);
        vm.expectRevert(RetainerStream.DisputesNotConfigured.selector);
        rs.openDispute(SID, keccak256("evidence-1"));
    }

    function test_OpenDispute_Reverts_NotParty() public {
        _create();
        DisputeManager dm = new DisputeManager(OPERATOR);
        // setTrustedCaller owner-only (test contract).
        dm.setTrustedCaller(address(rs), true);
        rs.setDisputes(dm);

        vm.prank(rando);
        vm.expectRevert(RetainerStream.NotParty.selector);
        rs.openDispute(SID, keccak256("evidence-1"));
    }

    function test_OpenDispute_Reverts_UnknownStream() public {
        DisputeManager dm = new DisputeManager(OPERATOR);
        // setTrustedCaller owner-only (test contract).
        dm.setTrustedCaller(address(rs), true);
        rs.setDisputes(dm);

        vm.prank(payer);
        vm.expectRevert(RetainerStream.UnknownStream.selector);
        rs.openDispute(SID, keccak256("evidence-1"));
    }

    function test_OpenDispute_PayerOpens_RecordsCase() public {
        _create();
        DisputeManager dm = new DisputeManager(OPERATOR);
        // setTrustedCaller owner-only (test contract).
        dm.setTrustedCaller(address(rs), true);
        rs.setDisputes(dm);

        vm.prank(payer);
        rs.openDispute(SID, keccak256("payer-evidence"));

        // Case recorded with payer as claimant, recipient as respondent.
        DisputeManager.Case memory c = dm.getCase(SID);
        assertEq(c.claimant, payer);
        assertEq(c.respondent, recipient);
        assertEq(uint8(c.status), uint8(DisputeManager.Status.OPENED));
    }

    function test_OpenDispute_RecipientOpens_RecordsCase() public {
        _create();
        DisputeManager dm = new DisputeManager(OPERATOR);
        // setTrustedCaller owner-only (test contract).
        dm.setTrustedCaller(address(rs), true);
        rs.setDisputes(dm);

        vm.prank(recipient);
        rs.openDispute(SID, keccak256("recipient-evidence"));

        DisputeManager.Case memory c = dm.getCase(SID);
        assertEq(c.claimant, recipient);
        assertEq(c.respondent, payer);
    }

    function test_SetDisputes_NonOwner_Reverts() public {
        DisputeManager dm = new DisputeManager(OPERATOR);
        vm.prank(rando);
        vm.expectRevert();
        rs.setDisputes(dm);
    }

    // regression: operator-triggered resolveDispute
    // closes the gap where recipient could drain the vested balance
    // after losing a dispute. Three cases: payer-wins (refund unvested),
    // recipient-wins (continue vesting), and withdraw gated during the
    // race window between decide() and resolveDispute().

    function _setupDisputeStream(DisputeManager dm) internal {
        // dm.setTrustedCaller is now owner-only (was
        // operator-only). Test contract is dm's owner (constructor
        // deployer), so direct call without prank.
        dm.setTrustedCaller(address(rs), true);
        // rs.setDisputes is owner-only on rs; test contract is owner.
        rs.setDisputes(dm);
        _create();
        // Half-vested point: warp to startT + SPAN/2.
        vm.warp(startT + SPAN / 2);
    }

    function test_ResolveDispute_PayerWins_RefundsUnvested() public {
        DisputeManager dm = new DisputeManager(OPERATOR);
        _setupDisputeStream(dm);
        // Payer opens; operator decides RELEASE_TO_CLAIMANT (payer wins).
        vm.prank(payer);
        rs.openDispute(SID, keccak256("payer-evidence"));
        vm.prank(OPERATOR);
        dm.assignToReview(SID);
        vm.prank(OPERATOR);
        dm.decide(
            SID,
            DisputeManager.Outcome.RELEASE_TO_CLAIMANT,
            keccak256("klaro.reason.DISPUTE_USER_FAULT"),
            bytes32(0)
        );

        uint256 payerBefore = usdc.balanceOf(payer);
        vm.prank(OPERATOR);
        rs.resolveDispute(SID);
        // Vested-at-50%-elapsed = DEPOSIT/2; refund is the other half.
        assertEq(usdc.balanceOf(payer), payerBefore + DEP / 2);
        assertTrue(rs.getStream(SID).resolved);
    }

    function test_ResolveDispute_RecipientWins_ContinuesVesting() public {
        DisputeManager dm = new DisputeManager(OPERATOR);
        _setupDisputeStream(dm);
        // Payer opens; operator decides REFUND_TO_RESPONDENT
        // (respondent=recipient → recipient wins).
        vm.prank(payer);
        rs.openDispute(SID, keccak256("payer-evidence"));
        vm.prank(OPERATOR);
        dm.assignToReview(SID);
        vm.prank(OPERATOR);
        dm.decide(
            SID,
            DisputeManager.Outcome.REFUND_TO_RESPONDENT,
            keccak256("klaro.reason.DISPUTE_USER_FAULT"),
            bytes32(0)
        );

        uint256 payerBefore = usdc.balanceOf(payer);
        vm.prank(OPERATOR);
        rs.resolveDispute(SID);
        // No refund to payer; recipient continues vesting normally.
        assertEq(usdc.balanceOf(payer), payerBefore);
        assertTrue(rs.getStream(SID).resolved);
        // Recipient can withdraw the half-vested amount.
        vm.prank(recipient);
        rs.withdraw(SID, DEP / 2);
        assertEq(usdc.balanceOf(recipient), DEP / 2);
    }

    function test_Withdraw_DuringDecidedButUnresolved_Reverts() public {
        DisputeManager dm = new DisputeManager(OPERATOR);
        _setupDisputeStream(dm);
        vm.prank(payer);
        rs.openDispute(SID, keccak256("payer-evidence"));
        vm.prank(OPERATOR);
        dm.assignToReview(SID);
        vm.prank(OPERATOR);
        dm.decide(
            SID,
            DisputeManager.Outcome.RELEASE_TO_CLAIMANT,
            keccak256("klaro.reason.DISPUTE_USER_FAULT"),
            bytes32(0)
        );
        // Recipient tries to drain before operator resolves; refuses.
        vm.prank(recipient);
        vm.expectRevert(RetainerStream.DisputeAwaitingResolution.selector);
        rs.withdraw(SID, 1);
    }

    // regression: openDispute + resolveDispute refuse
    // streams that have already been cancelled. Without this, a payer
    // could cancel (refund unvested), then open a dispute, win it, and
    // resolveDispute would refund the unvested portion AGAIN from
    // pooled USDC — draining other streams.
    function test_OpenDispute_OnCancelledStream_Reverts() public {
        DisputeManager dm = new DisputeManager(OPERATOR);
        _setupDisputeStream(dm);
        // Payer cancels at the half-vested point.
        vm.prank(payer);
        rs.cancelStream(SID);
        // Now payer attempts to open a dispute on the same stream.
        vm.prank(payer);
        vm.expectRevert(RetainerStream.StreamAlreadyCancelled.selector);
        rs.openDispute(SID, keccak256("evidence"));
    }

    // symmetric guard with . cancelStream now
    // refuses when a dispute is open (case exists, not yet resolved).
    // Without this, payer could open a dispute, see it going against
    // them, then cancel to escape resolveDispute's enforcement.
    function test_CancelStream_DuringOpenDispute_Reverts() public {
        DisputeManager dm = new DisputeManager(OPERATOR);
        _setupDisputeStream(dm);
        vm.prank(payer);
        rs.openDispute(SID, keccak256("evidence"));
        // Payer tries to cancel after opening the dispute — refused.
        vm.prank(payer);
        vm.expectRevert(RetainerStream.DisputeAwaitingResolution.selector);
        rs.cancelStream(SID);
    }

    // once resolveDispute fires (s.resolved=true), cancel is
    // allowed again — the dispute's outcome has been enforced. Mostly
    // a no-op in the recipientWon path since vesting continues, but
    // payer should retain the right to stop future vesting.
    function test_CancelStream_AfterResolvedDispute_Allowed() public {
        DisputeManager dm = new DisputeManager(OPERATOR);
        _setupDisputeStream(dm);
        vm.prank(payer);
        rs.openDispute(SID, keccak256("evidence"));
        vm.prank(OPERATOR);
        dm.assignToReview(SID);
        vm.prank(OPERATOR);
        dm.decide(
            SID,
            DisputeManager.Outcome.REFUND_TO_RESPONDENT,
            keccak256("klaro.reason.DISPUTE_USER_FAULT"),
            bytes32(0)
        );
        vm.prank(OPERATOR);
        rs.resolveDispute(SID);
        // s.resolved is true, recipient won (no refund), vesting continues.
        // Payer can now cancel to stop future vesting.
        vm.prank(payer);
        rs.cancelStream(SID);
        assertTrue(rs.getStream(SID).cancelledAt > 0);
    }

    function test_ResolveDispute_NonOperator_Reverts() public {
        DisputeManager dm = new DisputeManager(OPERATOR);
        _setupDisputeStream(dm);
        vm.prank(payer);
        rs.openDispute(SID, keccak256("ev"));
        vm.prank(OPERATOR);
        dm.assignToReview(SID);
        vm.prank(OPERATOR);
        dm.decide(
            SID,
            DisputeManager.Outcome.RELEASE_TO_CLAIMANT,
            keccak256("klaro.reason.DISPUTE_USER_FAULT"),
            bytes32(0)
        );
        vm.prank(rando);
        vm.expectRevert(RetainerStream.NotOperator.selector);
        rs.resolveDispute(SID);
    }
}
