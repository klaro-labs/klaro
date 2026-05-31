// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { Ownable2Step } from "@openzeppelin/contracts/access/Ownable2Step.sol";
import { Pausable } from "@openzeppelin/contracts/utils/Pausable.sol";

import { KlaroConfig } from "./KlaroConfig.sol";
import { DisputeManager } from "./DisputeManager.sol";

/// @title RetainerStream
/// @notice Sablier-style per-second USDC streaming for vendor retainers.
/// #38.
/// Linear vesting: at time `t`, `vested = deposit * clamp(t-startAt,
/// 0, endAt-startAt) / (endAt-startAt)`. Recipient pulls vested USDC
/// via `withdraw`. Payer may `cancel` — recipient keeps everything
/// vested up to cancellation; payer refunded the rest.
/// @dev Conservation invariant (Echidna target):
/// deposit == withdrawn + payerRefund + remainingForRecipient
/// for every stream, in every state.
contract RetainerStream is ReentrancyGuard, Ownable2Step, Pausable {
    using SafeERC20 for IERC20;

    /// @notice Operator role (day-to-day pause/unpause without holding owner key).
    /// P1 (#92).
    address public klaroOperator;
    event OperatorChanged(address indexed previous, address indexed next);
    error NotOperator();

    modifier onlyOperator() {
        if (msg.sender != klaroOperator) revert NotOperator();
        _;
    }

    struct Stream {
        address payer;
        address recipient;
        address token;
        uint256 deposit;
        uint256 withdrawn;
        uint64 startAt;
        uint64 endAt;
        uint64 cancelledAt; // 0 if active
        uint256 cancelledVested; // snapshot of vested-at-cancel
        // dispute resolution flag. Set true by
        // resolveDispute() after operator dispatches a DECIDED outcome.
        // withdraw() refuses while disputes.isDecided(streamId) but
        // !resolved — otherwise recipient could race the operator's
        // payer-win resolution and drain.
        bool resolved;
    }

    mapping(bytes32 => Stream) private _streams;

    /// @notice RS1: DisputeManager wiring. Original AUDIT P1 #99
    /// flagged RetainerStream as "orphaned: no operator, no pause,
    /// no DisputeManager wiring. Holds 30-day retainers with no
    /// admin recovery path." Operator + pause already added (iter
    /// 62 + #92). Disputes now wired the same way AgentEscrow +
    /// CashoutOrderProcessor wire them: optional, set post-deploy
    /// via `setDisputes`; `openDispute` reverts if unwired.
    DisputeManager public disputes;
    bytes32 internal constant STREAM_DISPUTE_CONTEXT = keccak256("klaro.dispute.stream");

    event DisputesContractChanged(address indexed previous, address indexed next);
    event StreamDisputeOpened(bytes32 indexed streamId, address indexed by);

    event StreamCreated(
        bytes32 indexed streamId,
        address indexed payer,
        address indexed recipient,
        address token,
        uint256 deposit,
        uint64 startAt,
        uint64 endAt
    );
    event Withdrawn(bytes32 indexed streamId, address indexed recipient, uint256 amount);
    event Cancelled(
        bytes32 indexed streamId, address indexed payer, uint256 vestedSnapshot, uint256 refunded
    );

    error AlreadyExists();
    error UnknownStream();
    error NotPayer();
    error NotRecipient();
    error AmountZero();
    error EndBeforeStart();
    error AmountExceedsWithdrawable(uint256 requested, uint256 withdrawable);
    error AlreadyCancelled();
    /// @notice RS1: `openDispute` reached before `setDisputes`
    /// was called by owner.
    error DisputesNotConfigured();
    /// @notice RS1: only payer or recipient may open a dispute.
    error NotParty();
    // resolveDispute prerequisites.
    error DisputeNotDecided();
    error AlreadyResolved();
    error OutcomeNotApplicable(uint8 outcome);
    error WrongDisputeContext();
    /// @notice Withdraw refuses while a DECIDED dispute awaits operator
    /// dispatch. Recipient must wait for resolveDispute() to fire
    /// before any further withdraw — otherwise a payer-win
    /// resolution could be front-run by a normal withdraw.
    error DisputeAwaitingResolution();
    // openDispute + resolveDispute refuse cancelled
    // streams. Without this, a payer who already pulled their
    // unvested refund via cancelStream could open a dispute, get
    // operator decision in their favor, and have resolveDispute
    // refund them AGAIN from pooled USDC (draining other streams).
    error StreamAlreadyCancelled();

    event DisputeResolved(
        bytes32 indexed streamId,
        DisputeManager.Outcome outcome,
        bool payerWon,
        uint256 refundToPayer
    );

    constructor(address operator_) Ownable(msg.sender) {
        KlaroConfig.requireArcTestnet();
        klaroOperator = operator_ == address(0) ? msg.sender : operator_;
        emit OperatorChanged(address(0), klaroOperator);
    }

    error ZeroOperatorAddress();

    function setOperator(address next) external onlyOwner {
        if (next == address(0)) revert ZeroOperatorAddress();
        emit OperatorChanged(klaroOperator, next);
        klaroOperator = next;
    }

    // pause is owner-only (cold key), matching every other fund-holding
    // contract (AgentEscrow/Cashout/InvoiceEscrow/LPStaking/…). Was
    // onlyOperator (hot key) — a compromised operator must not be able to
    // pause/unpause a contract holding 30-day retainers. (Audit D3b HIGH-2.)
    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    /// @notice RS1: owner wires DisputeManager post-deploy (same
    /// pattern as AgentEscrow + CashoutOrderProcessor). Owner
    /// must also call `disputes.setTrustedCaller(address(this),
    /// true)` so this contract can open a case with the
    /// namespaced STREAM_DISPUTE_CONTEXT.
    function setDisputes(DisputeManager next) external onlyOwner {
        emit DisputesContractChanged(address(disputes), address(next));
        disputes = next;
    }

    // ─── Dispute ────────────────────────────────────────────────────────

    /// @notice Either party opens a dispute over the stream. Operator
    /// resolves via DisputeManager; payer/recipient cannot
    /// self-resolve. Stream withdrawals continue to honor the
    /// vesting schedule until operator action — the dispute is
    /// an audit-log entry + admin lever, not a funds freeze (a
    /// freeze would require the owner to call `pause()`).
    /// @dev `disputes.open` reverts NotParty if this contract is not
    /// a trusted caller of the DisputeManager.
    // contracts P2 (audit): nonReentrant defense-in-depth, see
    // CashoutOrderProcessor.openDispute for rationale.
    function openDispute(bytes32 streamId, bytes32 openingEvidenceHash)
        external
        whenNotPaused
        nonReentrant
    {
        Stream storage s = _streams[streamId];
        if (s.payer == address(0)) revert UnknownStream();
        if (msg.sender != s.payer && msg.sender != s.recipient) revert NotParty();
        // cancelled streams already settled their unvested
        // accounting; opening a new dispute would let resolveDispute
        // refund the payer a second time from pooled USDC (other
        // streams' funds). Disputes on cancelled streams must be
        // handled off-chain.
        if (s.cancelledAt != 0) revert StreamAlreadyCancelled();
        if (address(disputes) == address(0)) revert DisputesNotConfigured();
        disputes.open(
            streamId,
            msg.sender,
            msg.sender == s.payer ? s.recipient : s.payer,
            STREAM_DISPUTE_CONTEXT,
            streamId,
            openingEvidenceHash
        );
        emit StreamDisputeOpened(streamId, msg.sender);
    }

    // ─── Create + cancel ────────────────────────────────────────────────

    /// @notice Payer locks `deposit` USDC into the stream. Recipient vests
    /// linearly from `startAt` to `endAt`. Payer must have approved
    /// this contract for `deposit` before calling.
    function createStream(
        bytes32 streamId,
        address recipient,
        address token,
        uint256 deposit,
        uint64 startAt,
        uint64 endAt
    ) external nonReentrant whenNotPaused {
        if (deposit == 0) revert AmountZero();
        if (endAt <= startAt) revert EndBeforeStart();
        if (_streams[streamId].payer != address(0)) revert AlreadyExists();
        if (recipient == address(0)) revert AmountZero();

        _streams[streamId] = Stream({
            payer: msg.sender,
            recipient: recipient,
            token: token,
            deposit: deposit,
            withdrawn: 0,
            startAt: startAt,
            endAt: endAt,
            cancelledAt: 0,
            cancelledVested: 0,
            resolved: false
        });

        IERC20(token).safeTransferFrom(msg.sender, address(this), deposit);
        emit StreamCreated(streamId, msg.sender, recipient, token, deposit, startAt, endAt);
    }

    /// @notice Payer cancels remaining unvested portion. Vested portion stays
    /// claimable by recipient via `withdraw`.
    /// @dev added `whenNotPaused`.
    /// Cancel moves USDC to the payer; during an emergency pause
    /// this still ran, defeating the pause guarantee that funds
    /// stop moving.
    function cancelStream(bytes32 streamId) external whenNotPaused nonReentrant {
        Stream storage s = _streams[streamId];
        if (s.payer == address(0)) revert UnknownStream();
        if (s.payer != msg.sender) revert NotPayer();
        if (s.cancelledAt != 0) revert AlreadyCancelled();
        // symmetric guard with . openDispute +
        // resolveDispute already refuse cancelled streams; cancelStream
        // must also refuse when a dispute is open (case exists in
        // DisputeManager but not yet resolved by this contract).
        // Otherwise payer could open a dispute, see it going against
        // them, then cancel to escape resolveDispute's enforcement —
        // stranding the case mid-flight in DisputeManager. The case is
        // either pending (payer must wait for resolution) or resolved
        // (s.resolved set, cancel allowed).
        if (
            address(disputes) != address(0) && !s.resolved
                && disputes.getCase(streamId).status != DisputeManager.Status.NONE
        ) {
            revert DisputeAwaitingResolution();
        }

        uint256 vestedNow = _vested(s, block.timestamp);
        s.cancelledAt = uint64(block.timestamp);
        s.cancelledVested = vestedNow;

        uint256 refund = s.deposit - vestedNow;
        if (refund > 0) IERC20(s.token).safeTransfer(s.payer, refund);
        emit Cancelled(streamId, s.payer, vestedNow, refund);
    }

    // ─── Withdraw ───────────────────────────────────────────────────────

    function withdraw(bytes32 streamId, uint256 amount) external nonReentrant whenNotPaused {
        Stream storage s = _streams[streamId];
        if (s.payer == address(0)) revert UnknownStream();
        if (s.recipient != msg.sender) revert NotRecipient();
        if (amount == 0) revert AmountZero();
        // dispute-aware gate. If a dispute has been
        // DECIDED but operator hasn't dispatched resolveDispute() yet,
        // refuse to withdraw. Without this, a recipient who lost a
        // dispute (operator decided in payer's favor) could drain the
        // vested balance in the race window before the operator dispatches.
        if (address(disputes) != address(0) && disputes.isDecided(streamId) && !s.resolved) {
            revert DisputeAwaitingResolution();
        }

        uint256 w = _withdrawable(s);
        if (amount > w) revert AmountExceedsWithdrawable(amount, w);

        s.withdrawn += amount;
        IERC20(s.token).safeTransfer(s.recipient, amount);
        emit Withdrawn(streamId, s.recipient, amount);
    }

    // ─── Dispute resolution ─────────────────────────────────────────────

    /// @notice operator dispatches a DECIDED dispute
    /// outcome to on-chain enforcement. Mirrors
    /// CashoutOrderProcessor.resolveDispute + AgentEscrow.
    /// resolveDispute pattern. Prior to this, the dispute was
    /// "audit-log only" — a recipient who lost a dispute could
    /// still drain the entire vested balance because withdraw
    /// ignored the outcome.
    /// Outcome semantics:
    /// - payerWon (REFUND_TO_RESPONDENT && claimant == recipient,
    /// OR RELEASE_TO_CLAIMANT && claimant == payer):
    /// freeze stream at current vested point, refund the
    /// unvested remainder to payer.
    /// - recipientWon (the inverse): mark resolved so withdraw
    /// unblocks; vesting continues normally.
    /// - Any other outcome (NONE, SLASH_LP) reverts.
    function resolveDispute(bytes32 streamId) external onlyOperator nonReentrant whenNotPaused {
        Stream storage s = _streams[streamId];
        if (s.payer == address(0)) revert UnknownStream();
        if (s.resolved) revert AlreadyResolved();
        // cancelled-stream double-refund guard. openDispute
        // also refuses cancelled streams, but the second gate here is
        // defense-in-depth in case a future code path opens a case
        // without going through openDispute.
        if (s.cancelledAt != 0) revert StreamAlreadyCancelled();
        if (address(disputes) == address(0)) revert DisputesNotConfigured();
        if (!disputes.isDecided(streamId)) revert DisputeNotDecided();
        // parity: bind to the stream context so a different
        // escrow's decided case can't be replayed against this streamId.
        if (disputes.getCase(streamId).context != STREAM_DISPUTE_CONTEXT) {
            revert WrongDisputeContext();
        }

        DisputeManager.Outcome outcome = disputes.outcomeOf(streamId);
        address claimant = disputes.getCase(streamId).claimant;
        bool payerWon;
        if (outcome == DisputeManager.Outcome.REFUND_TO_RESPONDENT) {
            payerWon = (claimant == s.recipient);
        } else if (outcome == DisputeManager.Outcome.RELEASE_TO_CLAIMANT) {
            payerWon = (claimant == s.payer);
        } else {
            revert OutcomeNotApplicable(uint8(outcome));
        }

        s.resolved = true;
        uint256 refund;
        if (payerWon) {
            // Freeze vesting at the current point + refund the unvested
            // remainder to payer. cancelledAt + cancelledVested re-use
            // the existing cancellation accounting path so the
            // conservation invariant continues to hold.
            uint256 vestedNow = _vested(s, block.timestamp);
            s.cancelledAt = uint64(block.timestamp);
            s.cancelledVested = vestedNow;
            refund = s.deposit - vestedNow;
            if (refund > 0) IERC20(s.token).safeTransfer(s.payer, refund);
        }
        emit DisputeResolved(streamId, outcome, payerWon, refund);
    }

    // ─── Math ───────────────────────────────────────────────────────────

    function _vested(Stream storage s, uint256 atTime) internal view returns (uint256) {
        if (atTime <= s.startAt) return 0;
        uint256 endpoint = atTime >= s.endAt ? s.endAt : atTime;
        uint256 elapsed = endpoint - s.startAt;
        uint256 span = s.endAt - s.startAt;
        return (s.deposit * elapsed) / span;
    }

    function _withdrawable(Stream storage s) internal view returns (uint256) {
        uint256 vestedNow = s.cancelledAt != 0 ? s.cancelledVested : _vested(s, block.timestamp);
        return vestedNow - s.withdrawn;
    }

    // ─── Views ──────────────────────────────────────────────────────────

    function getStream(bytes32 streamId) external view returns (Stream memory) {
        return _streams[streamId];
    }

    function vestedAmount(bytes32 streamId) external view returns (uint256) {
        Stream storage s = _streams[streamId];
        if (s.cancelledAt != 0) return s.cancelledVested;
        return _vested(s, block.timestamp);
    }

    function withdrawableAmount(bytes32 streamId) external view returns (uint256) {
        Stream storage s = _streams[streamId];
        if (s.payer == address(0)) return 0;
        return _withdrawable(s);
    }

    /// @notice Conservation accounting view — used by Echidna invariant.
    function accountingFor(bytes32 streamId)
        external
        view
        returns (uint256 deposit, uint256 withdrawn, uint256 vestedNow, uint256 refundedToPayer)
    {
        Stream storage s = _streams[streamId];
        deposit = s.deposit;
        withdrawn = s.withdrawn;
        vestedNow = s.cancelledAt != 0 ? s.cancelledVested : _vested(s, block.timestamp);
        refundedToPayer = s.cancelledAt != 0 ? s.deposit - s.cancelledVested : 0;
    }
}
