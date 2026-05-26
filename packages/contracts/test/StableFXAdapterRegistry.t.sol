// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import { Test } from "forge-std/Test.sol";
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { StableFXAdapterRegistry } from "../src/StableFXAdapterRegistry.sol";
import { MockStableFXAdapter } from "../src/adapters/MockStableFXAdapter.sol";
import { IStableFXAdapter } from "../src/adapters/IStableFXAdapter.sol";
import { RoutePolicyEngine } from "../src/RoutePolicyEngine.sol";
import { KlaroConfig } from "../src/KlaroConfig.sol";

contract MockToken is ERC20 {
    uint8 immutable _decimals;

    constructor(string memory n, string memory s, uint8 d) ERC20(n, s) {
        _decimals = d;
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    function mint(address to, uint256 amt) external {
        _mint(to, amt);
    }
}

contract StableFXAdapterRegistryTest is Test {
    StableFXAdapterRegistry reg;
    MockStableFXAdapter mockAdapter;
    RoutePolicyEngine policy;
    MockToken usdc;
    MockToken eurc;

    address operator = address(0xA11CE);
    address rando = address(0xBEEF);
    address vendor = address(0xC0FFEE);
    address recipient = address(0xDECAF);

    bytes32 constant USDC_EURC = keccak256("USDC_EURC");

    function setUp() public {
        vm.chainId(KlaroConfig.ARC_TESTNET_CHAIN_ID);
        reg = new StableFXAdapterRegistry(operator);
        mockAdapter = new MockStableFXAdapter();
        policy = new RoutePolicyEngine(operator);

        usdc = new MockToken("USDC", "USDC", 6);
        eurc = new MockToken("EURC", "EURC", 6);

        // Rate 1 USDC = 0.92 EURC (both 6-dec).
        // rate18 = 0.92 * 1e18 = 9.2e17
        mockAdapter.setRate(address(usdc), address(eurc), 92 * 10 ** 16);

        // Seed adapter with EURC liquidity for swaps
        eurc.mint(address(mockAdapter), 1_000_000_000_000); // 1M EURC

        // Vendor gets USDC + approves the registry (registry pulls then forwards).
        usdc.mint(vendor, 1_000_000_000); // 1k USDC
        vm.prank(vendor);
        usdc.approve(address(reg), type(uint256).max);

        vm.prank(operator);
        reg.setAdapter(address(usdc), address(eurc), mockAdapter);
        // MockStableFXAdapter.swap is allow-listed; trust the registry
        // so the indirect swap path works in tests.
        mockAdapter.setTrustedCaller(address(reg), true);
    }

    function test_QuoteReturnsRateAndHashAndAdapter() public view {
        (uint256 dst, bytes32 hash_, uint64 expiresAt, address a) =
            reg.quote(address(usdc), address(eurc), 100_000_000);
        assertEq(dst, 92_000_000); // 100 USDC * 0.92 = 92 EURC
        assertGt(expiresAt, block.timestamp);
        assertEq(a, address(mockAdapter));
        assertTrue(hash_ != bytes32(0));
    }

    function test_QuoteUnknownPairReverts() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                StableFXAdapterRegistry.NoAdapterForPair.selector, address(eurc), address(usdc)
            )
        );
        reg.quote(address(eurc), address(usdc), 100);
    }

    // swap is now onlyOperator + takes explicit `payer`. Vendor
    // still pre-approves the registry; operator calls with payer=vendor
    // after off-chain screening attestation.

    function test_SwapHappyPath_MovesFunds_AndEmits() public {
        (uint256 expectedDst, bytes32 hash_,,) =
            reg.quote(address(usdc), address(eurc), 100_000_000);

        uint256 vendorUsdcBefore = usdc.balanceOf(vendor);
        uint256 recipientEurcBefore = eurc.balanceOf(recipient);

        vm.prank(operator);
        uint256 actualDst = reg.swap(
            vendor,
            address(usdc),
            address(eurc),
            100_000_000,
            expectedDst,
            hash_,
            bytes32(0),
            recipient
        );

        assertEq(actualDst, expectedDst);
        assertEq(usdc.balanceOf(vendor), vendorUsdcBefore - 100_000_000);
        assertEq(eurc.balanceOf(recipient), recipientEurcBefore + expectedDst);
    }

    function test_Swap_SlippageReverts() public {
        // registry now rejects bytes32(0) before forwarding;
        // tests must thread a real hash from quote() through swap().
        (, bytes32 hash_,,) = reg.quote(address(usdc), address(eurc), 100_000_000);
        vm.prank(operator);
        vm.expectRevert(
            abi.encodeWithSelector(MockStableFXAdapter.Slippage.selector, 92_000_000, 200_000_000)
        );
        reg.swap(
            vendor,
            address(usdc),
            address(eurc),
            100_000_000,
            200_000_000,
            hash_,
            bytes32(0),
            recipient
        );
    }

    function test_Swap_StaleQuoteReverts() public {
        vm.prank(operator);
        vm.expectRevert();
        reg.swap(
            vendor,
            address(usdc),
            address(eurc),
            100_000_000,
            1,
            bytes32(uint256(0xDEAD)),
            bytes32(0),
            recipient
        );
    }

    function test_Swap_AdapterNotLive_Reverts() public {
        mockAdapter.setLive(false);
        vm.prank(operator);
        vm.expectRevert(
            abi.encodeWithSelector(
                StableFXAdapterRegistry.AdapterNotLive.selector, address(mockAdapter)
            )
        );
        reg.swap(
            vendor, address(usdc), address(eurc), 100_000_000, 1, bytes32(0), bytes32(0), recipient
        );
    }

    function test_Swap_RoutesThroughPolicy_WhenSet() public {
        // thread a real hash so the EmptyQuoteHash guard
        // doesn't pre-empt the policy and successful paths.
        (, bytes32 hash_,,) = reg.quote(address(usdc), address(eurc), 100_000_000);
        vm.prank(operator);
        reg.setPolicy(policy);
        vm.prank(operator);
        vm.expectRevert(
            abi.encodeWithSelector(
                RoutePolicyEngine.CorridorDisabled.selector, USDC_EURC, bytes32(0)
            )
        );
        reg.swap(vendor, address(usdc), address(eurc), 100_000_000, 1, hash_, USDC_EURC, recipient);

        vm.prank(operator);
        policy.setPolicy(USDC_EURC, true, 0, false);
        vm.prank(operator);
        uint256 dst = reg.swap(
            vendor, address(usdc), address(eurc), 100_000_000, 1, hash_, USDC_EURC, recipient
        );
        assertEq(dst, 92_000_000);
    }

    /// @notice regression: caller-supplied screening bypass closed.
    function test_Swap_NonOperator_Reverts() public {
        vm.prank(vendor);
        vm.expectRevert(StableFXAdapterRegistry.NotOperator.selector);
        reg.swap(
            vendor, address(usdc), address(eurc), 100_000_000, 1, bytes32(0), bytes32(0), recipient
        );
    }

    function test_NonOperatorCannotSetAdapter() public {
        vm.prank(rando);
        vm.expectRevert(StableFXAdapterRegistry.NotOperator.selector);
        reg.setAdapter(address(usdc), address(eurc), mockAdapter);
    }

    function test_SwapAdapterReplacement_Atomic() public {
        // Replace adapter with a fresh one — subsequent quotes return the new one.
        MockStableFXAdapter newAdapter = new MockStableFXAdapter();
        newAdapter.setRate(address(usdc), address(eurc), 95 * 10 ** 16);
        eurc.mint(address(newAdapter), 1_000_000_000_000);
        // vendor already approved the registry; no per-adapter approval needed.

        vm.prank(operator);
        reg.setAdapter(address(usdc), address(eurc), newAdapter);

        (uint256 dst,,, address a) = reg.quote(address(usdc), address(eurc), 100_000_000);
        assertEq(dst, 95_000_000);
        assertEq(a, address(newAdapter));
    }

    function test_MockAdapter_InsufficientLiquidity_Reverts() public {
        // pull the hash before sweeping liquidity so the
        // EmptyQuoteHash guard doesn't pre-empt the liquidity error path.
        (, bytes32 hash_,,) = reg.quote(address(usdc), address(eurc), 100_000_000);
        vm.prank(address(this));
        mockAdapter.sweep(address(eurc), address(this), eurc.balanceOf(address(mockAdapter)));
        vm.prank(operator);
        vm.expectRevert(MockStableFXAdapter.InsufficientLiquidity.selector);
        reg.swap(vendor, address(usdc), address(eurc), 100_000_000, 1, hash_, bytes32(0), recipient);
    }

    // regression: quote hash must be stable across blocks
    // within the same TTL bucket so a real-world quote→swap (which
    // straddles blocks) doesn't revert with StaleQuote. Across the
    // bucket boundary the hash MUST change so stale quotes still fail.
    function test_MockAdapter_QuoteHashStableWithinTtlBucket() public {
        (uint256 d1, bytes32 h1, uint64 exp1) =
            mockAdapter.quote(address(usdc), address(eurc), 100_000_000);
        // advance time within the same TTL bucket
        vm.warp(block.timestamp + 10);
        (uint256 d2, bytes32 h2, uint64 exp2) =
            mockAdapter.quote(address(usdc), address(eurc), 100_000_000);
        assertEq(d1, d2);
        assertEq(h1, h2);
        assertEq(exp1, exp2);
    }

    function test_MockAdapter_QuoteHashChangesAcrossTtlBucket() public {
        (, bytes32 h1,) = mockAdapter.quote(address(usdc), address(eurc), 100_000_000);
        // Cross the TTL boundary (default quoteTtl = 60s)
        vm.warp(block.timestamp + 120);
        (, bytes32 h2,) = mockAdapter.quote(address(usdc), address(eurc), 100_000_000);
        assertTrue(h1 != h2);
    }

    function test_MockAdapter_SwapForwardingQuoteHash_AcrossBlocks() public {
        // Pre fix: quote at t0, swap at t0+5s → StaleQuote.
        // Post fix: still inside the same TTL bucket → swap succeeds.
        (uint256 expectedDst, bytes32 hash_,) =
            mockAdapter.quote(address(usdc), address(eurc), 100_000_000);
        vm.warp(block.timestamp + 5);
        vm.roll(block.number + 2);
        vm.prank(operator);
        uint256 dst = reg.swap(
            vendor,
            address(usdc),
            address(eurc),
            100_000_000,
            expectedDst,
            hash_,
            bytes32(0),
            recipient
        );
        assertEq(dst, expectedDst);
    }

    // regression: Pausable kill-switch must freeze swap
    // (incident response parity with InvoiceEscrow / CashoutOrderProcessor
    // / AgentEscrow / LPStaking). Owner can pause + unpause; non-owner
    // cannot.
    function test_Pause_BlocksSwap() public {
        reg.pause(); // test contract = owner per setUp
        vm.prank(operator);
        vm.expectRevert(); // OZ Pausable.EnforcedPause()
        reg.swap(
            vendor, address(usdc), address(eurc), 100_000_000, 1, bytes32(0), bytes32(0), recipient
        );
    }

    function test_Pause_NonOwner_Reverts() public {
        vm.prank(rando);
        vm.expectRevert(); // OZ Ownable.OwnableUnauthorizedAccount(rando)
        reg.pause();
    }

    function test_Unpause_RestoresSwap() public {
        // real hash required (registry rejects bytes32(0)).
        (, bytes32 hash_,,) = reg.quote(address(usdc), address(eurc), 100_000_000);
        reg.pause();
        reg.unpause();
        vm.prank(operator);
        uint256 dst = reg.swap(
            vendor, address(usdc), address(eurc), 100_000_000, 1, hash_, bytes32(0), recipient
        );
        assertEq(dst, 92_000_000);
    }

    // regression: defense-in-depth slippage check at the
    // registry. A buggy or malicious adapter that returns less than
    // minDstAmount without reverting must still be caught — the
    // registry re-validates before emitting SwapExecuted. The adapter
    // below mints destination tokens to recipient but ignores
    // minDstAmount, so the per-adapter floor is bypassed.
    function test_Swap_RegistrySlippageGuard_CatchesBrokenAdapter() public {
        BrokenAdapter bad = new BrokenAdapter();
        eurc.mint(address(bad), 1_000_000_000_000);
        vm.prank(operator);
        reg.setAdapter(address(usdc), address(eurc), bad);

        // pass any non-zero hash so the EmptyQuoteHash
        // guard doesn't pre-empt the registry's slippage check
        // (BrokenAdapter ignores the hash anyway).
        bytes32 anyHash = bytes32(uint256(0xC0FFEE));
        // Adapter will pay 50_000_000 EURC; vendor demands at least
        // 90_000_000 → adapter doesn't enforce → registry must catch.
        vm.prank(operator);
        vm.expectRevert(
            abi.encodeWithSelector(
                StableFXAdapterRegistry.SlippageAtRegistry.selector, 50_000_000, 90_000_000
            )
        );
        reg.swap(
            vendor,
            address(usdc),
            address(eurc),
            100_000_000,
            90_000_000,
            anyHash,
            bytes32(0),
            recipient
        );
    }

    function test_Swap_RejectsZeroQuoteHash() public {
        // regression: bytes32(0) is rejected at the
        // registry before adapter logic. Defense against a compromised
        // operator daemon trying to bypass the freshness check.
        vm.prank(operator);
        vm.expectRevert(StableFXAdapterRegistry.EmptyQuoteHash.selector);
        reg.swap(
            vendor, address(usdc), address(eurc), 100_000_000, 1, bytes32(0), bytes32(0), recipient
        );
    }
}

/// @dev adapter that deliberately ignores minDstAmount so
/// the registry-level guard is the only thing protecting recipient.
contract BrokenAdapter is IStableFXAdapter {
    function quote(address, address, uint256 srcAmount)
        external
        view
        returns (uint256, bytes32, uint64)
    {
        return (srcAmount / 2, bytes32(0), uint64(block.timestamp + 60));
    }

    function swap(
        address srcToken,
        address dstToken,
        uint256 srcAmount,
        uint256, /* minDstAmount intentionally ignored */
        bytes32,
        address recipient
    ) external returns (uint256 dstAmount) {
        srcToken; // silence unused warnings
        dstAmount = srcAmount / 2;
        // Adapter has already received srcToken from registry; pay recipient
        // half the requested amount regardless of minDstAmount.
        IERC20Like(dstToken).transfer(recipient, dstAmount);
    }

    function isLive() external pure returns (bool) {
        return true;
    }
}

interface IERC20Like {
    function transfer(address to, uint256 amount) external returns (bool);
}
