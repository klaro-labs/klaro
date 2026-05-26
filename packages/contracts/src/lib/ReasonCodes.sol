// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

/// @title ReasonCodes
/// @notice Canonical reason hashes for every Klaro admin action. v2 §35A.2.
/// Every contract that emits a `reasonHash` (slash, refund, dispute,
/// pause, kill) MUST use one of these. Indexers reverse-lookup the
/// hash to the human label off-chain via the same string.
library ReasonCodes {
    // Hold queue
    bytes32 internal constant HOLD_SUSPICIOUS = keccak256("klaro.reason.HOLD_SUSPICIOUS");
    bytes32 internal constant HOLD_SCREENING_FAIL = keccak256("klaro.reason.HOLD_SCREENING_FAIL");
    bytes32 internal constant HOLD_HIGH_RISK_VENDOR =
        keccak256("klaro.reason.HOLD_HIGH_RISK_VENDOR");
    bytes32 internal constant HOLD_VENDOR_KYB_PENDING =
        keccak256("klaro.reason.HOLD_VENDOR_KYB_PENDING");

    // Refund
    bytes32 internal constant REFUND_PROOF_MISSING = keccak256("klaro.reason.REFUND_PROOF_MISSING");
    bytes32 internal constant REFUND_VENDOR_REQUEST =
        keccak256("klaro.reason.REFUND_VENDOR_REQUEST");
    bytes32 internal constant REFUND_DUPLICATE_PAY = keccak256("klaro.reason.REFUND_DUPLICATE_PAY");
    bytes32 internal constant REFUND_BUYER_DISPUTE = keccak256("klaro.reason.REFUND_BUYER_DISPUTE");

    // LP slash
    bytes32 internal constant SLASH_LP_TIMEOUT = keccak256("klaro.reason.SLASH_LP_TIMEOUT");
    bytes32 internal constant SLASH_LP_BAD_PROOF = keccak256("klaro.reason.SLASH_LP_BAD_PROOF");
    bytes32 internal constant SLASH_LP_DISPUTE_LOSS =
        keccak256("klaro.reason.SLASH_LP_DISPUTE_LOSS");
    bytes32 internal constant SLASH_LP_KYB_REVOKED = keccak256("klaro.reason.SLASH_LP_KYB_REVOKED");

    // Vendor penalty
    bytes32 internal constant PENALIZE_VENDOR_FRAUD =
        keccak256("klaro.reason.PENALIZE_VENDOR_FRAUD");
    bytes32 internal constant PENALIZE_VENDOR_CHARGEBACK =
        keccak256("klaro.reason.PENALIZE_VENDOR_CHARGEBACK");

    // LP lifecycle (, 2026-05-25): expand registry
    // beyond slash codes. LPRegistry.suspend and admin tooling need codes
    // for non-slash actions (KYB rejection, risk-based suspension); without
    // these registered, operators were defaulting to SLASH_LP_TIMEOUT,
    // which mis-tags the audit log.
    bytes32 internal constant LP_SUSPENDED_RISK = keccak256("klaro.reason.LP_SUSPENDED_RISK");
    bytes32 internal constant LP_KYB_REJECTED = keccak256("klaro.reason.LP_KYB_REJECTED");

    // Agent lifecycle (): same gap on the agent side.
    // AgentRegistry.deactivate-by-operator needs a deactivation reason that
    // matches the action; tests had to fall back to
    // DISPUTE_AGENT_FAULT which conflates two distinct flows.
    bytes32 internal constant AGENT_DEACTIVATED_ABUSE =
        keccak256("klaro.reason.AGENT_DEACTIVATED_ABUSE");
    bytes32 internal constant AGENT_DEACTIVATED_KYB =
        keccak256("klaro.reason.AGENT_DEACTIVATED_KYB");

    // Dispute outcomes
    bytes32 internal constant DISPUTE_AGENT_FAULT = keccak256("klaro.reason.DISPUTE_AGENT_FAULT");
    bytes32 internal constant DISPUTE_USER_FAULT = keccak256("klaro.reason.DISPUTE_USER_FAULT");
    bytes32 internal constant DISPUTE_INSUFFICIENT_EV =
        keccak256("klaro.reason.DISPUTE_INSUFFICIENT_EV");
    bytes32 internal constant DISPUTE_MUTUAL_RESOLVED =
        keccak256("klaro.reason.DISPUTE_MUTUAL_RESOLVED");

    // Pause / kill
    bytes32 internal constant PAUSE_EMERGENCY = keccak256("klaro.reason.PAUSE_EMERGENCY");
    bytes32 internal constant PAUSE_PARTNER_OUTAGE = keccak256("klaro.reason.PAUSE_PARTNER_OUTAGE");
    bytes32 internal constant PAUSE_MAINTENANCE = keccak256("klaro.reason.PAUSE_MAINTENANCE");
    bytes32 internal constant KILL_FRAUD = keccak256("klaro.reason.KILL_FRAUD");
    bytes32 internal constant KILL_REGULATORY = keccak256("klaro.reason.KILL_REGULATORY");

    /// @notice Catch-all when no canonical code fits. Operator MUST attach an
    /// off-chain note (audit log line) when emitting this — enforced
    /// at the queue/UI layer, not on-chain.
    bytes32 internal constant OTHER = keccak256("klaro.reason.OTHER");

    error UnknownReason(bytes32 reason);

    /// @notice Allow-list guard for contracts that want to reject arbitrary
    /// bytes32 reason hashes. Cheaper than mapping lookup — branch
    /// predictor caches the common paths.
    function require_(bytes32 reason) internal pure {
        if (
            reason != HOLD_SUSPICIOUS && reason != HOLD_SCREENING_FAIL
                && reason != HOLD_HIGH_RISK_VENDOR && reason != HOLD_VENDOR_KYB_PENDING
                && reason != REFUND_PROOF_MISSING && reason != REFUND_VENDOR_REQUEST
                && reason != REFUND_DUPLICATE_PAY && reason != REFUND_BUYER_DISPUTE
                && reason != SLASH_LP_TIMEOUT && reason != SLASH_LP_BAD_PROOF
                && reason != SLASH_LP_DISPUTE_LOSS && reason != SLASH_LP_KYB_REVOKED
                && reason != PENALIZE_VENDOR_FRAUD && reason != PENALIZE_VENDOR_CHARGEBACK
                && reason != LP_SUSPENDED_RISK && reason != LP_KYB_REJECTED
                && reason != AGENT_DEACTIVATED_ABUSE && reason != AGENT_DEACTIVATED_KYB
                && reason != DISPUTE_AGENT_FAULT && reason != DISPUTE_USER_FAULT
                && reason != DISPUTE_INSUFFICIENT_EV && reason != DISPUTE_MUTUAL_RESOLVED
                && reason != PAUSE_EMERGENCY && reason != PAUSE_PARTNER_OUTAGE
                && reason != PAUSE_MAINTENANCE && reason != KILL_FRAUD && reason != KILL_REGULATORY
                && reason != OTHER
        ) {
            revert UnknownReason(reason);
        }
    }
}
