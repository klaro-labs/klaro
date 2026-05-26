// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import { Test } from "forge-std/Test.sol";
import { VendorReputation } from "../src/VendorReputation.sol";
import { KlaroConfig } from "../src/KlaroConfig.sol";

contract VendorReputationTest is Test {
    VendorReputation rep;

    address operator = address(0xA11CE);
    address rando = address(0xBEEF);
    address consumer = address(0xC0FFEE);

    bytes32 constant V1 = keccak256("vendor-asha");
    bytes32 constant V2 = keccak256("vendor-other");

    function setUp() public {
        vm.chainId(KlaroConfig.ARC_TESTNET_CHAIN_ID);
        rep = new VendorReputation(operator);
    }

    function test_Operator_CanRecord() public {
        vm.prank(operator);
        uint256 id = rep.record(
            V1, VendorReputation.Kind.INVOICE_SETTLED, 10, keccak256("inv-1"), bytes32(0)
        );
        assertEq(id, 1);
        assertEq(rep.vendorEventCount(V1), 1);
    }

    function test_Rando_CannotRecord() public {
        vm.prank(rando);
        vm.expectRevert(VendorReputation.NotAuthorized.selector);
        rep.record(V1, VendorReputation.Kind.INVOICE_SETTLED, 10, bytes32(0), bytes32(0));
    }

    function test_TrustedCaller_CanRecord() public {
        // setTrustedCaller owner-only.
        rep.setTrustedCaller(consumer, true);
        vm.prank(consumer);
        rep.record(V1, VendorReputation.Kind.CASHOUT_RELEASED, 5, bytes32(0), bytes32(0));
        assertEq(rep.vendorEventCount(V1), 1);
    }

    function test_WeightZero_Reverts() public {
        vm.prank(operator);
        vm.expectRevert(VendorReputation.WeightZero.selector);
        rep.record(V1, VendorReputation.Kind.INVOICE_SETTLED, 0, bytes32(0), bytes32(0));
    }

    function test_RawScore_SumsWeights() public {
        vm.startPrank(operator);
        rep.record(V1, VendorReputation.Kind.INVOICE_SETTLED, 10, bytes32(0), bytes32(0));
        rep.record(V1, VendorReputation.Kind.CASHOUT_RELEASED, 5, bytes32(0), bytes32(0));
        rep.record(V1, VendorReputation.Kind.SLASH_PENALTY, -8, bytes32(0), bytes32(0));
        vm.stopPrank();
        (int256 sum, uint256 n) = rep.rawScore(V1);
        assertEq(sum, 7);
        assertEq(n, 3);
    }

    function test_VendorEventsPage_NewestFirst_AndPagination() public {
        vm.startPrank(operator);
        for (int32 i = 1; i <= 5; i++) {
            rep.record(
                V1,
                VendorReputation.Kind.INVOICE_SETTLED,
                i,
                bytes32(uint256(uint32(i))),
                bytes32(0)
            );
        }
        vm.stopPrank();
        (VendorReputation.Event[] memory page, uint256 total) = rep.vendorEventsPage(V1, 0, 3);
        assertEq(total, 5);
        assertEq(page.length, 3);
        // newest-first: weights should be 5, 4, 3
        assertEq(page[0].weight, 5);
        assertEq(page[1].weight, 4);
        assertEq(page[2].weight, 3);

        (page,) = rep.vendorEventsPage(V1, 3, 5);
        assertEq(page.length, 2);
        assertEq(page[0].weight, 2);
        assertEq(page[1].weight, 1);
    }

    function test_VendorsAreIsolated() public {
        vm.startPrank(operator);
        rep.record(V1, VendorReputation.Kind.INVOICE_SETTLED, 10, bytes32(0), bytes32(0));
        rep.record(V2, VendorReputation.Kind.SLASH_PENALTY, -5, bytes32(0), bytes32(0));
        vm.stopPrank();
        (int256 s1,) = rep.rawScore(V1);
        (int256 s2,) = rep.rawScore(V2);
        assertEq(s1, 10);
        assertEq(s2, -5);
    }

    function test_UntrustOnRevoke() public {
        // setTrustedCaller owner-only.
        rep.setTrustedCaller(consumer, true);
        rep.setTrustedCaller(consumer, false);
        vm.prank(consumer);
        vm.expectRevert(VendorReputation.NotAuthorized.selector);
        rep.record(V1, VendorReputation.Kind.INVOICE_SETTLED, 1, bytes32(0), bytes32(0));
    }
}
