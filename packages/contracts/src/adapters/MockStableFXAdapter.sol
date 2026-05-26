// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

import { IStableFXAdapter } from "./IStableFXAdapter.sol";

/// @title MockStableFXAdapter
/// @notice Deterministic FX adapter used until Circle StableFX TEST access is
/// granted. Operator sets per-pair rates (basis-point spread baked
/// into them) + funds the adapter with destination-token liquidity.
/// Swap pulls `srcAmount` from caller, returns `dstAmount` from the
/// adapter's own balance. UI labels every adapter using this contract
/// as "simulated" per .
contract MockStableFXAdapter is IStableFXAdapter, Ownable {
    using SafeERC20 for IERC20;

    /// @notice (srcToken, dstToken) → rate (scaled 1e18). dstAmount = srcAmount * rate / 1e18.
    mapping(address => mapping(address => uint256)) public rate;

    /// @notice Quote lifetime in seconds. Operator-tunable.
    uint64 public quoteTtl = 60;

    bool public liveFlag = true;

    /// @notice Allow-list for `swap`. Audit fix (loop ,
    /// 2026-05-25): `swap` was permissionless and never pulled
    /// `srcToken`. Any external caller could call directly and
    /// drain the adapter's `dstToken` liquidity for any rate the
    /// owner had set. Only the registry should reach `swap`.
    mapping(address => bool) public trustedCallers;

    event RateSet(address indexed srcToken, address indexed dstToken, uint256 rate);
    event QuoteTtlSet(uint64 ttl);
    event LiveFlagSet(bool live);
    event TrustedCallerSet(address indexed caller, bool trusted);

    error NoRate(address srcToken, address dstToken);
    error Slippage(uint256 actualDst, uint256 minDst);
    error StaleQuote(bytes32 expected, bytes32 actual);
    error InsufficientLiquidity();
    error NotTrustedCaller();

    modifier onlyTrustedCaller() {
        if (!trustedCallers[msg.sender]) revert NotTrustedCaller();
        _;
    }

    constructor() Ownable(msg.sender) { }

    function setRate(address srcToken, address dstToken, uint256 rate18) external onlyOwner {
        rate[srcToken][dstToken] = rate18;
        emit RateSet(srcToken, dstToken, rate18);
    }

    function setQuoteTtl(uint64 ttl) external onlyOwner {
        quoteTtl = ttl;
        emit QuoteTtlSet(ttl);
    }

    function setLive(bool live) external onlyOwner {
        liveFlag = live;
        emit LiveFlagSet(live);
    }

    function setTrustedCaller(address caller, bool trusted) external onlyOwner {
        trustedCallers[caller] = trusted;
        emit TrustedCallerSet(caller, trusted);
    }

    function isLive() external view returns (bool) {
        return liveFlag;
    }

    /// @notice previous `expiresAt = block.timestamp + quoteTtl`
    /// changed every block, so `quoteHash` did too — any caller that
    /// honestly forwarded the hash to `swap` more than one block after
    /// quoting reverted with `StaleQuote`. The whole quote-integrity
    /// feature was a no-op (tests passed only because swaps landed in
    /// the same block or passed `bytes32(0)` to skip the check).
    /// Now we bucket `expiresAt` to the next `quoteTtl` boundary, so
    /// every call within the same window returns the same hash; the
    /// next bucket boundary naturally invalidates stale quotes. Rate
    /// changes still invalidate immediately (different dstAmount →
    /// different hash).
    function quote(address srcToken, address dstToken, uint256 srcAmount)
        public
        view
        returns (uint256 dstAmount, bytes32 quoteHash, uint64 expiresAt)
    {
        uint256 r = rate[srcToken][dstToken];
        if (r == 0) revert NoRate(srcToken, dstToken);
        dstAmount = (srcAmount * r) / 1e18;
        uint64 ttl = quoteTtl == 0 ? 1 : quoteTtl;
        expiresAt = ((uint64(block.timestamp) / ttl) + 1) * ttl;
        quoteHash = keccak256(
            abi.encode(srcToken, dstToken, srcAmount, dstAmount, expiresAt, address(this))
        );
    }

    /// @notice Caller (registry) must have already transferred `srcAmount` of
    /// `srcToken` into this adapter before calling. Matches the
    /// FeeSplitter push-not-pull pattern: no persistent allowances.
    function swap(
        address srcToken,
        address dstToken,
        uint256 srcAmount,
        uint256 minDstAmount,
        bytes32 expectedQuoteHash,
        address recipient
    ) external onlyTrustedCaller returns (uint256 dstAmount) {
        (uint256 fresh, bytes32 freshHash,) = quote(srcToken, dstToken, srcAmount);
        if (expectedQuoteHash != bytes32(0) && freshHash != expectedQuoteHash) {
            revert StaleQuote(expectedQuoteHash, freshHash);
        }
        if (fresh < minDstAmount) revert Slippage(fresh, minDstAmount);
        if (IERC20(dstToken).balanceOf(address(this)) < fresh) {
            revert InsufficientLiquidity();
        }
        IERC20(dstToken).safeTransfer(recipient, fresh);
        dstAmount = fresh;
    }

    /// @notice Owner sweeps stranded token balances — useful for unwinding
    /// the mock liquidity pool when the adapter is decommissioned.
    function sweep(address token, address to, uint256 amount) external onlyOwner {
        IERC20(token).safeTransfer(to, amount);
    }
}
