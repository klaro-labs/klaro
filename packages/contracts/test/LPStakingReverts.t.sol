// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import { Test } from "forge-std/Test.sol";
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import { LPStaking } from "../src/LPStaking.sol";

/// @notice bump LPStaking branch
/// coverage from 38.89% (7/18). Existing LPStaking.t.sol covers
/// happy paths + a couple of reverts. This file targets every
/// uncovered branch: addStake / withdrawStake / slash / setActive
/// revert paths, withdrawStake auth split (wallet vs owner vs
/// neither), every tier boundary in `_tierFor`.
contract MockUSDC is ERC20 {
    constructor() ERC20("Mock USDC", "USDC") { }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amt) external {
        _mint(to, amt);
    }
}

contract LPStakingRevertsTest is Test {
    LPStaking staking;
    MockUSDC usdc;

    address operator;
    uint256 operatorPk;
    address lpWallet = address(0xA1);
    address other = address(0xC3);
    address owner;

    bytes32 constant LP_ID = keccak256("lp-aakash");
    bytes32 constant LP_OTHER = keccak256("lp-never-registered");
    bytes32 constant REASON = keccak256("klaro.reason.SLASH_LP_TIMEOUT");

    function setUp() public {
        vm.chainId(5_042_002);
        owner = address(this);
        (operator, operatorPk) = makeAddrAndKey("operator");
        usdc = new MockUSDC();
        staking = new LPStaking(address(usdc), operator);
        usdc.mint(lpWallet, 100_000_000_000);
        vm.prank(lpWallet);
        usdc.approve(address(staking), type(uint256).max);
        _register(LP_ID, lpWallet, 100_000_000);
    }

    function _register(bytes32 lpId, address wallet, uint256 amount) internal {
        uint64 deadline = uint64(block.timestamp + 10 minutes);
        uint256 nonce = staking.registerNonce(lpId);
        bytes32 structHash =
            keccak256(abi.encode(staking.REGISTER_TYPEHASH(), lpId, wallet, deadline, nonce));
        bytes32 digest = keccak256(
            abi.encodePacked("\x19\x01", staking.registrationDomainSeparator(), structHash)
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(operatorPk, digest);
        bytes memory auth = abi.encodePacked(r, s, v);
        vm.prank(wallet);
        staking.register(lpId, wallet, amount, deadline, auth);
    }

    // ─── addStake ────────────────────────────────────────────────────

    function test_AddStake_Unregistered_Reverts() public {
        vm.prank(lpWallet);
        vm.expectRevert(LPStaking.NotRegistered.selector);
        staking.addStake(LP_OTHER, 10_000_000);
    }

    function test_AddStake_Zero_Reverts() public {
        vm.prank(lpWallet);
        vm.expectRevert(LPStaking.AmountZero.selector);
        staking.addStake(LP_ID, 0);
    }

    // ─── withdrawStake (auth split + reverts) ────────────────────────

    function test_WithdrawStake_Unregistered_Reverts() public {
        vm.prank(lpWallet);
        vm.expectRevert(LPStaking.NotRegistered.selector);
        staking.withdrawStake(LP_OTHER, 1_000_000);
    }

    function test_WithdrawStake_Zero_Reverts() public {
        vm.prank(lpWallet);
        vm.expectRevert(LPStaking.AmountZero.selector);
        staking.withdrawStake(LP_ID, 0);
    }

    function test_WithdrawStake_Overdraw_Reverts() public {
        vm.prank(lpWallet);
        vm.expectRevert(
            abi.encodeWithSelector(
                LPStaking.InsufficientStake.selector, 100_000_000, 999_000_000_000
            )
        );
        staking.withdrawStake(LP_ID, 999_000_000_000);
    }

    // Audit 2026-05-30: a soft-suspended LP must not be able to withdraw stake
    // (dodge a pending slash) or add stake (change tier) while under review.
    function test_WithdrawStake_Suspended_Reverts() public {
        vm.prank(operator);
        staking.setActive(LP_ID, false);
        vm.prank(lpWallet);
        vm.expectRevert(LPStaking.LPSuspended.selector);
        staking.withdrawStake(LP_ID, 10_000_000);
    }

    function test_AddStake_Suspended_Reverts() public {
        vm.prank(operator);
        staking.setActive(LP_ID, false);
        vm.prank(lpWallet);
        vm.expectRevert(LPStaking.LPSuspended.selector);
        staking.addStake(LP_ID, 10_000_000);
    }

    function test_WithdrawStake_Suspended_OwnerBypass() public {
        vm.prank(operator);
        staking.setActive(LP_ID, false);
        // owner() (the deployer) retains an emergency withdraw path.
        staking.withdrawStake(LP_ID, 10_000_000);
        assertEq(staking.getLP(LP_ID).stake, 90_000_000);
    }

    function test_WithdrawStake_Stranger_RevertsOnlyOperator() public {
        // Stranger is neither lp.wallet nor owner — auth fails on the last guard.
        vm.prank(other);
        vm.expectRevert(LPStaking.OnlyOperator.selector);
        staking.withdrawStake(LP_ID, 10_000_000);
    }

    function test_WithdrawStake_Owner_AllowedAsAdminHook() public {
        // Owner-path branch in the auth guard: confirms admin can rescue stake.
        vm.prank(owner);
        staking.withdrawStake(LP_ID, 10_000_000);
        assertEq(staking.getLP(LP_ID).stake, 90_000_000);
    }

    // ─── slash ───────────────────────────────────────────────────────

    function test_Slash_Unregistered_Reverts() public {
        vm.prank(operator);
        vm.expectRevert(LPStaking.NotRegistered.selector);
        staking.slash(LP_OTHER, 1_000_000, REASON);
    }

    function test_Slash_Zero_Reverts() public {
        vm.prank(operator);
        vm.expectRevert(LPStaking.AmountZero.selector);
        staking.slash(LP_ID, 0, REASON);
    }

    function test_Slash_Overdraw_Reverts() public {
        vm.prank(operator);
        vm.expectRevert(
            abi.encodeWithSelector(
                LPStaking.InsufficientStake.selector, 100_000_000, 999_000_000_000
            )
        );
        staking.slash(LP_ID, 999_000_000_000, REASON);
    }

    // ─── setActive ───────────────────────────────────────────────────

    function test_SetActive_Unregistered_Reverts() public {
        vm.prank(operator);
        vm.expectRevert(LPStaking.NotRegistered.selector);
        staking.setActive(LP_OTHER, false);
    }

    function test_SetActive_NonOperator_Reverts() public {
        vm.prank(other);
        // setActive is now `onlyOperatorOrSlasher`.
        vm.expectRevert(LPStaking.OnlyOperatorOrSlasher.selector);
        staking.setActive(LP_ID, false);
    }

    // ─── setOperator (owner-only) ────────────────────────────────────

    function test_SetOperator_NonOwner_Reverts() public {
        vm.prank(other);
        vm.expectRevert();
        staking.setOperator(address(0xFEED));
    }

    function test_SetOperator_OwnerHappy() public {
        vm.prank(owner);
        staking.setOperator(address(0xC0FFEE2));
        assertEq(staking.klaroOperator(), address(0xC0FFEE2));
    }

    // ─── _tierFor boundaries (via register + addStake) ───────────────

    function test_TierLadder_T2Threshold() public {
        bytes32 lpT2 = keccak256("lp-t2");
        _register(lpT2, lpWallet, 500_000_000);
        assertEq(uint256(staking.tierOf(lpT2)), uint256(LPStaking.Tier.T2));
    }

    function test_TierLadder_T3Threshold() public {
        bytes32 lpT3 = keccak256("lp-t3");
        _register(lpT3, lpWallet, 2_000_000_000);
        assertEq(uint256(staking.tierOf(lpT3)), uint256(LPStaking.Tier.T3));
    }

    function test_TierLadder_AboveT3_StillT3() public {
        bytes32 lpHi = keccak256("lp-hi");
        _register(lpHi, lpWallet, 50_000_000_000);
        assertEq(uint256(staking.tierOf(lpHi)), uint256(LPStaking.Tier.T3));
    }

    function test_Register_Duplicate_Reverts() public {
        uint64 deadline = uint64(block.timestamp + 10 minutes);
        uint256 nonce = staking.registerNonce(LP_ID);
        bytes32 structHash =
            keccak256(abi.encode(staking.REGISTER_TYPEHASH(), LP_ID, lpWallet, deadline, nonce));
        bytes32 digest = keccak256(
            abi.encodePacked("\x19\x01", staking.registrationDomainSeparator(), structHash)
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(operatorPk, digest);
        bytes memory auth = abi.encodePacked(r, s, v);
        vm.prank(lpWallet);
        vm.expectRevert(LPStaking.AlreadyRegistered.selector);
        staking.register(LP_ID, lpWallet, 100_000_000, deadline, auth);
    }
}
