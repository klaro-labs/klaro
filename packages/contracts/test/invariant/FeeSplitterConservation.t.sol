// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import { Test, StdInvariant } from "forge-std/Test.sol";
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { FeeSplitter } from "../../src/FeeSplitter.sol";
import { KlaroConfig } from "../../src/KlaroConfig.sol";

/// Foundry-native invariant for THREAT_MODEL §5 invariant I3 (FeeSplitter
/// dust-conservation): for ANY amount and ANY valid BPS split, the sum of
/// payouts equals the amount in — the "last payee absorbs the rounding dust"
/// arithmetic must never leak or mint value. The Echidna stub for this same
/// property is deliberately unwired (reverts), so this is the live coverage.
///
/// Fuzzing earns its keep here: the dust case only shows up when
/// `amount * bps / 10_000` truncates, which depends on the exact (amount, bps)
/// pair — precisely what a stateful fuzzer explores and fixed unit tests don't.

contract MockToken is ERC20 {
    constructor() ERC20("Mock USDC", "USDC") { }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amt) external {
        _mint(to, amt);
    }
}

/// @dev The fuzzer drives `distribute()` with random amount + split shape. Every
/// call funds the splitter with exactly `amount` then distributes it, so a
/// correct splitter ends each call holding zero. `ghostTotalIn` accumulates the
/// funded total so the invariant can check total-out == total-in.
contract FeeSplitterHandler is Test {
    FeeSplitter public immutable splitter;
    MockToken public immutable token;

    // Fixed, distinct, non-zero payee pool. Each distribute uses the first `n`.
    address[5] public payees;

    uint256 public ghostTotalIn;
    uint256 public ghostCalls;

    constructor(FeeSplitter s, MockToken t) {
        splitter = s;
        token = t;
        payees[0] = address(0xBEEF01);
        payees[1] = address(0xBEEF02);
        payees[2] = address(0xBEEF03);
        payees[3] = address(0xBEEF04);
        payees[4] = address(0xBEEF05);
    }

    function payeeCount() external pure returns (uint256) {
        return 5;
    }

    /// Fuzz entry: distribute a bounded random `amount` across a random valid
    /// split. Inputs are constructed to always satisfy distributeAdHoc's guards
    /// (amount > 0, n > 0, every bps > 0, sum == 10_000, payee != 0), so the
    /// call never reverts and the conservation invariant is always reachable.
    function distribute(uint256 amountSeed, uint256 nSeed, uint256 splitSeed) external {
        uint256 amount = bound(amountSeed, 1, 1e18); // up to 1e12 USDC
        FeeSplitter.Split[] memory items = _buildSplit(nSeed, splitSeed);

        token.mint(address(splitter), amount);
        splitter.distributeAdHoc(address(token), amount, items);

        ghostTotalIn += amount;
        ghostCalls += 1;
    }

    /// Build a valid split: pick n in [1,5], hand out random bps that each are
    /// >= 1 and sum to exactly 10_000, with the last payee taking the remainder.
    function _buildSplit(uint256 nSeed, uint256 splitSeed)
        internal
        view
        returns (FeeSplitter.Split[] memory items)
    {
        uint256 n = bound(nSeed, 1, 5);
        items = new FeeSplitter.Split[](n);
        if (n == 1) {
            items[0] = FeeSplitter.Split({ payee: payees[0], bps: 10_000 });
            return items;
        }
        uint256 remaining = 10_000;
        for (uint256 i = 0; i < n - 1; i++) {
            // Reserve at least 1 bps for each still-unassigned payee (the rest
            // plus the last), so `remaining` can never drop below 1.
            uint256 maxForThis = remaining - (n - 1 - i);
            uint256 bps = bound(
                uint256(keccak256(abi.encode(splitSeed, i))), 1, maxForThis
            );
            items[i] = FeeSplitter.Split({ payee: payees[i], bps: uint16(bps) });
            remaining -= bps;
        }
        items[n - 1] = FeeSplitter.Split({ payee: payees[n - 1], bps: uint16(remaining) });
    }
}

contract FeeSplitterConservationInvariant is StdInvariant, Test {
    FeeSplitter splitter;
    MockToken token;
    FeeSplitterHandler handler;

    function setUp() public {
        vm.chainId(KlaroConfig.ARC_TESTNET_CHAIN_ID);
        splitter = new FeeSplitter(address(0xA11CE)); // operator unused here
        token = new MockToken();
        handler = new FeeSplitterHandler(splitter, token);
        // distribute* is allow-listed; the handler is the caller.
        splitter.setTrustedCaller(address(handler), true);

        targetContract(address(handler));
    }

    /// I3: value is conserved across every distribution. Two halves:
    ///  - the splitter retains nothing (every wei funded was paid out), and
    ///  - the total received by all payees equals the total ever funded.
    /// Together: no dust leaks, no value is minted.
    function invariant_feeSplitterConservesValue() public view {
        assertEq(
            token.balanceOf(address(splitter)),
            0,
            "splitter retained dust/value after distribution"
        );

        uint256 paidOut;
        for (uint256 i = 0; i < 5; i++) {
            paidOut += token.balanceOf(handler.payees(i));
        }
        assertEq(paidOut, handler.ghostTotalIn(), "sum(payouts) != sum(amounts in)");
    }
}
