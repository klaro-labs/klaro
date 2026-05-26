// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

import { KlaroConfig } from "./KlaroConfig.sol";

/// @title PrivacyVeil
/// @notice Per-invoice amount-commitment registry. The commit is a keccak256
/// hash of `(amountUsdc, salt)` — a hiding commitment good enough for
/// M1 receipts where vendors want to publish a receipt without
/// revealing the dollar amount (v2 §15.3).
/// A real Pedersen / Bulletproofs / ZK commitment lands in M9+; the
/// commit shape (`bytes32`) is forward-compatible so the consumer
/// interface doesn't change when the underlying cryptography upgrades.
/// @dev — only the commit goes on chain. Salt + revealed
/// amount stay off-chain. Anyone with both can verify by re-hashing.
contract PrivacyVeil is Ownable {
    struct Veil {
        bytes32 commit; // keccak256(abi.encode(amountUsdc, salt))
        uint64 committedAt;
        address committer;
        bool revealed; // true once the vendor / buyer revealed publicly
        uint256 revealedAmount; // populated when revealed; 0 otherwise
    }

    mapping(bytes32 => Veil) private _veils; // invoiceId → Veil

    /// @notice Allow-list for callers of `commit` and `commitFor`. Audit fix
    /// : both entrypoints were
    /// permissionless. Any address could front-run a legitimate
    /// `createInvoiceVeiled` and pin a junk hash with themselves as
    /// committer, permanently locking the vendor out of veiling that
    /// invoiceId and out of any subsequent reveal (since `reveal`
    /// requires `msg.sender == committer`).
    mapping(address => bool) public trustedCallers;

    event Committed(bytes32 indexed invoiceId, bytes32 indexed commit, address indexed committer);
    event Revealed(bytes32 indexed invoiceId, uint256 amountUsdc);
    event TrustedCallerSet(address indexed caller, bool trusted);

    error AlreadyCommitted();
    error UnknownInvoice();
    error AlreadyRevealed();
    error BadReveal();
    error NotCommitter();
    error NotTrustedCaller();

    modifier onlyTrustedCaller() {
        if (!trustedCallers[msg.sender]) revert NotTrustedCaller();
        _;
    }

    constructor() Ownable(msg.sender) {
        KlaroConfig.requireArcTestnet();
    }

    /// @notice Trusted callers (e.g. `InvoiceEscrow`) commit the
    /// amount + salt hash. The `committer` recorded is the
    /// on-behalf-of address whose `msg.sender` will be required for
    /// `reveal`. Re-commits are forbidden — every invoice gets
    /// exactly one veil.
    /// @dev The legacy `commit(invoiceId, hash)` entrypoint was removed in
    /// because every legitimate call already routes through
    /// `InvoiceEscrow.createInvoiceVeiled`. Keeping a permissionless
    /// direct entrypoint just re-opened the hijack vector.
    function commitFor(bytes32 invoiceId, bytes32 commitHash, address committer)
        external
        onlyTrustedCaller
    {
        _commit(invoiceId, commitHash, committer);
    }

    function setTrustedCaller(address caller, bool trusted) external onlyOwner {
        trustedCallers[caller] = trusted;
        emit TrustedCallerSet(caller, trusted);
    }

    function _commit(bytes32 invoiceId, bytes32 commitHash, address committer) internal {
        if (_veils[invoiceId].committedAt != 0) revert AlreadyCommitted();
        _veils[invoiceId] = Veil({
            commit: commitHash,
            committedAt: uint64(block.timestamp),
            committer: committer,
            revealed: false,
            revealedAmount: 0
        });
        emit Committed(invoiceId, commitHash, committer);
    }

    /// @notice Reveal the amount + salt so any verifier can prove the original
    /// commit. After reveal the veil is permanently bound.
    function reveal(bytes32 invoiceId, uint256 amountUsdc, bytes32 salt) external {
        Veil storage v = _veils[invoiceId];
        if (v.committedAt == 0) revert UnknownInvoice();
        if (v.revealed) revert AlreadyRevealed();
        if (msg.sender != v.committer) revert NotCommitter();
        bytes32 expected = keccak256(abi.encode(amountUsdc, salt));
        if (expected != v.commit) revert BadReveal();
        v.revealed = true;
        v.revealedAmount = amountUsdc;
        emit Revealed(invoiceId, amountUsdc);
    }

    function getVeil(bytes32 invoiceId) external view returns (Veil memory) {
        return _veils[invoiceId];
    }

    function isRevealed(bytes32 invoiceId) external view returns (bool) {
        return _veils[invoiceId].revealed;
    }
}
