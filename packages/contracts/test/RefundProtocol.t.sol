// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import { Test } from "forge-std/Test.sol";
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import { InvoiceEscrow } from "../src/InvoiceEscrow.sol";
import { RefundProtocol } from "../src/RefundProtocol.sol";
import { FeeSplitter } from "../src/FeeSplitter.sol";

contract MockUSDC is ERC20 {
    constructor() ERC20("Mock USDC", "USDC") { }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amt) external {
        _mint(to, amt);
    }
}

contract RefundProtocolTest is Test {
    InvoiceEscrow escrow;
    RefundProtocol refundProto;
    MockUSDC usdc;

    uint256 vendorPk = 0xA1A2A3;
    address vendor = vm.addr(0xA1A2A3);
    address operator = address(0xB2);
    uint256 buyerPk = 0xB0BB1E;
    address buyer = vm.addr(0xB0BB1E);

    bytes32 constant INV_ID = keccak256("inv-refund-001");
    uint256 constant AMOUNT = 4_200_000_000; // 4,200 USDC (6 dec)
    uint64 constant DUE_AT = 2_500_000_000;
    bytes32 constant META = keccak256("metadata-json");

    function setUp() public {
        vm.chainId(5_042_002);
        FeeSplitter splitter = new FeeSplitter(operator);
        escrow = new InvoiceEscrow(operator, splitter);
        refundProto = new RefundProtocol(escrow);
        usdc = new MockUSDC();
        // refund is now atomic on-chain; the
        // RefundProtocol address must be wired as the escrow's refund-caller.
        escrow.setRefundCaller(address(refundProto));

        // Seed buyer + approval, create + accept-and-pay invoice
        usdc.mint(buyer, AMOUNT * 10);
        vm.prank(buyer);
        usdc.approve(address(escrow), type(uint256).max);

        vm.prank(vendor);
        escrow.createInvoice(INV_ID, address(usdc), AMOUNT, DUE_AT, META);

        bytes memory acceptSig = _signAcceptance();
        escrow.acceptAndPay(INV_ID, acceptSig, buyer);
    }

    // ─── helpers ────────────────────────────────────────────────────────

    function _signAcceptance() internal view returns (bytes memory) {
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
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(buyerPk, digest);
        return abi.encodePacked(r, s, v);
    }

    function _signRefund(bytes32 invoiceId, uint64 expiresAt, uint256 nonce, uint256 signerPk)
        internal
        view
        returns (bytes memory)
    {
        bytes32 structHash = keccak256(
            abi.encode(
                refundProto.REFUND_TYPEHASH(),
                invoiceId,
                vendor,
                buyer,
                address(usdc),
                AMOUNT,
                expiresAt,
                nonce
            )
        );
        bytes32 digest =
            keccak256(abi.encodePacked("\x19\x01", refundProto.domainSeparator(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerPk, digest);
        return abi.encodePacked(r, s, v);
    }

    // ─── tests ──────────────────────────────────────────────────────────

    function test_executeRefund_validSig_marksRefunded_andBumpsNonce() public {
        uint64 expiresAt = uint64(block.timestamp + 1 hours);
        bytes memory sig = _signRefund(INV_ID, expiresAt, 0, vendorPk);

        vm.expectEmit(true, true, true, true, address(refundProto));
        emit RefundProtocol.RefundExecuted(INV_ID, vendor, buyer, AMOUNT, 0);
        refundProto.executeRefund(INV_ID, vendor, buyer, address(usdc), AMOUNT, expiresAt, 0, sig);

        assertTrue(refundProto.refunded(INV_ID));
        assertEq(refundProto.nonces(vendor), 1);
    }

    function test_executeRefund_expired_reverts() public {
        uint64 expiresAt = uint64(block.timestamp - 1); // already past
        bytes memory sig = _signRefund(INV_ID, expiresAt, 0, vendorPk);

        vm.expectRevert(
            abi.encodeWithSelector(
                RefundProtocol.ExpiredAuthorization.selector, expiresAt, uint64(block.timestamp)
            )
        );
        refundProto.executeRefund(INV_ID, vendor, buyer, address(usdc), AMOUNT, expiresAt, 0, sig);
    }

    function test_executeRefund_wrongSigner_reverts() public {
        uint64 expiresAt = uint64(block.timestamp + 1 hours);
        // Sign with buyer's pk instead of vendor's
        bytes memory sig = _signRefund(INV_ID, expiresAt, 0, buyerPk);

        vm.expectRevert(RefundProtocol.BadVendorSig.selector);
        refundProto.executeRefund(INV_ID, vendor, buyer, address(usdc), AMOUNT, expiresAt, 0, sig);
    }

    function test_executeRefund_replay_reverts() public {
        uint64 expiresAt = uint64(block.timestamp + 1 hours);
        bytes memory sig = _signRefund(INV_ID, expiresAt, 0, vendorPk);

        refundProto.executeRefund(INV_ID, vendor, buyer, address(usdc), AMOUNT, expiresAt, 0, sig);

        vm.expectRevert(abi.encodeWithSelector(RefundProtocol.AlreadyRefunded.selector, INV_ID));
        refundProto.executeRefund(INV_ID, vendor, buyer, address(usdc), AMOUNT, expiresAt, 0, sig);
    }

    function test_executeRefund_buyerMismatch_reverts() public {
        uint64 expiresAt = uint64(block.timestamp + 1 hours);
        address wrongBuyer = address(0xDEAD);

        // Sign for the wrong-buyer payload so the recovered signer matches
        // vendor — we want to exercise the buyer-mismatch error, not bad-sig.
        bytes32 structHash = keccak256(
            abi.encode(
                refundProto.REFUND_TYPEHASH(),
                INV_ID,
                vendor,
                wrongBuyer,
                address(usdc),
                AMOUNT,
                expiresAt,
                uint256(0)
            )
        );
        bytes32 digest =
            keccak256(abi.encodePacked("\x19\x01", refundProto.domainSeparator(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(vendorPk, digest);
        bytes memory sig = abi.encodePacked(r, s, v);

        vm.expectRevert(
            abi.encodeWithSelector(RefundProtocol.BuyerMismatch.selector, buyer, wrongBuyer)
        );
        refundProto.executeRefund(
            INV_ID, vendor, wrongBuyer, address(usdc), AMOUNT, expiresAt, 0, sig
        );
    }
}
