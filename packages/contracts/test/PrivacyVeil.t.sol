// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import { Test } from "forge-std/Test.sol";
import { PrivacyVeil } from "../src/PrivacyVeil.sol";
import { KlaroConfig } from "../src/KlaroConfig.sol";

contract PrivacyVeilTest is Test {
    PrivacyVeil veil;
    bytes32 constant INVOICE = keccak256("inv-veil-1");
    bytes32 constant SALT = keccak256("salt-1");
    uint256 constant AMOUNT = 4_200_000_000;
    bytes32 commit;
    address vendor = address(0xA1);
    address trustedEscrow = address(this); // test contract stands in for InvoiceEscrow

    function setUp() public {
        vm.chainId(KlaroConfig.ARC_TESTNET_CHAIN_ID);
        veil = new PrivacyVeil();
        veil.setTrustedCaller(trustedEscrow, true);
        commit = keccak256(abi.encode(AMOUNT, SALT));
    }

    // ─── Trusted-caller guard ( hijack closure) ────────────────

    function test_CommitFor_FromUntrustedCaller_Reverts() public {
        // Attacker tries to front-run a legitimate veil and pin a junk hash
        // attributed to themselves — would lock the real vendor out forever.
        vm.prank(address(0xBADBAD));
        vm.expectRevert(PrivacyVeil.NotTrustedCaller.selector);
        veil.commitFor(INVOICE, commit, vendor);
    }

    function test_SetTrustedCaller_OnlyOwner() public {
        vm.prank(address(0xBADBAD));
        vm.expectRevert();
        veil.setTrustedCaller(address(0xCAFE), true);
    }

    // ─── Happy path through the trusted caller ────────────────────────

    function test_CommitFor_Stores() public {
        veil.commitFor(INVOICE, commit, vendor);
        PrivacyVeil.Veil memory v = veil.getVeil(INVOICE);
        assertEq(v.commit, commit);
        assertEq(v.committer, vendor);
        assertFalse(v.revealed);
    }

    function test_DoubleCommit_Reverts() public {
        veil.commitFor(INVOICE, commit, vendor);
        vm.expectRevert(PrivacyVeil.AlreadyCommitted.selector);
        veil.commitFor(INVOICE, commit, vendor);
    }

    function test_Reveal_OnlyCommitter() public {
        veil.commitFor(INVOICE, commit, vendor);
        vm.prank(address(0xBADBAD));
        vm.expectRevert(PrivacyVeil.NotCommitter.selector);
        veil.reveal(INVOICE, AMOUNT, SALT);
    }

    function test_Reveal_BadSalt_Reverts() public {
        veil.commitFor(INVOICE, commit, vendor);
        vm.prank(vendor);
        vm.expectRevert(PrivacyVeil.BadReveal.selector);
        veil.reveal(INVOICE, AMOUNT, keccak256("wrong-salt"));
    }

    function test_Reveal_GoodPath_FlipsAndRecordsAmount() public {
        veil.commitFor(INVOICE, commit, vendor);
        vm.prank(vendor);
        veil.reveal(INVOICE, AMOUNT, SALT);
        assertTrue(veil.isRevealed(INVOICE));
        PrivacyVeil.Veil memory v = veil.getVeil(INVOICE);
        assertEq(v.revealedAmount, AMOUNT);
    }

    function test_DoubleReveal_Reverts() public {
        veil.commitFor(INVOICE, commit, vendor);
        vm.prank(vendor);
        veil.reveal(INVOICE, AMOUNT, SALT);
        vm.prank(vendor);
        vm.expectRevert(PrivacyVeil.AlreadyRevealed.selector);
        veil.reveal(INVOICE, AMOUNT, SALT);
    }
}
