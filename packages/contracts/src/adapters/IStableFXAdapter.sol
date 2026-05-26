// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

/// @title IStableFXAdapter
/// @notice Common interface for every Klaro stablecoin-FX adapter.
/// Registered per (srcToken, dstToken) pair in `StableFXAdapterRegistry`.
/// All amounts are token-native units (6-dec for USDC/EURC on Arc).
/// `quoteHash` binds (srcToken, dstToken, srcAmount, dstAmount, expiresAt, adapter)
/// so the off-chain UI can show a stable quote + the on-chain `swap`
/// re-verifies the same hash → either party can audit.
interface IStableFXAdapter {
    /// @notice Quote a swap. Pure-view path — no allowance, no transfer.
    function quote(address srcToken, address dstToken, uint256 srcAmount)
        external
        view
        returns (uint256 dstAmount, bytes32 quoteHash, uint64 expiresAt);

    /// @notice Execute the swap. Caller must have approved the adapter for
    /// `srcAmount` of `srcToken` (or via Permit2 for CircleStableFXAdapter).
    /// Reverts if `minDstAmount > actualDst` (slippage protection).
    function swap(
        address srcToken,
        address dstToken,
        uint256 srcAmount,
        uint256 minDstAmount,
        bytes32 expectedQuoteHash,
        address recipient
    ) external returns (uint256 dstAmount);

    /// @notice Adapter-side health/availability check — true means the adapter
    /// can serve a quote right now (e.g. Circle access granted; Pyth
    /// feeds fresh enough).
    function isLive() external view returns (bool);
}
