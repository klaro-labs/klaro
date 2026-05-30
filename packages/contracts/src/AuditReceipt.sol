// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import { ERC721 } from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { Ownable2Step } from "@openzeppelin/contracts/access/Ownable2Step.sol";

import { KlaroConfig } from "./KlaroConfig.sol";

/// @title AuditReceipt
/// @notice The Stenn-Proof receipt — per-invoice soulbound ERC-721 that
/// anchors every fact a future auditor / lender / regulator needs
/// to verify the invoice was real, both parties signed, screening
/// passed, and funds landed.
/// @dev Soulbound: every transfer call reverts. The receipt is the
/// vendor's property forever; reputation is built from owning many.
/// @dev On-chain fields are HASHES + IDs only ( — no PII).
/// Off-chain receipt page reads the URI to render full details.
/// The `verify(receiptHash)` view lets anyone confirm a receipt
/// exists without going through Klaro infrastructure.
contract AuditReceipt is ERC721, Ownable2Step {
    struct Anchor {
        bytes32 invoiceId; // matches InvoiceEscrow key
        bytes32 invoiceHash; // keccak256 of invoice metadata JSON
        bytes32 acceptanceHash; // keccak256(buyer EIP-712 signature)
        bytes32 screeningHash; // 3-of-3 screening result hash
        bytes32 settlementTx; // tx hash of InvoiceEscrow.settle call
        uint64 settledAt; // unix seconds of settle
        uint32 sourceChainId; // origin chain (Arc = 5042002, Base = 8453, etc.)
        address vendor; // for indexer convenience
    }

    /// @notice tokenId is the integer cast of a stable receipt hash:
    /// uint256(keccak256(abi.encode(invoiceId, acceptanceHash, settlementTx)))
    mapping(uint256 => Anchor) public anchors;

    /// @notice Anchor lookup by raw receiptHash → tokenId.
    mapping(bytes32 => uint256) public receiptOf;

    address public klaroOperator;
    uint256 private _nextLogIndex; // monotonic counter for ordering events

    event ReceiptMinted(
        uint256 indexed tokenId,
        bytes32 indexed receiptHash,
        bytes32 indexed invoiceId,
        address vendor
    );
    event OperatorChanged(address indexed previous, address indexed next);

    error OnlyOperator();
    error Soulbound();
    error AlreadyMinted();

    modifier onlyOperator() {
        if (msg.sender != klaroOperator) revert OnlyOperator();
        _;
    }

    constructor(address operator_)
        ERC721("Klaro Stenn-Proof Receipt", "STENN")
        Ownable(msg.sender)
    {
        KlaroConfig.requireArcTestnet();
        klaroOperator = operator_;
        emit OperatorChanged(address(0), operator_);
    }

    // ─── Mint ───────────────────────────────────────────────────────────

    /// @notice Mint a new receipt anchored to the given facts. Called by the
    /// Klaro backend after observing InvoiceEscrow.InvoiceSettled.
    function mint(Anchor calldata a)
        external
        onlyOperator
        returns (uint256 tokenId, bytes32 receiptHash)
    {
        receiptHash = keccak256(abi.encode(a.invoiceId, a.acceptanceHash, a.settlementTx));
        if (receiptOf[receiptHash] != 0) revert AlreadyMinted();

        tokenId = uint256(receiptHash);
        anchors[tokenId] = a;
        receiptOf[receiptHash] = tokenId;
        unchecked {
            ++_nextLogIndex;
        }

        _safeMint(a.vendor, tokenId);
        emit ReceiptMinted(tokenId, receiptHash, a.invoiceId, a.vendor);
    }

    // ─── Verify (anyone) ────────────────────────────────────────────────

    /// @notice Returns true if a receipt with this hash exists.
    function verify(bytes32 receiptHash) external view returns (bool) {
        return receiptOf[receiptHash] != 0;
    }

    /// @notice Read anchor by receipt hash. Returns zero-struct if missing.
    function anchorOf(bytes32 receiptHash) external view returns (Anchor memory) {
        return anchors[receiptOf[receiptHash]];
    }

    // ─── Soulbound enforcement ──────────────────────────────────────────

    /// @dev Disallow every transfer that isn't a mint (from == 0).
    /// OZ 5.x routes all transfers through `_update`; revert there.
    function _update(address to, uint256 tokenId, address auth)
        internal
        override
        returns (address)
    {
        address from = _ownerOf(tokenId);
        if (from != address(0) && to != address(0)) revert Soulbound();
        return super._update(to, tokenId, auth);
    }

    // ─── Admin ──────────────────────────────────────────────────────────

    function setOperator(address next) external onlyOwner {
        emit OperatorChanged(klaroOperator, next);
        klaroOperator = next;
    }
}
