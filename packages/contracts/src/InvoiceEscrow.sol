// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { EIP712 } from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import { SignatureChecker } from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { Pausable } from "@openzeppelin/contracts/utils/Pausable.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { Ownable2Step } from "@openzeppelin/contracts/access/Ownable2Step.sol";

import { KlaroConfig } from "./KlaroConfig.sol";
import { FeeSplitter } from "./FeeSplitter.sol";
import { CounterpartyRegistry } from "./CounterpartyRegistry.sol";
import { PrivacyVeil } from "./PrivacyVeil.sol";

/// @title InvoiceEscrow
/// @notice The core money-flow contract. A vendor creates an invoice; the
/// buyer signs EIP-712 acceptance; payment lands in escrow; vendor
/// (or auto-rule) settles → AuditReceipt mints downstream.
/// @dev State machine (per Klaro — money flows = state machines):
/// CREATED → ACCEPTED → PAID → SETTLED.
/// Any transition out of CREATED requires buyer acceptance.
/// Any transition out of PAID into SETTLED releases funds + triggers
/// receipt mint (called by Klaro backend, not this contract).
/// @dev Critical buy-side principle: signature checking uses
/// `SignatureChecker.isValidSignatureNow` (OZ) — that path accepts
/// both EOA `ecrecover` results AND EIP-1271 SCA `isValidSignature`
/// responses. Raw `ecrecover` only would silently fail for every
/// Modular-Wallet buyer (build-plan GAP 396).
contract InvoiceEscrow is EIP712, ReentrancyGuard, Pausable, Ownable2Step {
    using SafeERC20 for IERC20;

    // ─── State machine ──────────────────────────────────────────────────
    enum Status {
        NONE, // 0 — invoice id has never existed (default for unset)
        CREATED, // 1 — vendor issued, buyer has not signed yet
        ACCEPTED, // 2 — buyer EIP-712 signature recorded
        PAID, // 3 — USDC landed in escrow
        SETTLED, // 4 — vendor pulled funds; receipt minted off-chain
        REFUNDED, // 5 — payment returned to buyer (M4 work)
        CANCELLED // 6 — vendor voided before payment
    }

    struct Invoice {
        address vendor; // default sole payee when splitsHash == 0; else just record-keeper
        address token; // ERC-20 (USDC or EURC) — Arc ERC-20 interface uses 6 decimals
        uint256 amount; // gross amount in the token's native units (6-dec for Arc USDC)
        uint64 dueAt; // unix seconds; informational, no auto-revert
        uint64 acceptedAt; // unix seconds buyer accepted; 0 until then
        address acceptedBy; // buyer address recovered from signature
        bytes32 metadataHash; // keccak256 of off-chain JSON (line items, etc.)
        bytes32 screeningHash; // hash of the 3-of-3 screening result (set by Klaro)
        bytes32 splitsHash; // keccak256(abi.encode(splits)); 0 = sole-vendor path
        Status status;
    }

    /// @notice EIP-712 type-hash for buyer acceptance. v7 adds splitsHash so
    /// buyers cryptographically commit to the payout distribution.
    bytes32 public constant ACCEPTANCE_TYPEHASH = keccak256(
        "InvoiceAcceptance(bytes32 invoiceId,address vendor,address token,uint256 amount,uint64 dueAt,bytes32 metadataHash,bytes32 splitsHash)"
    );

    /// @notice EIP-712 type-hash for a vendor's Klaro Link authorization. The
    /// vendor signs this ONCE per link (binding their wallet to the link's
    /// token + amount until `authDeadline`); `createInvoiceFor` then lets the
    /// operator publish each link-payment's invoice on-chain on the vendor's
    /// behalf. Intentionally reusable across the link's many payments — each
    /// invoiceId is unique and `AlreadyExists` guards duplicates. Scoped to
    /// `linkId` so an authorization can't be replayed across links.
    bytes32 public constant LINK_INVOICE_AUTH_TYPEHASH = keccak256(
        "LinkInvoiceAuthorization(address vendor,address token,uint256 amount,bytes32 linkId,uint64 authDeadline)"
    );

    mapping(bytes32 => Invoice) public invoices; // invoiceId → state
    mapping(bytes32 => FeeSplitter.Split[]) private _invoiceSplits; // invoiceId → splits

    FeeSplitter public immutable feeSplitter;

    /// @notice Allow-listed caller of `refund()` — set to the deployed
    /// RefundProtocol address. was
    /// operator-only off-chain orchestration, which left the
    /// vendor signature consumed without funds moving.
    address public refundCaller;

    /// @notice Trusted Klaro backend wallet allowed to set screening hashes
    /// and trigger settle hooks. Replaceable; not the owner.
    address public klaroOperator;

    /// @notice Counterparty registry. When set:
    /// - Always rejects denylisted buyers.
    /// - Additionally requires a fresh-pass cached decision when `counterpartyStrict == true`.
    /// registry was deployed but never called.
    CounterpartyRegistry public counterparty;
    bool public counterpartyStrict;

    /// @notice Privacy veil — when set + the invoice carries an `amountCommit`,
    /// the commit is anchored at `createInvoice`. Reveal happens off-chain at
    /// receipt mint. .
    PrivacyVeil public veil;

    // ─── Events ─────────────────────────────────────────────────────────
    event InvoiceCreated(
        bytes32 indexed invoiceId,
        address indexed vendor,
        address token,
        uint256 amount,
        bytes32 metadataHash
    );
    event InvoiceSplitsSet(bytes32 indexed invoiceId, uint256 payeeCount, bytes32 splitsHash);
    event InvoiceAccepted(bytes32 indexed invoiceId, address indexed buyer, uint64 acceptedAt);
    event InvoicePaid(bytes32 indexed invoiceId, address indexed buyer, uint256 amount);
    event InvoiceSettled(bytes32 indexed invoiceId, address indexed vendor, uint256 amount);
    event InvoiceCancelled(bytes32 indexed invoiceId);
    event InvoiceRefunded(bytes32 indexed invoiceId, address indexed buyer, uint256 amount);
    event ScreeningRecorded(bytes32 indexed invoiceId, bytes32 screeningHash);
    event OperatorChanged(address indexed previous, address indexed next);
    event RefundCallerChanged(address indexed previous, address indexed next);
    event CounterpartyChanged(address indexed previous, address indexed next, bool strict);
    event VeilChanged(address indexed previous, address indexed next);
    event AmountCommitted(bytes32 indexed invoiceId, bytes32 amountCommit);

    // ─── Errors ─────────────────────────────────────────────────────────
    error InvalidStatus(Status expected, Status actual);
    error WrongVendor(address expected, address actual);
    error BadAcceptanceSig();
    error AmountZero();
    error TokenMismatch(address expected, address actual);
    error AmountMismatch(uint256 expected, uint256 actual);
    error OnlyOperator();
    error AlreadyExists();
    error BadSplitsHash(bytes32 expected, bytes32 actual);
    error BadSplitsSum(uint256 actual);
    error ZeroPayee();
    error ZeroBps();
    error OnlyRefundCaller();
    error ScreeningNotRecorded();
    error BuyerDenylisted();
    error BuyerNotCleared();
    error AuthExpired();
    error BadVendorAuth();
    // setRefundCaller now rejects
    // address(0) so the owner can't accidentally brick refunds.
    error ZeroAddress();

    modifier onlyOperator() {
        if (msg.sender != klaroOperator) revert OnlyOperator();
        _;
    }

    constructor(address operator_, FeeSplitter feeSplitter_)
        EIP712("Klaro Invoice", "1")
        Ownable(msg.sender)
    {
        KlaroConfig.requireArcTestnet();
        klaroOperator = operator_;
        feeSplitter = feeSplitter_;
        emit OperatorChanged(address(0), operator_);
    }

    // ─── Vendor-side ────────────────────────────────────────────────────

    /// @notice Vendor opens an invoice. `invoiceId` is deterministic off-chain
    /// (e.g. keccak256("klaro/" + vendor + nonce)) so the hosted page
    /// can be referenced before this tx confirms.
    function createInvoice(
        bytes32 invoiceId,
        address token,
        uint256 amount,
        uint64 dueAt,
        bytes32 metadataHash
    ) external whenNotPaused nonReentrant {
        _createInvoice(invoiceId, token, amount, dueAt, metadataHash, bytes32(0));
    }

    /// @notice Create a veiled invoice — vendor commits `keccak256(amount, salt)`
    /// to PrivacyVeil at creation; the on-chain `amount` field still carries
    /// the cleartext amount for now (M1 keccak-only). Mainnet PrivacyVeil v2
    /// will switch to Pedersen commitments + ZK reveal so the cleartext can
    /// drop from storage. .
    function createInvoiceVeiled(
        bytes32 invoiceId,
        address token,
        uint256 amount,
        uint64 dueAt,
        bytes32 metadataHash,
        bytes32 amountCommit
    ) external whenNotPaused nonReentrant {
        _createInvoice(invoiceId, token, amount, dueAt, metadataHash, bytes32(0));
        if (address(veil) != address(0) && amountCommit != bytes32(0)) {
            veil.commitFor(invoiceId, amountCommit, msg.sender);
            emit AmountCommitted(invoiceId, amountCommit);
        }
    }

    /// @notice Open an invoice that fans out to multiple payees on settle.
    /// Splits must sum to 10_000 BPS (validated). `splits[]` is stored
    /// and its hash is committed into the EIP-712 acceptance digest,
    /// so the buyer signature binds to the distribution.
    function createInvoiceWithSplits(
        bytes32 invoiceId,
        address token,
        uint256 amount,
        uint64 dueAt,
        bytes32 metadataHash,
        FeeSplitter.Split[] calldata splits
    ) external whenNotPaused nonReentrant {
        _validateSplits(splits);
        bytes32 splitsHash = keccak256(abi.encode(splits));
        _createInvoice(invoiceId, token, amount, dueAt, metadataHash, splitsHash);
        for (uint256 i = 0; i < splits.length; i++) {
            _invoiceSplits[invoiceId].push(splits[i]);
        }
        emit InvoiceSplitsSet(invoiceId, splits.length, splitsHash);
    }

    /// @notice Open an invoice on behalf of a vendor who pre-authorized a Klaro
    /// Link. The vendor signs `LinkInvoiceAuthorization` once (token+amount+
    /// linkId+deadline); anyone (the Klaro operator, or even the buyer's relayer)
    /// may then publish each link-payment's invoice on-chain by presenting that
    /// signature. The recovered signer becomes `inv.vendor`, so settlement always
    /// pays the vendor — a relayed publish cannot redirect funds. A spurious
    /// invoice is harmless: it still needs a buyer to `acceptAndPay`.
    /// Works for EOA + EIP-1271 vendor wallets (SignatureChecker).
    function createInvoiceFor(
        bytes32 invoiceId,
        address vendor,
        address token,
        uint256 amount,
        uint64 dueAt,
        bytes32 metadataHash,
        bytes32 linkId,
        uint64 authDeadline,
        bytes calldata vendorAuthSig
    ) external whenNotPaused nonReentrant {
        if (vendor == address(0)) revert ZeroAddress();
        if (block.timestamp > authDeadline) revert AuthExpired();
        bytes32 structHash = keccak256(
            abi.encode(LINK_INVOICE_AUTH_TYPEHASH, vendor, token, amount, linkId, authDeadline)
        );
        bytes32 digest = _hashTypedDataV4(structHash);
        if (!SignatureChecker.isValidSignatureNow(vendor, digest, vendorAuthSig)) {
            revert BadVendorAuth();
        }
        _createInvoiceFor(invoiceId, vendor, token, amount, dueAt, metadataHash, bytes32(0));
    }

    function _createInvoice(
        bytes32 invoiceId,
        address token,
        uint256 amount,
        uint64 dueAt,
        bytes32 metadataHash,
        bytes32 splitsHash
    ) internal {
        _createInvoiceFor(invoiceId, msg.sender, token, amount, dueAt, metadataHash, splitsHash);
    }

    function _createInvoiceFor(
        bytes32 invoiceId,
        address vendor,
        address token,
        uint256 amount,
        uint64 dueAt,
        bytes32 metadataHash,
        bytes32 splitsHash
    ) internal {
        if (amount == 0) revert AmountZero();
        if (invoices[invoiceId].status != Status.NONE) revert AlreadyExists();

        invoices[invoiceId] = Invoice({
            vendor: vendor,
            token: token,
            amount: amount,
            dueAt: dueAt,
            acceptedAt: 0,
            acceptedBy: address(0),
            metadataHash: metadataHash,
            screeningHash: bytes32(0),
            splitsHash: splitsHash,
            status: Status.CREATED
        });

        emit InvoiceCreated(invoiceId, vendor, token, amount, metadataHash);
    }

    function _validateSplits(FeeSplitter.Split[] calldata splits) internal pure {
        if (splits.length == 0) revert BadSplitsSum(0);
        uint256 sum;
        for (uint256 i = 0; i < splits.length; i++) {
            if (splits[i].payee == address(0)) revert ZeroPayee();
            if (splits[i].bps == 0) revert ZeroBps();
            sum += splits[i].bps;
        }
        if (sum != 10_000) revert BadSplitsSum(sum);
    }

    /// @notice Vendor voids an unpaid invoice. Refund logic for paid invoices
    /// lives in `RefundProtocol.sol` (M4).
    /// @dev missing
    /// `whenNotPaused`. Doesn't move funds but should freeze
    /// lifecycle transitions under emergency pause for parity
    /// with every other entrypoint.
    function cancelInvoice(bytes32 invoiceId) external whenNotPaused {
        Invoice storage inv = invoices[invoiceId];
        if (inv.status != Status.CREATED && inv.status != Status.ACCEPTED) {
            revert InvalidStatus(Status.CREATED, inv.status);
        }
        if (inv.vendor != msg.sender) {
            revert WrongVendor(inv.vendor, msg.sender);
        }
        inv.status = Status.CANCELLED;
        emit InvoiceCancelled(invoiceId);
    }

    // ─── Buyer-side ─────────────────────────────────────────────────────

    /// @notice One-shot accept + pay. Buyer signs EIP-712 acceptance off-chain,
    /// then any relayer (or the buyer themselves) calls this with the
    /// signature + sends the USDC in the same tx.
    /// @dev Token transfer happens BEFORE signature recovery so a bad sig
    /// reverts and unwinds the transfer. ReentrancyGuard protects the
    /// token call ordering.
    function acceptAndPay(bytes32 invoiceId, bytes calldata buyerSignature, address buyer)
        external
        whenNotPaused
        nonReentrant
    {
        Invoice storage inv = invoices[invoiceId];
        if (inv.status != Status.CREATED) {
            revert InvalidStatus(Status.CREATED, inv.status);
        }

        // Counterparty gate (, 2026-05-25).
        // Default mode: deny only buyers on the registry denylist; unknown
        // buyers fall through (daemon caches after seeing InvoicePaid).
        // Strict mode (`counterpartyStrict == true`): require a fresh-pass
        // cached decision. Operator flips strict on once screening lead time
        // is short enough that buyers always have a fresh decision by checkout.
        if (address(counterparty) != address(0)) {
            if (counterpartyStrict) {
                if (!counterparty.isAllowed(buyer)) revert BuyerNotCleared();
            } else {
                if (counterparty.denylist(buyer)) revert BuyerDenylisted();
            }
        }

        // Verify EIP-712 acceptance from buyer (works for EOA + EIP-1271 SCAs)
        bytes32 structHash = keccak256(
            abi.encode(
                ACCEPTANCE_TYPEHASH,
                invoiceId,
                inv.vendor,
                inv.token,
                inv.amount,
                inv.dueAt,
                inv.metadataHash,
                inv.splitsHash
            )
        );
        bytes32 digest = _hashTypedDataV4(structHash);
        if (!SignatureChecker.isValidSignatureNow(buyer, digest, buyerSignature)) {
            revert BadAcceptanceSig();
        }

        inv.acceptedAt = uint64(block.timestamp);
        inv.acceptedBy = buyer;
        inv.status = Status.PAID; // moves through ACCEPTED logically; emit both events.
        emit InvoiceAccepted(invoiceId, buyer, uint64(block.timestamp));

        // Pull USDC into escrow. Buyer must have approved.
        IERC20(inv.token).safeTransferFrom(buyer, address(this), inv.amount);
        emit InvoicePaid(invoiceId, buyer, inv.amount);
    }

    // ─── Klaro operator (screening + settle) ────────────────────────────

    /// @notice Klaro backend records the 3-of-3 screening result hash. Called
    /// after the screening orchestrator returns. Required before
    /// settlement so the AuditReceipt can anchor it.
    function recordScreening(bytes32 invoiceId, bytes32 screeningHash) external onlyOperator {
        Invoice storage inv = invoices[invoiceId];
        if (inv.status != Status.PAID) {
            revert InvalidStatus(Status.PAID, inv.status);
        }
        inv.screeningHash = screeningHash;
        emit ScreeningRecorded(invoiceId, screeningHash);
    }

    /// @notice Release funds to vendor + transition to SETTLED. Receipt
    /// minting happens off-chain in the backend after listening
    /// for the InvoiceSettled event (keeps this contract small).
    /// @dev missing `whenNotPaused`.
    /// Operator-only, but moves USDC to vendor + FeeSplitter. Every
    /// other fund-moving entrypoint here is paused-gated; this one
    /// slipped /68/72/73 sweeps.
    function settle(bytes32 invoiceId) external onlyOperator nonReentrant whenNotPaused {
        Invoice storage inv = invoices[invoiceId];
        if (inv.status != Status.PAID) {
            revert InvalidStatus(Status.PAID, inv.status);
        }
        // settle requires recordScreening first so
        // AuditReceipt can never anchor a zero screeningHash.
        if (inv.screeningHash == bytes32(0)) revert ScreeningNotRecorded();

        inv.status = Status.SETTLED;

        if (inv.splitsHash == bytes32(0)) {
            // Default path — sole vendor payee.
            IERC20(inv.token).safeTransfer(inv.vendor, inv.amount);
        } else {
            // Splits path — fan out atomically via FeeSplitter.
            FeeSplitter.Split[] memory splits = _readSplits(invoiceId);
            IERC20(inv.token).safeTransfer(address(feeSplitter), inv.amount);
            feeSplitter.distributeAdHoc(inv.token, inv.amount, splits);
        }
        emit InvoiceSettled(invoiceId, inv.vendor, inv.amount);
    }

    /// @notice Atomic refund — called by `RefundProtocol` after the vendor's
    /// EIP-712 authorization is validated. Transitions PAID → REFUNDED
    /// and returns the escrowed USDC to the original buyer in the same tx.
    /// .
    /// @dev explicit check that
    /// refundCaller has been configured. Without it, an un-set
    /// refundCaller (== address(0)) silently bricked refunds — any
    /// caller would fail the `msg.sender != address(0)` check, so
    /// every PAID invoice that needed a refund was permanently
    /// stuck. Now the failure mode is loud + identifiable.
    function refund(bytes32 invoiceId) external nonReentrant whenNotPaused {
        if (refundCaller == address(0)) revert OnlyRefundCaller();
        if (msg.sender != refundCaller) revert OnlyRefundCaller();
        Invoice storage inv = invoices[invoiceId];
        if (inv.status != Status.PAID) {
            revert InvalidStatus(Status.PAID, inv.status);
        }
        if (inv.acceptedBy == address(0)) revert BadAcceptanceSig();

        inv.status = Status.REFUNDED;
        IERC20(inv.token).safeTransfer(inv.acceptedBy, inv.amount);
        emit InvoiceRefunded(invoiceId, inv.acceptedBy, inv.amount);
    }

    function _readSplits(bytes32 invoiceId) internal view returns (FeeSplitter.Split[] memory out) {
        FeeSplitter.Split[] storage src = _invoiceSplits[invoiceId];
        uint256 n = src.length;
        out = new FeeSplitter.Split[](n);
        for (uint256 i = 0; i < n; i++) {
            out[i] = src[i];
        }
    }

    // ─── Admin ──────────────────────────────────────────────────────────

    /// @dev reject address(0) so the
    /// owner can't accidentally brick refunds by unsetting after
    /// configuration. Pair with the explicit unset-check in refund().
    function setRefundCaller(address next) external onlyOwner {
        if (next == address(0)) revert ZeroAddress();
        emit RefundCallerChanged(refundCaller, next);
        refundCaller = next;
    }

    function setOperator(address next) external onlyOwner {
        emit OperatorChanged(klaroOperator, next);
        klaroOperator = next;
    }

    function setCounterparty(CounterpartyRegistry next, bool strict) external onlyOwner {
        emit CounterpartyChanged(address(counterparty), address(next), strict);
        counterparty = next;
        counterpartyStrict = strict;
    }

    function setVeil(PrivacyVeil next) external onlyOwner {
        emit VeilChanged(address(veil), address(next));
        veil = next;
    }

    /// @notice Emergency pause — owner only. (boring infra).
    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // ─── Views ──────────────────────────────────────────────────────────

    function statusOf(bytes32 invoiceId) external view returns (Status) {
        return invoices[invoiceId].status;
    }

    /// @notice Full struct view — consumers (RefundProtocol, ReputationView,
    /// AuditReceipt mint backend) get the whole record in one call
    /// without hitting stack-depth limits that the auto-generated
    /// tuple getter would cause.
    function getInvoice(bytes32 invoiceId) external view returns (Invoice memory) {
        return invoices[invoiceId];
    }

    /// @notice EIP-712 domain separator. Exposed publicly so off-chain signing
    /// flows (vendor dashboard, hosted invoice) can build matching
    /// digests without hard-coding `name`/`version`.
    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    function getSplits(bytes32 invoiceId) external view returns (FeeSplitter.Split[] memory) {
        return _readSplits(invoiceId);
    }
}
