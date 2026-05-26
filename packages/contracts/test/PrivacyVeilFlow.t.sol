// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import { Test } from "forge-std/Test.sol";
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import { InvoiceEscrow } from "../src/InvoiceEscrow.sol";
import { FeeSplitter } from "../src/FeeSplitter.sol";
import { PrivacyVeil } from "../src/PrivacyVeil.sol";
import { KlaroConfig } from "../src/KlaroConfig.sol";

contract MockUSDC is ERC20 {
    constructor() ERC20("Mock USDC", "USDC") { }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amt) external {
        _mint(to, amt);
    }
}

contract PrivacyVeilFlowTest is Test {
    InvoiceEscrow esc;
    FeeSplitter splitter;
    PrivacyVeil veil;
    MockUSDC usdc;

    address vendor = address(0xA11);
    address operator = address(0xCAFE);

    bytes32 constant INVOICE_ID = keccak256("inv-veil");
    uint256 constant AMOUNT = 1234 * 10 ** 6;
    bytes32 constant SALT = keccak256("salt-1");

    function setUp() public {
        vm.chainId(KlaroConfig.ARC_TESTNET_CHAIN_ID);
        usdc = new MockUSDC();
        splitter = new FeeSplitter(operator);
        esc = new InvoiceEscrow(operator, splitter);
        veil = new PrivacyVeil();
        // PrivacyVeil.commitFor is allow-listed; trust the escrow so
        // veiled invoice creation can record commitments on the vendor's behalf.
        veil.setTrustedCaller(address(esc), true);
        esc.setVeil(veil);
    }

    function test_VeilSet_CommitsOnCreate() public {
        bytes32 commitHash = keccak256(abi.encode(AMOUNT, SALT));
        vm.prank(vendor);
        esc.createInvoiceVeiled(
            INVOICE_ID,
            address(usdc),
            AMOUNT,
            uint64(block.timestamp + 7 days),
            keccak256("meta"),
            commitHash
        );
        PrivacyVeil.Veil memory v = veil.getVeil(INVOICE_ID);
        assertEq(v.commit, commitHash);
        assertEq(v.committer, vendor, "vendor recorded as committer via commitFor");
        assertFalse(v.revealed);
    }

    function test_VeilNotSet_NoCommit() public {
        esc.setVeil(PrivacyVeil(address(0)));
        bytes32 commitHash = keccak256(abi.encode(AMOUNT, SALT));
        vm.prank(vendor);
        esc.createInvoiceVeiled(
            INVOICE_ID,
            address(usdc),
            AMOUNT,
            uint64(block.timestamp + 7 days),
            keccak256("meta"),
            commitHash
        );
        // Veil not present — no commit recorded since the contract is unset.
        // We don't probe the unset veil; just confirm the invoice exists.
        InvoiceEscrow.Invoice memory inv = esc.getInvoice(INVOICE_ID);
        assertEq(uint8(inv.status), uint8(InvoiceEscrow.Status.CREATED));
    }

    function test_RevealRoundtrip() public {
        bytes32 commitHash = keccak256(abi.encode(AMOUNT, SALT));
        vm.prank(vendor);
        esc.createInvoiceVeiled(
            INVOICE_ID,
            address(usdc),
            AMOUNT,
            uint64(block.timestamp + 7 days),
            keccak256("meta"),
            commitHash
        );

        // Vendor (the recorded committer) reveals.
        vm.prank(vendor);
        veil.reveal(INVOICE_ID, AMOUNT, SALT);
        assertTrue(veil.isRevealed(INVOICE_ID));
    }
}
