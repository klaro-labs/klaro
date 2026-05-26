// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import { Test } from "forge-std/Test.sol";
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { Pausable } from "@openzeppelin/contracts/utils/Pausable.sol";
import { FeeSplitter } from "../src/FeeSplitter.sol";
import { KlaroConfig } from "../src/KlaroConfig.sol";

contract MockUSDC is ERC20 {
    constructor() ERC20("Mock USDC", "USDC") { }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amt) external {
        _mint(to, amt);
    }
}

contract FeeSplitterTest is Test {
    FeeSplitter splitter;
    MockUSDC usdc;

    address operator = address(0xA11CE);
    address treasury = address(0x7);
    address reserve = address(0x8);
    address lpPool = address(0x9);
    address rando = address(0xBEEF);

    bytes32 constant DEFAULT_SPLIT = keccak256("klaro.protocol.default");

    function setUp() public {
        vm.chainId(KlaroConfig.ARC_TESTNET_CHAIN_ID);
        splitter = new FeeSplitter(operator);
        usdc = new MockUSDC();
        // distribute* is now allow-listed; tests
        // call it as the test contract, so trust this contract explicitly.
        // setTrustedCaller is now owner-only (was
        // operator-only); test contract is the deployer/owner.
        splitter.setTrustedCaller(address(this), true);
    }

    function _threeWaySplit() internal pure returns (FeeSplitter.Split[] memory) {
        FeeSplitter.Split[] memory items = new FeeSplitter.Split[](3);
        items[0] = FeeSplitter.Split({ payee: address(0x7), bps: 4000 }); // treasury 40%
        items[1] = FeeSplitter.Split({ payee: address(0x8), bps: 3500 }); // reserve 35%
        items[2] = FeeSplitter.Split({ payee: address(0x9), bps: 2500 }); // lpPool 25%
        return items;
    }

    function test_HappyPath_SumsToAmount() public {
        vm.prank(operator);
        splitter.setSplit(DEFAULT_SPLIT, _threeWaySplit());

        uint256 amount = 1_000_000_000; // 1000 USDC
        usdc.mint(address(splitter), amount);

        splitter.distribute(address(usdc), amount, DEFAULT_SPLIT);

        assertEq(usdc.balanceOf(treasury), 400_000_000); // 40%
        assertEq(usdc.balanceOf(reserve), 350_000_000); // 35%
        assertEq(usdc.balanceOf(lpPool), 250_000_000); // 25% (last → also absorbs dust)
        assertEq(
            usdc.balanceOf(treasury) + usdc.balanceOf(reserve) + usdc.balanceOf(lpPool), amount
        );
    }

    function test_DustGoesToLastPayee() public {
        // 100 USDC split 33/33/34 → first two get 33.000000 each, last gets 34.000001
        FeeSplitter.Split[] memory items = new FeeSplitter.Split[](3);
        items[0] = FeeSplitter.Split({ payee: address(0x7), bps: 3333 });
        items[1] = FeeSplitter.Split({ payee: address(0x8), bps: 3333 });
        items[2] = FeeSplitter.Split({ payee: address(0x9), bps: 3334 });
        vm.prank(operator);
        splitter.setSplit(DEFAULT_SPLIT, items);

        uint256 amount = 100_000_001; // odd amount to force rounding
        usdc.mint(address(splitter), amount);
        splitter.distribute(address(usdc), amount, DEFAULT_SPLIT);

        uint256 a = (amount * 3333) / 10_000;
        uint256 b = (amount * 3333) / 10_000;
        assertEq(usdc.balanceOf(address(0x7)), a);
        assertEq(usdc.balanceOf(address(0x8)), b);
        assertEq(usdc.balanceOf(address(0x9)), amount - a - b); // dust absorbed
        // Conservation invariant
        assertEq(
            usdc.balanceOf(address(0x7)) + usdc.balanceOf(address(0x8))
                + usdc.balanceOf(address(0x9)),
            amount
        );
    }

    function test_SetSplit_RejectsBadBpsSum() public {
        FeeSplitter.Split[] memory items = new FeeSplitter.Split[](2);
        items[0] = FeeSplitter.Split({ payee: address(0x7), bps: 5000 });
        items[1] = FeeSplitter.Split({ payee: address(0x8), bps: 4000 }); // sums to 9000
        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(FeeSplitter.BadBpsSum.selector, 9000));
        splitter.setSplit(DEFAULT_SPLIT, items);
    }

    function test_SetSplit_RejectsZeroPayee() public {
        FeeSplitter.Split[] memory items = new FeeSplitter.Split[](1);
        items[0] = FeeSplitter.Split({ payee: address(0), bps: 10_000 });
        vm.prank(operator);
        vm.expectRevert(FeeSplitter.ZeroPayee.selector);
        splitter.setSplit(DEFAULT_SPLIT, items);
    }

    function test_SetSplit_RejectsZeroBps() public {
        FeeSplitter.Split[] memory items = new FeeSplitter.Split[](2);
        items[0] = FeeSplitter.Split({ payee: address(0x7), bps: 10_000 });
        items[1] = FeeSplitter.Split({ payee: address(0x8), bps: 0 });
        vm.prank(operator);
        vm.expectRevert(FeeSplitter.ZeroBps.selector);
        splitter.setSplit(DEFAULT_SPLIT, items);
    }

    function test_SetSplit_RejectsEmpty() public {
        FeeSplitter.Split[] memory items = new FeeSplitter.Split[](0);
        vm.prank(operator);
        vm.expectRevert(FeeSplitter.EmptySplit.selector);
        splitter.setSplit(DEFAULT_SPLIT, items);
    }

    function test_OnlyOperatorCanSet() public {
        FeeSplitter.Split[] memory items = _threeWaySplit();
        vm.prank(rando);
        vm.expectRevert(FeeSplitter.NotOperator.selector);
        splitter.setSplit(DEFAULT_SPLIT, items);
    }

    function test_Distribute_UnknownSplitReverts() public {
        usdc.mint(address(splitter), 100);
        vm.expectRevert(abi.encodeWithSelector(FeeSplitter.UnknownSplit.selector, DEFAULT_SPLIT));
        splitter.distribute(address(usdc), 100, DEFAULT_SPLIT);
    }

    function test_Distribute_InsufficientBalanceReverts() public {
        vm.prank(operator);
        splitter.setSplit(DEFAULT_SPLIT, _threeWaySplit());

        usdc.mint(address(splitter), 50);
        vm.expectRevert(abi.encodeWithSelector(FeeSplitter.InsufficientBalance.selector, 50, 100));
        splitter.distribute(address(usdc), 100, DEFAULT_SPLIT);
    }

    function test_Distribute_AmountZeroReverts() public {
        vm.prank(operator);
        splitter.setSplit(DEFAULT_SPLIT, _threeWaySplit());
        vm.expectRevert(FeeSplitter.AmountZero.selector);
        splitter.distribute(address(usdc), 0, DEFAULT_SPLIT);
    }

    function test_SinglePayee_GetsEverything() public {
        FeeSplitter.Split[] memory items = new FeeSplitter.Split[](1);
        items[0] = FeeSplitter.Split({ payee: treasury, bps: 10_000 });
        vm.prank(operator);
        splitter.setSplit(DEFAULT_SPLIT, items);

        usdc.mint(address(splitter), 999_999_999);
        splitter.distribute(address(usdc), 999_999_999, DEFAULT_SPLIT);
        assertEq(usdc.balanceOf(treasury), 999_999_999);
    }

    function test_ResetSplit_ReplacesOldPayees() public {
        FeeSplitter.Split[] memory a = new FeeSplitter.Split[](2);
        a[0] = FeeSplitter.Split({ payee: address(0x7), bps: 5000 });
        a[1] = FeeSplitter.Split({ payee: address(0x8), bps: 5000 });
        vm.prank(operator);
        splitter.setSplit(DEFAULT_SPLIT, a);
        assertEq(splitter.payeeCount(DEFAULT_SPLIT), 2);

        FeeSplitter.Split[] memory b = new FeeSplitter.Split[](1);
        b[0] = FeeSplitter.Split({ payee: address(0x9), bps: 10_000 });
        vm.prank(operator);
        splitter.setSplit(DEFAULT_SPLIT, b);
        assertEq(splitter.payeeCount(DEFAULT_SPLIT), 1);
        assertEq(splitter.getSplit(DEFAULT_SPLIT)[0].payee, address(0x9));
    }

    /// @dev Property-style fuzz: conservation must hold for any positive
    /// amount + any valid 2-3 payee config.
    function testFuzz_ConservationInvariant(uint96 amountRaw, uint16 split1) public {
        uint256 amount = uint256(amountRaw) + 1; // amount >= 1
        uint16 b1 = uint16(bound(split1, 1, 9999));
        uint16 b2 = uint16(BPS_TOTAL_LOCAL - b1);

        FeeSplitter.Split[] memory items = new FeeSplitter.Split[](2);
        items[0] = FeeSplitter.Split({ payee: treasury, bps: b1 });
        items[1] = FeeSplitter.Split({ payee: reserve, bps: b2 });
        vm.prank(operator);
        splitter.setSplit(DEFAULT_SPLIT, items);

        usdc.mint(address(splitter), amount);
        splitter.distribute(address(usdc), amount, DEFAULT_SPLIT);

        assertEq(usdc.balanceOf(treasury) + usdc.balanceOf(reserve), amount);
    }

    uint16 constant BPS_TOTAL_LOCAL = 10_000;

    // ─── distributeAdHoc (per-invoice splits) ───────────────────────────

    function test_DistributeAdHoc_HappyPath() public {
        FeeSplitter.Split[] memory items = new FeeSplitter.Split[](2);
        items[0] = FeeSplitter.Split({ payee: treasury, bps: 200 }); // 2% platform fee
        items[1] = FeeSplitter.Split({ payee: rando, bps: 9800 }); // 98% net vendor

        uint256 amount = 1_000_000_000;
        usdc.mint(address(splitter), amount);

        splitter.distributeAdHoc(address(usdc), amount, items);
        assertEq(usdc.balanceOf(treasury), 20_000_000);
        assertEq(usdc.balanceOf(rando), 980_000_000);
    }

    function test_DistributeAdHoc_RejectsBadSum() public {
        FeeSplitter.Split[] memory items = new FeeSplitter.Split[](2);
        items[0] = FeeSplitter.Split({ payee: treasury, bps: 5000 });
        items[1] = FeeSplitter.Split({ payee: rando, bps: 4500 });
        usdc.mint(address(splitter), 100);
        vm.expectRevert(abi.encodeWithSelector(FeeSplitter.BadBpsSum.selector, 9500));
        splitter.distributeAdHoc(address(usdc), 100, items);
    }

    function test_DistributeAdHoc_NoStorageWrite() public {
        FeeSplitter.Split[] memory items = new FeeSplitter.Split[](1);
        items[0] = FeeSplitter.Split({ payee: treasury, bps: 10_000 });
        usdc.mint(address(splitter), 100);
        splitter.distributeAdHoc(address(usdc), 100, items);
        // splits storage for an arbitrary id should still be empty
        assertEq(splitter.payeeCount(keccak256("any-id")), 0);
    }

    // ─── ─────────────────────────────────────

    function test_Distribute_RevertsForNonTrustedCaller() public {
        vm.prank(operator);
        splitter.setSplit(DEFAULT_SPLIT, _threeWaySplit());
        usdc.mint(address(splitter), 100);
        // rando (not trusted) cannot drain stuck balance.
        vm.prank(rando);
        vm.expectRevert(FeeSplitter.NotTrustedCaller.selector);
        splitter.distribute(address(usdc), 100, DEFAULT_SPLIT);
    }

    function test_DistributeAdHoc_RevertsForNonTrustedCaller() public {
        FeeSplitter.Split[] memory items = new FeeSplitter.Split[](1);
        items[0] = FeeSplitter.Split({ payee: treasury, bps: 10_000 });
        usdc.mint(address(splitter), 100);
        vm.prank(rando);
        vm.expectRevert(FeeSplitter.NotTrustedCaller.selector);
        splitter.distributeAdHoc(address(usdc), 100, items);
    }

    function test_SetTrustedCaller_OwnerOnly() public {
        // was OperatorOnly; now OwnerOnly to prevent
        // operator-key compromise from self-granting membership.
        vm.prank(rando);
        vm.expectRevert(); // OZ Ownable.OwnableUnauthorizedAccount(rando)
        splitter.setTrustedCaller(rando, true);
    }

    function test_HashSplits_DeterministicAndMatchesOffchain() public {
        FeeSplitter.Split[] memory items = new FeeSplitter.Split[](2);
        items[0] = FeeSplitter.Split({ payee: treasury, bps: 200 });
        items[1] = FeeSplitter.Split({ payee: rando, bps: 9800 });
        bytes32 a = splitter.hashSplits(items);
        bytes32 b = splitter.hashSplits(items);
        assertEq(a, b);
        // Hash must match the same encoding off-chain consumers will use
        assertEq(a, keccak256(abi.encode(items)));
    }

    // regression: Pausable parity with the rest of the
    // money-moving Klaro stack. Owner pauses; both distribute paths
    // revert; unpause restores them.
    function test_Pause_BlocksDistribute() public {
        vm.prank(operator);
        splitter.setSplit(DEFAULT_SPLIT, _threeWaySplit());
        uint256 amount = 1_000_000_000;
        usdc.mint(address(splitter), amount);
        splitter.pause();
        vm.expectRevert(Pausable.EnforcedPause.selector);
        splitter.distribute(address(usdc), amount, DEFAULT_SPLIT);
    }

    function test_Pause_BlocksDistributeAdHoc() public {
        uint256 amount = 1_000_000_000;
        usdc.mint(address(splitter), amount);
        splitter.pause();
        vm.expectRevert(Pausable.EnforcedPause.selector);
        splitter.distributeAdHoc(address(usdc), amount, _threeWaySplit());
    }

    function test_Pause_NonOwner_Reverts() public {
        vm.prank(rando);
        vm.expectRevert(); // OZ Ownable.OwnableUnauthorizedAccount(rando)
        splitter.pause();
    }

    function test_Unpause_RestoresDistribute() public {
        vm.prank(operator);
        splitter.setSplit(DEFAULT_SPLIT, _threeWaySplit());
        uint256 amount = 1_000_000_000;
        usdc.mint(address(splitter), amount);
        splitter.pause();
        splitter.unpause();
        splitter.distribute(address(usdc), amount, DEFAULT_SPLIT);
        assertEq(usdc.balanceOf(address(0x7)), 400_000_000);
    }
}
