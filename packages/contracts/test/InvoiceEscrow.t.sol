// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import { Test } from "forge-std/Test.sol";
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import { InvoiceEscrow } from "../src/InvoiceEscrow.sol";
import { FeeSplitter } from "../src/FeeSplitter.sol";
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

contract InvoiceEscrowTest is Test {
    InvoiceEscrow escrow;
    FeeSplitter splitter;
    MockUSDC usdc;

    address vendor = address(0xA1);
    address operator = address(0xB2);
    uint256 buyerPk = 0xB0BB1E;
    address buyer = vm.addr(0xB0BB1E);

    bytes32 constant INV_ID = keccak256("inv-001");
    uint256 constant AMOUNT = 4_200_000_000;
    uint64 constant DUE_AT = 2_500_000_000;
    bytes32 constant META = keccak256("metadata-json");

    function setUp() public {
        vm.chainId(KlaroConfig.ARC_TESTNET_CHAIN_ID);
        splitter = new FeeSplitter(operator);
        escrow = new InvoiceEscrow(operator, splitter);
        usdc = new MockUSDC();
        usdc.mint(buyer, AMOUNT * 10);
        vm.prank(buyer);
        usdc.approve(address(escrow), type(uint256).max);
    }

    function _createInvoice() internal {
        vm.prank(vendor);
        escrow.createInvoice(INV_ID, address(usdc), AMOUNT, DUE_AT, META);
    }

    function _signAcceptance(bytes32 splitsHash) internal view returns (bytes memory) {
        bytes32 structHash = keccak256(
            abi.encode(
                escrow.ACCEPTANCE_TYPEHASH(),
                INV_ID,
                vendor,
                address(usdc),
                AMOUNT,
                DUE_AT,
                META,
                splitsHash
            )
        );
        bytes32 digest =
            keccak256(abi.encodePacked("\x19\x01", escrow.domainSeparator(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(buyerPk, digest);
        return abi.encodePacked(r, s, v);
    }

    function test_create_storesInvoice() public {
        _createInvoice();
        InvoiceEscrow.Invoice memory inv = escrow.getInvoice(INV_ID);
        assertEq(inv.vendor, vendor);
        assertEq(inv.amount, AMOUNT);
        assertEq(inv.splitsHash, bytes32(0));
        assertEq(uint8(inv.status), uint8(InvoiceEscrow.Status.CREATED));
    }

    function test_create_zeroAmount_reverts() public {
        vm.expectRevert(InvoiceEscrow.AmountZero.selector);
        vm.prank(vendor);
        escrow.createInvoice(INV_ID, address(usdc), 0, DUE_AT, META);
    }

    function test_create_duplicate_reverts() public {
        _createInvoice();
        vm.expectRevert(InvoiceEscrow.AlreadyExists.selector);
        vm.prank(vendor);
        escrow.createInvoice(INV_ID, address(usdc), AMOUNT, DUE_AT, META);
    }

    function test_acceptAndPay_validSig_advancesToPaid_andTransfersFunds() public {
        _createInvoice();
        uint256 escrowBefore = usdc.balanceOf(address(escrow));
        uint256 buyerBefore = usdc.balanceOf(buyer);

        bytes memory sig = _signAcceptance(bytes32(0));
        escrow.acceptAndPay(INV_ID, sig, buyer);

        assertEq(usdc.balanceOf(address(escrow)), escrowBefore + AMOUNT);
        assertEq(usdc.balanceOf(buyer), buyerBefore - AMOUNT);

        InvoiceEscrow.Invoice memory inv = escrow.getInvoice(INV_ID);
        assertEq(inv.acceptedBy, buyer);
        assertGt(inv.acceptedAt, 0);
        assertEq(uint8(inv.status), uint8(InvoiceEscrow.Status.PAID));
    }

    function test_acceptAndPay_badSig_reverts_andRefundsNothing() public {
        _createInvoice();

        bytes32 structHash = keccak256(
            abi.encode(
                escrow.ACCEPTANCE_TYPEHASH(),
                INV_ID,
                vendor,
                address(usdc),
                AMOUNT,
                DUE_AT,
                META,
                bytes32(0)
            )
        );
        bytes32 digest =
            keccak256(abi.encodePacked("\x19\x01", escrow.domainSeparator(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(0xDEAD, digest);
        bytes memory badSig = abi.encodePacked(r, s, v);

        uint256 escrowBefore = usdc.balanceOf(address(escrow));
        vm.expectRevert(InvoiceEscrow.BadAcceptanceSig.selector);
        escrow.acceptAndPay(INV_ID, badSig, buyer);
        assertEq(usdc.balanceOf(address(escrow)), escrowBefore, "balance must not move on bad sig");
    }

    function test_settle_movesFundsToVendor_andEmits() public {
        _createInvoice();
        bytes memory sig = _signAcceptance(bytes32(0));
        escrow.acceptAndPay(INV_ID, sig, buyer);

        // settle now requires screening recorded first.
        vm.prank(operator);
        escrow.recordScreening(INV_ID, keccak256("screening-passed"));

        uint256 vendorBefore = usdc.balanceOf(vendor);
        vm.expectEmit(true, true, false, true, address(escrow));
        emit InvoiceEscrow.InvoiceSettled(INV_ID, vendor, AMOUNT);
        vm.prank(operator);
        escrow.settle(INV_ID);

        assertEq(usdc.balanceOf(vendor), vendorBefore + AMOUNT);
        assertEq(uint8(escrow.getInvoice(INV_ID).status), uint8(InvoiceEscrow.Status.SETTLED));
    }

    function test_settle_nonOperator_reverts() public {
        _createInvoice();
        bytes memory sig = _signAcceptance(bytes32(0));
        escrow.acceptAndPay(INV_ID, sig, buyer);

        vm.expectRevert(InvoiceEscrow.OnlyOperator.selector);
        escrow.settle(INV_ID);
    }

    function test_cancel_byVendor_works_byOther_reverts() public {
        _createInvoice();

        vm.expectRevert(abi.encodeWithSelector(InvoiceEscrow.WrongVendor.selector, vendor, buyer));
        vm.prank(buyer);
        escrow.cancelInvoice(INV_ID);

        vm.prank(vendor);
        escrow.cancelInvoice(INV_ID);

        assertEq(uint8(escrow.getInvoice(INV_ID).status), uint8(InvoiceEscrow.Status.CANCELLED));
    }

    function test_recordScreening_setsHash() public {
        _createInvoice();
        bytes memory sig = _signAcceptance(bytes32(0));
        escrow.acceptAndPay(INV_ID, sig, buyer);

        bytes32 sh = keccak256("screening-passed");
        vm.prank(operator);
        escrow.recordScreening(INV_ID, sh);

        assertEq(escrow.getInvoice(INV_ID).screeningHash, sh);
    }

    // ─── M7 splits-path tests ───────────────────────────────────────────

    function test_createWithSplits_storesAndHashesCorrectly() public {
        FeeSplitter.Split[] memory splits = new FeeSplitter.Split[](2);
        splits[0] = FeeSplitter.Split({ payee: vendor, bps: 9800 });
        splits[1] = FeeSplitter.Split({ payee: address(0xC0FFEE), bps: 200 });

        bytes32 expected = keccak256(abi.encode(splits));

        vm.prank(vendor);
        escrow.createInvoiceWithSplits(INV_ID, address(usdc), AMOUNT, DUE_AT, META, splits);

        InvoiceEscrow.Invoice memory inv = escrow.getInvoice(INV_ID);
        assertEq(inv.splitsHash, expected);
        FeeSplitter.Split[] memory stored = escrow.getSplits(INV_ID);
        assertEq(stored.length, 2);
        assertEq(stored[1].bps, 200);
    }

    function test_createWithSplits_rejectsBadSum() public {
        FeeSplitter.Split[] memory splits = new FeeSplitter.Split[](2);
        splits[0] = FeeSplitter.Split({ payee: vendor, bps: 5000 });
        splits[1] = FeeSplitter.Split({ payee: vendor, bps: 4000 });

        vm.prank(vendor);
        vm.expectRevert(abi.encodeWithSelector(InvoiceEscrow.BadSplitsSum.selector, 9000));
        escrow.createInvoiceWithSplits(INV_ID, address(usdc), AMOUNT, DUE_AT, META, splits);
    }

    function test_settleWithSplits_fansOutAtomically() public {
        address platform = address(0xDEAD);
        FeeSplitter.Split[] memory splits = new FeeSplitter.Split[](2);
        splits[0] = FeeSplitter.Split({ payee: vendor, bps: 9800 }); // vendor net
        splits[1] = FeeSplitter.Split({ payee: platform, bps: 200 }); // 2% marketplace
        bytes32 splitsHash = keccak256(abi.encode(splits));

        vm.prank(vendor);
        escrow.createInvoiceWithSplits(INV_ID, address(usdc), AMOUNT, DUE_AT, META, splits);

        bytes memory sig = _signAcceptance(splitsHash);
        escrow.acceptAndPay(INV_ID, sig, buyer);

        // settle now requires screening recorded first.
        vm.prank(operator);
        escrow.recordScreening(INV_ID, keccak256("screening-passed"));

        // distribute* on FeeSplitter is now allow-listed.
        // setTrustedCaller owner-only.
        splitter.setTrustedCaller(address(escrow), true);

        vm.prank(operator);
        escrow.settle(INV_ID);

        // vendor is the LAST entry → absorbs any dust. 200 bps of 4_200_000_000 = 84_000_000
        assertEq(usdc.balanceOf(platform), 84_000_000);
        assertEq(usdc.balanceOf(vendor), AMOUNT - 84_000_000);
        assertEq(usdc.balanceOf(address(escrow)), 0);
        assertEq(usdc.balanceOf(address(splitter)), 0);
        assertEq(uint8(escrow.getInvoice(INV_ID).status), uint8(InvoiceEscrow.Status.SETTLED));
    }

    // ─── ─────────────────────────────────────

    function test_settle_revertsWhenScreeningNotRecorded() public {
        _createInvoice();
        bytes memory sig = _signAcceptance(bytes32(0));
        escrow.acceptAndPay(INV_ID, sig, buyer);
        // No recordScreening — settle must revert.
        vm.prank(operator);
        vm.expectRevert(InvoiceEscrow.ScreeningNotRecorded.selector);
        escrow.settle(INV_ID);
    }

    function test_refund_revertsForNonRefundCaller() public {
        _createInvoice();
        bytes memory sig = _signAcceptance(bytes32(0));
        escrow.acceptAndPay(INV_ID, sig, buyer);
        vm.expectRevert(InvoiceEscrow.OnlyRefundCaller.selector);
        escrow.refund(INV_ID);
    }

    function test_refund_byAuthorizedCaller_atomicallyReturnsFundsToBuyer() public {
        _createInvoice();
        bytes memory sig = _signAcceptance(bytes32(0));
        escrow.acceptAndPay(INV_ID, sig, buyer);
        // Wire this test contract as the refund-caller.
        escrow.setRefundCaller(address(this));

        uint256 buyerBefore = usdc.balanceOf(buyer);
        escrow.refund(INV_ID);
        assertEq(usdc.balanceOf(buyer), buyerBefore + AMOUNT);
        assertEq(uint8(escrow.getInvoice(INV_ID).status), uint8(InvoiceEscrow.Status.REFUNDED));
    }

    function test_refund_revertsWhenNotPaid() public {
        _createInvoice();
        escrow.setRefundCaller(address(this));
        // Invoice is CREATED, not PAID — refund must revert.
        vm.expectRevert(
            abi.encodeWithSelector(
                InvoiceEscrow.InvalidStatus.selector,
                InvoiceEscrow.Status.PAID,
                InvoiceEscrow.Status.CREATED
            )
        );
        escrow.refund(INV_ID);
    }

    function test_acceptAndPayWithSplits_buyerMustSignSplitsHash() public {
        FeeSplitter.Split[] memory splits = new FeeSplitter.Split[](2);
        splits[0] = FeeSplitter.Split({ payee: vendor, bps: 9800 });
        splits[1] = FeeSplitter.Split({ payee: address(0xC0FFEE), bps: 200 });
        vm.prank(vendor);
        escrow.createInvoiceWithSplits(INV_ID, address(usdc), AMOUNT, DUE_AT, META, splits);

        // Buyer signs the OLD (no-splits) digest — must fail.
        bytes memory oldSig = _signAcceptance(bytes32(0));
        vm.expectRevert(InvoiceEscrow.BadAcceptanceSig.selector);
        escrow.acceptAndPay(INV_ID, oldSig, buyer);

        // Signing the correct splits hash works.
        bytes32 splitsHash = keccak256(abi.encode(splits));
        bytes memory goodSig = _signAcceptance(splitsHash);
        escrow.acceptAndPay(INV_ID, goodSig, buyer);
        assertEq(uint8(escrow.getInvoice(INV_ID).status), uint8(InvoiceEscrow.Status.PAID));
    }
}
