// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import { Test } from "forge-std/Test.sol";
import { VendorReputation } from "../src/VendorReputation.sol";
import { KlaroConfig } from "../src/KlaroConfig.sol";

/// @notice close VendorReputation view
/// branch coverage from 40% (2/5). Existing tests probe `record` +
/// auth + pagination happy paths. Missing branches:
/// - `getEvent(0)` revert
/// - `getEvent(id > eventCount)` revert
/// - `vendorEventsPage` empty-page when offset >= total
/// - `vendorEventsPage` ternary: remaining < limit vs limit < remaining
contract VendorReputationViewsTest is Test {
    VendorReputation rep;
    address operator = address(0xC0FFEE);
    bytes32 vendor = keccak256("vendor-asha");

    function setUp() public {
        vm.chainId(KlaroConfig.ARC_TESTNET_CHAIN_ID);
        rep = new VendorReputation(operator);
    }

    function _seedFive() internal {
        vm.startPrank(operator);
        for (uint32 i = 1; i <= 5; i++) {
            rep.record(
                vendor,
                VendorReputation.Kind.INVOICE_SETTLED,
                int32(int256(uint256(i))),
                bytes32(uint256(i)),
                bytes32(0)
            );
        }
        vm.stopPrank();
    }

    function test_GetEvent_ZeroId_Reverts() public {
        vm.expectRevert(VendorReputation.UnknownEvent.selector);
        rep.getEvent(0);
    }

    function test_GetEvent_OutOfRange_Reverts() public {
        _seedFive();
        vm.expectRevert(VendorReputation.UnknownEvent.selector);
        rep.getEvent(999);
    }

    function test_GetEvent_Valid_ReturnsRow() public {
        _seedFive();
        VendorReputation.Event memory e = rep.getEvent(3);
        assertEq(e.vendorId, vendor);
        assertEq(int256(e.weight), 3);
    }

    function test_VendorEventsPage_OffsetBeyondTotal_ReturnsEmpty() public {
        _seedFive();
        (VendorReputation.Event[] memory page, uint256 total) = rep.vendorEventsPage(vendor, 99, 10);
        assertEq(page.length, 0);
        assertEq(total, 5);
    }

    function test_VendorEventsPage_RemainingSmallerThanLimit_TrimsToRemaining() public {
        _seedFive();
        // offset=3, total=5 → remaining=2, limit=10 → page.length should be 2
        (VendorReputation.Event[] memory page, uint256 total) = rep.vendorEventsPage(vendor, 3, 10);
        assertEq(page.length, 2);
        assertEq(total, 5);
    }

    function test_VendorEventsPage_LimitSmallerThanRemaining_TrimsToLimit() public {
        _seedFive();
        // offset=0, total=5 → remaining=5, limit=2 → page.length should be 2
        (VendorReputation.Event[] memory page, uint256 total) = rep.vendorEventsPage(vendor, 0, 2);
        assertEq(page.length, 2);
        assertEq(total, 5);
        // newest-first: id 5 then id 4
        assertEq(int256(page[0].weight), 5);
        assertEq(int256(page[1].weight), 4);
    }

    function test_VendorEventCount_UnknownVendor_ReturnsZero() public view {
        assertEq(rep.vendorEventCount(keccak256("nobody")), 0);
    }
}
