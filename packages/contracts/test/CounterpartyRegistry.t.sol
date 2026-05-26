// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import { Test } from "forge-std/Test.sol";
import { CounterpartyRegistry } from "../src/CounterpartyRegistry.sol";
import { KlaroConfig } from "../src/KlaroConfig.sol";

contract CounterpartyRegistryTest is Test {
    CounterpartyRegistry reg;
    address operator = address(0xC0FFEE);
    address buyer = address(0xBEEF);
    bytes32 bundleHash = keccak256("bundle:v1");
    bytes32 reason = keccak256("klaro.reason.HOLD_SCREENING_FAIL");

    function setUp() public {
        vm.chainId(KlaroConfig.ARC_TESTNET_CHAIN_ID);
        reg = new CounterpartyRegistry(operator);
    }

    function test_CacheDecision_StoredAndAllowedWhenFresh() public {
        vm.prank(operator);
        reg.cacheDecision(buyer, bundleHash, 1 hours, true);
        assertTrue(reg.isAllowed(buyer));
        assertFalse(reg.isStale(buyer));
    }

    function test_CacheDecision_StaleAfterTtl() public {
        vm.prank(operator);
        reg.cacheDecision(buyer, bundleHash, 1 minutes, true);
        vm.warp(block.timestamp + 2 minutes);
        assertFalse(reg.isAllowed(buyer));
        assertTrue(reg.isStale(buyer));
    }

    function test_CacheDecision_FailedScreen_NotAllowed() public {
        vm.prank(operator);
        reg.cacheDecision(buyer, bundleHash, 1 hours, false);
        assertFalse(reg.isAllowed(buyer));
    }

    function test_Deny_BlocksEvenWhenCachePass() public {
        vm.prank(operator);
        reg.cacheDecision(buyer, bundleHash, 1 hours, true);
        vm.prank(operator);
        reg.deny(buyer, reason);
        assertFalse(reg.isAllowed(buyer));
    }

    // regression: undeny now CLEARS the cached decision
    // so the buyer needs a fresh 3-of-3 screen before re-allowance.
    // Previously the cached pass survived deny→undeny, defeating the
    // very reason undeny exists.
    function test_Undeny_ClearsCachedDecision() public {
        vm.prank(operator);
        reg.cacheDecision(buyer, bundleHash, 1 hours, true);
        vm.prank(operator);
        reg.deny(buyer, reason);
        vm.prank(operator);
        reg.undeny(buyer, keccak256("klaro.reason.OTHER"));
        // Cache was cleared — buyer is "unknown" until re-screened.
        assertFalse(reg.isAllowed(buyer));
        // Fresh cache restores allowance.
        vm.prank(operator);
        reg.cacheDecision(buyer, bundleHash, 1 hours, true);
        assertTrue(reg.isAllowed(buyer));
    }

    function test_RequireAllowed_Reverts_OnDeny() public {
        vm.prank(operator);
        reg.deny(buyer, reason);
        vm.expectRevert(CounterpartyRegistry.Denied.selector);
        reg.requireAllowed(buyer);
    }

    function test_RequireAllowed_Reverts_OnStale() public {
        vm.expectRevert(CounterpartyRegistry.UnknownBuyer.selector);
        reg.requireAllowed(buyer);
    }

    function test_NonOperator_CannotCache() public {
        vm.expectRevert(CounterpartyRegistry.NotOperator.selector);
        reg.cacheDecision(buyer, bundleHash, 1 hours, true);
    }
}
