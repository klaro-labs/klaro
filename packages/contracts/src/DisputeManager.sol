// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { Ownable2Step } from "@openzeppelin/contracts/access/Ownable2Step.sol";
import { Pausable } from "@openzeppelin/contracts/utils/Pausable.sol";

import { KlaroConfig } from "./KlaroConfig.sol";
import { ReasonCodes } from "./lib/ReasonCodes.sol";

/// @title DisputeManager
/// @notice Canonical Klaro dispute registry. v2 §25.
/// Records the dispute lifecycle (Opened → EvidenceRequested
/// ↔ EvidenceSubmitted → UnderReview → Decided) and the final
/// outcome. Does **not** hold funds — consumer escrow contracts
/// (`CashoutOrderProcessor`, future `AgentEscrow`, `RetainerStream`)
/// listen for `Decided` events and execute fund movements per the
/// outcome.
/// Two-party model (claimant / respondent) handles every Klaro
/// dispute shape uniformly — vendor↔LP, buyer↔vendor, agent↔principal.
/// The `context` bytes32 tags the case with the originating flow so
/// off-chain indexers route the file to the right detail page.
// contracts P1 (audit): DisputeManager gains Pausable parity
// with every other lifecycle/money contract. If a flaw in
// open/decide/submitEvidence lets a hijack through, owner had no way
// to freeze new cases short of replacing the operator on every
// consumer contract. (boring infra — kill-switch one
// click away).
contract DisputeManager is Pausable, Ownable2Step {
    enum Status {
        NONE,
        OPENED, // case file created
        EVIDENCE_REQUESTED, // operator asked one party for more docs
        EVIDENCE_SUBMITTED, // party uploaded; back to queue
        UNDER_REVIEW, // Klaro panel actively reviewing
        DECIDED // terminal
    }

    enum Outcome {
        NONE,
        RELEASE_TO_CLAIMANT, // funds to the party who opened
        REFUND_TO_RESPONDENT, // funds returned to the other party
        SLASH_LP, // LP loses stake; funds to opener (cashout context)
        PENALIZE_VENDOR, // vendor reputation/stake penalty
        MUTUAL_RESOLVED // parties agreed; release per pre-existing terms
    }

    struct Case {
        address claimant;
        address respondent;
        bytes32 context; // e.g. keccak("cashout") / keccak("invoice")
        bytes32 contextRefId; // cashoutId / invoiceId / streamId
        bytes32 openingEvidenceHash;
        bytes32 latestEvidenceHash; // updated on each submitEvidence
        bytes32 decisionEvidenceHash;
        bytes32 decisionReasonHash; // ReasonCodes-validated
        Status status;
        Outcome outcome;
        uint64 openedAt;
        uint64 decidedAt;
    }

    mapping(bytes32 => Case) private _cases;
    address public klaroOperator;

    /// @notice Consumer escrow contracts allowed to open cases on behalf of
    /// their parties. e.g. CashoutOrderProcessor, AgentEscrow,
    /// RetainerStream — they call `open()` after their own
    /// party-permissioned `openDispute()` action.
    mapping(address => bool) public trustedCallers;

    // ─── Events ─────────────────────────────────────────────────────────
    event CaseOpened(
        bytes32 indexed caseId,
        address indexed claimant,
        address indexed respondent,
        bytes32 context,
        bytes32 contextRefId
    );
    event EvidenceRequested(bytes32 indexed caseId);
    event EvidenceSubmitted(bytes32 indexed caseId, address indexed by, bytes32 evidenceHash);
    event AssignedToReview(bytes32 indexed caseId);
    event Decided(
        bytes32 indexed caseId, Outcome outcome, bytes32 indexed reasonHash, bytes32 evidenceHash
    );
    event OperatorChanged(address indexed previous, address indexed next);
    event TrustedCallerSet(address indexed caller, bool trusted);

    // ─── Errors ─────────────────────────────────────────────────────────
    error NotOperator();
    error NotParty();
    error CaseAlreadyExists();
    error UnknownCase();
    error WrongState(Status expected, Status actual);
    // Outcome the case's escrow-context consumer cannot resolve → would strand.
    error OutcomeNotValidForContext(Outcome outcome, bytes32 context);
    error ZeroAddress();

    modifier onlyOperator() {
        if (msg.sender != klaroOperator) revert NotOperator();
        _;
    }

    constructor(address operator_) Ownable(msg.sender) {
        KlaroConfig.requireArcTestnet();
        klaroOperator = operator_;
        emit OperatorChanged(address(0), operator_);
    }

    // ─── Case lifecycle ─────────────────────────────────────────────────

    /// @notice Open a case. The operator OR a trusted-caller escrow
    /// (CashoutOrderProcessor, AgentEscrow, RetainerStream) opens
    /// the canonical cases. Parties may open ad-hoc cases ONLY
    /// with `context == bytes32(0)` so they cannot squat on the
    /// predictable caseIds the escrows derive from their own
    /// bytes32 ids (cashoutId, jobId, streamId).
    /// @dev the previous version
    /// let any address that named itself `claimant` open a case
    /// with any caseId + any context. An attacker watched the
    /// mempool, saw a vendor about to `CashoutOrderProcessor.
    /// openDispute(cashoutId)` (which forwards to
    /// `disputes.open(cashoutId, vendor, lp, CASHOUT_CTX, ...)`),
    /// front-ran with `disputes.open(cashoutId, attacker, attacker2,
    /// CASHOUT_CTX, ...)`, pre-empting the caseId. The legitimate
    /// escrow path then reverted `CaseAlreadyExists`, blocking
    /// the vendor's real dispute forever and stranding the cashout
    /// in DISPUTED state. The trusted-caller gate on namespaced
    /// contexts closes the hijack — only the escrow that owns the
    /// namespace can open a case in it.
    function open(
        bytes32 caseId,
        address claimant,
        address respondent,
        bytes32 context,
        bytes32 contextRefId,
        bytes32 openingEvidenceHash
    ) external whenNotPaused {
        if (claimant == address(0) || respondent == address(0)) {
            revert ZeroAddress();
        }
        if (_cases[caseId].status != Status.NONE) revert CaseAlreadyExists();
        bool isAuthority = msg.sender == klaroOperator || trustedCallers[msg.sender];
        if (context != bytes32(0)) {
            // Namespaced contexts (cashout/agent/stream) must come from an
            // authority — never from a self-declared party.
            if (!isAuthority) revert NotParty();
        } else if (!isAuthority && msg.sender != claimant && msg.sender != respondent) {
            revert NotParty();
        }

        _cases[caseId] = Case({
            claimant: claimant,
            respondent: respondent,
            context: context,
            contextRefId: contextRefId,
            openingEvidenceHash: openingEvidenceHash,
            latestEvidenceHash: openingEvidenceHash,
            decisionEvidenceHash: bytes32(0),
            decisionReasonHash: bytes32(0),
            status: Status.OPENED,
            outcome: Outcome.NONE,
            openedAt: uint64(block.timestamp),
            decidedAt: 0
        });

        emit CaseOpened(caseId, claimant, respondent, context, contextRefId);
    }

    /// @dev state-machine reads
    /// below were only rejecting `NONE` and `DECIDED`, leaving every
    /// intermediate transition order operator-trusted. The NatSpec
    /// claims a 5-state machine; the contract enforces it now.
    /// `requestEvidence` allowed jumping back from `UNDER_REVIEW` to
    /// `EVIDENCE_REQUESTED` (operator can still request more, which
    /// is fine), so we explicitly enumerate the legal predecessors.
    function requestEvidence(bytes32 caseId) external onlyOperator whenNotPaused {
        Case storage c = _cases[caseId];
        if (c.status == Status.NONE) revert UnknownCase();
        if (
            c.status != Status.OPENED && c.status != Status.EVIDENCE_SUBMITTED
                && c.status != Status.UNDER_REVIEW
        ) {
            revert WrongState(Status.OPENED, c.status);
        }
        c.status = Status.EVIDENCE_REQUESTED;
        emit EvidenceRequested(caseId);
    }

    function submitEvidence(bytes32 caseId, bytes32 evidenceHash) external whenNotPaused {
        Case storage c = _cases[caseId];
        if (c.status == Status.NONE) revert UnknownCase();
        // Parties may submit evidence at any point until a decision lands —
        // including the OPENED state (volunteer evidence). Reject DECIDED.
        if (c.status == Status.DECIDED) {
            revert WrongState(Status.EVIDENCE_REQUESTED, c.status);
        }
        if (msg.sender != c.claimant && msg.sender != c.respondent && msg.sender != klaroOperator) {
            revert NotParty();
        }
        // previously this regressed `status` from
        // UNDER_REVIEW back to EVIDENCE_SUBMITTED, which a losing party
        // could spam every time the operator called `assignToReview`,
        // making `decide()` (which requires UNDER_REVIEW per the iter
        // 65 state-machine fix) impossible to reach. Cashout +
        // AgentEscrow funds would lock in DISPUTED forever. Now: once
        // the operator has put the case UNDER_REVIEW (evidence window
        // is over), only the latest-evidence hash updates; status stays
        // UNDER_REVIEW so the decide path remains reachable. The
        // hash + event still serve as a tamper-evident audit record
        // of the late submission.
        c.latestEvidenceHash = evidenceHash;
        if (c.status != Status.UNDER_REVIEW) {
            c.status = Status.EVIDENCE_SUBMITTED;
        }
        emit EvidenceSubmitted(caseId, msg.sender, evidenceHash);
    }

    /// @dev `OPENED` is also accepted: the opener may have packaged
    /// sufficient evidence in the opening hash, in which case the
    /// operator can fast-track straight to review without an extra
    /// EVIDENCE_REQUESTED round. The only guarantee that matters
    /// for the audit-log story is that `decide` cannot skip
    /// `UNDER_REVIEW` (enforced below).
    function assignToReview(bytes32 caseId) external onlyOperator whenNotPaused {
        Case storage c = _cases[caseId];
        if (c.status == Status.NONE) revert UnknownCase();
        if (
            c.status != Status.OPENED && c.status != Status.EVIDENCE_REQUESTED
                && c.status != Status.EVIDENCE_SUBMITTED
        ) {
            revert WrongState(Status.EVIDENCE_SUBMITTED, c.status);
        }
        c.status = Status.UNDER_REVIEW;
        emit AssignedToReview(caseId);
    }

    /// @notice Terminal action. The outcome is stamped + consumer escrow
    /// contracts (subscribed to `Decided` events) execute fund moves.
    /// @dev The case must be `UNDER_REVIEW` first. Operators can no
    /// longer jump straight from `OPENED` to `DECIDED`, which
    /// would have bypassed evidence collection entirely and
    /// broken the audit-log story v2 §25 promises.
    function decide(bytes32 caseId, Outcome outcome, bytes32 reasonHash, bytes32 evidenceHash)
        external
        onlyOperator
        whenNotPaused
    {
        if (outcome == Outcome.NONE) {
            revert WrongState(Status.UNDER_REVIEW, Status.NONE);
        }
        ReasonCodes.require_(reasonHash);
        Case storage c = _cases[caseId];
        if (c.status == Status.NONE) revert UnknownCase();
        if (c.status != Status.UNDER_REVIEW) {
            revert WrongState(Status.UNDER_REVIEW, c.status);
        }
        // Audit 2026-05-30: an escrow-backed case (context != 0) committed with
        // an outcome its consumer's resolveDispute can't handle would move to
        // DECIDED and then strand the funds forever (resolveDispute reverts
        // OutcomeNotApplicable, and a DECIDED case can't be re-decided). Every
        // consumer handles RELEASE_TO_CLAIMANT + REFUND_TO_RESPONDENT; only the
        // cashout consumer handles SLASH_LP; none handle PENALIZE_VENDOR or
        // MUTUAL_RESOLVED. Reject the un-resolvable combinations up front.
        // Ad-hoc cases (context == 0) have no escrow to strand, so allow any.
        if (c.context != bytes32(0)) {
            bool resolvable = outcome == Outcome.RELEASE_TO_CLAIMANT
                || outcome == Outcome.REFUND_TO_RESPONDENT
                || (outcome == Outcome.SLASH_LP
                    && c.context == keccak256("klaro.dispute.cashout"));
            if (!resolvable) revert OutcomeNotValidForContext(outcome, c.context);
        }

        c.outcome = outcome;
        c.status = Status.DECIDED;
        c.decisionReasonHash = reasonHash;
        c.decisionEvidenceHash = evidenceHash;
        c.decidedAt = uint64(block.timestamp);

        emit Decided(caseId, outcome, reasonHash, evidenceHash);
    }

    // contracts P1: owner-controlled kill-switch parity.
    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function setOperator(address next) external onlyOwner {
        // Guard against bricking dispute resolution: operator(0) would make
        // every operator-gated path (assignToReview/decide and the
        // AgentEscrow/Cashout/Retainer resolveDispute fan-out) permanently
        // unreachable, stranding escrowed funds. (Audit D3b HIGH-1.)
        if (next == address(0)) revert ZeroAddress();
        emit OperatorChanged(klaroOperator, next);
        klaroOperator = next;
    }

    // (contracts audit): owner-only, mirroring FeeSplitter
    // + PrivacyVeil. Trusted callers can open cases with any caseId in
    // any namespaced context — an operator-key compromise self-granting
    // this lets the attacker hijack any escrow's dispute flow. Owner
    // multisig holds the membership key in prod.
    function setTrustedCaller(address caller, bool trusted) external onlyOwner {
        trustedCallers[caller] = trusted;
        emit TrustedCallerSet(caller, trusted);
    }

    // ─── Views ──────────────────────────────────────────────────────────

    function getCase(bytes32 caseId) external view returns (Case memory) {
        return _cases[caseId];
    }

    function statusOf(bytes32 caseId) external view returns (Status) {
        return _cases[caseId].status;
    }

    function outcomeOf(bytes32 caseId) external view returns (Outcome) {
        return _cases[caseId].outcome;
    }

    function isDecided(bytes32 caseId) external view returns (bool) {
        return _cases[caseId].status == Status.DECIDED;
    }
}
