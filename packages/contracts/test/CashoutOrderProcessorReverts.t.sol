// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import { Test } from "forge-std/Test.sol";
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import { CashoutOrderProcessor } from "../src/CashoutOrderProcessor.sol";
import { ProofRegistry } from "../src/ProofRegistry.sol";
import { LPStaking } from "../src/LPStaking.sol";
import { LPRegistry } from "../src/LPRegistry.sol";

/// @notice bump branch coverage on
/// CashoutOrderProcessor from 22% → higher by exercising every
/// documented revert path. Pre-existing happy-path tests live in
/// CashoutOrderProcessor.t.sol — this file ONLY covers reverts.
contract MockUSDC is ERC20 {
    constructor() ERC20("Mock USDC", "USDC") { }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amt) external {
        _mint(to, amt);
    }
}

contract CashoutOrderProcessorRevertsTest is Test {
    CashoutOrderProcessor proc;
    ProofRegistry proofs;
    LPStaking staking;
    LPRegistry registry;
    MockUSDC usdc;

    address vendor = address(0xA1);
    address other = address(0xC3);
    address lpWallet = address(0xA2);
    address operator;

    bytes32 constant CO_ID = keccak256("co-revert");
    bytes32 constant LP_ID = keccak256("lp-revert");
    bytes32 constant CORRIDOR = keccak256("INR");
    uint256 constant USDC_AMT = 1_000_000;
    uint256 constant INR_AMT = 8_340_000;

    function setUp() public {
        vm.chainId(5_042_002);
        operator = address(this);
        usdc = new MockUSDC();
        proofs = new ProofRegistry(operator);
        staking = new LPStaking(address(usdc), operator);
        registry = new LPRegistry(operator);
        proc = new CashoutOrderProcessor(address(usdc), proofs, staking, registry, operator);
        proofs.setOperator(address(proc));
        staking.setSlasher(address(proc));
        usdc.mint(vendor, USDC_AMT * 10);
        vm.prank(vendor);
        usdc.approve(address(proc), type(uint256).max);

        registry.registerLP(LP_ID, lpWallet, 1, keccak256("kyb"), keccak256("payout"));
        registry.admit(LP_ID);
    }

    function _request() internal {
        vm.prank(vendor);
        proc.requestAndLock(
            CO_ID, USDC_AMT, INR_AMT, CORRIDOR, uint64(block.timestamp + 5 minutes), keccak256("q")
        );
    }

    // ─── requestAndLock reverts ─────────────────────────────────────

    function test_requestAndLock_AmountZero_Reverts() public {
        vm.prank(vendor);
        vm.expectRevert(CashoutOrderProcessor.AmountZero.selector);
        proc.requestAndLock(CO_ID, 0, 0, CORRIDOR, uint64(block.timestamp + 60), keccak256("q"));
    }

    function test_requestAndLock_AlreadyExists_Reverts() public {
        _request();
        vm.prank(vendor);
        vm.expectRevert(CashoutOrderProcessor.AlreadyExists.selector);
        proc.requestAndLock(
            CO_ID, USDC_AMT, INR_AMT, CORRIDOR, uint64(block.timestamp + 60), keccak256("q")
        );
    }

    function test_requestAndLock_QuoteExpired_Reverts() public {
        // Move forward so expiry < block.timestamp.
        vm.warp(block.timestamp + 1000);
        vm.prank(vendor);
        vm.expectRevert(CashoutOrderProcessor.QuoteExpired.selector);
        proc.requestAndLock(
            CO_ID, USDC_AMT, INR_AMT, CORRIDOR, uint64(block.timestamp - 1), keccak256("q")
        );
    }

    // ─── confirmReceived reverts ────────────────────────────────────

    function test_confirmReceived_NotVendor_Reverts() public {
        _request();
        vm.prank(other);
        vm.expectRevert(CashoutOrderProcessor.NotVendor.selector);
        proc.confirmReceived(CO_ID);
    }

    function test_confirmReceived_WrongStatus_Reverts() public {
        _request();
        // Status is LOCKED, not PROOF_SUBMITTED → InvalidStatus.
        vm.prank(vendor);
        vm.expectRevert();
        proc.confirmReceived(CO_ID);
    }

    // ─── cancel reverts ─────────────────────────────────────────────

    function test_cancel_NotVendor_Reverts() public {
        _request();
        vm.prank(other);
        vm.expectRevert(CashoutOrderProcessor.NotVendor.selector);
        proc.cancel(CO_ID);
    }

    // ─── operator-only paths ────────────────────────────────────────

    function test_claimByLP_NotOperator_Reverts() public {
        _request();
        vm.prank(other);
        vm.expectRevert(CashoutOrderProcessor.NotOperator.selector);
        proc.claimByLP(CO_ID, LP_ID);
    }

    function test_expireUnconfirmed_NotOperator_Reverts() public {
        _request();
        vm.prank(other);
        vm.expectRevert(CashoutOrderProcessor.NotOperator.selector);
        proc.expireUnconfirmed(CO_ID);
    }

    // ─── pause guard ────────────────────────────────────────────────

    function test_requestAndLock_WhenPaused_Reverts() public {
        proc.pause();
        vm.prank(vendor);
        vm.expectRevert(); // Pausable: paused
        proc.requestAndLock(
            CO_ID, USDC_AMT, INR_AMT, CORRIDOR, uint64(block.timestamp + 60), keccak256("q")
        );
    }
}
