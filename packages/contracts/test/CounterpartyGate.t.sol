// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import { Test } from "forge-std/Test.sol";
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import { InvoiceEscrow } from "../src/InvoiceEscrow.sol";
import { FeeSplitter } from "../src/FeeSplitter.sol";
import { CounterpartyRegistry } from "../src/CounterpartyRegistry.sol";
import { KlaroConfig } from "../src/KlaroConfig.sol";

/// @notice Phase A fix (, 2026-05-25): InvoiceEscrow now
/// consults CounterpartyRegistry inside `acceptAndPay`. Default mode
/// is denylist-only; strict mode requires a fresh-pass cached decision.
contract MockUSDC is ERC20 {
    constructor() ERC20("Mock USDC", "USDC") { }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amt) external {
        _mint(to, amt);
    }
}

contract CounterpartyGateTest is Test {
    InvoiceEscrow esc;
    FeeSplitter splitter;
    CounterpartyRegistry reg;
    MockUSDC usdc;

    uint256 vendorPk = 0xA11CE;
    address vendor;
    uint256 buyerPk = 0xB0B;
    address buyer;
    address operator = address(0xCAFE);

    bytes32 constant INVOICE_ID = keccak256("invoice-cp-gate");
    uint256 constant AMOUNT = 100 * 10 ** 6;
    bytes32 constant REASON = keccak256("klaro.reason.HOLD_SCREENING_FAIL");

    function setUp() public {
        vm.chainId(KlaroConfig.ARC_TESTNET_CHAIN_ID);
        vendor = vm.addr(vendorPk);
        buyer = vm.addr(buyerPk);
        usdc = new MockUSDC();
        splitter = new FeeSplitter(operator);
        esc = new InvoiceEscrow(operator, splitter);
        reg = new CounterpartyRegistry(operator);
        // owner-only (test contract is owner).
        splitter.setTrustedCaller(address(esc), true);

        usdc.mint(buyer, AMOUNT * 10);
        vm.prank(buyer);
        usdc.approve(address(esc), type(uint256).max);

        vm.prank(vendor);
        esc.createInvoice(
            INVOICE_ID, address(usdc), AMOUNT, uint64(block.timestamp + 7 days), keccak256("meta")
        );
    }

    function _sig() internal view returns (bytes memory) {
        bytes32 typeHash = esc.ACCEPTANCE_TYPEHASH();
        bytes32 structHash = keccak256(
            abi.encode(
                typeHash,
                INVOICE_ID,
                vendor,
                address(usdc),
                AMOUNT,
                uint64(block.timestamp + 7 days),
                keccak256("meta"),
                bytes32(0)
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", esc.domainSeparator(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(buyerPk, digest);
        return abi.encodePacked(r, s, v);
    }

    function test_NoRegistryWired_AnyBuyerCanPay() public {
        vm.prank(buyer);
        esc.acceptAndPay(INVOICE_ID, _sig(), buyer);
        assertEq(usdc.balanceOf(address(esc)), AMOUNT);
    }

    function test_RegistryWired_DenylistedBuyer_Reverts() public {
        // Build sig BEFORE expectRevert — _sig() makes a staticcall to
        // ACCEPTANCE_TYPEHASH() and domainSeparator() that would otherwise
        // consume the expectRevert hook.
        bytes memory sig = _sig();
        esc.setCounterparty(reg, false);
        vm.prank(operator);
        reg.deny(buyer, REASON);

        vm.prank(buyer);
        vm.expectRevert(InvoiceEscrow.BuyerDenylisted.selector);
        esc.acceptAndPay(INVOICE_ID, sig, buyer);
    }

    function test_RegistryWired_UnknownBuyer_AcceptsInLenientMode() public {
        esc.setCounterparty(reg, false);
        // Buyer never screened → denylist false → allowed.
        vm.prank(buyer);
        esc.acceptAndPay(INVOICE_ID, _sig(), buyer);
        assertEq(usdc.balanceOf(address(esc)), AMOUNT);
    }

    function test_StrictMode_UnknownBuyer_Reverts() public {
        bytes memory sig = _sig();
        esc.setCounterparty(reg, true);
        vm.prank(buyer);
        vm.expectRevert(InvoiceEscrow.BuyerNotCleared.selector);
        esc.acceptAndPay(INVOICE_ID, sig, buyer);
    }

    function test_StrictMode_FreshPass_Accepts() public {
        esc.setCounterparty(reg, true);
        vm.prank(operator);
        reg.cacheDecision(buyer, keccak256("bundle"), 1 hours, true);

        vm.prank(buyer);
        esc.acceptAndPay(INVOICE_ID, _sig(), buyer);
        assertEq(usdc.balanceOf(address(esc)), AMOUNT);
    }
}
