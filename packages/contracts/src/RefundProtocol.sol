// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { EIP712 } from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import { SignatureChecker } from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { Pausable } from "@openzeppelin/contracts/utils/Pausable.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

import { KlaroConfig } from "./KlaroConfig.sol";
import { InvoiceEscrow } from "./InvoiceEscrow.sol";

/// @title RefundProtocol
/// @notice Klaro's signed-refund release contract. The vendor signs an
/// EIP-712 authorization off-chain; any relayer can submit it to
/// release escrowed USDC back to the original buyer. This means the
/// vendor never needs to hold USDC-on-Arc gas to initiate a refund.
/// @dev Klaro (state machines): refund moves `InvoiceEscrow`
/// from PAID → REFUNDED via the operator path. This contract is the
/// operator for refund-specific logic; ownership of the underlying
/// escrow stays with the original `InvoiceEscrow.klaroOperator`.
/// @dev Why a separate contract: refunds are economically distinct from
/// normal settlement and may need different rate-limits, replay
/// windows, partial-refund support (M7), and EIP-3009 buyer-pull
/// flow (M5). Keeping them isolated makes the audit story cleaner.
contract RefundProtocol is EIP712, ReentrancyGuard, Pausable, Ownable {
    using SafeERC20 for IERC20;

    /// @notice The escrow this protocol operates against. Set at deploy
    /// and immutable; one RefundProtocol per InvoiceEscrow.
    InvoiceEscrow public immutable escrow;

    /// @notice EIP-712 type-hash for the vendor's refund authorization.
    bytes32 public constant REFUND_TYPEHASH = keccak256(
        "RefundAuthorization(bytes32 invoiceId,address vendor,address buyer,address token,uint256 amount,uint64 expiresAt,uint256 nonce)"
    );

    /// @notice One-use nonce per vendor; replay protection.
    mapping(address => uint256) public nonces;

    /// @notice Already-refunded invoice ids (covers any partial-refund logic
    /// added later by tracking exactly-once.)
    mapping(bytes32 => bool) public refunded;

    event RefundExecuted(
        bytes32 indexed invoiceId,
        address indexed vendor,
        address indexed buyer,
        uint256 amount,
        uint256 nonce
    );

    error AlreadyRefunded(bytes32 invoiceId);
    error ExpiredAuthorization(uint64 expiresAt, uint64 nowTs);
    error BadVendorSig();
    error BuyerMismatch(address expected, address actual);
    error TokenMismatch(address expected, address actual);
    error AmountMismatch(uint256 expected, uint256 actual);

    constructor(InvoiceEscrow escrow_) EIP712("Klaro Refund", "1") Ownable(msg.sender) {
        KlaroConfig.requireArcTestnet();
        escrow = escrow_;
    }

    /// @notice Execute a refund using the vendor's EIP-712 authorization.
    /// Any address can call; signature alone gates correctness.
    /// @dev Pull funds from the escrow contract via a delegated path
    /// requires escrow.settle()'s authority — for M4 we rely on
    /// Klaro operator off-chain logic to mark the invoice REFUNDED
    /// in `InvoiceEscrow` AFTER this contract emits its event.
    /// M5 will wire an `escrow.refund(...)` function directly so
    /// the on-chain flow becomes atomic.
    function executeRefund(
        bytes32 invoiceId,
        address vendor,
        address buyer,
        address token,
        uint256 amount,
        uint64 expiresAt,
        uint256 nonce,
        bytes calldata vendorSignature
    ) external nonReentrant whenNotPaused {
        if (refunded[invoiceId]) revert AlreadyRefunded(invoiceId);
        if (block.timestamp > expiresAt) {
            revert ExpiredAuthorization(expiresAt, uint64(block.timestamp));
        }
        if (nonces[vendor] != nonce) {
            // Implicit replay protection: enforce strict ordering. The
            // operator's off-chain builder MUST query `nonces(vendor)` and
            // sign for that exact value.
            revert BadVendorSig();
        }

        // Recover + verify vendor signature (EOA + EIP-1271 SCA dual-path)
        bytes32 structHash = keccak256(
            abi.encode(REFUND_TYPEHASH, invoiceId, vendor, buyer, token, amount, expiresAt, nonce)
        );
        bytes32 digest = _hashTypedDataV4(structHash);
        if (!SignatureChecker.isValidSignatureNow(vendor, digest, vendorSignature)) {
            revert BadVendorSig();
        }

        // Cross-check against the invoice in the escrow
        InvoiceEscrow.Invoice memory inv = escrow.getInvoice(invoiceId);
        if (inv.status != InvoiceEscrow.Status.PAID) {
            revert AlreadyRefunded(invoiceId);
        }
        if (inv.vendor != vendor) revert BadVendorSig();
        if (inv.acceptedBy != buyer) {
            revert BuyerMismatch(inv.acceptedBy, buyer);
        }
        if (inv.token != token) revert TokenMismatch(inv.token, token);
        if (inv.amount != amount) revert AmountMismatch(inv.amount, amount);

        // Mark refunded + bump nonce
        refunded[invoiceId] = true;
        unchecked {
            nonces[vendor] = nonce + 1;
        }

        emit RefundExecuted(invoiceId, vendor, buyer, amount, nonce);

        // Atomic on-chain release. — replaces the
        // M4 off-chain operator orchestration that left vendor signatures
        // consumed without funds moving.
        escrow.refund(invoiceId);
    }

    /// @notice EIP-712 domain separator. Exposed for off-chain signer code.
    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    /// @notice Emergency freeze of the refund subsystem, independent of the
    /// underlying `InvoiceEscrow.pause`. Useful when refund-specific
    /// risk surfaces (e.g. a flaw in the signed-authorization scheme)
    /// without pausing fresh-invoice creation.
    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}
