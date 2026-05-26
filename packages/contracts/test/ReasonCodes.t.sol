// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import { Test } from "forge-std/Test.sol";
import { ReasonCodes } from "../src/lib/ReasonCodes.sol";

contract ReasonCallerHelper {
    function callRequire(bytes32 r) external pure {
        ReasonCodes.require_(r);
    }
}

contract ReasonCodesTest is Test {
    ReasonCallerHelper helper;

    function setUp() public {
        helper = new ReasonCallerHelper();
    }

    function test_KnownCodesPass() public pure {
        ReasonCodes.require_(ReasonCodes.HOLD_SUSPICIOUS);
        ReasonCodes.require_(ReasonCodes.SLASH_LP_TIMEOUT);
        ReasonCodes.require_(ReasonCodes.DISPUTE_AGENT_FAULT);
        ReasonCodes.require_(ReasonCodes.PAUSE_EMERGENCY);
        ReasonCodes.require_(ReasonCodes.OTHER);
    }

    function test_UnknownCodeReverts() public {
        bytes32 fake = keccak256("klaro.reason.NOT_REAL");
        vm.expectRevert(abi.encodeWithSelector(ReasonCodes.UnknownReason.selector, fake));
        helper.callRequire(fake);
    }

    function test_ZeroCodeReverts() public {
        vm.expectRevert(abi.encodeWithSelector(ReasonCodes.UnknownReason.selector, bytes32(0)));
        helper.callRequire(bytes32(0));
    }

    function test_CodesAreUnique() public pure {
        bytes32[24] memory all = [
            ReasonCodes.HOLD_SUSPICIOUS,
            ReasonCodes.HOLD_SCREENING_FAIL,
            ReasonCodes.HOLD_HIGH_RISK_VENDOR,
            ReasonCodes.HOLD_VENDOR_KYB_PENDING,
            ReasonCodes.REFUND_PROOF_MISSING,
            ReasonCodes.REFUND_VENDOR_REQUEST,
            ReasonCodes.REFUND_DUPLICATE_PAY,
            ReasonCodes.REFUND_BUYER_DISPUTE,
            ReasonCodes.SLASH_LP_TIMEOUT,
            ReasonCodes.SLASH_LP_BAD_PROOF,
            ReasonCodes.SLASH_LP_DISPUTE_LOSS,
            ReasonCodes.SLASH_LP_KYB_REVOKED,
            ReasonCodes.PENALIZE_VENDOR_FRAUD,
            ReasonCodes.PENALIZE_VENDOR_CHARGEBACK,
            ReasonCodes.DISPUTE_AGENT_FAULT,
            ReasonCodes.DISPUTE_USER_FAULT,
            ReasonCodes.DISPUTE_INSUFFICIENT_EV,
            ReasonCodes.DISPUTE_MUTUAL_RESOLVED,
            ReasonCodes.PAUSE_EMERGENCY,
            ReasonCodes.PAUSE_PARTNER_OUTAGE,
            ReasonCodes.PAUSE_MAINTENANCE,
            ReasonCodes.KILL_FRAUD,
            ReasonCodes.KILL_REGULATORY,
            ReasonCodes.OTHER
        ];
        for (uint256 i = 0; i < all.length; i++) {
            for (uint256 j = i + 1; j < all.length; j++) {
                require(all[i] != all[j], "duplicate code");
            }
        }
    }
}
