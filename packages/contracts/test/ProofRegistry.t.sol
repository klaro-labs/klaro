// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import { Test } from "forge-std/Test.sol";
import { ProofRegistry } from "../src/ProofRegistry.sol";

contract ProofRegistryTest is Test {
    ProofRegistry registry;
    address operator = address(0xB2);
    address other = address(0xC3);

    function setUp() public {
        vm.chainId(5_042_002);
        registry = new ProofRegistry(operator);
    }

    function _sample() internal pure returns (ProofRegistry.Proof memory p) {
        p = ProofRegistry.Proof({
            cashoutId: keccak256("co-001"),
            lpId: keccak256("lp-aakash"),
            vendorId: keccak256("vendor-asha"),
            inrAmount: 20_136_000, // ₹2,01,360 × 100 paise
            usdcAmount: 2_400_000_000, // 2,400 USDC (6 dec)
            utrReferenceHash: keccak256("utr+account-blob"),
            screenshotHash: keccak256("screenshot.png-bytes"),
            submittedAt: 0, // contract sets
            lpSignatureHash: keccak256("lp-eip712-sig"),
            verifierSignatureHash: keccak256("verifier-sig")
        });
    }

    function test_submit_byOperator_writes_andVerifyTrue() public {
        ProofRegistry.Proof memory p = _sample();
        vm.prank(operator);
        bytes32 h = registry.submit(p);
        assertTrue(registry.verify(h));
        ProofRegistry.Proof memory back = registry.getProof(h);
        assertEq(back.cashoutId, p.cashoutId);
        assertEq(back.usdcAmount, p.usdcAmount);
        assertGt(back.submittedAt, 0);
    }

    function test_submit_nonOperator_reverts() public {
        ProofRegistry.Proof memory p = _sample();
        vm.expectRevert(ProofRegistry.OnlyOperator.selector);
        vm.prank(other);
        registry.submit(p);
    }

    function test_submit_duplicate_reverts() public {
        ProofRegistry.Proof memory p = _sample();
        vm.prank(operator);
        registry.submit(p);
        vm.expectRevert(ProofRegistry.AlreadySubmitted.selector);
        vm.prank(operator);
        registry.submit(p);
    }

    function test_submit_missingVendor_reverts() public {
        ProofRegistry.Proof memory p = _sample();
        p.vendorId = bytes32(0);
        vm.expectRevert(ProofRegistry.VendorMissing.selector);
        vm.prank(operator);
        registry.submit(p);
    }

    function test_verify_unknown_returnsFalse() public view {
        assertFalse(registry.verify(keccak256("missing")));
    }
}
