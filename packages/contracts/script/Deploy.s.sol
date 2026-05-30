// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import { Script, console2 } from "forge-std/Script.sol";

import { InvoiceEscrow } from "../src/InvoiceEscrow.sol";
import { AuditReceipt } from "../src/AuditReceipt.sol";
import { FeeSplitter } from "../src/FeeSplitter.sol";
import { RoutePolicyEngine } from "../src/RoutePolicyEngine.sol";
import { LPRegistry } from "../src/LPRegistry.sol";
import { MultiChainRouter } from "../src/MultiChainRouter.sol";
import { DisputeManager } from "../src/DisputeManager.sol";
import { RetainerStream } from "../src/RetainerStream.sol";
import { StableFXAdapterRegistry } from "../src/StableFXAdapterRegistry.sol";
import { MockStableFXAdapter } from "../src/adapters/MockStableFXAdapter.sol";
import { AgentRegistry } from "../src/AgentRegistry.sol";
import { AgentEscrow } from "../src/AgentEscrow.sol";
import { VendorReputation } from "../src/VendorReputation.sol";
import { ReputationManager } from "../src/ReputationManager.sol";
import { ProofRegistry } from "../src/ProofRegistry.sol";
import { LPStaking } from "../src/LPStaking.sol";
import { CashoutOrderProcessor } from "../src/CashoutOrderProcessor.sol";
import { RefundProtocol } from "../src/RefundProtocol.sol";
import { CounterpartyRegistry } from "../src/CounterpartyRegistry.sol";
import { PrivacyVeil } from "../src/PrivacyVeil.sol";
import { KlaroConfig } from "../src/KlaroConfig.sol";

/// @title Deploy
/// @notice Arc-testnet deployment script for the full M3-M10 contract set.
/// forge script script/Deploy.s.sol:Deploy \
/// --rpc-url $ARC_TESTNET_RPC_URL \
/// --private-key $PRIVATE_KEY \
/// --broadcast \
/// --verify --etherscan-api-key $ARCSCAN_API_KEY
/// Split into phase helpers so per-frame locals stay under Solc's
/// 16-local stack limit.
contract Deploy is Script {
    // Storage so per-phase helpers can hand off references without piling locals.
    FeeSplitter public splitter;
    RoutePolicyEngine public policy;
    InvoiceEscrow public escrow;
    AuditReceipt public receipt;
    RefundProtocol public refunds;
    LPRegistry public lpRegistry;
    LPStaking public lpStaking;
    ProofRegistry public proofs;
    CashoutOrderProcessor public cashout;
    MultiChainRouter public router;
    DisputeManager public disputes;
    RetainerStream public retainer;
    StableFXAdapterRegistry public fxRegistry;
    MockStableFXAdapter public fxMock;
    AgentRegistry public agentReg;
    AgentEscrow public agentEsc;
    VendorReputation public reputation;
    ReputationManager public repManager;
    CounterpartyRegistry public counterparty;
    PrivacyVeil public veil;

    function run() external {
        address operator = vm.envOr("KLARO_OPERATOR", msg.sender);
        // P1 (#93):
        // KLARO_OWNER — multisig (Safe) that takes Ownable handover after wiring.
        // Defaults to msg.sender so testnet deploys stay one-tx;
        // mainnet must set this to the Klaro treasury Safe.
        // KLARO_FEE_RECEIVER — runtime override of the address-zero placeholder
        // in KlaroConfig. Required on mainnet (chain id == 1).
        address owner = vm.envOr("KLARO_OWNER", msg.sender);
        address feeReceiver = vm.envOr("KLARO_FEE_RECEIVER", address(0));
        _assertFeeReceiverForChain(feeReceiver);
        address effectiveFeeReceiver = feeReceiver == address(0) ? operator : feeReceiver;

        vm.startBroadcast();
        _runDeploy(operator, owner, effectiveFeeReceiver);
        vm.stopBroadcast();

        _logAll(operator);
        console2.log("Owner (Safe):", owner);
        console2.log("Fee receiver:", effectiveFeeReceiver);
    }

    /// @dev Broadcast-less variant used by Deploy.t.sol. Production `run()`
    /// wraps this in vm.startBroadcast so the operator + the deployer are
    /// the same address (enforced by --private-key on the CLI).
    function runForTest(address operator, address owner, address feeReceiver) external {
        _runDeploy(operator, owner, feeReceiver);
    }

    function _runDeploy(address operator, address owner, address feeReceiver) internal {
        _deployCore(operator);
        _deployLPAndCashout(operator);
        _deployM8M10(operator, feeReceiver);
        _wire();
        if (owner != address(0) && owner != tx.origin && owner != address(this)) {
            _handoverOwnership(owner);
        }
    }

    /// @dev Reject zero-address fee receiver on Ethereum mainnet (chain 1) and
    /// any other chain explicitly tagged production via KLARO_REQUIRE_FEE_RECEIVER=1.
    function _assertFeeReceiverForChain(address feeReceiver) internal view {
        bool requireSet =
            block.chainid == 1 || vm.envOr("KLARO_REQUIRE_FEE_RECEIVER", uint256(0)) == 1;
        if (requireSet && feeReceiver == address(0)) {
            revert("KLARO_FEE_RECEIVER must be set on this chain (no address(0) on mainnet)");
        }
    }

    /// @dev Start the ownership transfer of every contract to the multisig.
    /// Audit 2026-05-30: the contracts are now Ownable2Step, so this only sets
    /// the PENDING owner — the multisig MUST call `acceptOwnership()` on each to
    /// complete the handover. Until it does, the deployer retains owner powers.
    /// This eliminates the catastrophic 1-step risk where a typo in `owner` (the
    /// KLARO_OWNER env) irrevocably bricked admin control of all 20 contracts.
    function _handoverOwnership(address owner) internal {
        splitter.transferOwnership(owner);
        policy.transferOwnership(owner);
        escrow.transferOwnership(owner);
        receipt.transferOwnership(owner);
        lpRegistry.transferOwnership(owner);
        lpStaking.transferOwnership(owner);
        proofs.transferOwnership(owner);
        cashout.transferOwnership(owner);
        router.transferOwnership(owner);
        disputes.transferOwnership(owner);
        refunds.transferOwnership(owner);
        retainer.transferOwnership(owner);
        fxRegistry.transferOwnership(owner);
        // (contracts audit): the mock FX adapter was
        // missed from the handover list — deployer EOA retained
        // setRate / setLive / setTrustedCaller / sweep on the live
        // adapter, so a deployer-key compromise could drain dst-token
        // liquidity via `sweep(token, attacker, balance)` post-handover.
        // Mirror the refund/retainer handover-gap fix.
        fxMock.transferOwnership(owner);
        agentReg.transferOwnership(owner);
        agentEsc.transferOwnership(owner);
        reputation.transferOwnership(owner);
        repManager.transferOwnership(owner);
        counterparty.transferOwnership(owner);
        veil.transferOwnership(owner);
    }

    function _deployCore(address operator) internal {
        splitter = new FeeSplitter(operator);
        policy = new RoutePolicyEngine(operator);
        escrow = new InvoiceEscrow(operator, splitter);
        receipt = new AuditReceipt(operator);
        refunds = new RefundProtocol(escrow);
    }

    function _deployLPAndCashout(address operator) internal {
        lpRegistry = new LPRegistry(operator);
        lpStaking = new LPStaking(KlaroConfig.USDC, operator);
        proofs = new ProofRegistry(operator);
        cashout =
            new CashoutOrderProcessor(KlaroConfig.USDC, proofs, lpStaking, lpRegistry, operator);
    }

    function _deployM8M10(address operator, address feeReceiver) internal {
        router = new MultiChainRouter(policy, operator);
        disputes = new DisputeManager(operator);
        retainer = new RetainerStream(operator);
        fxRegistry = new StableFXAdapterRegistry(operator);
        fxMock = new MockStableFXAdapter();
        agentReg = new AgentRegistry(operator);
        agentEsc = new AgentEscrow(KlaroConfig.USDC, agentReg, feeReceiver, operator);
        reputation = new VendorReputation(operator);
        repManager = new ReputationManager(reputation, operator);
        // Phase 4 (#104) — new contracts ship as part of every fresh deploy:
        counterparty = new CounterpartyRegistry(operator);
        veil = new PrivacyVeil();
    }

    function _wire() internal {
        proofs.setOperator(address(cashout));
        // previously `lpStaking.setOperator(address(cashout))`
        // — but LPStaking.register's EIP-712 check expected klaroOperator
        // to be an EOA, and CashoutOrderProcessor (a contract with no
        // ERC-1271 isValidSignature) always failed verification → no LP
        // could ever register against the deployed staking contract.
        // Slasher role is now distinct from operator: cashout slashes,
        // EOA operator signs register auths.
        lpStaking.setSlasher(address(cashout));
        disputes.setTrustedCaller(address(cashout), true);
        disputes.setTrustedCaller(address(agentEsc), true);
        cashout.setDisputes(disputes);
        agentEsc.setDisputes(disputes);

        // FeeSplitter was permissionless — only money-flow contracts may call distribute*.
        splitter.setTrustedCaller(address(escrow), true);
        // InvoiceEscrow.refund() is allow-listed to RefundProtocol only.
        escrow.setRefundCaller(address(refunds));

        // P1 wiring (#89):
        // VendorReputation lets ReputationManager + the dispute/cashout consumers
        // write deltas. Without this every reputation update would revert.
        reputation.setTrustedCaller(address(repManager), true);
        reputation.setTrustedCaller(address(cashout), true);
        reputation.setTrustedCaller(address(disputes), true);
        reputation.setTrustedCaller(address(escrow), true);

        // finding #6: CounterpartyRegistry + PrivacyVeil
        // are now wired into InvoiceEscrow. Default mode is denylist-only —
        // strict mode is operator-flippable once screening lead time is short
        // enough that buyers always have a fresh cached decision by checkout.
        escrow.setCounterparty(
            counterparty,
            /*strict=*/
            false
        );
        escrow.setVeil(veil);
        // PrivacyVeil.commitFor is now
        // allow-listed. Without InvoiceEscrow on the list every veiled
        // invoice creation reverts NotTrustedCaller. Direct vendor commit
        // is no longer supported.
        veil.setTrustedCaller(address(escrow), true);

        // finding #32: RetainerStream + DisputeManager
        // trust each other so stream-disputes use the same open/decide path
        // as cashouts. Operator stays the deployer per constructor.
        disputes.setTrustedCaller(address(retainer), true);

        // Register MockStableFXAdapter for USDC↔EURC so a default testnet
        // route exists for quoting. Production adapters override.
        fxRegistry.setAdapter(KlaroConfig.USDC, KlaroConfig.EURC, fxMock);
        // MockStableFXAdapter.swap is now
        // allow-listed. Without this every registry-mediated swap reverts
        // NotTrustedCaller; without the modifier any address could call
        // swap directly and drain the mock's destination-token liquidity.
        fxMock.setTrustedCaller(address(fxRegistry), true);
    }

    function _logAll(address operator) internal view {
        console2.log("FeeSplitter:", address(splitter));
        console2.log("RoutePolicyEngine:", address(policy));
        console2.log("InvoiceEscrow:", address(escrow));
        console2.log("AuditReceipt:", address(receipt));
        console2.log("RefundProtocol:", address(refunds));
        console2.log("LPRegistry:", address(lpRegistry));
        console2.log("LPStaking:", address(lpStaking));
        console2.log("ProofRegistry:", address(proofs));
        console2.log("CashoutOrderProcessor:", address(cashout));
        console2.log("MultiChainRouter:", address(router));
        console2.log("DisputeManager:", address(disputes));
        console2.log("RetainerStream:", address(retainer));
        console2.log("StableFXRegistry:", address(fxRegistry));
        console2.log("MockStableFXAdapter:", address(fxMock));
        console2.log("AgentRegistry:", address(agentReg));
        console2.log("AgentEscrow:", address(agentEsc));
        console2.log("VendorReputation:", address(reputation));
        console2.log("ReputationManager:", address(repManager));
        console2.log("CounterpartyRegistry:", address(counterparty));
        console2.log("PrivacyVeil:", address(veil));
        console2.log("Operator:", operator);
    }
}
