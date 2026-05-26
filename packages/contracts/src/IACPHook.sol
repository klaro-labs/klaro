// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

/// @title IACPHook
/// @notice Agent Commerce Protocol hook interface — extension point for
/// `AgentEscrow` state transitions. Live mode wires this to
/// block-listing (Elliptic/TRM), reputation ticking, and ERP sync.
/// Hooks fire `before` and `after` every state-changing action:
/// - before*: may revert to block the action (e.g. screening fail)
/// - after*: read-only effect (emit events, queue off-chain work)
interface IACPHook {
    function beforeAction(
        bytes4 action, // keccak("createJob")[:4], etc.
        bytes32 jobId,
        address principal,
        address agent,
        uint256 amountUsdc
    ) external;

    function afterAction(
        bytes4 action,
        bytes32 jobId,
        address principal,
        address agent,
        uint256 amountUsdc
    ) external;
}

/// @notice No-op hook — used when a job opts out of ACP hooks.
contract NoopACPHook is IACPHook {
    function beforeAction(bytes4, bytes32, address, address, uint256) external pure { }
    function afterAction(bytes4, bytes32, address, address, uint256) external pure { }
}
