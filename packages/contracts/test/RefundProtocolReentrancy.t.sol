// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import { Test } from "forge-std/Test.sol";
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import { InvoiceEscrow } from "../src/InvoiceEscrow.sol";
import { FeeSplitter } from "../src/FeeSplitter.sol";
import { RefundProtocol } from "../src/RefundProtocol.sol";
import { KlaroConfig } from "../src/KlaroConfig.sol";

/// @notice finding #25: RefundProtocol previously lacked
/// a reentrancy harness. The refund path moves USDC via
/// `escrow.refund() → IERC20.safeTransfer(buyer)`. A hostile token can
/// re-enter `executeRefund` during transfer. The `refunded[invoiceId]`
/// guard set BEFORE `escrow.refund()` collapses the second call to
/// AlreadyRefunded; we still want the ReentrancyGuard belt + the
/// guard suspenders to hold together.
contract HostileToken is ERC20 {
    address public target;
    bytes public reentryArgs;
    bool public armed;

    constructor() ERC20("Hostile", "EVIL") { }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amt) external {
        _mint(to, amt);
    }

    function arm(address t, bytes calldata args) external {
        target = t;
        reentryArgs = args;
        armed = true;
    }

    function transfer(address to, uint256 amt) public override returns (bool) {
        if (armed) {
            armed = false;
            (bool ok,) = target.call(reentryArgs);
            require(!ok, "reentry should have reverted");
        }
        return super.transfer(to, amt);
    }
}

contract RefundProtocolReentrancyTest is Test {
    InvoiceEscrow esc;
    FeeSplitter splitter;
    RefundProtocol refunds;
    HostileToken hostile;

    uint256 vendorPk = 0xA11CE;
    address vendor;
    uint256 buyerPk = 0xB0B;
    address buyer;
    address operator = address(0xCAFE);

    bytes32 constant INVOICE_ID = keccak256("refund-reentry");
    uint256 constant AMOUNT = 100 * 10 ** 6;

    function setUp() public {
        vm.chainId(KlaroConfig.ARC_TESTNET_CHAIN_ID);
        vendor = vm.addr(vendorPk);
        buyer = vm.addr(buyerPk);

        splitter = new FeeSplitter(operator);
        esc = new InvoiceEscrow(operator, splitter);
        refunds = new RefundProtocol(esc);
        hostile = new HostileToken();

        // setTrustedCaller owner-only.
        splitter.setTrustedCaller(address(esc), true);
        esc.setRefundCaller(address(refunds));

        // Create + accept + pay so the invoice sits in PAID.
        vm.prank(vendor);
        esc.createInvoice(
            INVOICE_ID,
            address(hostile),
            AMOUNT,
            uint64(block.timestamp + 7 days),
            keccak256("meta")
        );

        hostile.mint(buyer, AMOUNT * 2);
        vm.prank(buyer);
        hostile.approve(address(esc), type(uint256).max);

        bytes32 typeHash = esc.ACCEPTANCE_TYPEHASH();
        bytes32 structHash = keccak256(
            abi.encode(
                typeHash,
                INVOICE_ID,
                vendor,
                address(hostile),
                AMOUNT,
                uint64(block.timestamp + 7 days),
                keccak256("meta"),
                bytes32(0)
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", esc.domainSeparator(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(buyerPk, digest);
        vm.prank(buyer);
        esc.acceptAndPay(INVOICE_ID, abi.encodePacked(r, s, v), buyer);
    }

    struct RefundArgs {
        bytes32 invoiceId;
        address vendor;
        address buyer;
        address token;
        uint256 amount;
        uint64 exp;
        uint256 nonce;
        bytes sig;
    }

    function _signRefund() internal view returns (RefundArgs memory a) {
        a.invoiceId = INVOICE_ID;
        a.vendor = vendor;
        a.buyer = buyer;
        a.token = address(hostile);
        a.amount = AMOUNT;
        a.exp = uint64(block.timestamp + 1 hours);
        a.nonce = refunds.nonces(vendor);
        bytes32 structHash = keccak256(
            abi.encode(
                refunds.REFUND_TYPEHASH(),
                a.invoiceId,
                a.vendor,
                a.buyer,
                a.token,
                a.amount,
                a.exp,
                a.nonce
            )
        );
        bytes32 digest =
            keccak256(abi.encodePacked("\x19\x01", refunds.domainSeparator(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(vendorPk, digest);
        a.sig = abi.encodePacked(r, s, v);
    }

    function _callRefund(RefundArgs memory a) internal {
        refunds.executeRefund(
            a.invoiceId, a.vendor, a.buyer, a.token, a.amount, a.exp, a.nonce, a.sig
        );
    }

    function test_Refund_BlocksReentrantCall() public {
        RefundArgs memory a = _signRefund();

        bytes memory reentryCall = abi.encodeWithSelector(
            RefundProtocol.executeRefund.selector,
            a.invoiceId,
            a.vendor,
            a.buyer,
            a.token,
            a.amount,
            a.exp,
            a.nonce,
            a.sig
        );
        hostile.arm(address(refunds), reentryCall);

        // If the outer call completes, the hostile token's `require(!ok)`
        // succeeded — proving the re-entrant call into executeRefund reverted.
        uint256 buyerBefore = hostile.balanceOf(buyer);
        _callRefund(a);

        assertEq(hostile.balanceOf(buyer) - buyerBefore, AMOUNT, "refunded exactly once");
        assertEq(hostile.balanceOf(address(esc)), 0, "escrow drained");
        assertTrue(refunds.refunded(INVOICE_ID), "refunded flag set");
    }
}
