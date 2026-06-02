// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

/// @title MockEURC
/// @notice Testnet-only stand-in for Circle's EURC (Euro Coin) until Klaro is
/// granted Circle StableFX TEST access. Six decimals, matching the real EURC
/// and Klaro's USDC precompile, so the MockStableFXAdapter rate math
/// (`dstAmount = srcAmount * rate / 1e18`) carries straight over to the live
/// token with no scaling change. Owner-mintable so the operator can seed the
/// FX adapter's destination-side liquidity pool. NOT for mainnet.
contract MockEURC is ERC20, Ownable {
    constructor() ERC20("Euro Coin (Klaro testnet mock)", "EURC") Ownable(msg.sender) { }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    /// @notice Owner mints `amount` (6-dp) to `to`. Used to fund the
    /// MockStableFXAdapter so USDC→EURC swaps pay out from real on-chain
    /// liquidity rather than a phantom balance.
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
}
