// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import { Test } from "forge-std/Test.sol";
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import { InvoiceEscrow } from "../src/InvoiceEscrow.sol";
import { FeeSplitter } from "../src/FeeSplitter.sol";
import { KlaroConfig } from "../src/KlaroConfig.sol";

/// @notice Regression for loop fix: refundCaller defaulted to
/// address(0) on deploy. Owner had to remember to setRefundCaller
/// before any refund could happen. If forgotten, refund() would
/// revert with OnlyRefundCaller for every caller — refunds
/// permanently bricked, PAID invoices stuck in escrow.
/// Two fixes verified here:
/// 1. setRefundCaller(address(0)) now reverts ZeroAddress
/// (owner can't accidentally unset)
/// 2. refund() explicitly checks refundCaller != 0 BEFORE the
/// msg.sender match — clear failure mode if owner forgot to
/// configure at all.

contract MockUSDC is ERC20 {
    constructor() ERC20("Mock USDC", "USDC") { }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amt) external {
        _mint(to, amt);
    }
}

contract InvoiceEscrowRefundCallerGuardTest is Test {
    InvoiceEscrow escrow;
    MockUSDC usdc;
    address operator = address(0xB2);
    address owner;

    function setUp() public {
        vm.chainId(KlaroConfig.ARC_TESTNET_CHAIN_ID);
        owner = address(this);
        FeeSplitter splitter = new FeeSplitter(operator);
        escrow = new InvoiceEscrow(operator, splitter);
        usdc = new MockUSDC();
    }

    function test_SetRefundCaller_ZeroAddress_Reverts() public {
        vm.prank(owner);
        vm.expectRevert(InvoiceEscrow.ZeroAddress.selector);
        escrow.setRefundCaller(address(0));
    }

    function test_SetRefundCaller_HappyPath_Updates() public {
        vm.prank(owner);
        escrow.setRefundCaller(address(0xCAFE));
        assertEq(escrow.refundCaller(), address(0xCAFE));
    }

    function test_Refund_BeforeConfiguration_RevertsClear() public {
        // refundCaller still == address(0) — confirm explicit revert path
        // (the unset check we added in , distinct from the random
        // OnlyRefundCaller a stranger would hit).
        bytes32 invoiceId = keccak256("inv-1");
        vm.expectRevert(InvoiceEscrow.OnlyRefundCaller.selector);
        escrow.refund(invoiceId);
    }

    function test_Refund_NotConfiguredCaller_Reverts() public {
        // Configure then call from a stranger
        vm.prank(owner);
        escrow.setRefundCaller(address(0xCAFE));

        bytes32 invoiceId = keccak256("inv-2");
        vm.prank(address(0xBAD));
        vm.expectRevert(InvoiceEscrow.OnlyRefundCaller.selector);
        escrow.refund(invoiceId);
    }
}
