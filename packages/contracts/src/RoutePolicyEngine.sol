// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { Ownable2Step } from "@openzeppelin/contracts/access/Ownable2Step.sol";

import { KlaroConfig } from "./KlaroConfig.sol";
import { ReasonCodes } from "./lib/ReasonCodes.sol";

/// @title RoutePolicyEngine
/// @notice Per-corridor allow-list + amount + screening gate. v2 §26.6.
/// Consumers (`MultiChainRouter`, `CashoutOrderProcessor`,
/// `StableFXAdapterRegistry`) call `checkRoute(...)` before opening
/// any flow — it reverts loudly if the corridor is paused, the amount
/// is over cap, or screening was required but not passed.
/// Vendor running totals (daily cap, weekly cap) intentionally live
/// in the router that calls this engine, not here. Single
/// responsibility: enable/block, nothing else.
contract RoutePolicyEngine is Ownable2Step {
    struct Policy {
        bool enabled; // master switch
        uint256 maxPerOrderUsdc; // 6-dec USDC; 0 = no cap
        bool requiresScreening; // if true, caller must pass screeningPassed=true
        bytes32 pauseReason; // set when enabled flips false; readable by UI
    }

    /// @notice corridor key (e.g. keccak256("INR")) → policy
    mapping(bytes32 => Policy) public policies;

    /// @notice track which corridors have been formally
    /// configured via `setPolicy`. `pauseCorridor` and
    /// `resumeCorridor` previously flipped `enabled` on any key —
    /// a typo or compromised operator could `resumeCorridor(<random>)`
    /// and end up with `enabled=true, maxPerOrderUsdc=0 (= no cap),
    /// requiresScreening=false`, opening an unlimited unscreened
    /// path that downstream consumers honor. Now those two writes
    /// require the corridor to have been intentionally configured.
    mapping(bytes32 => bool) public configured;

    address public klaroOperator;

    // ─── Events ─────────────────────────────────────────────────────────
    event PolicySet(
        bytes32 indexed corridor, bool enabled, uint256 maxPerOrder, bool requiresScreening
    );
    event CorridorPaused(bytes32 indexed corridor, bytes32 indexed reason);
    event CorridorResumed(bytes32 indexed corridor);
    event OperatorChanged(address indexed previous, address indexed next);

    // ─── Errors (consumed by consumers, surfaced to UI) ─────────────────
    error CorridorDisabled(bytes32 corridor, bytes32 reason);
    error AmountOverCap(bytes32 corridor, uint256 amount, uint256 cap);
    error ScreeningRequired(bytes32 corridor);
    error NotOperator();
    error CorridorNotConfigured(bytes32 corridor);

    modifier onlyOperator() {
        if (msg.sender != klaroOperator) revert NotOperator();
        _;
    }

    constructor(address operator_) Ownable(msg.sender) {
        KlaroConfig.requireArcTestnet();
        klaroOperator = operator_;
        emit OperatorChanged(address(0), operator_);
    }

    // ─── Operator writes ────────────────────────────────────────────────

    /// @notice Atomic setter — replaces the whole policy struct so we never
    /// leave a corridor half-configured.
    function setPolicy(
        bytes32 corridor,
        bool enabled,
        uint256 maxPerOrderUsdc,
        bool requiresScreening
    ) external onlyOperator {
        policies[corridor] = Policy({
            enabled: enabled,
            maxPerOrderUsdc: maxPerOrderUsdc,
            requiresScreening: requiresScreening,
            pauseReason: bytes32(0)
        });
        configured[corridor] = true;
        emit PolicySet(corridor, enabled, maxPerOrderUsdc, requiresScreening);
    }

    /// @notice Fast pause (e.g. partner outage) — flips enabled off + stamps
    /// a reason hash readable by the admin UI / status page.
    function pauseCorridor(bytes32 corridor, bytes32 reason) external onlyOperator {
        if (!configured[corridor]) revert CorridorNotConfigured(corridor);
        ReasonCodes.require_(reason);
        Policy storage p = policies[corridor];
        p.enabled = false;
        p.pauseReason = reason;
        emit CorridorPaused(corridor, reason);
    }

    function resumeCorridor(bytes32 corridor) external onlyOperator {
        if (!configured[corridor]) revert CorridorNotConfigured(corridor);
        Policy storage p = policies[corridor];
        p.enabled = true;
        p.pauseReason = bytes32(0);
        emit CorridorResumed(corridor);
    }

    function setOperator(address next) external onlyOwner {
        emit OperatorChanged(klaroOperator, next);
        klaroOperator = next;
    }

    // ─── Consumer-facing gate ───────────────────────────────────────────

    /// @notice Reverts if the route is blocked. Callers wire this inline at
    /// the top of `requestAndLock` / `openOrder` / `quoteFx`. No
    /// return value — consumers don't need to branch.
    function checkRoute(bytes32 corridor, uint256 amountUsdc, bool screeningPassed) external view {
        Policy memory p = policies[corridor];
        if (!p.enabled) revert CorridorDisabled(corridor, p.pauseReason);
        if (p.maxPerOrderUsdc != 0 && amountUsdc > p.maxPerOrderUsdc) {
            revert AmountOverCap(corridor, amountUsdc, p.maxPerOrderUsdc);
        }
        if (p.requiresScreening && !screeningPassed) {
            revert ScreeningRequired(corridor);
        }
    }

    // ─── Views ──────────────────────────────────────────────────────────

    function getPolicy(bytes32 corridor) external view returns (Policy memory) {
        return policies[corridor];
    }

    function isEnabled(bytes32 corridor) external view returns (bool) {
        return policies[corridor].enabled;
    }
}
