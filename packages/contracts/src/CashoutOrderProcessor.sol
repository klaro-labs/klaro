// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { Pausable } from "@openzeppelin/contracts/utils/Pausable.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

import { KlaroConfig } from "./KlaroConfig.sol";
import { ProofRegistry } from "./ProofRegistry.sol";
import { LPStaking } from "./LPStaking.sol";
import { LPRegistry } from "./LPRegistry.sol";
import { DisputeManager } from "./DisputeManager.sol";

/// @title CashoutOrderProcessor
/// @notice Vendor USDC → local-currency cashout flow.
/// State machine (v2 §19):
/// REQUESTED → LOCKED → CLAIMED → PROOF_SUBMITTED → CONFIRMED → RELEASED
/// ↘ DISPUTED → RESOLVED_LP_PAYS / RESOLVED_VENDOR_PAYS
/// ↘ EXPIRED
/// Token never custodied by Klaro the entity — USDC sits in escrow
/// (this contract) until the vendor either confirms receipt of the local
/// currency or the admin resolves a dispute. Slashing on bad-faith LP
/// is delegated to `LPStaking`.
contract CashoutOrderProcessor is ReentrancyGuard, Pausable, Ownable {
    using SafeERC20 for IERC20;

    enum Status {
        NONE,
        REQUESTED,
        LOCKED,
        CLAIMED,
        PROOF_SUBMITTED,
        CONFIRMED,
        RELEASED,
        DISPUTED,
        RESOLVED_LP_PAYS,
        RESOLVED_VENDOR_PAYS,
        EXPIRED,
        CANCELLED
    }

    struct Order {
        address vendor; // vendor wallet that requested
        address token; // USDC ERC-20 on Arc (6 dec)
        uint256 usdcAmount; // amount locked
        uint256 inrAmount; // quoted INR (× 100 = paise)
        bytes32 lpId; // LP claimed assignment (set on CLAIMED)
        // snapshot of
        // `LPRegistry.walletOf(lpId)` taken at `claimByLP` time. Iter
        // 71-73 worked off live `registry.walletOf(o.lpId)` reads at
        // confirm/release/expire/dispute time — meaning a compromised
        // operator could call `LPRegistry.setWallet(lpId, attacker)`
        // between claim + payout and divert already-escrowed USDC.
        // Snapshotting binds the payout target to whatever the operator
        // approved at assignment time. Any wallet rotation must wait for
        // the LP's open obligations to resolve.
        address lpWallet;
        bytes32 corridor; // e.g. keccak256("INR")
        uint64 requestedAt;
        uint64 quoteExpiresAt;
        bytes32 quoteHash; // anchors LP rate + spread + Klaro fee
        bytes32 proofHash; // ProofRegistry anchor (set on PROOF_SUBMITTED)
        Status status;
    }

    /// @notice cashoutId → order
    mapping(bytes32 => Order) public orders;

    IERC20 public immutable usdc;
    ProofRegistry public immutable proofs;
    LPStaking public immutable staking;
    LPRegistry public immutable registry;
    DisputeManager public disputes; // set via setDisputes() post-deploy
    address public klaroOperator;

    bytes32 internal constant CASHOUT_DISPUTE_CONTEXT = keccak256("klaro.dispute.cashout");

    // pending-slash record. Populated when SLASH_LP
    // resolution succeeds (vendor paid) but staking.slash reverts —
    // typically because LPStaking is independently paused. Operator
    // calls retrySlash(cashoutId) once LPStaking unpauses.
    struct PendingSlash {
        bytes32 lpId;
        uint256 amount;
        bytes32 reasonHash;
    }

    mapping(bytes32 => PendingSlash) public pendingSlash;

    event DisputesContractChanged(address indexed previous, address indexed next);
    event DisputeOpenedInManager(bytes32 indexed cashoutId, bytes32 indexed caseId);

    /// @notice Confirm-window — vendor has this many seconds to confirm or
    /// dispute after PROOF_SUBMITTED. Auto-confirm logic lives off-chain
    /// in the operator daemon; this contract only enforces signed actions.
    uint64 public constant CONFIRM_WINDOW = 24 hours;

    // ─── Events ─────────────────────────────────────────────────────────
    event OrderRequested(
        bytes32 indexed cashoutId,
        address indexed vendor,
        uint256 usdcAmount,
        uint256 inrAmount,
        bytes32 corridor
    );
    event OrderLocked(bytes32 indexed cashoutId, uint256 usdcAmount);
    event OrderClaimed(bytes32 indexed cashoutId, bytes32 indexed lpId);
    event ProofSubmittedFor(bytes32 indexed cashoutId, bytes32 indexed proofHash);
    event OrderConfirmed(bytes32 indexed cashoutId);
    event OrderReleased(bytes32 indexed cashoutId, bytes32 indexed lpId, uint256 usdcAmount);
    event OrderDisputed(bytes32 indexed cashoutId, address indexed by);
    event OrderResolved(
        bytes32 indexed cashoutId, Status outcome, uint256 slashAmount, bytes32 reasonHash
    );
    event OrderExpired(bytes32 indexed cashoutId);
    event OrderCancelled(bytes32 indexed cashoutId);
    event OperatorChanged(address indexed previous, address indexed next);
    // SLASH_LP resolution previously failed atomically
    // when LPStaking was paused independently (e.g. owner investigating
    // a staking bug). Now: dispute resolution completes (vendor paid)
    // and the slash is deferred to a separate operator-retriable call.
    event SlashDeferred(
        bytes32 indexed cashoutId,
        bytes32 indexed lpId,
        uint256 amount,
        bytes32 reasonHash,
        string reason
    );
    event SlashRetried(bytes32 indexed cashoutId, bytes32 indexed lpId, uint256 amount);
    // owner-only write-off when retrySlash can never
    // succeed (e.g. LP stake fully consumed, LPRegistry removed the
    // entry, staking contract migrated). Distinct event keeps the
    // audit trail honest — operator explicitly acknowledges the LP
    // escaped slashing rather than silently deleting the record.
    event SlashWrittenOff(
        bytes32 indexed cashoutId, bytes32 indexed lpId, uint256 amount, bytes32 writeOffReasonHash
    );

    // ─── Errors ─────────────────────────────────────────────────────────
    error InvalidStatus(Status expected, Status actual);
    error AlreadyExists();
    error AmountZero();
    error QuoteExpired();
    error NotVendor();
    error NotOperator();
    error WindowNotElapsed();
    error DisputesNotConfigured();
    error DisputeNotDecided();
    error OutcomeNotApplicable(uint8 outcome);
    error SlashNotAllowed();
    // a caseId opened against a different context
    // (e.g. AgentEscrow's AGENT_DISPUTE_CONTEXT) but supplied here as
    // a cashoutId — outcomeOf would resolve against the wrong escrow's
    // decision and route this cashout's USDC based on an agent
    // dispute's resolution. Same caseId namespace, distinct contexts.
    error WrongDisputeContext();
    // retrySlash gates.
    error NoPendingSlash();

    modifier onlyOperator() {
        if (msg.sender != klaroOperator) revert NotOperator();
        _;
    }

    constructor(
        address usdc_,
        ProofRegistry proofs_,
        LPStaking staking_,
        LPRegistry registry_,
        address operator_
    ) Ownable(msg.sender) {
        KlaroConfig.requireArcTestnet();
        usdc = IERC20(usdc_);
        proofs = proofs_;
        staking = staking_;
        registry = registry_;
        klaroOperator = operator_;
        emit OperatorChanged(address(0), operator_);
    }

    // ─── Vendor side ────────────────────────────────────────────────────

    /// @notice Vendor opens a cashout request + locks USDC into escrow in
    /// one tx. The vendor must approve USDC first.
    function requestAndLock(
        bytes32 cashoutId,
        uint256 usdcAmount,
        uint256 inrAmount,
        bytes32 corridor,
        uint64 quoteExpiresAt,
        bytes32 quoteHash
    ) external whenNotPaused nonReentrant {
        if (usdcAmount == 0) revert AmountZero();
        if (orders[cashoutId].status != Status.NONE) revert AlreadyExists();
        if (block.timestamp > quoteExpiresAt) revert QuoteExpired();

        orders[cashoutId] = Order({
            vendor: msg.sender,
            token: address(usdc),
            usdcAmount: usdcAmount,
            inrAmount: inrAmount,
            lpId: bytes32(0),
            lpWallet: address(0),
            corridor: corridor,
            requestedAt: uint64(block.timestamp),
            quoteExpiresAt: quoteExpiresAt,
            quoteHash: quoteHash,
            proofHash: bytes32(0),
            status: Status.LOCKED
        });

        usdc.safeTransferFrom(msg.sender, address(this), usdcAmount);
        emit OrderRequested(cashoutId, msg.sender, usdcAmount, inrAmount, corridor);
        emit OrderLocked(cashoutId, usdcAmount);
    }

    /// @notice Vendor confirms INR received → USDC releases to the claimed LP.
    /// @dev added `whenNotPaused`.
    /// A paused emergency state previously still allowed vendor to
    /// release USDC — inconsistent with the intent of a pause
    /// (freeze all fund movement).
    function confirmReceived(bytes32 cashoutId) external whenNotPaused nonReentrant {
        Order storage o = orders[cashoutId];
        if (o.vendor != msg.sender) revert NotVendor();
        _confirmReceivedTransitions(o, cashoutId);
    }

    /// @notice Operator-callable release path (). Klaro's
    /// vendors are SMBs without signing infrastructure; the
    /// operator daemon signs on behalf of the vendor after the
    /// web action verifies vendor ownership + PROOF_SUBMITTED
    /// state. Defense-in-depth: caller must pass the expected
    /// vendor and the contract reverts if it doesn't match the
    /// order's recorded vendor (catches operator-key compromise
    /// where the attacker also needs the matching vendor id).
    /// @dev wired the daemon enqueue but called the
    /// vendor-only `confirmReceived`, which reverted NotVendor
    /// every time → 5 BullMQ retries → DLQ → USDC stuck.
    /// This new entrypoint is what the daemon should call.
    function operatorConfirmReceived(bytes32 cashoutId, address expectedVendor)
        external
        whenNotPaused
        nonReentrant
        onlyOperator
    {
        Order storage o = orders[cashoutId];
        if (o.vendor != expectedVendor) revert NotVendor();
        _confirmReceivedTransitions(o, cashoutId);
    }

    /// @dev Shared release-transition + payout. Called from both
    /// `confirmReceived` (vendor-direct) and `operatorConfirmReceived`
    /// (daemon-driven). Status guard + USDC move + events.
    function _confirmReceivedTransitions(Order storage o, bytes32 cashoutId) private {
        if (o.status != Status.PROOF_SUBMITTED) {
            revert InvalidStatus(Status.PROOF_SUBMITTED, o.status);
        }

        o.status = Status.RELEASED;
        // Canonical LP wallet lives in LPRegistry, not LPStaking.
        address lpAddr = o.lpWallet;
        emit OrderConfirmed(cashoutId);
        usdc.safeTransfer(lpAddr, o.usdcAmount);
        emit OrderReleased(cashoutId, o.lpId, o.usdcAmount);
    }

    /// @notice Vendor opens dispute. Funds stay locked until operator resolves.
    /// If a DisputeManager is wired (post-M9), this also opens a case
    /// file there with the vendor as claimant + LP wallet as respondent.
    /// `openingEvidenceHash` is the keccak of the off-chain evidence
    /// bundle (description + screenshots + bank-statement excerpt).
    // contracts P2 (audit): nonReentrant defense-in-depth.
    // disputes.open() is currently storage-only, but if the
    // DisputeManager implementation is ever swapped for a callback-
    // capable one, the missing guard becomes exploitable.
    function openDispute(bytes32 cashoutId, bytes32 openingEvidenceHash)
        external
        whenNotPaused
        nonReentrant
    {
        Order storage o = orders[cashoutId];
        if (o.vendor != msg.sender) revert NotVendor();
        if (o.status != Status.PROOF_SUBMITTED && o.status != Status.CLAIMED) {
            revert InvalidStatus(Status.PROOF_SUBMITTED, o.status);
        }
        o.status = Status.DISPUTED;
        emit OrderDisputed(cashoutId, msg.sender);

        if (address(disputes) != address(0)) {
            address lpAddr = o.lpWallet;
            disputes.open(
                cashoutId, // re-use cashoutId as caseId
                msg.sender, // vendor = claimant
                lpAddr, // LP wallet = respondent
                CASHOUT_DISPUTE_CONTEXT,
                cashoutId, // contextRefId
                openingEvidenceHash
            );
            emit DisputeOpenedInManager(cashoutId, cashoutId);
        }
    }

    /// @notice retry a deferred slash. Operator calls
    /// this once LPStaking is unpaused (or the staking bug
    /// that caused the original revert is fixed). Clears the
    /// pending record on success.
    function retrySlash(bytes32 cashoutId) external onlyOperator nonReentrant whenNotPaused {
        PendingSlash storage p = pendingSlash[cashoutId];
        if (p.amount == 0) revert NoPendingSlash();
        // Cache + clear before the external call to prevent any
        // reentrancy from re-using the record. nonReentrant already
        // covers same-contract re-entry; this is defense-in-depth.
        bytes32 lpId = p.lpId;
        uint256 amount = p.amount;
        bytes32 reasonHash = p.reasonHash;
        delete pendingSlash[cashoutId];
        staking.slash(lpId, amount, reasonHash);
        emit SlashRetried(cashoutId, lpId, amount);
    }

    /// @notice owner-only admin escape hatch when a
    /// pendingSlash can never succeed — e.g. the LP's stake has
    /// been fully consumed by other slashes, the LP entry was
    /// removed from LPRegistry, or the staking contract was
    /// migrated and the original lpId no longer exists.
    /// Without this, the record persists forever and the
    /// SlashDeferred event is an unfulfilled liability with no
    /// audit-trail closure. Owner-only (not operator) because
    /// this is a write-off, not a routine operation.
    function writeOffPendingSlash(bytes32 cashoutId, bytes32 writeOffReasonHash)
        external
        onlyOwner
    {
        PendingSlash storage p = pendingSlash[cashoutId];
        if (p.amount == 0) revert NoPendingSlash();
        bytes32 lpId = p.lpId;
        uint256 amount = p.amount;
        delete pendingSlash[cashoutId];
        emit SlashWrittenOff(cashoutId, lpId, amount, writeOffReasonHash);
    }

    function setDisputes(DisputeManager next) external onlyOwner {
        emit DisputesContractChanged(address(disputes), address(next));
        disputes = next;
    }

    // ─── Klaro operator (LP assignment + proof + dispute resolution) ────

    // pause-coverage parity with the /75/78
    // sweep on expireUnconfirmed/settle. These two functions don't
    // move USDC but advance the state machine (LOCKED → CLAIMED →
    // PROOF_SUBMITTED). The moment owner unpauses after an incident,
    // a queued confirmReceived would settle without operator review.
    function claimByLP(bytes32 cashoutId, bytes32 lpId) external onlyOperator whenNotPaused {
        Order storage o = orders[cashoutId];
        if (o.status != Status.LOCKED) {
            revert InvalidStatus(Status.LOCKED, o.status);
        }
        // LPRegistry is the canonical KYB + status source. Reverts if the LP
        // is unknown / pending / suspended / revoked.
        registry.assertActive(lpId);
        o.lpId = lpId;
        // snapshot the LP's wallet at assignment time. Subsequent
        // payout legs (confirmReceived / resolveDispute / expireUnconfirmed)
        // read `o.lpWallet`, NOT `registry.walletOf(o.lpId)`, so a wallet
        // rotation between claim + payout cannot redirect escrowed USDC.
        address lpWallet = registry.walletOf(lpId);
        if (lpWallet == address(0)) revert NotVendor();
        o.lpWallet = lpWallet;
        o.status = Status.CLAIMED;
        emit OrderClaimed(cashoutId, lpId);
    }

    function recordProof(bytes32 cashoutId, ProofRegistry.Proof calldata p)
        external
        onlyOperator
        whenNotPaused
    {
        Order storage o = orders[cashoutId];
        if (o.status != Status.CLAIMED) {
            revert InvalidStatus(Status.CLAIMED, o.status);
        }
        bytes32 proofHash = proofs.submit(p);
        o.proofHash = proofHash;
        o.status = Status.PROOF_SUBMITTED;
        emit ProofSubmittedFor(cashoutId, proofHash);
    }

    /// @notice Resolve a dispute only after DisputeManager has recorded the
    /// canonical outcome. The operator may supply a slash amount only
    /// for an explicit SLASH_LP decision.
    function resolveDispute(bytes32 cashoutId, uint256 slashAmount, bytes32 reasonHash)
        external
        onlyOperator
        nonReentrant
        whenNotPaused
    {
        Order storage o = orders[cashoutId];
        if (o.status != Status.DISPUTED) {
            revert InvalidStatus(Status.DISPUTED, o.status);
        }
        if (address(disputes) == address(0)) revert DisputesNotConfigured();
        if (!disputes.isDecided(cashoutId)) revert DisputeNotDecided();
        // bind the resolution to a cashout-context case.
        // Without this an AgentEscrow case decided as REFUND_TO_RESPONDENT
        // could be replayed here to refund the LP from cashout escrow.
        if (disputes.getCase(cashoutId).context != CASHOUT_DISPUTE_CONTEXT) {
            revert WrongDisputeContext();
        }

        DisputeManager.Outcome decision = disputes.outcomeOf(cashoutId);
        address lpAddr = o.lpWallet;
        if (decision == DisputeManager.Outcome.REFUND_TO_RESPONDENT) {
            if (slashAmount != 0) revert SlashNotAllowed();
            Status outcome = Status.RESOLVED_LP_PAYS;
            o.status = outcome;
            usdc.safeTransfer(lpAddr, o.usdcAmount);
            emit OrderResolved(cashoutId, outcome, 0, reasonHash);
            emit OrderReleased(cashoutId, o.lpId, o.usdcAmount);
        } else if (decision == DisputeManager.Outcome.RELEASE_TO_CLAIMANT) {
            if (slashAmount != 0) revert SlashNotAllowed();
            Status outcome = Status.RESOLVED_VENDOR_PAYS;
            o.status = outcome;
            usdc.safeTransfer(o.vendor, o.usdcAmount);
            emit OrderResolved(cashoutId, outcome, 0, reasonHash);
        } else if (decision == DisputeManager.Outcome.SLASH_LP) {
            if (slashAmount == 0) revert AmountZero();
            Status outcome = Status.RESOLVED_VENDOR_PAYS;
            o.status = outcome;
            // cross-contract pause coupling. Previously
            // `staking.slash` was called inline — if LPStaking was
            // paused (owner investigating a staking bug), the whole
            // resolveDispute reverted and the cashout sat in DISPUTED
            // until LPStaking unpaused, which is a different owner's
            // call than the cashout operator. Try the slash; on
            // revert defer it to a separate retrySlash call so vendor
            // is paid immediately and operator can replay the slash.
            try staking.slash(o.lpId, slashAmount, reasonHash) {
            // ok
            }
            catch Error(string memory reason) {
                pendingSlash[cashoutId] =
                    PendingSlash({ lpId: o.lpId, amount: slashAmount, reasonHash: reasonHash });
                emit SlashDeferred(cashoutId, o.lpId, slashAmount, reasonHash, reason);
            } catch (bytes memory) {
                pendingSlash[cashoutId] =
                    PendingSlash({ lpId: o.lpId, amount: slashAmount, reasonHash: reasonHash });
                emit SlashDeferred(cashoutId, o.lpId, slashAmount, reasonHash, "");
            }
            usdc.safeTransfer(o.vendor, o.usdcAmount);
            emit OrderResolved(cashoutId, outcome, slashAmount, reasonHash);
        } else {
            revert OutcomeNotApplicable(uint8(decision));
        }
    }

    /// @notice Vendor never confirmed within `CONFIRM_WINDOW` and there's
    /// no dispute → operator can mark expired + return USDC.
    /// @dev missed in iter
    /// 62/68 pause-coverage rounds. `expireUnconfirmed`
    /// moves USDC back to vendor; emergency pause must freeze
    /// all fund movement for consistency.
    function expireUnconfirmed(bytes32 cashoutId) external onlyOperator nonReentrant whenNotPaused {
        Order storage o = orders[cashoutId];
        if (
            o.status != Status.PROOF_SUBMITTED && o.status != Status.CLAIMED
                && o.status != Status.LOCKED
        ) {
            revert InvalidStatus(Status.PROOF_SUBMITTED, o.status);
        }
        if (block.timestamp < o.requestedAt + CONFIRM_WINDOW) {
            revert WindowNotElapsed();
        }
        o.status = Status.EXPIRED;
        usdc.safeTransfer(o.vendor, o.usdcAmount);
        emit OrderExpired(cashoutId);
    }

    /// @notice Vendor may cancel a still-LOCKED (un-claimed) order.
    function cancel(bytes32 cashoutId) external nonReentrant whenNotPaused {
        Order storage o = orders[cashoutId];
        if (o.vendor != msg.sender) revert NotVendor();
        if (o.status != Status.LOCKED) {
            revert InvalidStatus(Status.LOCKED, o.status);
        }
        o.status = Status.CANCELLED;
        usdc.safeTransfer(o.vendor, o.usdcAmount);
        emit OrderCancelled(cashoutId);
    }

    // ─── Admin ──────────────────────────────────────────────────────────

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function setOperator(address next) external onlyOwner {
        emit OperatorChanged(klaroOperator, next);
        klaroOperator = next;
    }

    // ─── Views ──────────────────────────────────────────────────────────

    function getOrder(bytes32 cashoutId) external view returns (Order memory) {
        return orders[cashoutId];
    }
}
