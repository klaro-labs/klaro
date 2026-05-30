// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { Ownable2Step } from "@openzeppelin/contracts/access/Ownable2Step.sol";

import { KlaroConfig } from "./KlaroConfig.sol";
import { ReasonCodes } from "./lib/ReasonCodes.sol";

/// @title LPRegistry
/// @notice Liquidity-provider directory. v2 §30A.8.
/// Stores ONLY hashes of off-chain KYB + payout records (
/// — no PII on-chain). Status + tier exposed for consumer contracts
/// (`CashoutOrderProcessor.claimByLP`, `MultiChainRouter`) to gate flows.
/// Status enum and tier are intentionally orthogonal — KYB can be
/// admitted before the LP stakes, and tier can be 0 even when admitted.
contract LPRegistry is Ownable2Step {
    enum Status {
        NONE, // unregistered
        PENDING, // registered, KYB under review
        ADMITTED, // KYB passed, can claim orders
        SUSPENDED, // temporarily blocked (operator action)
        REVOKED // permanently kicked (fraud / KYB revoked)
    }

    struct LP {
        address wallet; // USDC payout destination
        uint8 tier; // 0..4, mirrors LPStaking tier
        Status status;
        bytes32 kybRecordHash; // keccak of off-chain KYB bundle
        bytes32 payoutAccountHash; // keccak of bank/UPI routing details
        uint64 registeredAt;
        uint64 admittedAt;
        uint64 lastStatusChangeAt;
        bytes32 lastReasonHash; // ReasonCodes-validated
    }

    mapping(bytes32 => LP) private _lps;
    address public klaroOperator;

    event LPRegistered(bytes32 indexed lpId, address indexed wallet, uint8 tier, bytes32 kybHash);
    event LPAdmitted(bytes32 indexed lpId);
    event LPSuspended(bytes32 indexed lpId, bytes32 indexed reason);
    event LPRevoked(bytes32 indexed lpId, bytes32 indexed reason);
    event LPReinstated(bytes32 indexed lpId);
    event LPTierChanged(bytes32 indexed lpId, uint8 from, uint8 to);
    event LPWalletChanged(bytes32 indexed lpId, address from, address to);
    event LPKYBHashUpdated(bytes32 indexed lpId, bytes32 newHash);
    event LPPayoutAccountUpdated(bytes32 indexed lpId, bytes32 newHash);
    event OperatorChanged(address indexed previous, address indexed next);

    error NotOperator();
    error AlreadyRegistered();
    error UnknownLP();
    error NotActive(bytes32 lpId, Status status);
    error ZeroWallet();
    error BadTier(uint8 tier);
    error WrongStateForOp(Status expected, Status actual);

    modifier onlyOperator() {
        if (msg.sender != klaroOperator) revert NotOperator();
        _;
    }

    constructor(address operator_) Ownable(msg.sender) {
        KlaroConfig.requireArcTestnet();
        klaroOperator = operator_;
        emit OperatorChanged(address(0), operator_);
    }

    // ─── Lifecycle ──────────────────────────────────────────────────────

    function registerLP(
        bytes32 lpId,
        address wallet,
        uint8 tier,
        bytes32 kybRecordHash,
        bytes32 payoutAccountHash
    ) external onlyOperator {
        if (wallet == address(0)) revert ZeroWallet();
        if (tier > 4) revert BadTier(tier);
        if (_lps[lpId].status != Status.NONE) revert AlreadyRegistered();

        _lps[lpId] = LP({
            wallet: wallet,
            tier: tier,
            status: Status.PENDING,
            kybRecordHash: kybRecordHash,
            payoutAccountHash: payoutAccountHash,
            registeredAt: uint64(block.timestamp),
            admittedAt: 0,
            lastStatusChangeAt: uint64(block.timestamp),
            lastReasonHash: bytes32(0)
        });
        emit LPRegistered(lpId, wallet, tier, kybRecordHash);
    }

    function admit(bytes32 lpId) external onlyOperator {
        LP storage lp = _lps[lpId];
        if (lp.status != Status.PENDING && lp.status != Status.SUSPENDED) {
            revert WrongStateForOp(Status.PENDING, lp.status);
        }
        // P1: LPReinstated was dead code (status was
        // already ADMITTED before the SUSPENDED check). Capture before mutation.
        bool wasSuspended = lp.status == Status.SUSPENDED;
        lp.status = Status.ADMITTED;
        lp.admittedAt = lp.admittedAt == 0 ? uint64(block.timestamp) : lp.admittedAt;
        lp.lastStatusChangeAt = uint64(block.timestamp);
        emit LPAdmitted(lpId);
        if (wasSuspended) emit LPReinstated(lpId);
    }

    function suspend(bytes32 lpId, bytes32 reason) external onlyOperator {
        ReasonCodes.require_(reason);
        LP storage lp = _lps[lpId];
        if (lp.status != Status.ADMITTED) {
            revert WrongStateForOp(Status.ADMITTED, lp.status);
        }
        lp.status = Status.SUSPENDED;
        lp.lastStatusChangeAt = uint64(block.timestamp);
        lp.lastReasonHash = reason;
        emit LPSuspended(lpId, reason);
    }

    function revoke(bytes32 lpId, bytes32 reason) external onlyOperator {
        ReasonCodes.require_(reason);
        LP storage lp = _lps[lpId];
        if (lp.status == Status.NONE) revert UnknownLP();
        if (lp.status == Status.REVOKED) {
            revert WrongStateForOp(Status.ADMITTED, lp.status);
        }
        lp.status = Status.REVOKED;
        lp.lastStatusChangeAt = uint64(block.timestamp);
        lp.lastReasonHash = reason;
        emit LPRevoked(lpId, reason);
    }

    function setTier(bytes32 lpId, uint8 tier) external onlyOperator {
        if (tier > 4) revert BadTier(tier);
        LP storage lp = _lps[lpId];
        if (lp.status == Status.NONE) revert UnknownLP();
        uint8 from = lp.tier;
        lp.tier = tier;
        emit LPTierChanged(lpId, from, tier);
    }

    function setWallet(bytes32 lpId, address wallet) external onlyOperator {
        if (wallet == address(0)) revert ZeroWallet();
        LP storage lp = _lps[lpId];
        if (lp.status == Status.NONE) revert UnknownLP();
        address from = lp.wallet;
        lp.wallet = wallet;
        emit LPWalletChanged(lpId, from, wallet);
    }

    function updateKYBHash(bytes32 lpId, bytes32 newHash) external onlyOperator {
        LP storage lp = _lps[lpId];
        if (lp.status == Status.NONE) revert UnknownLP();
        lp.kybRecordHash = newHash;
        emit LPKYBHashUpdated(lpId, newHash);
    }

    function updatePayoutAccountHash(bytes32 lpId, bytes32 newHash) external onlyOperator {
        LP storage lp = _lps[lpId];
        if (lp.status == Status.NONE) revert UnknownLP();
        lp.payoutAccountHash = newHash;
        emit LPPayoutAccountUpdated(lpId, newHash);
    }

    function setOperator(address next) external onlyOwner {
        emit OperatorChanged(klaroOperator, next);
        klaroOperator = next;
    }

    // ─── Consumer-facing gates ──────────────────────────────────────────

    /// @notice Reverts if LP can't currently claim orders. Used inline by
    /// `CashoutOrderProcessor.claimByLP` etc.
    function assertActive(bytes32 lpId) external view {
        Status s = _lps[lpId].status;
        if (s != Status.ADMITTED) revert NotActive(lpId, s);
    }

    function assertTierAtLeast(bytes32 lpId, uint8 minTier) external view {
        LP storage lp = _lps[lpId];
        if (lp.status != Status.ADMITTED) revert NotActive(lpId, lp.status);
        if (lp.tier < minTier) revert BadTier(lp.tier);
    }

    // ─── Views ──────────────────────────────────────────────────────────

    function getLP(bytes32 lpId) external view returns (LP memory) {
        return _lps[lpId];
    }

    function walletOf(bytes32 lpId) external view returns (address) {
        return _lps[lpId].wallet;
    }

    function statusOf(bytes32 lpId) external view returns (Status) {
        return _lps[lpId].status;
    }

    function isActive(bytes32 lpId) external view returns (bool) {
        return _lps[lpId].status == Status.ADMITTED;
    }
}
