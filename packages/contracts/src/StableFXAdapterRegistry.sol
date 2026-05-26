// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { Pausable } from "@openzeppelin/contracts/utils/Pausable.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import { KlaroConfig } from "./KlaroConfig.sol";
import { IStableFXAdapter } from "./adapters/IStableFXAdapter.sol";
import { RoutePolicyEngine } from "./RoutePolicyEngine.sol";

/// @title StableFXAdapterRegistry
/// @notice Per-pair adapter routing. v2 §26.
/// Operator registers adapters for each `(srcToken, dstToken)` pair.
/// Today: MockStableFXAdapter for every pair until Circle TEST access
/// is granted; then CircleStableFXAdapter takes over for USDC↔EURC.
/// Adapter swap is **atomic** — registry.setAdapter() can never leave
/// the storage in a half-configured state, and a swap reads adapter +
/// routes in one tx with no observable middle state for griefers.
/// added `Pausable` for incident-response parity with
/// every other fund-moving Klaro contract (InvoiceEscrow,
/// CashoutOrderProcessor, AgentEscrow, AgentBudgetWallet,
/// RefundProtocol, LPStaking, RetainerStream). Without it, a Pyth
/// feed compromise, FX rate manipulation, or bad-adapter swap
/// drain attempt left no kill-switch short of rotating the
/// operator key (which breaks every legitimate path simultaneously).
contract StableFXAdapterRegistry is Ownable, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    /// @notice (srcToken, dstToken) → adapter
    mapping(address => mapping(address => IStableFXAdapter)) private _adapters;

    /// @notice Optional gate — when set, every swap goes through
    /// `policy.checkRoute(corridor, srcAmount, screeningPassed)`.
    RoutePolicyEngine public policy;

    address public klaroOperator;

    event AdapterSet(address indexed srcToken, address indexed dstToken, address adapter);
    event PolicySet(address indexed previous, address indexed next);
    event SwapExecuted(
        address indexed srcToken,
        address indexed dstToken,
        address indexed adapter,
        uint256 srcAmount,
        uint256 dstAmount,
        address recipient
    );
    event OperatorChanged(address indexed previous, address indexed next);

    error NotOperator();
    error NoAdapterForPair(address srcToken, address dstToken);
    error AdapterNotLive(address adapter);
    // defense-in-depth slippage check at the registry.
    // The adapter is supposed to enforce minDstAmount, but a buggy or
    // malicious adapter (mock-in-prod, wrong oracle) could return less
    // and the recipient loses value. Registry re-checks before emitting.
    error SlippageAtRegistry(uint256 dstAmount, uint256 minDstAmount);
    // a zero quote hash skips the adapter's
    // stale-quote check entirely (MockStableFXAdapter:115 honors
    // `bytes32(0)` as "no expected hash"). Operator daemon must
    // always recompute + forward the real hash; the registry
    // refuses the zero sentinel to prevent a compromised daemon
    // from bypassing the quote-bucket guard.
    error EmptyQuoteHash();
    // an off-by-one or null-coerced operator daemon
    // could submit srcAmount=0, which the mock adapter quotes as
    // (dstAmount=0, valid non-zero quoteHash) → no-op swap that
    // still emits SwapExecuted, polluting on-chain audit volume.
    error AmountZero();

    modifier onlyOperator() {
        if (msg.sender != klaroOperator) revert NotOperator();
        _;
    }

    constructor(address operator_) Ownable(msg.sender) {
        KlaroConfig.requireArcTestnet();
        klaroOperator = operator_;
        emit OperatorChanged(address(0), operator_);
    }

    // ─── Operator writes ────────────────────────────────────────────────

    function setAdapter(address srcToken, address dstToken, IStableFXAdapter adapter)
        external
        onlyOperator
    {
        _adapters[srcToken][dstToken] = adapter;
        emit AdapterSet(srcToken, dstToken, address(adapter));
    }

    function setPolicy(RoutePolicyEngine next) external onlyOperator {
        emit PolicySet(address(policy), address(next));
        policy = next;
    }

    function setOperator(address next) external onlyOwner {
        emit OperatorChanged(klaroOperator, next);
        klaroOperator = next;
    }

    /// @notice Owner kill-switch for FX-incident response ().
    /// Setting paused freezes every `swap()` call until unpaused.
    /// Quote remains readable so off-chain consumers see stale-quote
    /// + paused state and can render the right banner.
    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // ─── Consumer flow ──────────────────────────────────────────────────

    function quote(address srcToken, address dstToken, uint256 srcAmount)
        external
        view
        returns (uint256 dstAmount, bytes32 quoteHash, uint64 expiresAt, address adapter)
    {
        IStableFXAdapter a = _adapters[srcToken][dstToken];
        if (address(a) == address(0)) {
            revert NoAdapterForPair(srcToken, dstToken);
        }
        (dstAmount, quoteHash, expiresAt) = a.quote(srcToken, dstToken, srcAmount);
        adapter = address(a);
    }

    /// @notice Atomic swap. Caller (vendor) approves the **registry** for
    /// `srcAmount`. Registry pulls + forwards into the adapter, then
    /// the adapter pays `recipient` from its own dst-token balance.
    /// Routes through policy if set.
    /// @dev same defect class
    /// closed in on `MultiChainRouter.initiateBridge` —
    /// caller-supplied `screeningPassed` bool let any user pass
    /// `true` and bypass the corridor's `requiresScreening`
    /// policy. Now `onlyOperator`; the operator daemon vets
    /// screening status off-chain before invoking. Bool removed.
    /// The user still owns the funds — `payer` is an explicit
    /// param so the operator can pull from a pre-approved
    /// vendor allowance without taking custody.
    function swap(
        address payer,
        address srcToken,
        address dstToken,
        uint256 srcAmount,
        uint256 minDstAmount,
        bytes32 expectedQuoteHash,
        bytes32 corridor,
        address recipient
    ) external onlyOperator nonReentrant whenNotPaused returns (uint256 dstAmount) {
        IStableFXAdapter a = _adapters[srcToken][dstToken];
        if (address(a) == address(0)) {
            revert NoAdapterForPair(srcToken, dstToken);
        }
        if (!a.isLive()) revert AdapterNotLive(address(a));

        if (address(policy) != address(0)) {
            // Operator-attested screening; the bool is forced true on this
            // path because the operator gate IS the trust boundary.
            policy.checkRoute(
                corridor,
                srcAmount,
                /*screeningPassed=*/
                true
            );
        }

        // Pull from the user (who pre-approved the registry) → forward to
        // adapter → adapter pays recipient.
        // refuse zero quoteHash so the adapter's
        // freshness check can't be bypassed by a buggy/compromised
        // operator daemon.
        if (expectedQuoteHash == bytes32(0)) revert EmptyQuoteHash();
        // refuse zero srcAmount (would emit a no-op
        // SwapExecuted event polluting on-chain audit volume).
        if (srcAmount == 0) revert AmountZero();
        IERC20(srcToken).safeTransferFrom(payer, address(a), srcAmount);
        dstAmount =
            a.swap(srcToken, dstToken, srcAmount, minDstAmount, expectedQuoteHash, recipient);
        // re-validate the adapter respected the floor.
        if (dstAmount < minDstAmount) {
            revert SlippageAtRegistry(dstAmount, minDstAmount);
        }
        emit SwapExecuted(srcToken, dstToken, address(a), srcAmount, dstAmount, recipient);
    }

    // ─── Views ──────────────────────────────────────────────────────────

    function adapterFor(address srcToken, address dstToken)
        external
        view
        returns (IStableFXAdapter)
    {
        return _adapters[srcToken][dstToken];
    }
}
