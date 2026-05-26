// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import { Test } from "forge-std/Test.sol";
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import { LPStaking } from "../src/LPStaking.sol";

contract MockUSDC is ERC20 {
    constructor() ERC20("Mock USDC", "USDC") { }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amt) external {
        _mint(to, amt);
    }
}

contract LPStakingTest is Test {
    LPStaking staking;
    MockUSDC usdc;

    address operator;
    uint256 operatorPk;
    address lpWallet = address(0xA1);
    address other = address(0xC3);
    address feeSink = address(0xFEE);

    bytes32 constant LP_ID = keccak256("lp-aakash");

    function setUp() public {
        vm.chainId(5_042_002);
        // register() now requires an operator-signed EIP-712 auth;
        // makeAddrAndKey gives us a deterministic privkey we can sign with.
        (operator, operatorPk) = makeAddrAndKey("operator");
        usdc = new MockUSDC();
        staking = new LPStaking(address(usdc), operator);
        // LPS2: KLARO_FEE_RECEIVER defaults to address(0) so tests
        // must pin a sink explicitly or slash() reverts FeeReceiverUnset.
        staking.setFeeReceiver(feeSink);
        usdc.mint(lpWallet, 100_000_000_000);
        vm.prank(lpWallet);
        usdc.approve(address(staking), type(uint256).max);
    }

    /// @dev Build the operator's EIP-712 RegisterAuthorization signature for
    /// (lpId, wallet, deadline). Uses the current per-lpId nonce so
    /// retries after a botched submission re-sign cleanly.
    function _authFor(bytes32 lpId, address wallet, uint64 deadline)
        internal
        view
        returns (bytes memory)
    {
        uint256 nonce = staking.registerNonce(lpId);
        bytes32 structHash =
            keccak256(abi.encode(staking.REGISTER_TYPEHASH(), lpId, wallet, deadline, nonce));
        bytes32 digest = MessageHashUtilsLite.toTypedDataHash(
            staking.registrationDomainSeparator(), structHash
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(operatorPk, digest);
        return abi.encodePacked(r, s, v);
    }

    function _register(bytes32 lpId, address wallet, uint256 amount) internal {
        uint64 deadline = uint64(block.timestamp + 10 minutes);
        bytes memory auth = _authFor(lpId, wallet, deadline);
        vm.prank(wallet);
        staking.register(lpId, wallet, amount, deadline, auth);
    }

    function test_register_atT0_setsTier() public {
        _register(LP_ID, lpWallet, 50_000_000);
        assertEq(uint8(staking.tierOf(LP_ID)), uint8(LPStaking.Tier.T0));
    }

    function test_register_belowT0_reverts() public {
        uint64 deadline = uint64(block.timestamp + 10 minutes);
        bytes memory auth = _authFor(LP_ID, lpWallet, deadline);
        vm.expectRevert(
            abi.encodeWithSelector(
                LPStaking.InsufficientStake.selector, uint256(10_000_000), uint256(50_000_000)
            )
        );
        vm.prank(lpWallet);
        staking.register(LP_ID, lpWallet, 10_000_000, deadline, auth);
    }

    function test_register_duplicate_reverts() public {
        _register(LP_ID, lpWallet, 50_000_000);
        uint64 deadline = uint64(block.timestamp + 10 minutes);
        bytes memory auth = _authFor(LP_ID, lpWallet, deadline);
        vm.expectRevert(LPStaking.AlreadyRegistered.selector);
        vm.prank(lpWallet);
        staking.register(LP_ID, lpWallet, 50_000_000, deadline, auth);
    }

    function test_register_frontRunByDifferentWallet_reverts() public {
        // Operator signed auth for `lpWallet`; an attacker tries to submit
        // under their own `other` address with the same payload. The
        // msg.sender vs auth-bound wallet check rejects it.
        uint64 deadline = uint64(block.timestamp + 10 minutes);
        bytes memory auth = _authFor(LP_ID, lpWallet, deadline);
        usdc.mint(other, 1_000_000_000);
        vm.prank(other);
        usdc.approve(address(staking), type(uint256).max);
        vm.prank(other);
        vm.expectRevert(
            abi.encodeWithSelector(LPStaking.CallerNotAuthorizedWallet.selector, lpWallet)
        );
        staking.register(LP_ID, lpWallet, 50_000_000, deadline, auth);
    }

    function test_register_expiredAuth_reverts() public {
        uint64 deadline = uint64(block.timestamp - 1);
        bytes memory auth = _authFor(LP_ID, lpWallet, deadline);
        vm.prank(lpWallet);
        vm.expectRevert(LPStaking.BadOperatorAuth.selector);
        staking.register(LP_ID, lpWallet, 50_000_000, deadline, auth);
    }

    function test_register_wrongSigner_reverts() public {
        // Attacker generates their own signature for the operator's
        // intended payload. SignatureChecker recovers a different signer
        // and rejects.
        (, uint256 attackerPk) = makeAddrAndKey("attacker");
        uint64 deadline = uint64(block.timestamp + 10 minutes);
        bytes32 structHash = keccak256(
            abi.encode(
                staking.REGISTER_TYPEHASH(), LP_ID, lpWallet, deadline, staking.registerNonce(LP_ID)
            )
        );
        bytes32 digest = MessageHashUtilsLite.toTypedDataHash(
            staking.registrationDomainSeparator(), structHash
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(attackerPk, digest);
        bytes memory auth = abi.encodePacked(r, s, v);
        vm.prank(lpWallet);
        vm.expectRevert(LPStaking.BadOperatorAuth.selector);
        staking.register(LP_ID, lpWallet, 50_000_000, deadline, auth);
    }

    function test_addStake_movesTierUp() public {
        _register(LP_ID, lpWallet, 50_000_000);

        vm.prank(lpWallet);
        staking.addStake(LP_ID, 1_950_000_000);
        assertEq(uint8(staking.tierOf(LP_ID)), uint8(LPStaking.Tier.T3));
    }

    function test_withdrawStake_movesTierDown_andReturnsUSDC() public {
        _register(LP_ID, lpWallet, 2_000_000_000);
        uint256 walletBefore = usdc.balanceOf(lpWallet);

        vm.prank(lpWallet);
        staking.withdrawStake(LP_ID, 1_950_000_000);
        assertEq(uint8(staking.tierOf(LP_ID)), uint8(LPStaking.Tier.T0));
        assertEq(usdc.balanceOf(lpWallet), walletBefore + 1_950_000_000);
    }

    function test_slash_byOperator_reducesStake_andTier() public {
        _register(LP_ID, lpWallet, 2_000_000_000);

        vm.prank(operator);
        staking.slash(LP_ID, 1_500_000_000, keccak256("dispute-resolution-001"));

        LPStaking.LP memory lp = staking.getLP(LP_ID);
        assertEq(lp.stake, 500_000_000);
        assertEq(uint8(lp.tier), uint8(LPStaking.Tier.T2));
        assertEq(lp.slashedTotal, 1_500_000_000);
        // LPS2 regression: slashed USDC reaches the configured
        // sink instead of being burned to 0xdEaD.
        assertEq(usdc.balanceOf(feeSink), 1_500_000_000);
    }

    // LPS2 regression: slash() must revert FeeReceiverUnset
    // when fee receiver is address(0) instead of silently burning USDC
    // to 0xdEaD .
    function test_slash_FeeReceiverUnset_Reverts() public {
        _register(LP_ID, lpWallet, 2_000_000_000);
        staking.setFeeReceiver(address(0));
        vm.prank(operator);
        vm.expectRevert(LPStaking.FeeReceiverUnset.selector);
        staking.slash(LP_ID, 100_000_000, keccak256("dispute-resolution-001"));
    }

    function test_setFeeReceiver_NonOwner_Reverts() public {
        vm.prank(other);
        vm.expectRevert();
        staking.setFeeReceiver(address(0xFEEDBEEF));
    }

    function test_slash_nonOperator_reverts() public {
        _register(LP_ID, lpWallet, 500_000_000);

        // slash is now `onlyOperatorOrSlasher` so neither
        // role permits this caller.
        vm.expectRevert(LPStaking.OnlyOperatorOrSlasher.selector);
        vm.prank(other);
        staking.slash(LP_ID, 100_000_000, keccak256("noop"));
    }

    function test_setActive_byOperator_toggles() public {
        _register(LP_ID, lpWallet, 100_000_000);

        vm.prank(operator);
        staking.setActive(LP_ID, false);
        assertFalse(staking.getLP(LP_ID).active);
    }
}

/// @dev Tiny inline helper; the lib path in this monorepo is a leaf import
/// that varies by OZ version. Re-implementing the 1-liner avoids the
/// pin churn.
library MessageHashUtilsLite {
    function toTypedDataHash(bytes32 domainSeparator, bytes32 structHash)
        internal
        pure
        returns (bytes32)
    {
        return keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
    }
}
