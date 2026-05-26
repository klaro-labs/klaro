// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { Pausable } from "@openzeppelin/contracts/utils/Pausable.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

import { KlaroConfig } from "./KlaroConfig.sol";

/// @title FeeSplitter
/// @notice Atomic BPS-weighted token splitter. v2 §31.5.
/// Money-flow contracts (`InvoiceEscrow.settle`, `CashoutOrderProcessor.confirmReceived`,
/// `AgentEscrow.release`, etc.) transfer the gross amount to this contract,
/// then immediately call `distribute(token, amount, splitId)`. Tokens fan out
/// to {protocolTreasury, reserveFund, lpPayoutPool, vendor, ...} in one tx
/// per the configured `splitId`.
/// @dev Two strict invariants — enforced on write, asserted by Echidna on every
/// distribute:
/// 1. sum(bps_i) == 10_000 — no over- or under-allocation
/// 2. sum(payouts_i) == amount — value conserved; dust goes to the last
/// payee in the array (battle-tested OZ PaymentSplitter pattern)
// every other money-moving Klaro contract gained
// Pausable in iters 62/72/74/75/78. FeeSplitter never did. Today's only
// trusted caller is `InvoiceEscrow.settle` (itself pause-gated), but
// principle-16 "boring infra" requires a kill-switch one click away —
// not one trusted-caller misconfiguration. Owner can pause/unpause; both
// distribute paths gain `whenNotPaused`.
contract FeeSplitter is ReentrancyGuard, Pausable, Ownable {
    using SafeERC20 for IERC20;

    uint16 public constant BPS_TOTAL = 10_000;

    struct Split {
        address payee;
        uint16 bps;
    }

    mapping(bytes32 => Split[]) private _splits;

    address public klaroOperator;

    /// @notice Allow-listed callers of `distribute*`.
    /// P0-2: was permissionless — any address could drain stuck
    /// token balances against any configured split.
    mapping(address => bool) public trustedCallers;

    event SplitConfigured(bytes32 indexed splitId, uint256 payeeCount);
    event Distributed(bytes32 indexed splitId, address indexed token, uint256 amount);
    event Payout(
        bytes32 indexed splitId, address indexed payee, address indexed token, uint256 amount
    );
    event OperatorChanged(address indexed previous, address indexed next);
    event TrustedCallerSet(address indexed caller, bool trusted);

    error BadBpsSum(uint256 actual);
    error EmptySplit();
    error ZeroPayee();
    error ZeroBps();
    error UnknownSplit(bytes32 splitId);
    error InsufficientBalance(uint256 have, uint256 want);
    error AmountZero();
    error NotOperator();
    error NotTrustedCaller();

    modifier onlyOperator() {
        if (msg.sender != klaroOperator) revert NotOperator();
        _;
    }

    modifier onlyTrustedCaller() {
        if (!trustedCallers[msg.sender]) revert NotTrustedCaller();
        _;
    }

    constructor(address operator_) Ownable(msg.sender) {
        KlaroConfig.requireArcTestnet();
        klaroOperator = operator_;
        emit OperatorChanged(address(0), operator_);
    }

    // ─── Configuration ──────────────────────────────────────────────────

    /// @notice Replace the split for `splitId`. Validates payees + BPS sum
    /// atomically so a partial-config can never be left behind.
    function setSplit(bytes32 splitId, Split[] calldata items) external onlyOperator {
        if (items.length == 0) revert EmptySplit();

        uint256 sum;
        delete _splits[splitId];
        for (uint256 i = 0; i < items.length; i++) {
            Split calldata s = items[i];
            if (s.payee == address(0)) revert ZeroPayee();
            if (s.bps == 0) revert ZeroBps();
            sum += s.bps;
            _splits[splitId].push(s);
        }
        if (sum != BPS_TOTAL) revert BadBpsSum(sum);

        emit SplitConfigured(splitId, items.length);
    }

    function setOperator(address next) external onlyOwner {
        emit OperatorChanged(klaroOperator, next);
        klaroOperator = next;
    }

    /// @dev (contracts audit): trusted-caller membership
    /// is now owner-gated (was operator-gated). FeeSplitter governs
    /// who can call distribute*() — i.e. who can redirect in-flight
    /// settlement payouts. An operator-key compromise previously
    /// let the attacker self-grant `trustedCallers[attacker] = true`
    /// and route arbitrary settlements; owner (multisig in prod) is
    /// the correct authority for membership changes. Matches the
    /// PrivacyVeil pattern.
    function setTrustedCaller(address caller, bool trusted) external onlyOwner {
        trustedCallers[caller] = trusted;
        emit TrustedCallerSet(caller, trusted);
    }

    // owner-controlled kill switch parity with the rest
    // of the money-moving Klaro stack. `pause()` freezes both
    // distribute paths; recovery via `unpause()`.
    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // ─── Distribution ───────────────────────────────────────────────────

    /// @notice Distribute `amount` of `token` (already transferred to this
    /// contract by the caller) across the `splitId` payees.
    /// Last payee absorbs any rounding dust so sum(payouts) == amount.
    /// @dev Reentrancy-guarded because any payee could be a contract with
    /// a hostile `receive`/ERC-777 hook.
    function distribute(address token, uint256 amount, bytes32 splitId)
        external
        nonReentrant
        whenNotPaused
        onlyTrustedCaller
    {
        if (amount == 0) revert AmountZero();
        Split[] storage items = _splits[splitId];
        uint256 n = items.length;
        if (n == 0) revert UnknownSplit(splitId);

        _checkBalance(token, amount);
        _distributeToPayees(token, amount, items, splitId);
        emit Distributed(splitId, token, amount);
    }

    /// @notice Per-call splits (no storage write). Caller passes the splits
    /// array directly — used by `InvoiceEscrow` for vendor-set
    /// per-invoice splits. Validates BPS sum on every call.
    function distributeAdHoc(address token, uint256 amount, Split[] calldata items)
        external
        nonReentrant
        whenNotPaused
        onlyTrustedCaller
    {
        if (amount == 0) revert AmountZero();
        uint256 n = items.length;
        if (n == 0) revert EmptySplit();

        uint256 sum;
        for (uint256 i = 0; i < n; i++) {
            if (items[i].payee == address(0)) revert ZeroPayee();
            if (items[i].bps == 0) revert ZeroBps();
            sum += items[i].bps;
        }
        if (sum != BPS_TOTAL) revert BadBpsSum(sum);

        _checkBalance(token, amount);

        uint256 distributed;
        for (uint256 i = 0; i < n - 1; i++) {
            uint256 cut = (amount * items[i].bps) / BPS_TOTAL;
            distributed += cut;
            IERC20(token).safeTransfer(items[i].payee, cut);
            emit Payout(bytes32(0), items[i].payee, token, cut);
        }
        uint256 last = amount - distributed;
        IERC20(token).safeTransfer(items[n - 1].payee, last);
        emit Payout(bytes32(0), items[n - 1].payee, token, last);

        emit Distributed(bytes32(0), token, amount);
    }

    function _checkBalance(address token, uint256 amount) internal view {
        uint256 bal = IERC20(token).balanceOf(address(this));
        if (bal < amount) revert InsufficientBalance(bal, amount);
    }

    function _distributeToPayees(
        address token,
        uint256 amount,
        Split[] storage items,
        bytes32 splitId
    ) internal {
        uint256 n = items.length;
        uint256 distributed;
        for (uint256 i = 0; i < n - 1; i++) {
            uint256 cut = (amount * items[i].bps) / BPS_TOTAL;
            distributed += cut;
            IERC20(token).safeTransfer(items[i].payee, cut);
            emit Payout(splitId, items[i].payee, token, cut);
        }
        uint256 last = amount - distributed;
        IERC20(token).safeTransfer(items[n - 1].payee, last);
        emit Payout(splitId, items[n - 1].payee, token, last);
    }

    /// @notice Pure helper exposing the splits-hash convention so consumers
    /// (InvoiceEscrow EIP-712 typed-data) hash splits the same way
    /// off-chain and on-chain.
    function hashSplits(Split[] calldata items) external pure returns (bytes32) {
        return keccak256(abi.encode(items));
    }

    // ─── Views ──────────────────────────────────────────────────────────

    function getSplit(bytes32 splitId) external view returns (Split[] memory) {
        return _splits[splitId];
    }

    function payeeCount(bytes32 splitId) external view returns (uint256) {
        return _splits[splitId].length;
    }
}
