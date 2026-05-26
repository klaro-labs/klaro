// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import { InvoiceEscrow } from "../../src/InvoiceEscrow.sol";
import { AuditReceipt } from "../../src/AuditReceipt.sol";
import { DisputeManager } from "../../src/DisputeManager.sol";
import { RefundProtocol } from "../../src/RefundProtocol.sol";

/// @notice Halmos symbolic targets. Drive with:
/// halmos --config packages/contracts/halmos.toml
/// Each `check_*` function is a symbolic harness — Halmos explores all paths
/// and reports counterexamples. We target the chokepoints:
/// - `InvoiceEscrow.acceptAndPay` — money inflow
/// - `AuditReceipt.mint` — receipt anchor
/// - `DisputeManager.decide` — outcome write
/// - `RefundProtocol.executeRefund` — money outflow
/// Concrete symbolic bodies land alongside the first Halmos CI run; this file
/// pins the target shape so the toml config + tests don't drift.
/// @dev same fail-closed treatment as
/// `test/echidna/Targets.sol`. A symbolic `return true` is a worse signal
/// than a missing harness — it silently claims "Halmos verified" when no
/// paths were actually explored. Reverting forces a CI failure until the
/// bodies are wired.
error HalmosHarnessNotWired();

contract HalmosTargets {
    InvoiceEscrow public escrow;
    AuditReceipt public receipt;
    DisputeManager public disputes;
    RefundProtocol public refunds;

    function check_accept_does_not_double_spend(bytes32) public pure returns (bool) {
        revert HalmosHarnessNotWired();
    }

    function check_receipt_is_deterministic(bytes32) public pure returns (bool) {
        revert HalmosHarnessNotWired();
    }

    function check_dispute_outcome_is_idempotent(bytes32) public pure returns (bool) {
        revert HalmosHarnessNotWired();
    }

    function check_refund_burns_nonce(bytes32) public pure returns (bool) {
        revert HalmosHarnessNotWired();
    }
}
