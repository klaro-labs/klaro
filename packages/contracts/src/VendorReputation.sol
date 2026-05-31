// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { Ownable2Step } from "@openzeppelin/contracts/access/Ownable2Step.sol";

import { KlaroConfig } from "./KlaroConfig.sol";

/// @title VendorReputation
/// @notice Append-only event log of reputation-impacting actions per vendor.
/// v2 §17.1.
/// Stores only `(vendorId, kind, weight, evidenceHash, timestamp)`
/// per event — scoring + tier derivation lives in `ReputationManager`.
/// Separation lets us evolve scoring formulas without rewriting history.
/// Writes restricted to operator + allow-listed consumer escrows
/// (`InvoiceEscrow`, `CashoutOrderProcessor`, `AgentEscrow`,
/// `DisputeManager`) — every state-change in those contracts can stamp
/// a reputation event in the same tx.
contract VendorReputation is Ownable2Step {
    enum Kind {
        NONE,
        INVOICE_SETTLED, // +weight, paid-on-time settled invoice
        INVOICE_SETTLED_LATE, // +weight, paid-late settled invoice
        CASHOUT_RELEASED, // +weight, successful cashout
        AGENT_JOB_CLOSED, // +weight, agent job completed
        DISPUTE_OPENED, // -weight, vendor opened dispute
        DISPUTE_WON, // +weight, dispute resolved in vendor's favor
        DISPUTE_LOST, // -weight, dispute resolved against vendor
        REFUND_ISSUED, // -small weight, vendor issued refund
        SLASH_PENALTY, // -large weight, admin slash
        KYB_PASSED, // +weight, KYB completed
        KYB_REVOKED, // -large weight, KYB pulled
        MANUAL_ADJUST // either direction, operator-only with reason
    }

    struct Event {
        bytes32 vendorId; // off-chain hash of vendor identity
        Kind kind;
        int32 weight; // signed; consumers sum these
        bytes32 evidenceHash; // tx hash / case id / proof anchor
        bytes32 reasonHash; // optional ReasonCodes hash (slash/penalty/manual)
        uint64 at;
    }

    /// @notice Per-vendor list of event ids (sequential per vendor).
    mapping(bytes32 => uint256[]) private _vendorEvents;

    /// @notice per-kind running sum + total per vendor.
    /// Closes the O(n) gas DoS in `vendorWeightsByKind` / `rawScore` —
    /// every score read previously looped the full event history (2
    /// SLOADs per event). For a vendor past ~1k events, the read
    /// exceeded the block gas limit and bricked every consumer
    /// (LP-eligibility gate, agent fee cap, UI). Now: O(1) reads.
    /// Maintained atomically in `record()` so the storage is
    /// monotonically consistent with `events[ids[]]`.
    mapping(bytes32 => int256[12]) private _runningPerKind;
    mapping(bytes32 => int256) private _runningTotal;

    /// @notice Global event store — id → event.
    mapping(uint256 => Event) public events;
    uint256 public eventCount;

    address public klaroOperator;
    mapping(address => bool) public trustedCallers;

    event EventRecorded(
        uint256 indexed id, bytes32 indexed vendorId, Kind indexed kind, int32 weight
    );
    event TrustedCallerSet(address indexed caller, bool trusted);
    event OperatorChanged(address indexed previous, address indexed next);

    error NotAuthorized();
    error UnknownEvent();
    error WeightZero();
    // surfaces a clearly-labeled failure if `record()`
    // is somehow called with `Kind.NONE` (defensive — the enum's first
    // entry is reserved and shouldn't be passed by any caller).
    error InvalidKind();

    modifier onlyAuthorized() {
        if (msg.sender != klaroOperator && !trustedCallers[msg.sender]) {
            revert NotAuthorized();
        }
        _;
    }

    constructor(address operator_) Ownable(msg.sender) {
        KlaroConfig.requireArcTestnet();
        klaroOperator = operator_;
        emit OperatorChanged(address(0), operator_);
    }

    error ZeroOperatorAddress();

    function setOperator(address next) external onlyOwner {
        if (next == address(0)) revert ZeroOperatorAddress();
        emit OperatorChanged(klaroOperator, next);
        klaroOperator = next;
    }

    /// @dev (contracts audit): owner-only, mirroring
    /// FeeSplitter + DisputeManager. Trusted callers can write
    /// reputation deltas for any vendor — operator-key compromise
    /// previously let the attacker fabricate vendor reputation
    /// scores to bypass tier-gated features. Owner multisig holds
    /// the membership key in prod.
    function setTrustedCaller(address caller, bool trusted) external onlyOwner {
        trustedCallers[caller] = trusted;
        emit TrustedCallerSet(caller, trusted);
    }

    /// @notice Append an event to the vendor's reputation log.
    function record(
        bytes32 vendorId,
        Kind kind,
        int32 weight,
        bytes32 evidenceHash,
        bytes32 reasonHash
    ) external onlyAuthorized returns (uint256 id) {
        if (weight == 0) revert WeightZero();
        uint8 idx = uint8(kind);
        if (idx == 0) revert InvalidKind();
        id = ++eventCount;
        events[id] = Event({
            vendorId: vendorId,
            kind: kind,
            weight: weight,
            evidenceHash: evidenceHash,
            reasonHash: reasonHash,
            at: uint64(block.timestamp)
        });
        _vendorEvents[vendorId].push(id);
        // O(1) aggregate maintenance.
        _runningPerKind[vendorId][idx - 1] += int256(weight);
        _runningTotal[vendorId] += int256(weight);
        emit EventRecorded(id, vendorId, kind, weight);
    }

    // ─── Views ──────────────────────────────────────────────────────────

    function getEvent(uint256 id) external view returns (Event memory) {
        if (id == 0 || id > eventCount) revert UnknownEvent();
        return events[id];
    }

    function vendorEventCount(bytes32 vendorId) external view returns (uint256) {
        return _vendorEvents[vendorId].length;
    }

    /// @notice Paginated read of vendor's events — newest first.
    function vendorEventsPage(bytes32 vendorId, uint256 offset, uint256 limit)
        external
        view
        returns (Event[] memory page, uint256 total)
    {
        uint256[] storage ids = _vendorEvents[vendorId];
        total = ids.length;
        if (offset >= total) return (new Event[](0), total);
        uint256 remaining = total - offset;
        uint256 size = remaining < limit ? remaining : limit;
        page = new Event[](size);
        for (uint256 i = 0; i < size; i++) {
            // newest-first
            page[i] = events[ids[total - 1 - offset - i]];
        }
    }

    /// @notice Sum of weights — primary input to ReputationManager.
    /// O(1) via `_runningTotal` (was O(n) summing the
    /// event history every read — bricked at ~1k events per vendor).
    function rawScore(bytes32 vendorId) external view returns (int256 sum, uint256 n) {
        sum = _runningTotal[vendorId];
        n = _vendorEvents[vendorId].length;
    }

    /// @notice Number of `Kind` enum entries, used to size the
    /// per-kind aggregate array. Mirrors the enum definition;
    /// bump if enum grows.
    uint256 public constant KIND_COUNT = 12;

    /// @notice Per-kind weight sums for `vendorId`. Audit fix (loop
    /// , 2026-05-25): ReputationManager.kindMultiplier
    /// was being set + version-bumped but never applied because
    /// the only score input was `rawScore`'s undifferentiated
    /// sum. This view returns `int256[12]` indexed by `Kind` -
    /// 1 (skipping `NONE`) so the manager can multiply each
    /// bucket by its multiplier in O(1) outside this contract.
    /// O(1) — returns the per-kind running storage
    /// array directly. Previously looped every event in the vendor's
    /// history, exceeding block gas limit past ~1k events.
    function vendorWeightsByKind(bytes32 vendorId)
        external
        view
        returns (int256[12] memory perKind, uint256 n)
    {
        perKind = _runningPerKind[vendorId];
        n = _vendorEvents[vendorId].length;
    }
}
