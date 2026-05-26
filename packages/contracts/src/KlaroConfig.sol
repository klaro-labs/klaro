// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

/// @title KlaroConfig
/// @notice Single source of truth for Arc-testnet deployed contract addresses
/// that Klaro depends on. Pins every external address Klaro reads or
/// writes against, so audits review one constants file instead of
/// hunting through call sites.
/// @dev (never guess) + (Arc/Circle primitives
/// maximally but correctly). Every address below is verified against
/// `docs.arc.io/arc/references/contract-addresses` — re-check at the
/// start of every new session before adding new addresses.
/// Addresses are `address constant` (not `immutable`) so they can be
/// read in `pure` contexts and confirmed without a deployment.
library KlaroConfig {
    // ─── Arc network ────────────────────────────────────────────────────
    /// @notice Arc testnet chain ID — verified
    uint256 internal constant ARC_TESTNET_CHAIN_ID = 5_042_002;

    // ─── Circle stablecoins on Arc ──────────────────────────────────────
    /// @notice USDC ERC-20 interface on Arc testnet — uses **6 decimals**.
    /// Arc exposes USDC via two interfaces over a single balance:
    /// - Native: 18 decimals (gas accounting only)
    /// - ERC-20 at this address: 6 decimals (transferFrom / approve)
    /// Klaro's escrow uses `transferFrom`+`transfer` (ERC-20), so all
    /// on-chain amounts are 6-decimal.
    /// Source: docs.arc.io/arc/concepts/stablecoin-native-model.
    address internal constant USDC = 0x3600000000000000000000000000000000000000;
    uint8 internal constant USDC_DECIMALS = 6;

    /// @notice EURC on Arc testnet — 6 decimals.
    /// corrected from synthesized placeholder
    /// (`0x89b…00f0` was empty on chain). Verified via arc-docs MCP.
    address internal constant EURC = 0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a;

    /// @notice USYC yield-bearing stablecoin on Arc testnet — 6 decimals.
    /// corrected from synthesized placeholder.
    address internal constant USYC = 0xe9185F0c5F296Ed1797AaE4238D26CCaBEadb86C;

    /// @notice USYC mint/redeem helpers — required for any USYC yield-corridor flow.
    address internal constant USYC_ENTITLEMENTS = 0xCC205224862C7641930c87679E98999d23C26113;
    address internal constant USYC_TELLER = 0x9fdF14c5B14173D74C08Af27AebFf39240dC105A;

    // ─── CCTP V2 + Gateway ──────────────────────────────────────────────
    /// @notice CCTP V2 TokenMessenger on Arc — Fast (8-20s) + Standard
    address internal constant CCTP_TOKEN_MESSENGER_V2 = 0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA;

    /// @notice CCTP V2 MessageTransmitter on Arc — inbound mint receiver
    /// (verified iter session 2026-05-24 via arc-docs MCP)
    address internal constant CCTP_MESSAGE_TRANSMITTER_V2 =
        0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275;

    /// @notice GatewayWallet — Klaro escrow source for cross-chain pulls
    address internal constant GATEWAY_WALLET = 0x0077777d7EBA4688BDeF3E311b846F25870A19B9;

    /// @notice GatewayMinter — destination minter when funds land on Arc
    address internal constant GATEWAY_MINTER = 0x0022222ABE238Cc2C7Bb1f21003F0a260052475B;

    /// @notice Arc Gateway domain id (verified ) — used in CCTP attestations
    uint32 internal constant ARC_GATEWAY_DOMAIN = 26;

    // ─── StableFX ───────────────────────────────────────────────────────
    /// @notice FxEscrow — Circle's StableFX escrow contract on Arc
    /// (verified iter session 2026-05-24 via arc-docs MCP).
    /// Note: USDC allowance must be granted to PERMIT2, not directly to FxEscrow.
    address internal constant FX_ESCROW = 0x867650F5eAe8df91445971f14d89fd84F0C9a9f8;

    // ─── Common infrastructure ──────────────────────────────────────────
    /// @notice Permit2 (Uniswap) — gasless approvals via EIP-712
    address internal constant PERMIT2 = 0x000000000022D473030F116dDEE9F6B43aC78BA3;

    /// @notice Multicall3 — atomic batched reads
    address internal constant MULTICALL3 = 0xcA11bde05977b3631167028862bE2a173976CA11;

    /// @notice CREATE2 deployer — deterministic addresses across chains
    address internal constant CREATE2_DEPLOYER = 0x4e59b44847b379578588920cA78FbF26c0B4956C;

    /// @notice Pyth Network oracle on Arc — price feeds for FX + financing
    address internal constant PYTH_ORACLE = 0x2880aB155794e7179c9eE2e38200202908C17B43;

    /// @notice Memo contract — Arc-native compliance metadata attachment
    /// (verified / 2026-05-26 via arc-docs MCP).
    /// ABI: `sendWithMemo(address to, uint256 amount, bytes memo)`
    /// payable; combines transfer + memo emission in one tx via
    /// the CallFrom precompile (preserves original msg.sender).
    /// Event: `MemoSent(address indexed sender, address indexed
    /// recipient, uint256 amount, bytes memo)`.
    /// **Wiring status (, honest label per ):**
    /// Pinned but not yet called from any contract. Original AUDIT
    /// P1 #138 flagged this. Klaro's existing on-chain events
    /// (`InvoiceSettled(invoiceId,…)`, `OrderReleased(cashoutId,…)`,
    /// `JobCompleted(jobId,…)`, etc.) provide tx-hash → internal-id
    /// correlation, so Memo is a defense-in-depth additional
    /// indexable layer for compliance partners (Elliptic / TRM)
    /// rather than a missing primitive. Wiring requires replacing
    /// every `usdc.safeTransfer` callsite with
    /// `IMemo(MEMO).sendWithMemo{value: amt*1e12}(to, amt, memo)`
    /// + decimal conversion (USDC 6-dec ERC-20 ↔ 18-dec native
    /// gas) + reworking the FeeSplitter fan-out + retrofitting
    /// every fund-flow test. Scheduled for M11 alongside the
    /// Elliptic/TRM screening provider integration.
    address internal constant MEMO = 0x9702466268ccF55eAB64cdf484d272Ac08d3b75b;

    // ─── ERC-8004 (Agent identity) — three registries ──────────────────
    // All three verified iter session 2026-05-24 via arc-docs MCP; the
    // prior addresses were stale and have been replaced.
    /// @notice Identity registry — agent DID resolution
    address internal constant ERC_8004_IDENTITY = 0x8004A818BFB912233c491871b3d84c89A494BD9e;

    /// @notice Reputation registry — agent + vendor scores
    address internal constant ERC_8004_REPUTATION = 0x8004B663056A597Dffe9eCcC1965A193B7388713;

    /// @notice Validation registry — proof attestations for agent work
    address internal constant ERC_8004_VALIDATION = 0x8004Cb1BF31DAf7788923b405b754f57acEB4272;

    // ─── ERC-8183 (Agent job escrow) ────────────────────────────────────
    /// @notice ERC-8183 reference (AgenticCommerce) on Arc testnet
    /// (verified iter session 2026-05-24 via arc-docs MCP).
    address internal constant ERC_8183_REFERENCE = 0x0747EEf0706327138c69792bF28Cd525089e4583;

    // ─── Klaro fee receiver (placeholder until live wallet) ────────────
    /// @notice Klaro protocol fee receiver — replace before mainnet.
    /// Currently `address(0)` so any fee transfer fails loudly during
    /// testnet rather than silently sending to a wrong address.
    address internal constant KLARO_FEE_RECEIVER = address(0);

    /// @notice Reject any call attempting to use Arc primitives off-chain.
    /// Useful guard in factory contracts before mainnet deployment.
    error WrongChain(uint256 expected, uint256 actual);

    function requireArcTestnet() internal view {
        if (block.chainid != ARC_TESTNET_CHAIN_ID) {
            revert WrongChain(ARC_TESTNET_CHAIN_ID, block.chainid);
        }
    }
}
