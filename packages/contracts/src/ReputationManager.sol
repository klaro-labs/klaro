// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

import { KlaroConfig } from "./KlaroConfig.sol";
import { VendorReputation } from "./VendorReputation.sol";

/// @title ReputationManager
/// @notice Computes a per-vendor Trust Score by aggregating events from
/// `VendorReputation`. v2 §17. Versioned scoring formula — every
/// score recomputation stamps the formula version so historical
/// scores remain reproducible.
/// Score range: 0-1000. Tier ladder mirrors `lib/financingReadiness`:
/// EMERGING / ACTIVE / ESTABLISHED / PRIORITY. Single source of truth
/// for both on-chain consumers (LP-tier eligibility, agent fee caps)
/// and off-chain UI (`/vendor/reputation`).
contract ReputationManager is Ownable {
    enum Tier {
        EMERGING,
        ACTIVE,
        ESTABLISHED,
        PRIORITY
    }

    /// @notice Tier thresholds (out of 1000). Operator-tunable.
    uint16 public emergingMax = 400; // < emergingMax → EMERGING
    uint16 public activeMax = 650; // < activeMax → ACTIVE
    uint16 public establishedMax = 850; // < establishedMax → ESTABLISHED; >= → PRIORITY

    /// @notice Per-event-kind weight multiplier. Scoring formula version increments
    /// when these change so consumers can detect a formula bump.
    mapping(VendorReputation.Kind => int16) public kindMultiplier;
    uint32 public formulaVersion = 1;

    /// @notice Append-only log of score recomputations. Vendors see how their
    /// score evolved over time + which formula version produced each.
    struct Snapshot {
        uint64 at;
        uint32 formulaVersion;
        int256 rawSum;
        uint16 score;
        Tier tier;
    }
    mapping(bytes32 => Snapshot[]) private _history;

    VendorReputation public immutable rep;
    address public klaroOperator;

    event TierThresholdsChanged(uint16 emergingMax, uint16 activeMax, uint16 establishedMax);
    event KindMultiplierChanged(
        VendorReputation.Kind indexed kind, int16 multiplier, uint32 newFormulaVersion
    );
    event ScoreSnapshotted(
        bytes32 indexed vendorId, uint16 score, Tier tier, uint32 formulaVersion
    );
    event OperatorChanged(address indexed previous, address indexed next);

    error NotOperator();
    error BadThresholds();

    modifier onlyOperator() {
        if (msg.sender != klaroOperator) revert NotOperator();
        _;
    }

    constructor(VendorReputation rep_, address operator_) Ownable(msg.sender) {
        KlaroConfig.requireArcTestnet();
        rep = rep_;
        klaroOperator = operator_;
        emit OperatorChanged(address(0), operator_);

        // Default formula v1 — positive events weighted 1x, penalties 2x for
        // mild + 5x for severe. Tuned in M11 based on real beta-vendor data.
        kindMultiplier[VendorReputation.Kind.INVOICE_SETTLED] = 1;
        kindMultiplier[VendorReputation.Kind.INVOICE_SETTLED_LATE] = 1; // late still counts
        kindMultiplier[VendorReputation.Kind.CASHOUT_RELEASED] = 1;
        kindMultiplier[VendorReputation.Kind.AGENT_JOB_CLOSED] = 1;
        kindMultiplier[VendorReputation.Kind.DISPUTE_WON] = 2;
        kindMultiplier[VendorReputation.Kind.KYB_PASSED] = 3;
        kindMultiplier[VendorReputation.Kind.DISPUTE_OPENED] = 1;
        kindMultiplier[VendorReputation.Kind.DISPUTE_LOST] = 2;
        kindMultiplier[VendorReputation.Kind.REFUND_ISSUED] = 1;
        kindMultiplier[VendorReputation.Kind.SLASH_PENALTY] = 5;
        kindMultiplier[VendorReputation.Kind.KYB_REVOKED] = 5;
        kindMultiplier[VendorReputation.Kind.MANUAL_ADJUST] = 1;
    }

    // ─── Config ─────────────────────────────────────────────────────────

    function setTierThresholds(uint16 emerging, uint16 active, uint16 established)
        external
        onlyOperator
    {
        if (!(emerging < active && active < established && established <= 1000)) {
            revert BadThresholds();
        }
        emergingMax = emerging;
        activeMax = active;
        establishedMax = established;
        emit TierThresholdsChanged(emerging, active, established);
    }

    function setKindMultiplier(VendorReputation.Kind kind, int16 m) external onlyOperator {
        kindMultiplier[kind] = m;
        formulaVersion++;
        emit KindMultiplierChanged(kind, m, formulaVersion);
    }

    function setOperator(address next) external onlyOwner {
        emit OperatorChanged(klaroOperator, next);
        klaroOperator = next;
    }

    // ─── Scoring ────────────────────────────────────────────────────────

    /// @notice Compute the current score for `vendorId`. Pure-view — does
    /// not snapshot. Off-chain UI calls this freely.
    /// @dev prior version called
    /// `rep.rawScore` which sums raw weights at 1x. The
    /// `kindMultiplier` mapping was set + version-bumped but
    /// never applied — `setKindMultiplier` was a no-op on scores,
    /// which silently broke the per-kind tunability v2 §17
    /// promises. Now reads per-kind weight sums via the
    /// dedicated `vendorWeightsByKind` view and multiplies each
    /// bucket by its configured multiplier before clamping.
    /// `rawSum` is preserved in the return tuple (raw event
    /// total, unmultiplied) for off-chain consumers that want
    /// the un-amplified figure.
    function computeScore(bytes32 vendorId)
        public
        view
        returns (uint16 score, Tier tier, int256 rawSum)
    {
        (int256[12] memory perKind, uint256 n) = rep.vendorWeightsByKind(vendorId);
        if (n == 0) return (0, Tier.EMERGING, 0);

        int256 amplified;
        int256 raw;
        // Kinds are enum-indexed 1..12; the perKind array is 0-indexed
        // skipping NONE. Read both together so the per-kind sum and its
        // multiplier stay aligned.
        for (uint8 i = 0; i < 12; i++) {
            int256 bucket = perKind[i];
            if (bucket == 0) continue;
            raw += bucket;
            int256 m = int256(kindMultiplier[VendorReputation.Kind(i + 1)]);
            amplified += bucket * m;
        }
        rawSum = raw;

        // Headroom + clamp to [0, 1000]. Same shape as before; the only
        // change is that `amplified` (not `raw`) is what scales.
        int256 base = amplified * 10;
        if (base < 0) base = 0;
        if (base > 1000) base = 1000;
        score = uint16(uint256(base));
        tier = _tierFor(score);
    }

    /// @notice Snapshot the current score on-chain. Called by operator on a
    /// schedule (e.g. daily) so vendors get an immutable score history.
    /// @dev previous version was
    /// permissionless. The self-rate guard checked `msg.sender ==
    /// vendorAddress` against a CALLER-SUPPLIED `vendorAddress` —
    /// attacker just passed any address other than their own (e.g.
    /// `address(0)`) and wrote unbounded entries into
    /// `_history[vendorId]`. Storage-growth grief + score-history
    /// pollution. NatSpec said "called by operator" — implementation
    /// now matches. The `vendorAddress` arg was load-bearing only
    /// for the broken self-rate check, so it's removed (breaking
    /// signature change is fine since no off-chain caller exists yet).
    function snapshot(bytes32 vendorId) external onlyOperator returns (uint16 score, Tier tier) {
        (uint16 s, Tier t, int256 sum) = computeScore(vendorId);
        _history[vendorId].push(
            Snapshot({
                at: uint64(block.timestamp),
                formulaVersion: formulaVersion,
                rawSum: sum,
                score: s,
                tier: t
            })
        );
        emit ScoreSnapshotted(vendorId, s, t, formulaVersion);
        return (s, t);
    }

    // ─── Views ──────────────────────────────────────────────────────────

    function tierOf(bytes32 vendorId) external view returns (Tier) {
        (, Tier t,) = computeScore(vendorId);
        return t;
    }

    function snapshotCount(bytes32 vendorId) external view returns (uint256) {
        return _history[vendorId].length;
    }

    function snapshotAt(bytes32 vendorId, uint256 index) external view returns (Snapshot memory) {
        return _history[vendorId][index];
    }

    function latestSnapshot(bytes32 vendorId) external view returns (Snapshot memory) {
        uint256 n = _history[vendorId].length;
        if (n == 0) {
            return Snapshot({ at: 0, formulaVersion: 0, rawSum: 0, score: 0, tier: Tier.EMERGING });
        }
        return _history[vendorId][n - 1];
    }

    function _tierFor(uint16 score) internal view returns (Tier) {
        if (score < emergingMax) return Tier.EMERGING;
        if (score < activeMax) return Tier.ACTIVE;
        if (score < establishedMax) return Tier.ESTABLISHED;
        return Tier.PRIORITY;
    }
}
