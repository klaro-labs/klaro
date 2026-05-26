// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import { Test } from "forge-std/Test.sol";
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import { CashoutOrderProcessor } from "../src/CashoutOrderProcessor.sol";
import { ProofRegistry } from "../src/ProofRegistry.sol";
import { LPStaking } from "../src/LPStaking.sol";
import { LPRegistry } from "../src/LPRegistry.sol";
import { DisputeManager } from "../src/DisputeManager.sol";
import { ReasonCodes } from "../src/lib/ReasonCodes.sol";

contract MockUSDC is ERC20 {
    constructor() ERC20("Mock USDC", "USDC") { }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amt) external {
        _mint(to, amt);
    }
}

contract CashoutOrderProcessorTest is Test {
    CashoutOrderProcessor proc;
    ProofRegistry proofs;
    LPStaking staking;
    LPRegistry registry;
    MockUSDC usdc;

    address vendor = address(0xA1);
    address lpWallet = address(0xA2);
    address other = address(0xC3);
    // Use this contract address as the operator so it can also be msg.sender
    // for proc.claimByLP / recordProof in tests, AND owner of staking.
    address operator;

    bytes32 constant CO_ID = keccak256("co-001");
    bytes32 constant LP_ID = keccak256("lp-aakash");
    bytes32 constant CORRIDOR = keccak256("INR");
    uint256 constant USDC_AMT = 2_400_000_000;
    uint256 constant INR_AMT = 20_136_000;

    // LPStaking.register now needs an operator-signed auth. Sign
    // with a keyed identity, then transfer staking's operator to proc once
    // the LP is on-chain so the slash/setActive paths still work.
    address signingOperator;
    uint256 signingOperatorPk;

    function setUp() public {
        vm.chainId(5_042_002);
        operator = address(this);
        (signingOperator, signingOperatorPk) = makeAddrAndKey("staking-signing-operator");

        usdc = new MockUSDC();
        proofs = new ProofRegistry(operator);
        staking = new LPStaking(address(usdc), signingOperator);
        // LPS2: pin a slash sink so staking.slash() doesn't
        // revert FeeReceiverUnset when CashoutOrderProcessor exercises
        // the dispute-loss → slash flow.
        staking.setFeeReceiver(address(0xFEE));
        registry = new LPRegistry(operator);
        proc = new CashoutOrderProcessor(address(usdc), proofs, staking, registry, operator);

        // Wire ownership so cashout proc can call staking.slash (operator),
        // and proof submission (operator). For this test all three share
        // the same operator address (this contract). In prod the proc IS
        // the operator that owns staking + proofs.
        proofs.setOperator(address(proc));

        // Seed vendor + LP balances + approvals
        usdc.mint(vendor, USDC_AMT * 10);
        usdc.mint(lpWallet, 5_000_000_000);
        vm.prank(vendor);
        usdc.approve(address(proc), type(uint256).max);
        vm.prank(lpWallet);
        usdc.approve(address(staking), type(uint256).max);

        // Register LP via operator-signed auth (signingOperator), then
        // transfer staking's operator to proc so slash() still works.
        _registerStaked(LP_ID, lpWallet, 500_000_000);
        // distinct slasher role; operator stays as the
        // EOA registrar signer so future register() calls work.
        staking.setSlasher(address(proc));

        registry.registerLP(LP_ID, lpWallet, 2, keccak256("kyb-bundle"), keccak256("payout"));
        registry.admit(LP_ID);
    }

    function _registerStaked(bytes32 lpId, address wallet, uint256 amount) internal {
        uint64 deadline = uint64(block.timestamp + 10 minutes);
        uint256 nonce = staking.registerNonce(lpId);
        bytes32 structHash =
            keccak256(abi.encode(staking.REGISTER_TYPEHASH(), lpId, wallet, deadline, nonce));
        bytes32 digest = keccak256(
            abi.encodePacked("\x19\x01", staking.registrationDomainSeparator(), structHash)
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signingOperatorPk, digest);
        bytes memory auth = abi.encodePacked(r, s, v);
        vm.prank(wallet);
        staking.register(lpId, wallet, amount, deadline, auth);
    }

    function _request() internal {
        vm.prank(vendor);
        proc.requestAndLock(
            CO_ID,
            USDC_AMT,
            INR_AMT,
            CORRIDOR,
            uint64(block.timestamp + 5 minutes),
            keccak256("quote-blob")
        );
    }

    function _sampleProof() internal pure returns (ProofRegistry.Proof memory p) {
        p = ProofRegistry.Proof({
            cashoutId: CO_ID,
            lpId: LP_ID,
            vendorId: keccak256("vendor-asha"),
            inrAmount: INR_AMT,
            usdcAmount: USDC_AMT,
            utrReferenceHash: keccak256("utr+account"),
            screenshotHash: keccak256("screenshot.png"),
            submittedAt: 0,
            lpSignatureHash: keccak256("lp-sig"),
            verifierSignatureHash: keccak256("verifier-sig")
        });
    }

    // ─── tests ──────────────────────────────────────────────────────────

    function test_requestAndLock_locksUSDC_andSetsLocked() public {
        uint256 procBefore = usdc.balanceOf(address(proc));
        uint256 vendorBefore = usdc.balanceOf(vendor);
        _request();
        assertEq(usdc.balanceOf(address(proc)), procBefore + USDC_AMT);
        assertEq(usdc.balanceOf(vendor), vendorBefore - USDC_AMT);
        assertEq(uint8(proc.getOrder(CO_ID).status), uint8(CashoutOrderProcessor.Status.LOCKED));
    }

    function test_requestAndLock_expiredQuote_reverts() public {
        vm.expectRevert(CashoutOrderProcessor.QuoteExpired.selector);
        vm.prank(vendor);
        proc.requestAndLock(
            CO_ID, USDC_AMT, INR_AMT, CORRIDOR, uint64(block.timestamp - 1), keccak256("quote-blob")
        );
    }

    function test_happyPath_confirmReceived_releasesToLP() public {
        _request();

        // operator claims for the LP
        vm.prank(operator);
        proc.claimByLP(CO_ID, LP_ID);

        // operator records proof
        vm.prank(operator);
        proc.recordProof(CO_ID, _sampleProof());

        uint256 lpBefore = usdc.balanceOf(lpWallet);

        // vendor confirms INR landed → USDC released to LP
        vm.prank(vendor);
        proc.confirmReceived(CO_ID);

        assertEq(usdc.balanceOf(lpWallet), lpBefore + USDC_AMT);
        assertEq(uint8(proc.getOrder(CO_ID).status), uint8(CashoutOrderProcessor.Status.RELEASED));
    }

    function test_confirmReceived_nonVendor_reverts() public {
        _request();
        vm.prank(operator);
        proc.claimByLP(CO_ID, LP_ID);
        vm.prank(operator);
        proc.recordProof(CO_ID, _sampleProof());

        vm.expectRevert(CashoutOrderProcessor.NotVendor.selector);
        vm.prank(other);
        proc.confirmReceived(CO_ID);
    }

    // regression: operatorConfirmReceived is the daemon's
    // release path (Klaro vendors are SMBs without signing infra). The
    // function requires onlyOperator AND validates the passed vendor
    // matches the recorded order vendor.

    function test_operatorConfirmReceived_happy_releasesToLP() public {
        _request();
        vm.prank(operator);
        proc.claimByLP(CO_ID, LP_ID);
        vm.prank(operator);
        proc.recordProof(CO_ID, _sampleProof());

        uint256 lpBefore = usdc.balanceOf(lpWallet);
        vm.prank(operator);
        proc.operatorConfirmReceived(CO_ID, vendor);

        assertEq(usdc.balanceOf(lpWallet), lpBefore + USDC_AMT);
        assertEq(uint8(proc.getOrder(CO_ID).status), uint8(CashoutOrderProcessor.Status.RELEASED));
    }

    function test_operatorConfirmReceived_nonOperator_reverts() public {
        _request();
        vm.prank(operator);
        proc.claimByLP(CO_ID, LP_ID);
        vm.prank(operator);
        proc.recordProof(CO_ID, _sampleProof());

        vm.expectRevert(CashoutOrderProcessor.NotOperator.selector);
        vm.prank(other);
        proc.operatorConfirmReceived(CO_ID, vendor);
    }

    function test_operatorConfirmReceived_wrongVendor_reverts() public {
        _request();
        vm.prank(operator);
        proc.claimByLP(CO_ID, LP_ID);
        vm.prank(operator);
        proc.recordProof(CO_ID, _sampleProof());

        // Defense-in-depth: operator-key compromise alone isn't enough;
        // attacker also needs to know the correct vendor address.
        vm.expectRevert(CashoutOrderProcessor.NotVendor.selector);
        vm.prank(operator);
        proc.operatorConfirmReceived(CO_ID, other);
    }

    function test_openDispute_blocksRelease_thenResolveSlashesLP() public {
        DisputeManager dm = new DisputeManager(operator);
        dm.setTrustedCaller(address(proc), true);
        proc.setDisputes(dm);
        _request();
        vm.prank(operator);
        proc.claimByLP(CO_ID, LP_ID);
        vm.prank(operator);
        proc.recordProof(CO_ID, _sampleProof());

        vm.prank(vendor);
        proc.openDispute(CO_ID, keccak256("evidence"));
        assertEq(uint8(proc.getOrder(CO_ID).status), uint8(CashoutOrderProcessor.Status.DISPUTED));
        dm.assignToReview(CO_ID);
        dm.decide(
            CO_ID,
            DisputeManager.Outcome.SLASH_LP,
            keccak256("klaro.reason.SLASH_LP_BAD_PROOF"),
            bytes32(0)
        );

        uint256 vendorBefore = usdc.balanceOf(vendor);

        // Operator resolves AGAINST the LP → slash 200_000_000 + refund vendor
        vm.prank(operator);
        proc.resolveDispute(CO_ID, 200_000_000, keccak256("klaro.reason.SLASH_LP_BAD_PROOF"));

        assertEq(usdc.balanceOf(vendor), vendorBefore + USDC_AMT);
        assertEq(
            uint8(proc.getOrder(CO_ID).status),
            uint8(CashoutOrderProcessor.Status.RESOLVED_VENDOR_PAYS)
        );
        assertEq(staking.getLP(LP_ID).slashedTotal, 200_000_000);
    }

    // regression: when LPStaking is paused independently
    // (owner investigating a staking bug), SLASH_LP resolution used to
    // revert wholesale — cashout stuck in DISPUTED, vendor not paid,
    // until LPStaking unpaused. Now: resolveDispute completes (vendor
    // paid) and the slash is deferred to a separate retrySlash call.
    function test_resolveDispute_slashDeferred_whenLPStakingPaused() public {
        DisputeManager dm = new DisputeManager(operator);
        dm.setTrustedCaller(address(proc), true);
        proc.setDisputes(dm);
        _request();
        vm.prank(operator);
        proc.claimByLP(CO_ID, LP_ID);
        vm.prank(operator);
        proc.recordProof(CO_ID, _sampleProof());

        vm.prank(vendor);
        proc.openDispute(CO_ID, keccak256("evidence"));
        dm.assignToReview(CO_ID);
        dm.decide(
            CO_ID,
            DisputeManager.Outcome.SLASH_LP,
            keccak256("klaro.reason.SLASH_LP_BAD_PROOF"),
            bytes32(0)
        );

        // Pause LPStaking BEFORE resolving the cashout dispute.
        staking.pause();

        uint256 vendorBefore = usdc.balanceOf(vendor);
        uint256 slashedBefore = staking.getLP(LP_ID).slashedTotal;

        vm.prank(operator);
        proc.resolveDispute(CO_ID, 200_000_000, keccak256("klaro.reason.SLASH_LP_BAD_PROOF"));

        // Vendor is paid; slash deferred (LP not yet slashed).
        assertEq(usdc.balanceOf(vendor), vendorBefore + USDC_AMT);
        assertEq(staking.getLP(LP_ID).slashedTotal, slashedBefore);
        (bytes32 pendingLpId, uint256 pendingAmount,) = proc.pendingSlash(CO_ID);
        assertEq(pendingLpId, LP_ID);
        assertEq(pendingAmount, 200_000_000);

        // Unpause + retry.
        staking.unpause();
        vm.prank(operator);
        proc.retrySlash(CO_ID);
        assertEq(staking.getLP(LP_ID).slashedTotal, slashedBefore + 200_000_000);
        // pendingSlash record cleared.
        (, uint256 amtAfter,) = proc.pendingSlash(CO_ID);
        assertEq(amtAfter, 0);
    }

    function test_retrySlash_revertsWhenNoPendingSlash() public {
        vm.prank(operator);
        vm.expectRevert(CashoutOrderProcessor.NoPendingSlash.selector);
        proc.retrySlash(CO_ID);
    }

    function test_resolveDispute_zeroSlash_releasesToLP() public {
        DisputeManager dm = new DisputeManager(operator);
        dm.setTrustedCaller(address(proc), true);
        proc.setDisputes(dm);
        _request();
        vm.prank(operator);
        proc.claimByLP(CO_ID, LP_ID);
        vm.prank(operator);
        proc.recordProof(CO_ID, _sampleProof());
        vm.prank(vendor);
        proc.openDispute(CO_ID, keccak256("evidence"));
        dm.assignToReview(CO_ID);
        dm.decide(
            CO_ID,
            DisputeManager.Outcome.REFUND_TO_RESPONDENT,
            keccak256("klaro.reason.DISPUTE_USER_FAULT"),
            bytes32(0)
        );

        uint256 lpBefore = usdc.balanceOf(lpWallet);

        vm.prank(operator);
        proc.resolveDispute(CO_ID, 0, keccak256("klaro.reason.DISPUTE_USER_FAULT"));

        assertEq(usdc.balanceOf(lpWallet), lpBefore + USDC_AMT);
        assertEq(
            uint8(proc.getOrder(CO_ID).status), uint8(CashoutOrderProcessor.Status.RESOLVED_LP_PAYS)
        );
    }

    function test_resolveDispute_revertsWithoutCanonicalDecision() public {
        _request();
        vm.prank(operator);
        proc.claimByLP(CO_ID, LP_ID);
        vm.prank(vendor);
        proc.openDispute(CO_ID, keccak256("evidence"));

        vm.expectRevert(CashoutOrderProcessor.DisputesNotConfigured.selector);
        proc.resolveDispute(CO_ID, 0, keccak256("operator-choice-not-allowed"));
    }

    function test_resolveDispute_cannotSlashWhenDecisionPaysLP() public {
        DisputeManager dm = new DisputeManager(operator);
        dm.setTrustedCaller(address(proc), true);
        proc.setDisputes(dm);
        _request();
        vm.prank(operator);
        proc.claimByLP(CO_ID, LP_ID);
        vm.prank(vendor);
        proc.openDispute(CO_ID, keccak256("evidence"));
        dm.assignToReview(CO_ID);
        dm.decide(
            CO_ID,
            DisputeManager.Outcome.REFUND_TO_RESPONDENT,
            keccak256("klaro.reason.DISPUTE_USER_FAULT"),
            bytes32(0)
        );

        vm.expectRevert(CashoutOrderProcessor.SlashNotAllowed.selector);
        proc.resolveDispute(CO_ID, 1, keccak256("klaro.reason.SLASH_LP_DISPUTE_LOSS"));
    }

    function test_cancel_byVendor_returnsUSDC() public {
        _request();
        uint256 vendorBefore = usdc.balanceOf(vendor);
        vm.prank(vendor);
        proc.cancel(CO_ID);
        assertEq(usdc.balanceOf(vendor), vendorBefore + USDC_AMT);
        assertEq(uint8(proc.getOrder(CO_ID).status), uint8(CashoutOrderProcessor.Status.CANCELLED));
    }

    function test_expireUnconfirmed_afterWindow_refundsVendor() public {
        _request();
        vm.prank(operator);
        proc.claimByLP(CO_ID, LP_ID);
        vm.prank(operator);
        proc.recordProof(CO_ID, _sampleProof());

        // Fast-forward past CONFIRM_WINDOW
        vm.warp(block.timestamp + 25 hours);
        uint256 vendorBefore = usdc.balanceOf(vendor);

        vm.prank(operator);
        proc.expireUnconfirmed(CO_ID);

        assertEq(usdc.balanceOf(vendor), vendorBefore + USDC_AMT);
        assertEq(uint8(proc.getOrder(CO_ID).status), uint8(CashoutOrderProcessor.Status.EXPIRED));
    }

    // ─── M8 LPRegistry-gating tests ─────────────────────────────────────

    function test_claimByLP_revertsForSuspendedLP() public {
        _request();
        registry.suspend(LP_ID, ReasonCodes.SLASH_LP_BAD_PROOF);
        vm.expectRevert(
            abi.encodeWithSelector(
                LPRegistry.NotActive.selector, LP_ID, LPRegistry.Status.SUSPENDED
            )
        );
        vm.prank(operator);
        proc.claimByLP(CO_ID, LP_ID);
    }

    function test_claimByLP_revertsForUnknownLP() public {
        _request();
        bytes32 unknownLp = keccak256("lp.never-registered");
        vm.expectRevert(
            abi.encodeWithSelector(LPRegistry.NotActive.selector, unknownLp, LPRegistry.Status.NONE)
        );
        vm.prank(operator);
        proc.claimByLP(CO_ID, unknownLp);
    }

    function test_claimByLP_succeedsForAdmittedLP() public {
        _request();
        vm.prank(operator);
        proc.claimByLP(CO_ID, LP_ID);
        assertEq(uint8(proc.getOrder(CO_ID).status), uint8(CashoutOrderProcessor.Status.CLAIMED));
    }

    // ─── M9 DisputeManager integration ──────────────────────────────────

    function test_openDispute_opensCaseInDisputeManager_whenWired() public {
        DisputeManager dm = new DisputeManager(operator);
        // Operator (= this test contract) sets the CashoutOrderProcessor as a
        // trusted caller so it can open cases on behalf of vendors.
        dm.setTrustedCaller(address(proc), true);
        proc.setDisputes(dm);

        _request();
        vm.prank(operator);
        proc.claimByLP(CO_ID, LP_ID);
        vm.prank(operator);
        proc.recordProof(CO_ID, _sampleProof());

        bytes32 evHash = keccak256("vendor evidence bundle");
        vm.prank(vendor);
        proc.openDispute(CO_ID, evHash);

        DisputeManager.Case memory c = dm.getCase(CO_ID);
        assertEq(uint8(c.status), uint8(DisputeManager.Status.OPENED));
        assertEq(c.claimant, vendor);
        assertEq(c.respondent, lpWallet);
        assertEq(c.openingEvidenceHash, evHash);
        // contextRefId mirrors the cashoutId
        assertEq(c.contextRefId, CO_ID);
    }

    function test_openDispute_skipsDisputeManager_whenNotWired() public {
        // disputes is null by default → openDispute should still work (legacy path)
        _request();
        vm.prank(operator);
        proc.claimByLP(CO_ID, LP_ID);
        vm.prank(vendor);
        proc.openDispute(CO_ID, bytes32(0));
        assertEq(uint8(proc.getOrder(CO_ID).status), uint8(CashoutOrderProcessor.Status.DISPUTED));
        assertEq(address(proc.disputes()), address(0));
    }
}
