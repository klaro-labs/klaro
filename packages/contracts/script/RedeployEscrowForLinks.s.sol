// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import { Script, console } from "forge-std/Script.sol";
import { InvoiceEscrow } from "../src/InvoiceEscrow.sol";
import { RefundProtocol } from "../src/RefundProtocol.sol";
import { FeeSplitter } from "../src/FeeSplitter.sol";
import { CounterpartyRegistry } from "../src/CounterpartyRegistry.sol";
import { PrivacyVeil } from "../src/PrivacyVeil.sol";

interface ITrustedCaller {
    function setTrustedCaller(address caller, bool trusted) external;
}

/// Redeploy InvoiceEscrow (now with createInvoiceFor) + RefundProtocol (stores
/// the escrow immutably, so it must redeploy too) and re-wire against the
/// EXISTING dependency contracts. All other contracts (AuditReceipt, cashout,
/// disputes, reputation manager) are unaffected — they don't store the escrow
/// address. Owner/operator = the deployer (0xAD578…), which already owns the
/// splitter/reputation/veil, so the trusted-caller re-wiring is authorized.
contract RedeployEscrowForLinks is Script {
    address constant OPERATOR = 0xAD578be3836eDa982e18600784c414cC69B4EB94;
    FeeSplitter constant SPLITTER = FeeSplitter(0x3b2E07e58f1578cF24B6438E3E76728C21555B66);
    address constant REPUTATION = 0xb44CE869978CC1C0bf71687B307b19657d907750; // VendorReputation
    CounterpartyRegistry constant COUNTERPARTY =
        CounterpartyRegistry(0x59cEC2911422A08C5AA1922Ce31E85a17d17C21A);
    PrivacyVeil constant VEIL = PrivacyVeil(0x73660E5aa28a304369B1C9aF06d18468Af6a95F5);

    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(pk);

        InvoiceEscrow escrow = new InvoiceEscrow(OPERATOR, SPLITTER);
        RefundProtocol refunds = new RefundProtocol(escrow);

        // Re-add the new escrow as a trusted caller on the shared contracts.
        SPLITTER.setTrustedCaller(address(escrow), true);
        ITrustedCaller(REPUTATION).setTrustedCaller(address(escrow), true);
        VEIL.setTrustedCaller(address(escrow), true);

        // Configure the new escrow exactly like the original wiring.
        escrow.setRefundCaller(address(refunds));
        escrow.setCounterparty(COUNTERPARTY, false);
        escrow.setVeil(VEIL);

        vm.stopBroadcast();

        console.log("NEW_INVOICE_ESCROW=%s", address(escrow));
        console.log("NEW_REFUND_PROTOCOL=%s", address(refunds));
    }
}
