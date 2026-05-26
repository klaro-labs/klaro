// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import { Test } from "forge-std/Test.sol";
import { AuditReceipt } from "../src/AuditReceipt.sol";

contract AuditReceiptTest is Test {
    AuditReceipt receipt;
    address vendor = address(0xA1);
    address operator = address(0xB2);
    address other = address(0xC3);

    function setUp() public {
        vm.chainId(5_042_002);
        receipt = new AuditReceipt(operator);
    }

    function _sampleAnchor() internal view returns (AuditReceipt.Anchor memory a) {
        a = AuditReceipt.Anchor({
            invoiceId: keccak256("inv-001"),
            invoiceHash: keccak256("invoice-json"),
            acceptanceHash: keccak256("eip712-sig"),
            screeningHash: keccak256("screen-pass"),
            settlementTx: keccak256("settle-tx"),
            settledAt: uint64(block.timestamp),
            sourceChainId: 5_042_002,
            vendor: vendor
        });
    }

    function test_mint_byOperator_mintsToVendor_andEmits() public {
        AuditReceipt.Anchor memory a = _sampleAnchor();

        vm.prank(operator);
        (uint256 tokenId, bytes32 hash_) = receipt.mint(a);

        assertEq(receipt.ownerOf(tokenId), vendor);
        assertEq(receipt.receiptOf(hash_), tokenId);
        assertTrue(receipt.verify(hash_));
    }

    function test_mint_byNonOperator_reverts() public {
        AuditReceipt.Anchor memory a = _sampleAnchor();
        vm.expectRevert(AuditReceipt.OnlyOperator.selector);
        vm.prank(other);
        receipt.mint(a);
    }

    function test_mint_duplicate_reverts() public {
        AuditReceipt.Anchor memory a = _sampleAnchor();
        vm.prank(operator);
        receipt.mint(a);
        vm.expectRevert(AuditReceipt.AlreadyMinted.selector);
        vm.prank(operator);
        receipt.mint(a);
    }

    function test_anchorOf_unknown_returnsZeroStruct() public view {
        AuditReceipt.Anchor memory a = receipt.anchorOf(keccak256("missing"));
        assertEq(a.invoiceId, bytes32(0));
        assertEq(a.vendor, address(0));
    }

    function test_soulbound_transferReverts() public {
        AuditReceipt.Anchor memory a = _sampleAnchor();
        vm.prank(operator);
        (uint256 tokenId,) = receipt.mint(a);

        vm.expectRevert(AuditReceipt.Soulbound.selector);
        vm.prank(vendor);
        receipt.transferFrom(vendor, other, tokenId);
    }
}
