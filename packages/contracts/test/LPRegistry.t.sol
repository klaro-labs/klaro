// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import { Test } from "forge-std/Test.sol";
import { LPRegistry } from "../src/LPRegistry.sol";
import { ReasonCodes } from "../src/lib/ReasonCodes.sol";
import { KlaroConfig } from "../src/KlaroConfig.sol";

contract LPRegistryTest is Test {
    LPRegistry reg;
    address operator = address(0xA11CE);
    address rando = address(0xBEEF);
    address lpWallet = address(0xC0FFEE);
    address lpWallet2 = address(0xDECAF);

    bytes32 constant LP_ID = keccak256("lp.mudrex.in");
    bytes32 constant KYB_HASH = keccak256("kyb-bundle-v1");
    bytes32 constant PAYOUT_HASH = keccak256("upi:lp@mudrex");

    function setUp() public {
        vm.chainId(KlaroConfig.ARC_TESTNET_CHAIN_ID);
        reg = new LPRegistry(operator);
    }

    function _register() internal {
        vm.prank(operator);
        reg.registerLP(LP_ID, lpWallet, 2, KYB_HASH, PAYOUT_HASH);
    }

    function test_RegisterStartsPending() public {
        _register();
        LPRegistry.LP memory lp = reg.getLP(LP_ID);
        assertEq(lp.wallet, lpWallet);
        assertEq(uint8(lp.status), uint8(LPRegistry.Status.PENDING));
        assertEq(lp.tier, 2);
        assertFalse(reg.isActive(LP_ID));
    }

    function test_NonOperatorCannotRegister() public {
        vm.prank(rando);
        vm.expectRevert(LPRegistry.NotOperator.selector);
        reg.registerLP(LP_ID, lpWallet, 2, KYB_HASH, PAYOUT_HASH);
    }

    function test_DuplicateRegisterReverts() public {
        _register();
        vm.prank(operator);
        vm.expectRevert(LPRegistry.AlreadyRegistered.selector);
        reg.registerLP(LP_ID, lpWallet, 2, KYB_HASH, PAYOUT_HASH);
    }

    function test_ZeroWalletReverts() public {
        vm.prank(operator);
        vm.expectRevert(LPRegistry.ZeroWallet.selector);
        reg.registerLP(LP_ID, address(0), 0, KYB_HASH, PAYOUT_HASH);
    }

    function test_BadTierReverts() public {
        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(LPRegistry.BadTier.selector, 5));
        reg.registerLP(LP_ID, lpWallet, 5, KYB_HASH, PAYOUT_HASH);
    }

    function test_AdmitTransitionsToAdmitted_AndIsActive() public {
        _register();
        vm.prank(operator);
        reg.admit(LP_ID);
        assertTrue(reg.isActive(LP_ID));
        reg.assertActive(LP_ID); // does not revert
    }

    function test_SuspendBlocksAssertActive() public {
        _register();
        vm.prank(operator);
        reg.admit(LP_ID);
        vm.prank(operator);
        reg.suspend(LP_ID, ReasonCodes.SLASH_LP_BAD_PROOF);
        vm.expectRevert(
            abi.encodeWithSelector(
                LPRegistry.NotActive.selector, LP_ID, LPRegistry.Status.SUSPENDED
            )
        );
        reg.assertActive(LP_ID);
    }

    function test_SuspendRejectsBadReason() public {
        _register();
        vm.prank(operator);
        reg.admit(LP_ID);
        bytes32 fake = keccak256("klaro.reason.NOT_REAL");
        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(ReasonCodes.UnknownReason.selector, fake));
        reg.suspend(LP_ID, fake);
    }

    function test_SuspendAdmitFlipsBack() public {
        _register();
        vm.startPrank(operator);
        reg.admit(LP_ID);
        reg.suspend(LP_ID, ReasonCodes.PAUSE_PARTNER_OUTAGE);
        reg.admit(LP_ID);
        vm.stopPrank();
        assertTrue(reg.isActive(LP_ID));
    }

    function test_RevokeIsTerminal() public {
        _register();
        vm.prank(operator);
        reg.admit(LP_ID);
        vm.prank(operator);
        reg.revoke(LP_ID, ReasonCodes.KILL_FRAUD);
        // Can't admit a revoked LP back
        vm.prank(operator);
        vm.expectRevert(
            abi.encodeWithSelector(
                LPRegistry.WrongStateForOp.selector,
                LPRegistry.Status.PENDING,
                LPRegistry.Status.REVOKED
            )
        );
        reg.admit(LP_ID);
    }

    function test_AssertTierAtLeast() public {
        _register();
        vm.prank(operator);
        reg.admit(LP_ID);
        reg.assertTierAtLeast(LP_ID, 2); // tier 2 passes
        vm.expectRevert(abi.encodeWithSelector(LPRegistry.BadTier.selector, 2));
        reg.assertTierAtLeast(LP_ID, 3);
    }

    function test_SetTierUpdates() public {
        _register();
        vm.prank(operator);
        reg.setTier(LP_ID, 4);
        assertEq(reg.getLP(LP_ID).tier, 4);
    }

    function test_SetWalletUpdates() public {
        _register();
        vm.prank(operator);
        reg.setWallet(LP_ID, lpWallet2);
        assertEq(reg.walletOf(LP_ID), lpWallet2);
    }

    function test_UpdateKYBHash() public {
        _register();
        bytes32 newKyb = keccak256("kyb-bundle-v2");
        vm.prank(operator);
        reg.updateKYBHash(LP_ID, newKyb);
        assertEq(reg.getLP(LP_ID).kybRecordHash, newKyb);
    }

    function test_UpdatePayoutAccountHash() public {
        _register();
        bytes32 newPayout = keccak256("bank:9999");
        vm.prank(operator);
        reg.updatePayoutAccountHash(LP_ID, newPayout);
        assertEq(reg.getLP(LP_ID).payoutAccountHash, newPayout);
    }

    function test_OnlyHashesStored_NoStringFuzz(bytes calldata kybBlob, bytes calldata payoutBlob)
        public
    {
        // Property: regardless of what hashes off-chain produces, the LP record
        // only ever contains the bytes32 commitments — no string storage exists.
        bytes32 kyb = keccak256(kybBlob);
        bytes32 payout = keccak256(payoutBlob);
        vm.prank(operator);
        reg.registerLP(LP_ID, lpWallet, 1, kyb, payout);
        LPRegistry.LP memory lp = reg.getLP(LP_ID);
        assertEq(lp.kybRecordHash, kyb);
        assertEq(lp.payoutAccountHash, payout);
    }

    function test_AssertActiveOnUnknownLPReverts() public {
        vm.expectRevert(
            abi.encodeWithSelector(LPRegistry.NotActive.selector, LP_ID, LPRegistry.Status.NONE)
        );
        reg.assertActive(LP_ID);
    }
}
