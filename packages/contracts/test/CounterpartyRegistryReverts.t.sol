// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import { Test } from "forge-std/Test.sol";
import { CounterpartyRegistry } from "../src/CounterpartyRegistry.sol";
import { KlaroConfig } from "../src/KlaroConfig.sol";

/// @notice bump CounterpartyRegistry
/// branch coverage from 23% (3/13) toward 70%+. Existing
/// CounterpartyRegistry.t.sol covers the happy path + a couple of
/// reverts. This file targets every uncovered branch: zero-address
/// guards, TTL floor clamping, owner-only mutators, default-TTL
/// fallback, `requireAllowed` failed-screen path, and the
/// no-decision branch in `isAllowed`/`isStale`.
contract CounterpartyRegistryRevertsTest is Test {
    CounterpartyRegistry reg;
    address operator = address(0xC0FFEE);
    address owner;
    address buyer = address(0xBEEF);
    bytes32 bundleHash = keccak256("bundle:v1");
    bytes32 reason = keccak256("klaro.reason.HOLD_SCREENING_FAIL");

    function setUp() public {
        vm.chainId(KlaroConfig.ARC_TESTNET_CHAIN_ID);
        owner = address(this);
        reg = new CounterpartyRegistry(operator);
    }

    // ─── constructor ─────────────────────────────────────────────────

    function test_Constructor_ZeroAddress_Reverts() public {
        vm.expectRevert(CounterpartyRegistry.ZeroAddress.selector);
        new CounterpartyRegistry(address(0));
    }

    // ─── cacheDecision ───────────────────────────────────────────────

    function test_CacheDecision_ZeroAddressBuyer_Reverts() public {
        vm.prank(operator);
        vm.expectRevert(CounterpartyRegistry.ZeroAddress.selector);
        reg.cacheDecision(address(0), bundleHash, 1 hours, true);
    }

    function test_CacheDecision_ZeroTtl_UsesDefaultTtl() public {
        vm.prank(operator);
        reg.cacheDecision(buyer, bundleHash, 0, true);
        CounterpartyRegistry.Decision memory d = reg.getDecision(buyer);
        assertEq(uint256(d.ttlSeconds), uint256(reg.defaultTtl()));
    }

    // ─── isAllowed / isStale on never-seen buyer ─────────────────────

    function test_IsAllowed_NoCacheNoDenylist_ReturnsFalse() public view {
        assertFalse(reg.isAllowed(address(0xDEAD)));
    }

    function test_IsStale_NoCache_ReturnsTrue() public view {
        assertTrue(reg.isStale(address(0xDEAD)));
    }

    // ─── requireAllowed branches ─────────────────────────────────────

    function test_RequireAllowed_NoDecision_RevertsUnknownBuyer() public {
        vm.expectRevert(CounterpartyRegistry.UnknownBuyer.selector);
        reg.requireAllowed(buyer);
    }

    function test_RequireAllowed_StaleDecision_RevertsUnknownBuyer() public {
        vm.prank(operator);
        reg.cacheDecision(buyer, bundleHash, 1 minutes, true);
        vm.warp(block.timestamp + 2 minutes);
        vm.expectRevert(CounterpartyRegistry.UnknownBuyer.selector);
        reg.requireAllowed(buyer);
    }

    function test_RequireAllowed_FailedScreen_RevertsDenied() public {
        vm.prank(operator);
        reg.cacheDecision(buyer, bundleHash, 1 hours, false);
        vm.expectRevert(CounterpartyRegistry.Denied.selector);
        reg.requireAllowed(buyer);
    }

    function test_RequireAllowed_FreshPass_DoesNotRevert() public {
        vm.prank(operator);
        reg.cacheDecision(buyer, bundleHash, 1 hours, true);
        reg.requireAllowed(buyer); // no revert
    }

    // ─── deny / undeny — non-operator path ───────────────────────────

    function test_Deny_NonOperator_Reverts() public {
        vm.prank(address(0xBAD));
        vm.expectRevert(CounterpartyRegistry.NotOperator.selector);
        reg.deny(buyer, reason);
    }

    function test_Undeny_NonOperator_Reverts() public {
        vm.prank(address(0xBAD));
        vm.expectRevert(CounterpartyRegistry.NotOperator.selector);
        reg.undeny(buyer, reason);
    }

    // ─── setDefaultTtl ───────────────────────────────────────────────

    function test_SetDefaultTtl_HappyPath() public {
        vm.prank(operator);
        reg.setDefaultTtl(2 hours);
        assertEq(uint256(reg.defaultTtl()), 2 hours);
    }

    function test_SetDefaultTtl_BelowFloor_ClampsToFiveMinutes() public {
        vm.prank(operator);
        reg.setDefaultTtl(30 seconds);
        assertEq(uint256(reg.defaultTtl()), 5 minutes);
    }

    function test_SetDefaultTtl_NonOperator_Reverts() public {
        vm.prank(address(0xBAD));
        vm.expectRevert(CounterpartyRegistry.NotOperator.selector);
        reg.setDefaultTtl(1 hours);
    }

    // ─── setOperator (owner-only) ────────────────────────────────────

    function test_SetOperator_HappyPath() public {
        address next = address(0xC0FFEE2);
        vm.prank(owner);
        reg.setOperator(next);
        assertEq(reg.klaroOperator(), next);
    }

    function test_SetOperator_ZeroAddress_Reverts() public {
        vm.prank(owner);
        vm.expectRevert(CounterpartyRegistry.ZeroAddress.selector);
        reg.setOperator(address(0));
    }

    function test_SetOperator_NonOwner_Reverts() public {
        vm.prank(address(0xBAD));
        // OZ Ownable v5 reverts with OwnableUnauthorizedAccount(address)
        vm.expectRevert();
        reg.setOperator(address(0xFEED));
    }
}
