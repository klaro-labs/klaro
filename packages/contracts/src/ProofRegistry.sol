// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { Ownable2Step } from "@openzeppelin/contracts/access/Ownable2Step.sol";
import { KlaroConfig } from "./KlaroConfig.sol";

/// @title ProofRegistry
/// @notice Anchor for the 10 fields that prove a partner cashout actually
/// happened off-chain (v2 §24.1). The proof is HASHES + IDs only —
/// no PII (). UTR references, screenshot bytes, and
/// signatures live off-chain; the receipt page reads the URI to
/// pull them when authorized.
/// @dev The CashoutOrderProcessor calls `submit()` on a successful LP
/// claim and again on dispute resolution; this contract holds the
/// immutable anchor for both. Anyone can `verify()` a proof hash.
/// @dev Why a separate contract: keeps the cashout state-machine code
/// small + lets us extend proof types (Reclaim, zkEmail)
/// without changing the order contract.
contract ProofRegistry is Ownable2Step {
    struct Proof {
        bytes32 cashoutId; // matches CashoutOrderProcessor key
        bytes32 lpId; // LP entity (off-chain identity in LPStaking)
        bytes32 vendorId; // vendor (off-chain identity in Supabase)
        uint256 inrAmount; // INR amount × 100 (paise precision) — for audit
        uint256 usdcAmount; // 6-decimal USDC (Arc ERC-20 interface)
        bytes32 utrReferenceHash; // keccak256 of the UTR + payout-account string
        bytes32 screenshotHash; // keccak256 of the screenshot bytes
        uint64 submittedAt; // unix seconds
        bytes32 lpSignatureHash; // keccak256 of the LP's EIP-712 attestation
        bytes32 verifierSignatureHash; // optional countersign by Klaro verifier
    }

    /// @notice Stable proof hash → Proof struct.
    mapping(bytes32 => Proof) public proofs;

    /// @notice Klaro operator (CashoutOrderProcessor) is the only writer.
    address public klaroOperator;

    event ProofSubmitted(
        bytes32 indexed proofHash,
        bytes32 indexed cashoutId,
        bytes32 indexed lpId,
        uint256 usdcAmount
    );
    event OperatorChanged(address indexed previous, address indexed next);

    error OnlyOperator();
    error AlreadySubmitted();
    error VendorMissing();

    modifier onlyOperator() {
        if (msg.sender != klaroOperator) revert OnlyOperator();
        _;
    }

    constructor(address operator_) Ownable(msg.sender) {
        KlaroConfig.requireArcTestnet();
        klaroOperator = operator_;
        emit OperatorChanged(address(0), operator_);
    }

    /// @notice Anchor a new proof. The `proofHash` is deterministic over the
    /// immutable fields so disputers can reconstruct + verify.
    function submit(Proof calldata p) external onlyOperator returns (bytes32 proofHash) {
        if (p.vendorId == bytes32(0)) revert VendorMissing();
        proofHash = keccak256(
            abi.encode(
                p.cashoutId,
                p.lpId,
                p.vendorId,
                p.inrAmount,
                p.usdcAmount,
                p.utrReferenceHash,
                p.screenshotHash,
                p.lpSignatureHash,
                p.verifierSignatureHash
            )
        );
        if (proofs[proofHash].submittedAt != 0) revert AlreadySubmitted();

        Proof storage stored = proofs[proofHash];
        stored.cashoutId = p.cashoutId;
        stored.lpId = p.lpId;
        stored.vendorId = p.vendorId;
        stored.inrAmount = p.inrAmount;
        stored.usdcAmount = p.usdcAmount;
        stored.utrReferenceHash = p.utrReferenceHash;
        stored.screenshotHash = p.screenshotHash;
        stored.submittedAt = uint64(block.timestamp);
        stored.lpSignatureHash = p.lpSignatureHash;
        stored.verifierSignatureHash = p.verifierSignatureHash;

        emit ProofSubmitted(proofHash, p.cashoutId, p.lpId, p.usdcAmount);
    }

    /// @notice Anyone can verify a proof anchor.
    function verify(bytes32 proofHash) external view returns (bool) {
        return proofs[proofHash].submittedAt != 0;
    }

    /// @notice Read the full anchor for a hash. Zero-struct when missing.
    function getProof(bytes32 proofHash) external view returns (Proof memory) {
        return proofs[proofHash];
    }

    function setOperator(address next) external onlyOwner {
        emit OperatorChanged(klaroOperator, next);
        klaroOperator = next;
    }
}
