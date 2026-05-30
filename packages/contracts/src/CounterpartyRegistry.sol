// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { Ownable2Step } from "@openzeppelin/contracts/access/Ownable2Step.sol";

import { KlaroConfig } from "./KlaroConfig.sol";
import { ReasonCodes } from "./lib/ReasonCodes.sol";

/// @title CounterpartyRegistry
/// @notice Onchain screening-hash cache + denylist for buyer wallets.
/// v2 §8 demands every invoice payment route through a 3-of-3 screen
/// (sanctions + behavioral + KYB-liveness). Re-running 3 external API
/// calls on every payment is slow + expensive. This registry caches
/// the keccak of the screening bundle alongside a TTL so the daemon
/// can skip the round-trip when the cache is still fresh.
/// Also holds an operator-managed permanent denylist for wallets that
/// should ALWAYS be rejected (sanctions hits, confirmed fraud).
/// @dev — no PII stored. Only the bundle hash + decidedAt +
/// TTL. Raw screening evidence lives off-chain in `screening_results`.
contract CounterpartyRegistry is Ownable2Step {
    struct Decision {
        bytes32 bundleHash; // keccak of off-chain 3-of-3 screening bundle
        uint64 decidedAt; // unix seconds when screening ran
        uint32 ttlSeconds; // when cache turns stale (re-screen required)
        bool pass; // last decision outcome
    }

    mapping(address => Decision) private _decisions;
    mapping(address => bool) public denylist;
    address public klaroOperator;
    uint32 public defaultTtl = 24 hours;

    event DecisionCached(
        address indexed buyer, bytes32 bundleHash, uint64 decidedAt, uint32 ttlSeconds, bool pass
    );
    event DenylistAdded(address indexed buyer, bytes32 indexed reason);
    event DenylistRemoved(address indexed buyer, bytes32 indexed reason);
    event OperatorChanged(address indexed previous, address indexed next);
    event DefaultTtlChanged(uint32 previous, uint32 next);

    error NotOperator();
    error Denied();
    error UnknownBuyer();
    error ZeroAddress();

    modifier onlyOperator() {
        if (msg.sender != klaroOperator) revert NotOperator();
        _;
    }

    constructor(address operator_) Ownable(msg.sender) {
        KlaroConfig.requireArcTestnet();
        if (operator_ == address(0)) revert ZeroAddress();
        klaroOperator = operator_;
        emit OperatorChanged(address(0), operator_);
    }

    // ─── Decision cache ────────────────────────────────────────────────

    function cacheDecision(address buyer, bytes32 bundleHash, uint32 ttlSeconds, bool pass)
        external
        onlyOperator
    {
        if (buyer == address(0)) revert ZeroAddress();
        uint32 ttl = ttlSeconds == 0 ? defaultTtl : ttlSeconds;
        _decisions[buyer] = Decision({
            bundleHash: bundleHash, decidedAt: uint64(block.timestamp), ttlSeconds: ttl, pass: pass
        });
        emit DecisionCached(buyer, bundleHash, uint64(block.timestamp), ttl, pass);
    }

    /// @notice True iff the cached decision is `pass` AND still inside its TTL.
    /// InvoiceEscrow.fund() can call this to short-circuit the daemon
    /// round-trip when a recent decision exists.
    function isAllowed(address buyer) external view returns (bool) {
        if (denylist[buyer]) return false;
        Decision storage d = _decisions[buyer];
        if (d.decidedAt == 0) return false;
        if (block.timestamp >= uint256(d.decidedAt) + uint256(d.ttlSeconds)) {
            return false;
        }
        return d.pass;
    }

    function isStale(address buyer) external view returns (bool) {
        Decision storage d = _decisions[buyer];
        if (d.decidedAt == 0) return true;
        return block.timestamp >= uint256(d.decidedAt) + uint256(d.ttlSeconds);
    }

    function getDecision(address buyer) external view returns (Decision memory) {
        return _decisions[buyer];
    }

    /// @notice Reverts if the buyer is denylisted or has no fresh pass on file.
    /// Designed for callers that prefer revert over branching (e.g.
    /// a future InvoiceEscrow.fund() pre-check).
    function requireAllowed(address buyer) external view {
        if (denylist[buyer]) revert Denied();
        Decision storage d = _decisions[buyer];
        if (d.decidedAt == 0) revert UnknownBuyer();
        if (block.timestamp >= uint256(d.decidedAt) + uint256(d.ttlSeconds)) {
            revert UnknownBuyer();
        }
        if (!d.pass) revert Denied();
    }

    // ─── Denylist ──────────────────────────────────────────────────────

    function deny(address buyer, bytes32 reason) external onlyOperator {
        ReasonCodes.require_(reason);
        denylist[buyer] = true;
        emit DenylistAdded(buyer, reason);
    }

    function undeny(address buyer, bytes32 reason) external onlyOperator {
        ReasonCodes.require_(reason);
        denylist[buyer] = false;
        // clear the cached decision too. Otherwise a
        // buyer who was denylisted (despite a still-fresh cached pass)
        // and then undeny'd silently regains their stale pass for the
        // remainder of the TTL window without re-running the 3-of-3
        // screen — i.e. the operator un-deny'd without re-screening,
        // which contradicts the very reason undeny exists.
        delete _decisions[buyer];
        emit DenylistRemoved(buyer, reason);
    }

    // ─── Admin ─────────────────────────────────────────────────────────

    function setDefaultTtl(uint32 next) external onlyOperator {
        if (next < 5 minutes) next = 5 minutes;
        emit DefaultTtlChanged(defaultTtl, next);
        defaultTtl = next;
    }

    function setOperator(address next) external onlyOwner {
        if (next == address(0)) revert ZeroAddress();
        emit OperatorChanged(klaroOperator, next);
        klaroOperator = next;
    }
}
