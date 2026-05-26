// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { Pausable } from "@openzeppelin/contracts/utils/Pausable.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { EIP712 } from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import { SignatureChecker } from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";

import { KlaroConfig } from "./KlaroConfig.sol";

/// @title LPStaking
/// @notice USDC-staked liquidity-provider registry for Partner Cashout.
/// tier ladder (USDC values, 6-dec on Arc ERC-20):
/// Tier 0 ≥ 50_000_000 ( $50) — quote-only, no payouts
/// Tier 1 ≥ 100_000_000 ($100) — small payouts, manual
/// Tier 2 ≥ 500_000_000 ($500) — medium auto-eligible
/// Tier 3 ≥ 2_000_000_000 ($2k) — large auto-eligible
/// Tier 4 = custom (Klaro-set) — institutional, governance gate
/// @dev Stake = collateral for slashing. The Klaro operator (which
/// CashoutOrderProcessor owns) may slash a fraction of stake when a
/// dispute resolves against the LP. Reason is anchored on-chain
/// via `slashReasonHash` for the audit log.
/// @dev (best option) — explicit tier ladder vs computed
/// logarithmic curve. Tier transitions must be auditable in plain
/// English for the LP onboarding flow.
contract LPStaking is ReentrancyGuard, EIP712, Pausable, Ownable {
    using SafeERC20 for IERC20;

    enum Tier {
        NONE,
        T0,
        T1,
        T2,
        T3,
        T4
    }

    struct LP {
        address wallet; // payout wallet (also slash target)
        uint256 stake; // USDC ERC-20 units (6 dec)
        Tier tier;
        bool active; // toggled off on KYB failure / soft-suspend
        uint64 joinedAt;
        uint256 slashedTotal; // cumulative slashed amount, for trust score
    }

    /// @notice lpId (off-chain entity hash) → LP record
    mapping(bytes32 => LP) public lps;

    /// @notice The USDC ERC-20 token used for stake (KlaroConfig.USDC)
    IERC20 public immutable usdc;

    /// @notice Operator (CashoutOrderProcessor) — only one allowed to slash
    address public klaroOperator;

    /// @notice Where slashed USDC lands. Defaults to KlaroConfig.KLARO_FEE_RECEIVER
    /// (currently `address(0)`); owner can override at deploy time or
    /// later via `setFeeReceiver`. LPS2: when this is
    /// `address(0)`, `slash()` reverts `FeeReceiverUnset` instead of
    /// routing real USDC to `0xdEaD` .
    address public feeReceiver;

    // Tier thresholds — 6-decimal USDC values per Arc ERC-20 interface
    uint256 internal constant T0 = 50_000_000; // $50
    uint256 internal constant T1 = 100_000_000; // $100
    uint256 internal constant T2 = 500_000_000; // $500
    uint256 internal constant T3 = 2_000_000_000; // $2,000

    event LPRegistered(bytes32 indexed lpId, address indexed wallet, uint256 stake, Tier tier);
    event StakeAdded(bytes32 indexed lpId, uint256 amount, uint256 newStake, Tier newTier);
    event StakeWithdrawn(bytes32 indexed lpId, uint256 amount, uint256 newStake, Tier newTier);
    event Slashed(bytes32 indexed lpId, uint256 amount, bytes32 reasonHash);
    event ActiveChanged(bytes32 indexed lpId, bool active);
    event OperatorChanged(address indexed previous, address indexed next);
    event SlasherChanged(address indexed previous, address indexed next);
    event FeeReceiverChanged(address indexed previous, address indexed next);

    error OnlyOperator();
    // separate slasher role. klaroOperator is the EIP-712
    // registration signer (must be an EOA so signatures work). The
    // CashoutOrderProcessor contract holds the slasher role so it can
    // call slash() during dispute resolution. Prior deploy collapsed
    // both into one address by calling setOperator(cashout) → every
    // LP register reverted BadOperatorAuth because cashout has no
    // ERC-1271 isValidSignature implementation.
    error OnlyOperatorOrSlasher();
    error NotRegistered();
    error AlreadyRegistered();
    error AmountZero();
    error InsufficientStake(uint256 stake, uint256 requested);
    /// @notice LPS2: slash refuses to burn USDC to 0xdEaD when the
    /// Klaro fee receiver isn't configured. KlaroConfig comment
    /// promised this would "fail loudly during testnet rather
    /// than silently sending to a wrong address" — the previous
    /// `address(0xdEaD)` fallback contradicted that promise and
    /// violated (proof beats claims).
    error FeeReceiverUnset();
    /// @notice Operator's EIP-712 authorization for (lpId, wallet) is
    /// missing, expired, or mis-signed.
    error BadOperatorAuth();
    /// @notice Caller is not the wallet bound in the operator's auth.
    error CallerNotAuthorizedWallet(address expected);

    /// @notice EIP-712 type hash for the operator's registration auth.
    bytes32 public constant REGISTER_TYPEHASH = keccak256(
        "RegisterAuthorization(bytes32 lpId,address wallet,uint64 deadline,uint256 nonce)"
    );

    /// @notice Per-(lpId) nonce so a leaked operator signature cannot be
    /// reused after the LP cancels + re-registers.
    mapping(bytes32 => uint256) public registerNonce;

    /// @notice address allowed to slash + setActive. Set by
    /// owner via `setSlasher(address)`. Typically the
    /// CashoutOrderProcessor contract. Distinct from
    /// `klaroOperator` (the EOA whose signature gates `register`).
    address public slasher;

    modifier onlyOperator() {
        if (msg.sender != klaroOperator) revert OnlyOperator();
        _;
    }

    /// @notice slash + setActive use this so the cashout
    /// contract can drive them while register stays bound to an
    /// EOA signer.
    modifier onlyOperatorOrSlasher() {
        if (msg.sender != klaroOperator && msg.sender != slasher) {
            revert OnlyOperatorOrSlasher();
        }
        _;
    }

    constructor(address usdc_, address operator_)
        EIP712("Klaro LPStaking", "1")
        Ownable(msg.sender)
    {
        KlaroConfig.requireArcTestnet();
        usdc = IERC20(usdc_);
        klaroOperator = operator_;
        feeReceiver = KlaroConfig.KLARO_FEE_RECEIVER; // address(0) until owner sets
        emit OperatorChanged(address(0), operator_);
    }

    /// @notice Owner sets the slashed-USDC destination ( LPS2).
    function setFeeReceiver(address next) external onlyOwner {
        emit FeeReceiverChanged(feeReceiver, next);
        feeReceiver = next;
    }

    // ─── LP self-service ────────────────────────────────────────────────

    /// @notice Register a new LP entity with initial stake.
    /// @dev previously
    /// permissionless. An attacker could front-run a legitimate
    /// LP's registration to pin the lpId with the wrong wallet,
    /// making the wallet field immutable for that lpId (no
    /// re-register, no wallet setter). Operator now signs an
    /// EIP-712 authorization binding (lpId, wallet, deadline,
    /// nonce); the bound wallet must call register itself so the
    /// signature is not relayable to a different msg.sender. The
    /// nonce-per-lpId allows operator re-issuance after a botched
    /// submission.
    function register(
        bytes32 lpId,
        address wallet,
        uint256 amount,
        uint64 deadline,
        bytes calldata operatorAuth
    ) external nonReentrant whenNotPaused {
        if (lps[lpId].joinedAt != 0) revert AlreadyRegistered();
        if (amount < T0) revert InsufficientStake(amount, T0);
        if (msg.sender != wallet) revert CallerNotAuthorizedWallet(wallet);
        if (block.timestamp > deadline) revert BadOperatorAuth();

        uint256 nonce = registerNonce[lpId];
        bytes32 structHash = keccak256(abi.encode(REGISTER_TYPEHASH, lpId, wallet, deadline, nonce));
        bytes32 digest = _hashTypedDataV4(structHash);
        if (!SignatureChecker.isValidSignatureNow(klaroOperator, digest, operatorAuth)) {
            revert BadOperatorAuth();
        }
        unchecked {
            registerNonce[lpId] = nonce + 1;
        }

        usdc.safeTransferFrom(msg.sender, address(this), amount);
        Tier t = _tierFor(amount);
        lps[lpId] = LP({
            wallet: wallet,
            stake: amount,
            tier: t,
            active: true,
            joinedAt: uint64(block.timestamp),
            slashedTotal: 0
        });
        emit LPRegistered(lpId, wallet, amount, t);
    }

    /// @notice EIP-712 domain separator. Exposed for off-chain signer code.
    function registrationDomainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    /// @notice Top up an existing LP stake.
    /// @dev previously
    /// permissionless — anyone could deposit USDC for any
    /// registered lpId, silently pumping that LP's tier past
    /// what the operator vetted. Gift-attack vector even if
    /// the LP doesn't want or expect the contribution. Now
    /// restricted to the LP's own wallet (the address bound
    /// at register-time by the operator-signed auth).
    function addStake(bytes32 lpId, uint256 amount) external nonReentrant whenNotPaused {
        LP storage lp = lps[lpId];
        if (lp.joinedAt == 0) revert NotRegistered();
        if (amount == 0) revert AmountZero();
        if (msg.sender != lp.wallet) revert CallerNotAuthorizedWallet(lp.wallet);

        usdc.safeTransferFrom(msg.sender, address(this), amount);
        lp.stake += amount;
        // never demote operator-
        // promoted T4 LPs. `_tierFor` only returns T0..T3; without this
        // guard a T4 LP topping up by 1 USDC silently dropped to T3
        // and lost institutional eligibility without operator consent.
        if (lp.tier != Tier.T4) {
            lp.tier = _tierFor(lp.stake);
        }
        emit StakeAdded(lpId, amount, lp.stake, lp.tier);
    }

    /// @notice Withdraw idle stake. The LP's tier downgrades automatically;
    /// operator may pause first via `setActive(lpId, false)` if the
    /// LP has open obligations.
    function withdrawStake(bytes32 lpId, uint256 amount) external nonReentrant whenNotPaused {
        LP storage lp = lps[lpId];
        if (lp.joinedAt == 0) revert NotRegistered();
        if (amount == 0) revert AmountZero();
        if (lp.stake < amount) revert InsufficientStake(lp.stake, amount);
        if (msg.sender != lp.wallet && msg.sender != owner()) {
            revert OnlyOperator();
        }

        lp.stake -= amount;
        // same T4-protection rule as addStake.
        if (lp.tier != Tier.T4) {
            lp.tier = _tierFor(lp.stake);
        }
        usdc.safeTransfer(lp.wallet, amount);
        emit StakeWithdrawn(lpId, amount, lp.stake, lp.tier);
    }

    // ─── Klaro operator (slash + suspend) ──────────────────────────────

    /// @notice Slash a fraction of LP stake. `reasonHash` ties the action
    /// to an off-chain dispute resolution record.
    /// @dev (audit ): T4 LPs ARE demoted on slash —
    /// intentional, the inverse of `addStake`/`withdrawStake`'s
    /// protection rule. Slash is a penalty path; if
    /// the LP's stake drops below T4's institutional threshold
    /// due to misconduct, the tier should reflect that. The
    /// `_tierFor` clamp ensures the new tier accurately
    /// represents the post-slash position. (doc fix:
    /// removed stale reference to a regression test that was
    /// never added — T4 promotion path doesn't exist as a
    /// setter, so a synthetic test requires storage manipulation.
    /// Behavior is pinned by code comment + audit acceptance.)
    function slash(bytes32 lpId, uint256 amount, bytes32 reasonHash)
        external
        onlyOperatorOrSlasher
        nonReentrant
        whenNotPaused
    {
        LP storage lp = lps[lpId];
        if (lp.joinedAt == 0) revert NotRegistered();
        if (amount == 0) revert AmountZero();
        if (lp.stake < amount) revert InsufficientStake(lp.stake, amount);

        lp.stake -= amount;
        lp.slashedTotal += amount;
        // T4 demotion is intentional on slash — see fn NatSpec.
        lp.tier = _tierFor(lp.stake);
        // LPS2: fail-closed when fee receiver is unset (original
        // AUDIT P1 — money-burn vector). Previous behavior routed
        // slashed USDC to 0xdEaD which permanently destroys real funds
        // and contradicted the KlaroConfig comment that promised a loud
        // failure. Owner sets via `setFeeReceiver` (defaults to
        // KlaroConfig.KLARO_FEE_RECEIVER, which is `address(0)` today).
        address sink = feeReceiver;
        if (sink == address(0)) revert FeeReceiverUnset();
        usdc.safeTransfer(sink, amount);
        emit Slashed(lpId, amount, reasonHash);
    }

    /// @dev kept for backward compat; new callers should
    /// use `suspend()` (slasher+operator) or `reactivate()`
    /// (operator-only). Direct setActive(true) by slasher is
    /// gated to operator-only via internal check.
    function setActive(bytes32 lpId, bool active) external onlyOperatorOrSlasher {
        // only klaroOperator (the EOA) may re-activate.
        // Slasher (CashoutOrderProcessor contract) can only suspend —
        // re-activation belongs to a human operator. Without this,
        // a future cashout upgrade or operator-key compromise could
        // re-activate LPs the EOA operator explicitly suspended.
        if (active && msg.sender != klaroOperator) revert OnlyOperator();
        LP storage lp = lps[lpId];
        if (lp.joinedAt == 0) revert NotRegistered();
        lp.active = active;
        emit ActiveChanged(lpId, active);
    }

    function setOperator(address next) external onlyOwner {
        emit OperatorChanged(klaroOperator, next);
        klaroOperator = next;
    }

    /// @notice set the slasher (typically the
    /// CashoutOrderProcessor contract). Distinct from
    /// klaroOperator so register's EIP-712 check stays bound
    /// to an EOA signer. Owner-only.
    function setSlasher(address next) external onlyOwner {
        emit SlasherChanged(slasher, next);
        slasher = next;
    }

    /// @notice Emergency kill-switch for staking entrypoints. Audit fix
    /// (loop ): LPStaking previously had no `Pausable` —
    /// every fund-moving contract in Klaro now does for parity
    /// + incident-response readiness.
    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // ─── Views ──────────────────────────────────────────────────────────

    function tierOf(bytes32 lpId) external view returns (Tier) {
        return lps[lpId].tier;
    }

    function getLP(bytes32 lpId) external view returns (LP memory) {
        return lps[lpId];
    }

    function _tierFor(uint256 stake) internal pure returns (Tier) {
        if (stake >= T3) return Tier.T3; // T4 promotion is operator-set, not derived
        if (stake >= T2) return Tier.T2;
        if (stake >= T1) return Tier.T1;
        if (stake >= T0) return Tier.T0;
        return Tier.NONE;
    }
}
