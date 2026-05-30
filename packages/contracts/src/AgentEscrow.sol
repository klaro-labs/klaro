// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { Pausable } from "@openzeppelin/contracts/utils/Pausable.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { Ownable2Step } from "@openzeppelin/contracts/access/Ownable2Step.sol";

import { KlaroConfig } from "./KlaroConfig.sol";
import { AgentRegistry } from "./AgentRegistry.sol";
import { DisputeManager } from "./DisputeManager.sol";
import { IACPHook, NoopACPHook } from "./IACPHook.sol";

/// @title AgentEscrow
/// @notice Klaro's ERC-8183-aligned 6-state agent job lifecycle. v2 §28.
/// Status: NONE → CREATED → FUNDED → STARTED → COMPLETED → CLOSED
/// ↘ DISPUTED → (DisputeManager) → CLOSED
/// ↘ CANCELLED (principal, pre-STARTED only)
/// Per-job `IACPHook` runs before AND after every transition. Live
/// mode wires it to Elliptic/TRM screening + reputation ticks + ERP
/// sync; tests use `NoopACPHook` to pass through. Hook reverts roll
/// back the state change (verified by test).
/// Fees: principal funds `amountUsdc + computed protocol fee` per
/// `AgentRegistry.feeBpsOf(agentId)`. Cap enforced ≤ 100% at the
/// registry (`maxAgentFeeBps`) — sanity-checked again here.
contract AgentEscrow is ReentrancyGuard, Pausable, Ownable2Step {
    using SafeERC20 for IERC20;

    enum Status {
        NONE,
        CREATED, // job opened, not yet funded
        FUNDED, // principal locked USDC
        STARTED, // agent acknowledged + began work
        COMPLETED, // agent submitted deliverable + principal accepted → funds out
        DISPUTED, // dispute opened, escrow frozen
        CANCELLED, // principal voided before STARTED
        CLOSED // fully terminal: payout sent or refund delivered
    }

    struct Job {
        address principal;
        bytes32 agentId;
        address agent; // agent's payout wallet (resolved at create)
        address token; // USDC ERC-20
        uint256 amountUsdc; // payout to agent before fee
        uint256 feeUsdc; // protocol cut, derived from feeBps at create
        bytes32 deliverableHash; // committed at submitDeliverable
        Status status;
        IACPHook hook; // per-job ACP hook
        uint64 createdAt;
        uint64 fundedAt;
        uint64 startedAt;
        uint64 completedAt;
    }

    mapping(bytes32 => Job) public jobs;

    IERC20 public immutable usdc;
    AgentRegistry public immutable registry;
    DisputeManager public disputes; // optional; set post-deploy
    address public klaroFeeReceiver;
    address public klaroOperator;

    bytes32 internal constant AGENT_DISPUTE_CONTEXT = keccak256("klaro.dispute.agent");

    // Action ids for IACPHook
    bytes4 internal constant ACTION_CREATE = bytes4(keccak256("createJob"));
    bytes4 internal constant ACTION_FUND = bytes4(keccak256("fundJob"));
    bytes4 internal constant ACTION_START = bytes4(keccak256("startJob"));
    bytes4 internal constant ACTION_DELIVER = bytes4(keccak256("submitDeliverable"));
    bytes4 internal constant ACTION_COMPLETE = bytes4(keccak256("markCompleted"));
    bytes4 internal constant ACTION_DISPUTE = bytes4(keccak256("openDispute"));
    bytes4 internal constant ACTION_CANCEL = bytes4(keccak256("cancel"));

    event JobCreated(
        bytes32 indexed jobId,
        address indexed principal,
        bytes32 indexed agentId,
        uint256 amount,
        uint256 fee
    );
    event JobFunded(bytes32 indexed jobId);
    event JobStarted(bytes32 indexed jobId);
    event DeliverableSubmitted(bytes32 indexed jobId, bytes32 deliverableHash);
    event JobCompleted(bytes32 indexed jobId, uint256 paidToAgent, uint256 paidProtocolFee);
    event JobDisputed(bytes32 indexed jobId, address indexed by);
    event JobCancelled(bytes32 indexed jobId);
    event JobClosed(bytes32 indexed jobId, Status finalStatus);
    event DisputesContractChanged(address indexed previous, address indexed next);
    event FeeReceiverChanged(address indexed previous, address indexed next);
    event OperatorChanged(address indexed previous, address indexed next);
    /// @notice Emitted whenever a dispute is resolved with the
    /// DisputeManager wired. `derivedPayToAgent` is the value
    /// the contract computed from the on-chain outcome; off-chain
    /// reconcilers can match this against the daemon's intent log.
    event DisputeResolvedFromOnChainOutcome(
        bytes32 indexed jobId, DisputeManager.Outcome outcome, bool derivedPayToAgent
    );
    /// @notice Emitted when a principal-supplied IACPHook reverts on
    /// `beforeAction` or `afterAction`. :
    /// hook calls are wrapped in try/catch so a malicious or
    /// buggy principal hook can't grief the agent's ability to
    /// `startJob` / `submitDeliverable` / `openDispute` and
    /// strand funds in escrow. The revert is observable but the
    /// lifecycle transition still happens.
    event HookReverted(bytes32 indexed jobId, bytes4 indexed action, bytes reason);

    error NotPrincipal();
    error NotAgent();
    error NotOperator();
    error AlreadyExists();
    /// @notice same defect class as LPS2.
    /// markCompleted + resolveDispute used to no-op the fee
    /// transfer when klaroFeeReceiver == address(0), trapping
    /// feeUsdc in this contract forever (no sweep path, no
    /// refund). Now fail-closed; operator must call
    /// `setFeeReceiver` before completing a fee-bearing job.
    error FeeReceiverUnset();
    error InvalidStatus(Status expected, Status actual);
    error AmountZero();
    error FeeCapExceeded(uint256 fee, uint256 amount);
    error NoAgent();
    error DisputesNotConfigured();
    /// @notice Operator's `payToAgent` argument disagrees with the
    /// direction derived from the on-chain outcome + claimant.
    error OutcomeMismatch(bool derivedPayToAgent);
    // symmetric guard with CashoutOrderProcessor — a
    // cashout-context case opened against this jobId would otherwise
    // resolve the agent escrow using the wrong escrow's decision.
    error WrongDisputeContext();
    /// @notice Outcome enum value has no defined fund move for the agent
    /// escrow context (e.g. SLASH_LP applies to LP cashouts only).
    error OutcomeNotApplicable(uint8 outcome);

    modifier onlyOperator() {
        if (msg.sender != klaroOperator) revert NotOperator();
        _;
    }

    constructor(address usdc_, AgentRegistry registry_, address feeReceiver_, address operator_)
        Ownable(msg.sender)
    {
        KlaroConfig.requireArcTestnet();
        usdc = IERC20(usdc_);
        registry = registry_;
        klaroFeeReceiver = feeReceiver_;
        klaroOperator = operator_;
        emit OperatorChanged(address(0), operator_);
    }

    // ─── Job lifecycle ──────────────────────────────────────────────────

    /// @notice Principal opens a job at `amountUsdc` against `agentId`.
    /// Fee is derived from the agent's currently-registered `feeBps`.
    /// @dev added `nonReentrant`
    /// and moved the storage write BEFORE the external `hook`
    /// call. Previously a hostile IACPHook could re-enter
    /// `createJob` with the same jobId — the `AlreadyExists`
    /// check reads `jobs[jobId].status` which was still NONE
    /// during the re-entrant call, so the attacker could spawn
    /// multiple JobCreated events for one id + overwrite the
    /// Job struct with attacker-controlled fields before the
    /// first storage write landed. Checks-effects-interactions
    /// + reentrancy guard close both vectors.
    function createJob(
        bytes32 jobId,
        bytes32 agentId,
        address agent,
        uint256 amountUsdc,
        IACPHook hook
    ) external nonReentrant whenNotPaused {
        if (amountUsdc == 0) revert AmountZero();
        if (agent == address(0)) revert NoAgent();
        if (jobs[jobId].status != Status.NONE) revert AlreadyExists();
        registry.assertActive(agentId);

        uint16 feeBps = registry.feeBpsOf(agentId);
        uint256 fee = (amountUsdc * feeBps) / 10_000;
        if (fee > amountUsdc) revert FeeCapExceeded(fee, amountUsdc);

        IACPHook h = address(hook) == address(0) ? IACPHook(address(new NoopACPHook())) : hook;

        // Effects FIRST (write the Job struct) so any subsequent external
        // call sees a non-NONE status and the AlreadyExists guard works
        // even under direct re-entry. ReentrancyGuard above provides the
        // belt-and-suspenders second layer.
        jobs[jobId] = Job({
            principal: msg.sender,
            agentId: agentId,
            agent: agent,
            token: address(usdc),
            amountUsdc: amountUsdc,
            feeUsdc: fee,
            deliverableHash: bytes32(0),
            status: Status.CREATED,
            hook: h,
            createdAt: uint64(block.timestamp),
            fundedAt: 0,
            startedAt: 0,
            completedAt: 0
        });

        // Interactions after effects.
        h.beforeAction(ACTION_CREATE, jobId, msg.sender, agent, amountUsdc);
        emit JobCreated(jobId, msg.sender, agentId, amountUsdc, fee);
        h.afterAction(ACTION_CREATE, jobId, msg.sender, agent, amountUsdc);
    }

    /// @notice Principal funds the escrow. Principal must have approved this
    /// contract for `amountUsdc + feeUsdc`.
    function fundJob(bytes32 jobId) external nonReentrant whenNotPaused {
        Job storage j = jobs[jobId];
        if (j.principal != msg.sender) revert NotPrincipal();
        if (j.status != Status.CREATED) {
            revert InvalidStatus(Status.CREATED, j.status);
        }
        _safeBefore(j.hook, ACTION_FUND, jobId, j);

        j.status = Status.FUNDED;
        j.fundedAt = uint64(block.timestamp);
        usdc.safeTransferFrom(msg.sender, address(this), j.amountUsdc + j.feeUsdc);

        emit JobFunded(jobId);
        _safeAfter(j.hook, ACTION_FUND, jobId, j);
    }

    /// @notice Agent acknowledges + starts work.
    function startJob(bytes32 jobId) external nonReentrant whenNotPaused {
        Job storage j = jobs[jobId];
        if (j.agent != msg.sender) revert NotAgent();
        if (j.status != Status.FUNDED) {
            revert InvalidStatus(Status.FUNDED, j.status);
        }
        _safeBefore(j.hook, ACTION_START, jobId, j);

        j.status = Status.STARTED;
        j.startedAt = uint64(block.timestamp);

        emit JobStarted(jobId);
        _safeAfter(j.hook, ACTION_START, jobId, j);
    }

    /// @notice Agent submits the deliverable hash. Stays in STARTED — principal
    /// marks completion separately so they can review off-chain.
    function submitDeliverable(bytes32 jobId, bytes32 deliverableHash)
        external
        nonReentrant
        whenNotPaused
    {
        Job storage j = jobs[jobId];
        if (j.agent != msg.sender) revert NotAgent();
        if (j.status != Status.STARTED) {
            revert InvalidStatus(Status.STARTED, j.status);
        }
        _safeBefore(j.hook, ACTION_DELIVER, jobId, j);

        j.deliverableHash = deliverableHash;
        emit DeliverableSubmitted(jobId, deliverableHash);
        _safeAfter(j.hook, ACTION_DELIVER, jobId, j);
    }

    /// @notice Principal accepts → releases funds + closes. Cannot be called
    /// before deliverable is submitted (deliverableHash != 0 guard).
    function markCompleted(bytes32 jobId) external nonReentrant whenNotPaused {
        Job storage j = jobs[jobId];
        if (j.principal != msg.sender) revert NotPrincipal();
        if (j.status != Status.STARTED) {
            revert InvalidStatus(Status.STARTED, j.status);
        }
        if (j.deliverableHash == bytes32(0)) {
            revert InvalidStatus(Status.COMPLETED, j.status);
        }
        _safeBefore(j.hook, ACTION_COMPLETE, jobId, j);

        j.status = Status.CLOSED;
        j.completedAt = uint64(block.timestamp);

        // previously silently no-op'd the fee transfer
        // when feeReceiver==0, stranding `feeUsdc` USDC in this contract
        // with no recovery path. Now fail-closed (same pattern as LPS2).
        if (j.feeUsdc > 0 && klaroFeeReceiver == address(0)) {
            revert FeeReceiverUnset();
        }
        usdc.safeTransfer(j.agent, j.amountUsdc);
        if (j.feeUsdc > 0) {
            usdc.safeTransfer(klaroFeeReceiver, j.feeUsdc);
        }

        emit JobCompleted(jobId, j.amountUsdc, j.feeUsdc);
        emit JobClosed(jobId, Status.CLOSED);
        _safeAfter(j.hook, ACTION_COMPLETE, jobId, j);
    }

    function openDispute(bytes32 jobId, bytes32 openingEvidenceHash)
        external
        nonReentrant
        whenNotPaused
    {
        Job storage j = jobs[jobId];
        if (msg.sender != j.principal && msg.sender != j.agent) {
            revert NotPrincipal();
        }
        if (j.status != Status.STARTED && j.status != Status.FUNDED) {
            revert InvalidStatus(Status.STARTED, j.status);
        }
        _safeBefore(j.hook, ACTION_DISPUTE, jobId, j);
        j.status = Status.DISPUTED;
        emit JobDisputed(jobId, msg.sender);

        if (address(disputes) != address(0)) {
            disputes.open(
                jobId,
                msg.sender,
                msg.sender == j.principal ? j.agent : j.principal,
                AGENT_DISPUTE_CONTEXT,
                jobId,
                openingEvidenceHash
            );
        }
        _safeAfter(j.hook, ACTION_DISPUTE, jobId, j);
    }

    /// @notice Principal cancels a CREATED job (no funds at risk yet) OR a
    /// FUNDED job (funds + fee refunded). After STARTED, only the
    /// dispute path can refund.
    function cancel(bytes32 jobId) external nonReentrant whenNotPaused {
        Job storage j = jobs[jobId];
        if (j.principal != msg.sender) revert NotPrincipal();
        if (j.status != Status.CREATED && j.status != Status.FUNDED) {
            revert InvalidStatus(Status.FUNDED, j.status);
        }
        _safeBefore(j.hook, ACTION_CANCEL, jobId, j);

        bool wasFunded = j.status == Status.FUNDED;
        j.status = Status.CANCELLED;

        if (wasFunded) {
            usdc.safeTransfer(j.principal, j.amountUsdc + j.feeUsdc);
        }

        emit JobCancelled(jobId);
        emit JobClosed(jobId, Status.CANCELLED);
        _safeAfter(j.hook, ACTION_CANCEL, jobId, j);
    }

    /// @notice Operator-only resolution path for a DISPUTED job.
    /// @dev the previous version
    /// only required the case to be DECIDED but otherwise trusted
    /// the operator's `payToAgent` boolean — a compromised or
    /// buggy operator could ship funds to the wrong party while
    /// the on-chain DisputeManager said the opposite. Now the
    /// contract derives `payToAgent` from the on-chain outcome +
    /// claimant identity and reverts if the operator's bool
    /// disagrees. Any outcome without a deterministic recipient,
    /// including MUTUAL_RESOLVED, reverts until a directed decision
    /// is recorded.
    function resolveDispute(bytes32 jobId, bool payToAgent)
        external
        nonReentrant
        whenNotPaused
        onlyOperator
    {
        Job storage j = jobs[jobId];
        if (j.status != Status.DISPUTED) {
            revert InvalidStatus(Status.DISPUTED, j.status);
        }

        if (address(disputes) == address(0)) revert DisputesNotConfigured();
        if (!disputes.isDecided(jobId)) {
            revert InvalidStatus(Status.DISPUTED, Status.DISPUTED);
        }
        // enforce the case was opened against the agent
        // context so a cashout decision can't route this job's USDC.
        if (disputes.getCase(jobId).context != AGENT_DISPUTE_CONTEXT) {
            revert WrongDisputeContext();
        }

        DisputeManager.Outcome outcome = disputes.outcomeOf(jobId);
        bool agentIsClaimant = disputes.getCase(jobId).claimant == j.agent;
        bool derivedPayToAgent;

        if (outcome == DisputeManager.Outcome.RELEASE_TO_CLAIMANT) {
            derivedPayToAgent = agentIsClaimant;
        } else if (outcome == DisputeManager.Outcome.REFUND_TO_RESPONDENT) {
            derivedPayToAgent = !agentIsClaimant;
        } else {
            revert OutcomeNotApplicable(uint8(outcome));
        }

        if (derivedPayToAgent != payToAgent) {
            revert OutcomeMismatch(derivedPayToAgent);
        }

        emit DisputeResolvedFromOnChainOutcome(jobId, outcome, derivedPayToAgent);

        j.status = Status.CLOSED;
        j.completedAt = uint64(block.timestamp);

        if (payToAgent) {
            // same fee-stranding gate as markCompleted.
            if (j.feeUsdc > 0 && klaroFeeReceiver == address(0)) {
                revert FeeReceiverUnset();
            }
            usdc.safeTransfer(j.agent, j.amountUsdc);
            if (j.feeUsdc > 0) {
                usdc.safeTransfer(klaroFeeReceiver, j.feeUsdc);
            }
            emit JobCompleted(jobId, j.amountUsdc, j.feeUsdc);
        } else {
            // Refund principal — full amount + fee.
            usdc.safeTransfer(j.principal, j.amountUsdc + j.feeUsdc);
        }
        emit JobClosed(jobId, Status.CLOSED);
    }

    // ─── Admin ──────────────────────────────────────────────────────────

    function setDisputes(DisputeManager next) external onlyOwner {
        emit DisputesContractChanged(address(disputes), address(next));
        disputes = next;
    }

    function setFeeReceiver(address next) external onlyOwner {
        emit FeeReceiverChanged(klaroFeeReceiver, next);
        klaroFeeReceiver = next;
    }

    function setOperator(address next) external onlyOwner {
        emit OperatorChanged(klaroOperator, next);
        klaroOperator = next;
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // ─── Safe hook wrappers ─────────────────────────────────────────────
    // wraps every external
    // IACPHook call in try/catch so a principal-supplied malicious or
    // buggy hook can't permanently block agent-side transitions
    // (`startJob` / `submitDeliverable` / `openDispute`). Without this
    // a principal could fund a job, let the agent do the work, then
    // their hook reverts on ACTION_DELIVER + ACTION_DISPUTE — agent
    // can't deliver, can't dispute, and `cancel` rejects post-STARTED.
    // Funds permanently stranded. The wrapper emits `HookReverted` for
    // off-chain observability and lets the lifecycle continue.

    function _safeBefore(IACPHook hook, bytes4 action, bytes32 jobId, Job storage j) internal {
        try hook.beforeAction(action, jobId, j.principal, j.agent, j.amountUsdc) { }
        catch (bytes memory reason) {
            emit HookReverted(jobId, action, reason);
        }
    }

    function _safeAfter(IACPHook hook, bytes4 action, bytes32 jobId, Job storage j) internal {
        try hook.afterAction(action, jobId, j.principal, j.agent, j.amountUsdc) { }
        catch (bytes memory reason) {
            emit HookReverted(jobId, action, reason);
        }
    }

    // ─── Views ──────────────────────────────────────────────────────────

    function getJob(bytes32 jobId) external view returns (Job memory) {
        return jobs[jobId];
    }
}
