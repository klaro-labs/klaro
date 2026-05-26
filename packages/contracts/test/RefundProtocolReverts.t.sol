// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import { Test } from "forge-std/Test.sol";
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import { InvoiceEscrow } from "../src/InvoiceEscrow.sol";
import { RefundProtocol } from "../src/RefundProtocol.sol";
import { FeeSplitter } from "../src/FeeSplitter.sol";

/// @notice bump RefundProtocol branch
/// coverage from 33%. Existing happy-path + ExpiredAuthorization + BadVendorSig
/// + AlreadyRefunded + BuyerMismatch tests live in RefundProtocol.t.sol — this
/// file adds the remaining TokenMismatch + AmountMismatch + nonce-skew paths.
contract MockUSDC is ERC20 {
    constructor() ERC20("Mock USDC", "USDC") { }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amt) external {
        _mint(to, amt);
    }
}

contract RefundProtocolRevertsTest is Test {
    InvoiceEscrow escrow;
    RefundProtocol refunds;
    MockUSDC usdc;
    MockUSDC otherToken;

    uint256 vendorPk = 0xA11A11;
    address vendor = vm.addr(0xA11A11);
    address operator = address(0xB2);
    uint256 buyerPk = 0xB0BB0B;
    address buyer = vm.addr(0xB0BB0B);

    bytes32 constant INV_ID = keccak256("inv-refund-reverts");
    uint256 constant AMOUNT = 1_000_000; // 1 USDC
    uint64 constant DUE_AT = 2_500_000_000;
    bytes32 constant META = keccak256("meta");

    function setUp() public {
        vm.chainId(5_042_002);
        FeeSplitter splitter = new FeeSplitter(operator);
        escrow = new InvoiceEscrow(operator, splitter);
        refunds = new RefundProtocol(escrow);
        usdc = new MockUSDC();
        otherToken = new MockUSDC();
        escrow.setRefundCaller(address(refunds));

        usdc.mint(buyer, AMOUNT * 10);
        vm.prank(buyer);
        usdc.approve(address(escrow), type(uint256).max);

        vm.prank(vendor);
        escrow.createInvoice(INV_ID, address(usdc), AMOUNT, DUE_AT, META);

        bytes32 ah = keccak256(
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
        bytes32 ad = keccak256(abi.encodePacked("\x19\x01", escrow.domainSeparator(), ah));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(buyerPk, ad);
        escrow.acceptAndPay(INV_ID, abi.encodePacked(r, s, v), buyer);
    }

    function _signRefund(address tokenArg, uint256 amountArg, uint64 expiresAt, uint256 nonce)
        internal
        view
        returns (bytes memory)
    {
        bytes32 h = keccak256(
            abi.encode(
                refunds.REFUND_TYPEHASH(),
                INV_ID,
                vendor,
                buyer,
                tokenArg,
                amountArg,
                expiresAt,
                nonce
            )
        );
        bytes32 d = keccak256(abi.encodePacked("\x19\x01", refunds.domainSeparator(), h));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(vendorPk, d);
        return abi.encodePacked(r, s, v);
    }

    function test_executeRefund_TokenMismatch_Reverts() public {
        uint64 exp = uint64(block.timestamp + 1 hours);
        bytes memory sig = _signRefund(address(otherToken), AMOUNT, exp, 0);
        vm.expectRevert(
            abi.encodeWithSelector(
                RefundProtocol.TokenMismatch.selector, address(usdc), address(otherToken)
            )
        );
        refunds.executeRefund(INV_ID, vendor, buyer, address(otherToken), AMOUNT, exp, 0, sig);
    }

    function test_executeRefund_AmountMismatch_Reverts() public {
        uint64 exp = uint64(block.timestamp + 1 hours);
        uint256 wrongAmount = AMOUNT + 1;
        bytes memory sig = _signRefund(address(usdc), wrongAmount, exp, 0);
        vm.expectRevert(
            abi.encodeWithSelector(RefundProtocol.AmountMismatch.selector, AMOUNT, wrongAmount)
        );
        refunds.executeRefund(INV_ID, vendor, buyer, address(usdc), wrongAmount, exp, 0, sig);
    }

    function test_executeRefund_NonceSkew_RevertsAsBadSig() public {
        // nonce out-of-order — refunded[id]=false but nonces[vendor] != 5.
        uint64 exp = uint64(block.timestamp + 1 hours);
        bytes memory sig = _signRefund(address(usdc), AMOUNT, exp, 5);
        vm.expectRevert(RefundProtocol.BadVendorSig.selector);
        refunds.executeRefund(INV_ID, vendor, buyer, address(usdc), AMOUNT, exp, 5, sig);
    }
}
