// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import { InvoiceEscrow } from "../../src/InvoiceEscrow.sol";
import { FeeSplitter } from "../../src/FeeSplitter.sol";
import { CashoutOrderProcessor } from "../../src/CashoutOrderProcessor.sol";

/// @notice Echidna invariant targets. Drive with:
/// echidna packages/contracts/test/echidna/Targets.sol --config packages/contracts/echidna.yaml
/// Invariants (per THREAT_MODEL §5):
/// I1. InvoiceEscrow conservation — for every invoice id, the running balance
/// of escrowed USDC equals `amount` if PAID, 0 otherwise. settle/refund
/// are the only paths that reduce the balance.
/// I2. CashoutOrderProcessor double-release — once an order reaches RELEASED,
/// no further release can occur.
/// I3. FeeSplitter dust-conservation — sum of payouts always equals the
/// input amount (rounding dust goes to the last payee).
/// We expose state-changing entry points to Echidna's fuzzer + assert the
/// invariants between calls. Concrete bodies land alongside the first Echidna
/// CI run; this file pins the target shape so the config + tests don't drift.
///
/// STATUS: I3 (FeeSplitter dust-conservation) now has LIVE coverage via a
/// Foundry-native stateful-fuzz invariant — see
/// `test/invariant/FeeSplitterConservation.t.sol` (256 runs × 128k calls, 0
/// reverts), which runs in the existing `forge test` lane without needing the
/// Echidna binary. I1 (InvoiceEscrow conservation) + I2 (Cashout no-double-
/// release) remain unwired here and fail-closed below.
///
/// @dev Custom error so any Echidna run loudly fails-closed until the bodies
/// are wired. the previous
/// `return true` made every invariant a vacuous green — Echidna would
/// report "0 counterexamples" and CI dashboards would claim coverage we
/// do not have. Per Klaro (no overclaiming) + Claude rule 14
/// (brutal honesty), green is reserved for verified invariants.
error EchidnaHarnessNotWired();

contract EchidnaTargets {
    InvoiceEscrow public escrow;
    CashoutOrderProcessor public cashout;
    FeeSplitter public splitter;

    function echidna_invariant_escrow_conservation() public pure returns (bool) {
        revert EchidnaHarnessNotWired();
    }

    function echidna_invariant_cashout_no_double_release() public pure returns (bool) {
        revert EchidnaHarnessNotWired();
    }

    /// @dev Covered live by FeeSplitterConservation.t.sol (Foundry invariant).
    /// Left fail-closed here so an Echidna run can't claim vacuous green; the
    /// real proof lives in the forge lane.
    function echidna_invariant_splitter_dust_conservation() public pure returns (bool) {
        revert EchidnaHarnessNotWired();
    }
}
