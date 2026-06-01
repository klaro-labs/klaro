// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import { Script, console } from "forge-std/Script.sol";
import { CashoutOrderProcessor } from "../src/CashoutOrderProcessor.sol";
import { ProofRegistry } from "../src/ProofRegistry.sol";
import { LPStaking } from "../src/LPStaking.sol";
import { LPRegistry } from "../src/LPRegistry.sol";
import { DisputeManager } from "../src/DisputeManager.sol";
import { KlaroConfig } from "../src/KlaroConfig.sol";

interface ITrustedCaller {
    function setTrustedCaller(address caller, bool trusted) external;
}

/// Surgical redeploy of CashoutOrderProcessor only — the storage layout changed
/// (Order gained `klaroFee`) + the constructor gained `feeReceiver`, so the
/// contract cannot be upgraded in place. Every dependency (ProofRegistry,
/// LPStaking, LPRegistry, DisputeManager, VendorReputation, USDC) is UNCHANGED
/// and re-wired against the new COP. Owner/operator/feeReceiver = the deployer
/// 0xAD578…, which already owns all of these, so the re-wiring is authorized.
///
/// Mirrors the original Deploy.s.sol `_wire()` block for `cashout`:
///   proofs.setOperator(cashout); lpStaking.setSlasher(cashout);
///   disputes.setTrustedCaller(cashout,true); cashout.setDisputes(disputes);
///   reputation.setTrustedCaller(cashout,true);
///
/// Run:
///   PRIVATE_KEY=$DAEMON_OPERATOR_PRIVATE_KEY forge script \
///     script/RedeployCashoutForFee.s.sol:RedeployCashoutForFee \
///     --rpc-url https://rpc.testnet.arc.network --broadcast --skip-simulation
contract RedeployCashoutForFee is Script {
    // From DEPLOYMENT.md (Arc testnet). Deployer owns all of these.
    address constant OPERATOR = 0xAD578be3836eDa982e18600784c414cC69B4EB94;
    address constant FEE_RECEIVER = 0xAD578be3836eDa982e18600784c414cC69B4EB94;
    ProofRegistry constant PROOFS =
        ProofRegistry(0xb0a2c7815D75EeBF73f8869C810EC8da5FcCbC33);
    LPStaking constant LP_STAKING =
        LPStaking(0x4b36eD428b47F4254737215454BE6e9b99A1bD1f);
    LPRegistry constant LP_REGISTRY =
        LPRegistry(0xCF591a1fA140c5Ca04686dDD7De006Da78C2180b);
    DisputeManager constant DISPUTES =
        DisputeManager(0xee9561BE93312625C7F622D3f63B9092Af23aE5F);
    address constant REPUTATION = 0xb44CE869978CC1C0bf71687B307b19657d907750; // VendorReputation
    address constant OLD_COP = 0x4047ecf1f67dE098aF919bD2Ce9137b4414d226c;

    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(pk);

        CashoutOrderProcessor cashout = new CashoutOrderProcessor(
            KlaroConfig.USDC, PROOFS, LP_STAKING, LP_REGISTRY, OPERATOR, FEE_RECEIVER
        );

        // Re-point the roles the OLD cashout held to the NEW one. setOperator /
        // setSlasher OVERWRITE (the old COP loses the role — it can no longer
        // advance proofs or slash). The old COP stays a trusted caller on
        // disputes/reputation, which is harmless once it's no longer the proofs
        // operator; we deliberately do NOT revoke it here so any in-flight
        // old-COP dispute can still resolve. Decommission separately if desired.
        PROOFS.setOperator(address(cashout)); // recordProof is onlyOperator==COP
        LP_STAKING.setSlasher(address(cashout)); // resolveDispute SLASH_LP → staking.slash
        DISPUTES.setTrustedCaller(address(cashout), true);
        cashout.setDisputes(DISPUTES);
        ITrustedCaller(REPUTATION).setTrustedCaller(address(cashout), true);

        vm.stopBroadcast();

        console.log("NEW_CASHOUT_ORDER_PROCESSOR=%s", address(cashout));
        console.log("OLD_CASHOUT_ORDER_PROCESSOR=%s", OLD_COP);
        console.log("fee_receiver=%s", FEE_RECEIVER);
    }
}
