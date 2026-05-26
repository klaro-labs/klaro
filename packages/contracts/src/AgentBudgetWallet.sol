// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { Pausable } from "@openzeppelin/contracts/utils/Pausable.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

import { KlaroConfig } from "./KlaroConfig.sol";

/// @title AgentBudgetWallet
/// @notice Per-agent USDC budget wallet with daily-cap + recipient allowlist.
/// **Testnet shim** — Circle's first-party spend policies are
/// mainnet-only (per build-plan ). At mainnet this contract is
/// swapped for a Circle Wallet with their spend-policy enforcement;
/// the consumer interface (`spend(to, amount)`) stays identical so
/// off-chain callers don't change.
/// Single owner = the agent. Owner deposits USDC + configures policy;
/// the agent (or its delegated session key) calls `spend()` for every
/// outgoing payment. Reverts loudly on:
/// - non-allowlisted recipient
/// - daily cap exceeded
/// - insufficient balance
contract AgentBudgetWallet is ReentrancyGuard, Pausable, Ownable {
    using SafeERC20 for IERC20;

    IERC20 public immutable usdc;

    uint256 public dailyCapUsdc;
    mapping(address => bool) public allowlist;

    uint64 public windowStart;
    uint256 public windowSpentUsdc;
    uint64 public constant WINDOW = 1 days;

    event Funded(address indexed from, uint256 amount);
    event Spent(address indexed to, uint256 amount, uint256 windowSpentAfter);
    event DailyCapChanged(uint256 previous, uint256 next);
    event AllowlistChanged(address indexed addr, bool allowed);
    event Withdrawn(address indexed to, uint256 amount);

    error NotAllowed(address to);
    error DailyCapExceeded(uint256 requested, uint256 remainingInWindow);
    error AmountZero();

    constructor(address usdc_, uint256 dailyCap_) Ownable(msg.sender) {
        KlaroConfig.requireArcTestnet();
        // closed
        // setDailyCap(0) but left this constructor accepting it.
        // Deploying with zero leaves spend()'s `!= 0 && ...` guard
        // short-circuited → uncapped withdrawals to allowlist. Reject
        // at construction too; halt via `pause()` only.
        if (dailyCap_ == 0) revert AmountZero();
        usdc = IERC20(usdc_);
        dailyCapUsdc = dailyCap_;
        windowStart = uint64(block.timestamp);
        emit DailyCapChanged(0, dailyCap_);
    }

    // ─── Policy mutation ────────────────────────────────────────────────

    function setDailyCap(uint256 next) external onlyOwner {
        // `spend()`'s cap guard
        // was `dailyCapUsdc != 0 && nextSpent > dailyCapUsdc`, so
        // calling `setDailyCap(0)` to "freeze spending" instead
        // unlocked uncapped withdrawals to allowlisted addresses —
        // exact opposite of operator intent. Reject zero so the only
        // way to halt spending is `pause()`, which is unambiguous.
        if (next == 0) revert AmountZero();
        emit DailyCapChanged(dailyCapUsdc, next);
        dailyCapUsdc = next;
    }

    function setAllowlist(address addr, bool allowed) external onlyOwner {
        allowlist[addr] = allowed;
        emit AllowlistChanged(addr, allowed);
    }

    function setAllowlistBatch(address[] calldata addrs, bool allowed) external onlyOwner {
        for (uint256 i = 0; i < addrs.length; i++) {
            allowlist[addrs[i]] = allowed;
            emit AllowlistChanged(addrs[i], allowed);
        }
    }

    // ─── Funding ────────────────────────────────────────────────────────

    /// @notice Owner deposits USDC into the wallet. Caller must have approved
    /// this contract.
    /// @dev previously callable by anyone (gift attack
    /// class — same as LPStaking.addStake fix). An
    /// attacker could pump `balance()` to skew off-chain
    /// accounting / trust-score signals; under emergency `pause()`
    /// the deposit still landed because `fund` skipped
    /// `whenNotPaused`, undermining the kill-switch story.
    /// Owner can always recover via `withdraw`, so this was
    /// reputational/grief, not stuck-fund — closed at P2.
    function fund(uint256 amount) external onlyOwner nonReentrant whenNotPaused {
        if (amount == 0) revert AmountZero();
        usdc.safeTransferFrom(msg.sender, address(this), amount);
        emit Funded(msg.sender, amount);
    }

    /// @notice Owner withdraws any unspent USDC.
    /// @dev added `whenNotPaused`.
    /// The spend-policy story depends on `pause()` being a true
    /// freeze — if the agent's key is compromised and the
    /// emergency response is to `pause()`, the attacker must NOT
    /// have a second exit via `withdraw`. With the modifier in
    /// place, both fund-moving entrypoints (`spend` and
    /// `withdraw`) are subject to the same kill switch.
    function withdraw(address to, uint256 amount) external onlyOwner nonReentrant whenNotPaused {
        usdc.safeTransfer(to, amount);
        emit Withdrawn(to, amount);
    }

    // ─── Spend ──────────────────────────────────────────────────────────

    /// @notice Spend `amount` to `to`. Only the agent (owner) may call.
    /// Rolls the daily window if expired before checking the cap.
    function spend(address to, uint256 amount) external onlyOwner nonReentrant whenNotPaused {
        if (amount == 0) revert AmountZero();
        if (!allowlist[to]) revert NotAllowed(to);

        // Roll window if expired.
        if (block.timestamp >= windowStart + WINDOW) {
            windowStart = uint64(block.timestamp);
            windowSpentUsdc = 0;
        }

        uint256 nextSpent = windowSpentUsdc + amount;
        if (dailyCapUsdc != 0 && nextSpent > dailyCapUsdc) {
            uint256 remaining = dailyCapUsdc > windowSpentUsdc ? dailyCapUsdc - windowSpentUsdc : 0;
            revert DailyCapExceeded(amount, remaining);
        }

        windowSpentUsdc = nextSpent;
        usdc.safeTransfer(to, amount);
        emit Spent(to, amount, nextSpent);
    }

    // ─── Admin ──────────────────────────────────────────────────────────

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // ─── Views ──────────────────────────────────────────────────────────

    function remainingInWindow() external view returns (uint256) {
        if (block.timestamp >= windowStart + WINDOW) return dailyCapUsdc;
        return dailyCapUsdc > windowSpentUsdc ? dailyCapUsdc - windowSpentUsdc : 0;
    }

    function balance() external view returns (uint256) {
        return usdc.balanceOf(address(this));
    }
}
