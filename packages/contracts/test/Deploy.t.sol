// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import { Test } from "forge-std/Test.sol";
import { Deploy } from "../script/Deploy.s.sol";
import { KlaroConfig } from "../src/KlaroConfig.sol";

/// @title DeployTest
/// @notice P1 (#91): regression-guards the `_wire()` step.
/// The deploy script *appears* to work even when a wiring line is
/// deleted — contracts compile and deploy, but the trusted-caller /
/// operator / refund-caller relationships silently never get set, and
/// every consumer call reverts at runtime. This test runs the full
/// Deploy.run() and asserts the post-state of every wired permission.
contract DeployTest is Test {
    Deploy d;
    address feeReceiver = address(0xFEE);

    function setUp() public {
        vm.chainId(KlaroConfig.ARC_TESTNET_CHAIN_ID);
        d = new Deploy();
        // Operator == the Deploy contract itself: every _wire() call originates
        // from Deploy, so the operator-guarded setters see msg.sender == operator.
        // Owner stays as the Deploy contract too (no Ownable handover branch).
        d.runForTest(address(d), address(d), feeReceiver);
    }

    function test_wire_DisputeManagerTrustsCashoutAndAgent() public view {
        assertTrue(d.disputes().trustedCallers(address(d.cashout())), "disputes <- cashout");
        assertTrue(d.disputes().trustedCallers(address(d.agentEsc())), "disputes <- agentEsc");
    }

    function test_wire_FeeSplitterTrustsInvoiceEscrow() public view {
        assertTrue(d.splitter().trustedCallers(address(d.escrow())), "splitter <- escrow");
    }

    function test_wire_InvoiceEscrowRefundCallerIsRefundProtocol() public view {
        assertEq(d.escrow().refundCaller(), address(d.refunds()), "escrow.refundCaller eq refunds");
    }

    function test_wire_VendorReputationTrustsAllProducers() public view {
        assertTrue(d.reputation().trustedCallers(address(d.repManager())), "rep <- repManager");
        assertTrue(d.reputation().trustedCallers(address(d.cashout())), "rep <- cashout");
        assertTrue(d.reputation().trustedCallers(address(d.disputes())), "rep <- disputes");
        assertTrue(d.reputation().trustedCallers(address(d.escrow())), "rep <- escrow");
    }

    function test_wire_ProofRegistryAndLPStakingRolesPostF92_1() public view {
        // ProofRegistry still uses cashout as operator
        // (no EIP-712 there). LPStaking splits into two roles — operator
        // (EOA, signs register auths) and slasher (cashout contract,
        // calls slash). Prior single-role wiring meant no LP could
        // register because cashout has no ERC-1271 isValidSignature.
        assertEq(d.proofs().klaroOperator(), address(d.cashout()), "proofs.operator eqcashout");
        assertEq(d.lpStaking().slasher(), address(d.cashout()), "lpStaking.slasher eqcashout");
        // klaroOperator stays as the deploy-supplied address so EIP-712
        // register works (the test passes address(d) as operator above).
        assertEq(d.lpStaking().klaroOperator(), address(d), "lpStaking.operator unchanged");
    }

    function test_wire_CashoutAndAgentEscrowKnowTheirDisputeManager() public view {
        assertEq(address(d.cashout().disputes()), address(d.disputes()));
        assertEq(address(d.agentEsc().disputes()), address(d.disputes()));
    }

    function test_agentEscrowUsesConfiguredFeeReceiver() public view {
        assertEq(d.agentEsc().klaroFeeReceiver(), feeReceiver);
    }

    function test_handoverIncludesRefundAndRetainer() public {
        Deploy withOwner = new Deploy();
        address owner = address(0xBEEF);
        withOwner.runForTest(address(withOwner), owner, feeReceiver);

        assertEq(withOwner.refunds().owner(), owner);
        assertEq(withOwner.retainer().owner(), owner);
    }

    // regression — fxMock was missing from
    // _handoverOwnership, leaving the deployer EOA with sweep/setRate
    // post-handover (drain vector via sweep(token, attacker, balance)).
    function test_handoverIncludesFxMock() public {
        Deploy withOwner = new Deploy();
        address owner = address(0xBEEF);
        withOwner.runForTest(address(withOwner), owner, feeReceiver);
        assertEq(withOwner.fxMock().owner(), owner);
    }

    function test_phase4_CounterpartyRegistryDeployed() public view {
        assertEq(d.counterparty().klaroOperator(), address(d));
        assertTrue(d.counterparty().defaultTtl() > 0);
    }

    function test_phase4_PrivacyVeilDeployed() public view {
        assertFalse(d.veil().isRevealed(keccak256("never-committed")));
    }
}
