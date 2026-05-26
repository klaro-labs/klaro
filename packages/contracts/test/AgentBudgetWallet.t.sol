// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import { Test } from "forge-std/Test.sol";
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { AgentBudgetWallet } from "../src/AgentBudgetWallet.sol";
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

contract AgentBudgetWalletTest is Test {
    AgentBudgetWallet w;
    MockUSDC usdc;

    address owner_ = address(0xA1); // agent
    address recipient1 = address(0xB1);
    address recipient2 = address(0xB2);
    address rando = address(0xBEEF);

    uint256 constant CAP = 500_000_000; // $500/day
    uint256 constant FUND = 5_000_000_000; // $5k seed

    function setUp() public {
        vm.chainId(KlaroConfig.ARC_TESTNET_CHAIN_ID);
        usdc = new MockUSDC();

        vm.prank(owner_);
        w = new AgentBudgetWallet(address(usdc), CAP);

        // Owner funds
        usdc.mint(owner_, FUND);
        vm.prank(owner_);
        usdc.approve(address(w), type(uint256).max);
        vm.prank(owner_);
        w.fund(FUND);

        // Allowlist recipient1 only
        vm.prank(owner_);
        w.setAllowlist(recipient1, true);
    }

    function test_FundLandsInWallet() public view {
        assertEq(w.balance(), FUND);
    }

    function test_Spend_HappyPath_DeductsWindow() public {
        vm.prank(owner_);
        w.spend(recipient1, 100_000_000);
        assertEq(usdc.balanceOf(recipient1), 100_000_000);
        assertEq(w.windowSpentUsdc(), 100_000_000);
        assertEq(w.remainingInWindow(), CAP - 100_000_000);
    }

    function test_Spend_NonAllowlisted_Reverts() public {
        vm.prank(owner_);
        vm.expectRevert(abi.encodeWithSelector(AgentBudgetWallet.NotAllowed.selector, recipient2));
        w.spend(recipient2, 50_000_000);
    }

    function test_Spend_AboveDailyCap_Reverts() public {
        vm.prank(owner_);
        w.spend(recipient1, 400_000_000);
        vm.prank(owner_);
        vm.expectRevert(
            abi.encodeWithSelector(
                AgentBudgetWallet.DailyCapExceeded.selector,
                200_000_000, // requested
                100_000_000 // remaining
            )
        );
        w.spend(recipient1, 200_000_000);
    }

    function test_Window_RollsAfter24h_CapResets() public {
        vm.prank(owner_);
        w.spend(recipient1, 500_000_000); // full cap

        vm.warp(block.timestamp + 1 days + 1);
        vm.prank(owner_);
        w.spend(recipient1, 500_000_000); // fresh window allows another full cap
        assertEq(usdc.balanceOf(recipient1), 1_000_000_000);
    }

    function test_NonOwner_CannotSpend() public {
        vm.prank(rando);
        vm.expectRevert();
        w.spend(recipient1, 1);
    }

    function test_Withdraw_OnlyOwner() public {
        vm.prank(rando);
        vm.expectRevert();
        w.withdraw(rando, 1);
        vm.prank(owner_);
        w.withdraw(owner_, 1_000_000_000);
        assertEq(w.balance(), FUND - 1_000_000_000);
    }

    function test_AllowlistBatch_Works() public {
        address[] memory addrs = new address[](2);
        addrs[0] = recipient1;
        addrs[1] = recipient2;
        vm.prank(owner_);
        w.setAllowlistBatch(addrs, true);
        assertTrue(w.allowlist(recipient1));
        assertTrue(w.allowlist(recipient2));
    }

    function test_Pause_BlocksSpend() public {
        vm.prank(owner_);
        w.pause();
        vm.prank(owner_);
        vm.expectRevert();
        w.spend(recipient1, 1);
    }

    /// @notice regression: `withdraw` was missing `whenNotPaused`.
    /// Compromised agent key + emergency `pause()` was not a true
    /// freeze because the owner-as-attacker could still drain
    /// via `withdraw`. Now both fund exits are pause-gated.
    function test_Pause_BlocksWithdraw() public {
        vm.prank(owner_);
        w.pause();
        vm.prank(owner_);
        vm.expectRevert();
        w.withdraw(recipient1, 1);
    }

    /// @notice regression flip: `setDailyCap(0)` used to mean
    /// "unlimited spending" because the spend guard read
    /// `dailyCapUsdc != 0 && ...`. Operator calling it to
    /// "freeze" instead unlocked drain. Now zero is rejected
    /// outright; halt is via `pause()`.
    function test_SetDailyCap_Zero_Reverts() public {
        vm.prank(owner_);
        vm.expectRevert(AgentBudgetWallet.AmountZero.selector);
        w.setDailyCap(0);
    }

    // regression: `fund` was anyone-callable. Attacker
    // could pump balance() to skew off-chain accounting + trust
    // signals + bypass the kill-switch. Now: onlyOwner + whenNotPaused.
    function test_Fund_NonOwner_Reverts() public {
        usdc.mint(rando, 1_000_000);
        vm.prank(rando);
        usdc.approve(address(w), type(uint256).max);
        vm.prank(rando);
        vm.expectRevert(); // OZ Ownable.OwnableUnauthorizedAccount(rando)
        w.fund(1_000_000);
    }

    function test_Pause_BlocksFund() public {
        usdc.mint(owner_, 100_000_000);
        vm.prank(owner_);
        usdc.approve(address(w), type(uint256).max);
        vm.prank(owner_);
        w.pause();
        vm.prank(owner_);
        vm.expectRevert(); // Pausable.EnforcedPause
        w.fund(50_000_000);
    }
}
