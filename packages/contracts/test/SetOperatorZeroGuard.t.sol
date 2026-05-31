// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import { Test } from "forge-std/Test.sol";
import { Deploy } from "../script/Deploy.s.sol";
import { KlaroConfig } from "../src/KlaroConfig.sol";

interface ISetOperator {
    function setOperator(address) external;
}

/// @title SetOperatorZeroGuardTest
/// @notice Audit D3b MEDIUM-1: setOperator(address(0)) would brick every
/// operator-gated path on a contract (settlement, cashout, dispute resolution,
/// slashing, …). Every operator-gated contract must reject the zero operator.
/// Deploys the full system via the Deploy script (owner == the Deploy contract)
/// and asserts each setter reverts on address(0). Generic expectRevert covers
/// both error names in use (ZeroOperatorAddress on the 15 added in the audit
/// pass; ZeroAddress on DisputeManager + CounterpartyRegistry).
contract SetOperatorZeroGuardTest is Test {
    Deploy d;
    address owner;
    address[] targets;

    function setUp() public {
        vm.chainId(KlaroConfig.ARC_TESTNET_CHAIN_ID);
        d = new Deploy();
        // operator == owner == the Deploy contract (no Ownable handover branch).
        d.runForTest(address(d), address(d), address(0xFEE));
        owner = address(d);
        // Resolve every operator-gated contract address up front (these getter
        // calls must not be inside expectRevert).
        targets = [
            address(d.escrow()),
            address(d.receipt()),
            address(d.splitter()),
            address(d.policy()),
            address(d.lpRegistry()),
            address(d.lpStaking()),
            address(d.proofs()),
            address(d.cashout()),
            address(d.router()),
            address(d.disputes()),
            address(d.retainer()),
            address(d.fxRegistry()),
            address(d.agentReg()),
            address(d.agentEsc()),
            address(d.reputation()),
            address(d.repManager()),
            address(d.counterparty())
        ];
    }

    function test_AllOperatorGatedContracts_RejectZeroOperator() public {
        assertEq(targets.length, 17, "expected 17 operator-gated contracts");
        for (uint256 i = 0; i < targets.length; i++) {
            vm.prank(owner);
            vm.expectRevert();
            ISetOperator(targets[i]).setOperator(address(0));
        }
    }
}
