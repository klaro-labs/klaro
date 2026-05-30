// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

import { KlaroConfig } from "./KlaroConfig.sol";
import { RoutePolicyEngine } from "./RoutePolicyEngine.sol";

/// @title MultiChainRouter
/// @notice Routing oracle + audit log. v2 §26.
/// **Not a bridge.** Actual cross-chain transfers happen off-chain
/// (Circle's Iris API attests CCTP V2, App Kit SDK is TypeScript-only).
/// This contract:
/// 1. `decide()` — pure view returning recommended route for
/// (sourceChainId, amount, corridor)
/// 2. `checkAndDecide()` — calls `RoutePolicyEngine.checkRoute()` then
/// `decide()` — reverts if blocked
/// 3. `recordExecution()` — operator stamps which route was actually
/// taken + txHash for the audit trail ( — proof beats claims)
contract MultiChainRouter is Ownable {
    enum RouteKind {
        NONE,
        SAME_CHAIN, // already on Arc — no bridge needed
        CCTP_V2_FAST, // 8-20s, higher fee — for small invoice payments
        CCTP_V2_STANDARD, // slower, cheaper — for large batched cashouts
        GATEWAY, // Circle Gateway — cross-ecosystem (e.g. Solana → Arc)
        APP_KIT_SWAP // App Kit Swap — USDC/EURC/cirBTC on Arc Testnet only
    }

    /// @notice Fast-vs-Standard threshold in 6-dec USDC. Default 10_000 USDC.
    uint256 public fastTierMaxUsdc = 10_000_000_000;

    /// @notice Supported EVM source chains for CCTP V2 routing.
    mapping(uint256 => bool) public evmSourceSupported;

    /// @notice Source-chain ID where Gateway is the only viable path
    /// (non-EVM ecosystems indexed by their Circle domain).
    mapping(uint256 => bool) public gatewayOnlySource;

    RoutePolicyEngine public immutable policy;
    address public klaroOperator;

    struct Execution {
        RouteKind kind;
        uint256 sourceChainId;
        uint256 amountUsdc;
        bytes32 corridor;
        bytes32 sourceTxHash;
        bytes32 attestationHash;
        uint64 recordedAt;
    }
    mapping(bytes32 => Execution) public executions;

    event RouteDecided(
        bytes32 indexed routeId,
        RouteKind kind,
        uint256 sourceChainId,
        uint256 amountUsdc,
        bytes32 indexed corridor
    );
    event RouteExecuted(
        bytes32 indexed routeId,
        RouteKind kind,
        bytes32 indexed sourceTxHash,
        bytes32 attestationHash
    );
    event SourceChainConfigured(uint256 indexed chainId, bool evm, bool gateway);
    event FastTierThresholdChanged(uint256 from, uint256 to);
    event OperatorChanged(address indexed previous, address indexed next);
    /// @notice Emitted when anyone requests a bridge. The Klaro operator daemon
    /// subscribes to this event and performs the actual Circle CCTP V2
    /// burn off-chain — this contract only records intent + the route.
    /// bridge entrypoint was missing; the
    /// marketing copy implied cross-chain payment but no caller existed.
    // `mintRecipient` is required by the daemon to
    // construct the Circle CCTP V2 burn. Prior signature emitted only
    // `requestedBy` (always the operator) so the daemon had to
    // side-look-up invoiceId → InvoiceEscrow → vendor to derive the
    // recipient — creating a race window (vendor address change
    // between bridge intent + burn) + silent failure path when the
    // invoice doesn't exist on the destination view. Operator now
    // supplies `mintRecipient` explicitly at the call site so the
    // event carries it.
    event BridgeInitiated(
        bytes32 indexed invoiceId,
        bytes32 indexed corridor,
        uint256 sourceChainId,
        uint256 destChainId,
        uint256 amountUsdc,
        RouteKind kind,
        address requestedBy,
        address mintRecipient
    );

    error NotOperator();
    error UnsupportedSource(uint256 chainId);
    error AlreadyRecorded(bytes32 routeId);
    // refuse mintRecipient=0 so the off-chain CCTP burn
    // (subscribed to BridgeInitiated) can't be tricked into minting to
    // address(0) — USDC would be permanently destroyed on the dest chain.
    error ZeroMintRecipient();
    // Klaro only bridges to Arc; reject any other destChainId.
    error WrongDestChain(uint256 destChainId);

    modifier onlyOperator() {
        if (msg.sender != klaroOperator) revert NotOperator();
        _;
    }

    constructor(RoutePolicyEngine policy_, address operator_) Ownable(msg.sender) {
        KlaroConfig.requireArcTestnet();
        policy = policy_;
        klaroOperator = operator_;
        emit OperatorChanged(address(0), operator_);

        // Seed only testnet source chains. Klaro is a testnet-only project
        // today and must not pre-seed mainnet ids — mainnet routes must be
        // added explicitly via `setSourceChain(<id>, true, false)` when they
        // ship, using the same operator-controlled path covered by
        // `test_OperatorCanAddSourceChain`.
        evmSourceSupported[84_532] = true; // Base Sepolia
        evmSourceSupported[11_155_111] = true; // Ethereum Sepolia
        evmSourceSupported[11_155_420] = true; // Optimism Sepolia
        evmSourceSupported[421_614] = true; // Arbitrum Sepolia
        evmSourceSupported[KlaroConfig.ARC_TESTNET_CHAIN_ID] = true;

        // Gateway-only sources keyed by Circle domain. 5 = Solana per Circle docs.
        gatewayOnlySource[5] = true;
    }

    // ─── Operator config ────────────────────────────────────────────────

    function setSourceChain(uint256 chainId, bool evm, bool gateway) external onlyOperator {
        evmSourceSupported[chainId] = evm;
        gatewayOnlySource[chainId] = gateway;
        emit SourceChainConfigured(chainId, evm, gateway);
    }

    function setFastTierThreshold(uint256 newThresholdUsdc) external onlyOperator {
        emit FastTierThresholdChanged(fastTierMaxUsdc, newThresholdUsdc);
        fastTierMaxUsdc = newThresholdUsdc;
    }

    function setOperator(address next) external onlyOwner {
        emit OperatorChanged(klaroOperator, next);
        klaroOperator = next;
    }

    // ─── Decisions ──────────────────────────────────────────────────────

    /// @notice Pure decision — no state read, no policy gate. Off-chain
    /// daemons use this for preview / quote calculation.
    function decide(uint256 sourceChainId, uint256 amountUsdc) public view returns (RouteKind) {
        if (sourceChainId == KlaroConfig.ARC_TESTNET_CHAIN_ID) {
            return RouteKind.SAME_CHAIN;
        }
        if (gatewayOnlySource[sourceChainId]) return RouteKind.GATEWAY;
        if (!evmSourceSupported[sourceChainId]) return RouteKind.NONE;
        return amountUsdc <= fastTierMaxUsdc ? RouteKind.CCTP_V2_FAST : RouteKind.CCTP_V2_STANDARD;
    }

    /// @notice Gated decision — calls `RoutePolicyEngine.checkRoute()` first.
    /// Reverts if corridor disabled / over cap.
    /// @dev same defect class
    /// closed on `initiateBridge` + on
    /// `StableFXAdapterRegistry.swap` — caller-supplied
    /// `screeningPassed` bool let anyone bypass corridor
    /// `requiresScreening`. This is a view but off-chain
    /// callers / SDK pre-flights use it as an authority. Drop
    /// the bool: when a corridor sets `requiresScreening = true`,
    /// this view ALWAYS reverts; callers must use `decide()`
    /// (pure, no policy check) for informational previews and
    /// the operator-attested `initiateBridge` for the live path.
    function checkAndDecide(uint256 sourceChainId, uint256 amountUsdc, bytes32 corridor)
        external
        view
        returns (RouteKind)
    {
        policy.checkRoute(
            corridor,
            amountUsdc,
            /*screeningPassed=*/
            false
        );
        RouteKind kind = decide(sourceChainId, amountUsdc);
        if (kind == RouteKind.NONE) revert UnsupportedSource(sourceChainId);
        return kind;
    }

    /// @notice Operator stamps the executed route + source tx + attestation.
    /// One-shot: replays revert. The execution record is the audit-trail
    /// proof per .
    function recordExecution(
        bytes32 routeId,
        RouteKind kind,
        uint256 sourceChainId,
        uint256 amountUsdc,
        bytes32 corridor,
        bytes32 sourceTxHash,
        bytes32 attestationHash
    ) external onlyOperator {
        if (executions[routeId].kind != RouteKind.NONE) {
            revert AlreadyRecorded(routeId);
        }
        executions[routeId] = Execution({
            kind: kind,
            sourceChainId: sourceChainId,
            amountUsdc: amountUsdc,
            corridor: corridor,
            sourceTxHash: sourceTxHash,
            attestationHash: attestationHash,
            recordedAt: uint64(block.timestamp)
        });
        emit RouteDecided(routeId, kind, sourceChainId, amountUsdc, corridor);
        emit RouteExecuted(routeId, kind, sourceTxHash, attestationHash);
    }

    // ─── Bridge entrypoint ──────────────────────────────────────────────

    /// @notice Anyone (typically the buyer's wallet or an invoice frontend)
    /// records intent to bridge USDC from `sourceChainId` to Arc for
    /// an invoice. The contract does no token movement — it asks the
    /// policy engine to allow the route, decides which CCTP/Gateway
    /// path applies, and emits `BridgeInitiated`. The Klaro operator
    /// daemon picks up the event, performs the Circle Iris attestation
    /// dance off-chain, then comes back to `recordExecution()` once
    /// the source-chain burn is confirmed.
    /// closes the orphan-contract gap.
    /// @dev the `screeningPassed`
    /// bool used to be caller-supplied — any user passed `true`
    /// and the corridor's `requiresScreening` policy was bypassed.
    /// Daemon then trusted the `BridgeInitiated` event as
    /// policy-validated. Now operator-only — the off-chain
    /// operator daemon must vet the screening status before
    /// forwarding to this contract. Removed the bool from the
    /// signature so the only path is operator-attested.
    // added `mintRecipient` parameter — see event
    // comment above. Off-chain caller pre-computes the recipient
    // (e.g. invoice.vendor on the destination chain) and supplies it
    // so the daemon's CCTP burn uses the same address the contract
    // event records.
    function initiateBridge(
        bytes32 invoiceId,
        bytes32 corridor,
        uint256 sourceChainId,
        uint256 destChainId,
        uint256 amountUsdc,
        address mintRecipient
    ) external onlyOperator returns (RouteKind kind) {
        // refuse mintRecipient=0 — daemon's CCTP burn
        // would mint to address(0) on the destination chain →
        // permanently destroyed USDC. The audit closed F92-4 by adding
        // the param; this closes the back-door of that fix.
        if (mintRecipient == address(0)) revert ZeroMintRecipient();
        // Audit 2026-05-30: destChainId was accepted + emitted but never
        // validated. Klaro always bridges TO Arc (the daemon's CCTP burn mints
        // on Arc); an operator typo in destChainId would emit a BridgeInitiated
        // the daemon then acts on, minting to the wrong chain → fund loss.
        if (destChainId != KlaroConfig.ARC_TESTNET_CHAIN_ID) {
            revert WrongDestChain(destChainId);
        }
        // Operator gate replaces the caller-supplied screening bool.
        // The operator daemon is responsible for resolving screening
        // status from `CounterpartyRegistry` / external providers
        // before invoking this contract.
        policy.checkRoute(
            corridor,
            amountUsdc,
            /*screeningPassed=*/
            true
        );
        kind = decide(sourceChainId, amountUsdc);
        if (kind == RouteKind.NONE) revert UnsupportedSource(sourceChainId);
        emit BridgeInitiated(
            invoiceId,
            corridor,
            sourceChainId,
            destChainId,
            amountUsdc,
            kind,
            msg.sender,
            mintRecipient
        );
    }

    // ─── Views ──────────────────────────────────────────────────────────

    function getExecution(bytes32 routeId) external view returns (Execution memory) {
        return executions[routeId];
    }
}
