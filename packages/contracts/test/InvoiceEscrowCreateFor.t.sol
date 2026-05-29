// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import { Test } from "forge-std/Test.sol";
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import { InvoiceEscrow } from "../src/InvoiceEscrow.sol";
import { FeeSplitter } from "../src/FeeSplitter.sol";
import { KlaroConfig } from "../src/KlaroConfig.sol";

contract MockUSDC is ERC20 {
    constructor() ERC20("Mock USDC", "USDC") { }
    function decimals() public pure override returns (uint8) { return 6; }
    function mint(address to, uint256 amt) external { _mint(to, amt); }
}

/// Klaro Link on-chain path: a vendor signs a LinkInvoiceAuthorization once;
/// the operator (a relayer != vendor) publishes each link-payment's invoice via
/// createInvoiceFor. Funds must always settle to the vendor.
contract InvoiceEscrowCreateForTest is Test {
    InvoiceEscrow escrow;
    FeeSplitter splitter;
    MockUSDC usdc;

    uint256 vendorPk = 0xC0FFEE;
    address vendor = vm.addr(0xC0FFEE);
    address operator = address(0xB2);    // Klaro operator = the relayer
    address relayer = address(0xCAFE);   // anyone may publish with the vendor's sig
    uint256 buyerPk = 0xB0BB1E;
    address buyer = vm.addr(0xB0BB1E);

    address token;
    uint256 constant AMOUNT = 50_000_000; // 50 USDC (6-dec)
    uint64 constant DUE_AT = 2_500_000_000;
    bytes32 constant META = keccak256("link-meta");
    bytes32 constant LINK_ID = keccak256("link.Re7aPmK2");
    uint64 deadline;

    function setUp() public {
        vm.chainId(KlaroConfig.ARC_TESTNET_CHAIN_ID);
        splitter = new FeeSplitter(operator);
        escrow = new InvoiceEscrow(operator, splitter);
        usdc = new MockUSDC();
        token = address(usdc);
        usdc.mint(buyer, AMOUNT * 10);
        vm.prank(buyer);
        usdc.approve(address(escrow), type(uint256).max);
        deadline = uint64(block.timestamp + 30 days);
    }

    function _signLinkAuth(uint256 pk, address tok, uint256 amount, bytes32 linkId, uint64 dl)
        internal view returns (bytes memory)
    {
        bytes32 structHash = keccak256(
            abi.encode(escrow.LINK_INVOICE_AUTH_TYPEHASH(), vm.addr(pk), tok, amount, linkId, dl)
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", escrow.domainSeparator(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        return abi.encodePacked(r, s, v);
    }

    function _signAcceptance(bytes32 invoiceId, address invVendor) internal view returns (bytes memory) {
        bytes32 structHash = keccak256(
            abi.encode(escrow.ACCEPTANCE_TYPEHASH(), invoiceId, invVendor, token, AMOUNT, DUE_AT, META, bytes32(0))
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", escrow.domainSeparator(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(buyerPk, digest);
        return abi.encodePacked(r, s, v);
    }

    function test_createInvoiceFor_validAuth_setsVendorFromSig_notSender() public {
        bytes32 invId = keccak256("inv-A");
        bytes memory auth = _signLinkAuth(vendorPk, token, AMOUNT, LINK_ID, deadline);
        // relayer (not the vendor) publishes
        vm.prank(relayer);
        escrow.createInvoiceFor(invId, vendor, token, AMOUNT, DUE_AT, META, LINK_ID, deadline, auth);
        InvoiceEscrow.Invoice memory inv = escrow.getInvoice(invId);
        assertEq(inv.vendor, vendor, "vendor must be the signer, not msg.sender");
        assertEq(inv.amount, AMOUNT);
        assertEq(uint8(inv.status), uint8(InvoiceEscrow.Status.CREATED));
    }

    function test_createInvoiceFor_badAuth_reverts() public {
        bytes32 invId = keccak256("inv-bad");
        // signed by the WRONG key (buyer), claiming to be the vendor
        bytes memory auth = _signLinkAuth(buyerPk, token, AMOUNT, LINK_ID, deadline);
        vm.prank(relayer);
        vm.expectRevert(InvoiceEscrow.BadVendorAuth.selector);
        escrow.createInvoiceFor(invId, vendor, token, AMOUNT, DUE_AT, META, LINK_ID, deadline, auth);
    }

    function test_createInvoiceFor_tamperedTerms_reverts() public {
        bytes32 invId = keccak256("inv-tamper");
        bytes memory auth = _signLinkAuth(vendorPk, token, AMOUNT, LINK_ID, deadline);
        // publish with a DIFFERENT amount than was authorized
        vm.prank(relayer);
        vm.expectRevert(InvoiceEscrow.BadVendorAuth.selector);
        escrow.createInvoiceFor(invId, vendor, token, AMOUNT + 1, DUE_AT, META, LINK_ID, deadline, auth);
    }

    function test_createInvoiceFor_wrongLinkId_reverts() public {
        bytes32 invId = keccak256("inv-link");
        bytes memory auth = _signLinkAuth(vendorPk, token, AMOUNT, LINK_ID, deadline);
        vm.prank(relayer);
        vm.expectRevert(InvoiceEscrow.BadVendorAuth.selector);
        escrow.createInvoiceFor(invId, vendor, token, AMOUNT, DUE_AT, META, keccak256("other-link"), deadline, auth);
    }

    function test_createInvoiceFor_expired_reverts() public {
        bytes32 invId = keccak256("inv-exp");
        uint64 past = uint64(block.timestamp - 1);
        bytes memory auth = _signLinkAuth(vendorPk, token, AMOUNT, LINK_ID, past);
        vm.prank(relayer);
        vm.expectRevert(InvoiceEscrow.AuthExpired.selector);
        escrow.createInvoiceFor(invId, vendor, token, AMOUNT, DUE_AT, META, LINK_ID, past, auth);
    }

    function test_createInvoiceFor_zeroVendor_reverts() public {
        bytes32 invId = keccak256("inv-zero");
        bytes memory auth = _signLinkAuth(vendorPk, token, AMOUNT, LINK_ID, deadline);
        vm.prank(relayer);
        vm.expectRevert(InvoiceEscrow.ZeroAddress.selector);
        escrow.createInvoiceFor(invId, address(0), token, AMOUNT, DUE_AT, META, LINK_ID, deadline, auth);
    }

    function test_createInvoiceFor_reusable_acrossMultiplePayments() public {
        // ONE authorization, TWO different invoiceIds (the link is multi-pay).
        bytes memory auth = _signLinkAuth(vendorPk, token, AMOUNT, LINK_ID, deadline);
        bytes32 inv1 = keccak256("inv-1");
        bytes32 inv2 = keccak256("inv-2");
        vm.prank(relayer);
        escrow.createInvoiceFor(inv1, vendor, token, AMOUNT, DUE_AT, META, LINK_ID, deadline, auth);
        vm.prank(relayer);
        escrow.createInvoiceFor(inv2, vendor, token, AMOUNT, DUE_AT, META, LINK_ID, deadline, auth);
        assertEq(escrow.getInvoice(inv1).vendor, vendor);
        assertEq(escrow.getInvoice(inv2).vendor, vendor);
    }

    function test_createInvoiceFor_duplicateId_reverts() public {
        bytes32 invId = keccak256("inv-dup");
        bytes memory auth = _signLinkAuth(vendorPk, token, AMOUNT, LINK_ID, deadline);
        vm.prank(relayer);
        escrow.createInvoiceFor(invId, vendor, token, AMOUNT, DUE_AT, META, LINK_ID, deadline, auth);
        vm.prank(relayer);
        vm.expectRevert(InvoiceEscrow.AlreadyExists.selector);
        escrow.createInvoiceFor(invId, vendor, token, AMOUNT, DUE_AT, META, LINK_ID, deadline, auth);
    }

    /// The critical end-to-end guarantee: a RELAYED publish still pays the VENDOR.
    function test_createInvoiceFor_thenAcceptAndPay_fundsToEscrowForVendor() public {
        bytes32 invId = keccak256("inv-e2e");
        bytes memory auth = _signLinkAuth(vendorPk, token, AMOUNT, LINK_ID, deadline);
        vm.prank(relayer);
        escrow.createInvoiceFor(invId, vendor, token, AMOUNT, DUE_AT, META, LINK_ID, deadline, auth);

        uint256 escrowBefore = usdc.balanceOf(address(escrow));
        bytes memory acc = _signAcceptance(invId, vendor);
        escrow.acceptAndPay(invId, acc, buyer);

        InvoiceEscrow.Invoice memory inv = escrow.getInvoice(invId);
        assertEq(inv.vendor, vendor);
        assertEq(inv.acceptedBy, buyer);
        assertEq(uint8(inv.status), uint8(InvoiceEscrow.Status.PAID));
        assertEq(usdc.balanceOf(address(escrow)), escrowBefore + AMOUNT);

        // operator settles → vendor receives the funds
        vm.prank(operator);
        escrow.recordScreening(invId, keccak256("clean"));
        vm.prank(operator);
        escrow.settle(invId);
        assertEq(usdc.balanceOf(vendor), AMOUNT, "settlement must pay the vendor, not the relayer");
        assertEq(uint8(escrow.getInvoice(invId).status), uint8(InvoiceEscrow.Status.SETTLED));
    }
}
