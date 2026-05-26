// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import { Test } from "forge-std/Test.sol";
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { InvoiceEscrow } from "../src/InvoiceEscrow.sol";
import { FeeSplitter } from "../src/FeeSplitter.sol";
import { KlaroConfig } from "../src/KlaroConfig.sol";

/// @notice P1 (#91): reentrancy harness.
/// A malicious token whose transferFrom calls back into the escrow
/// must not be able to drain it. ReentrancyGuard should block the
/// re-entrant call to acceptAndPay / settle / refund.
contract HostileToken is ERC20 {
    InvoiceEscrow public target;
    bytes32 public reentryInvoiceId;
    bytes public reentryArgs;
    bool public armed;

    constructor() ERC20("Hostile", "EVIL") { }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amt) external {
        _mint(to, amt);
    }

    function arm(InvoiceEscrow t, bytes32 id, bytes calldata sig, address buyer) external {
        target = t;
        reentryInvoiceId = id;
        reentryArgs = abi.encodeWithSelector(InvoiceEscrow.acceptAndPay.selector, id, sig, buyer);
        armed = true;
    }

    function transferFrom(address from, address to, uint256 amt) public override returns (bool) {
        if (armed) {
            armed = false; // single re-entry attempt
            (bool ok,) = address(target).call(reentryArgs);
            // The re-entrant call MUST revert (nonReentrant). Bubble the result
            // up so the outer test sees how the guard reacted.
            require(!ok, "reentry should have reverted");
        }
        return super.transferFrom(from, to, amt);
    }
}

contract InvoiceEscrowReentrancyTest is Test {
    InvoiceEscrow esc;
    FeeSplitter splitter;
    HostileToken hostile;

    uint256 vendorPk = 0xA11CE;
    address vendor;
    uint256 buyerPk = 0xB0B;
    address buyer;
    address operator = address(0xCAFE);

    bytes32 constant ID = keccak256("inv-reentry");
    uint256 constant AMOUNT = 100_000_000;

    function setUp() public {
        vm.chainId(KlaroConfig.ARC_TESTNET_CHAIN_ID);
        vendor = vm.addr(vendorPk);
        buyer = vm.addr(buyerPk);

        splitter = new FeeSplitter(operator);
        esc = new InvoiceEscrow(operator, splitter);
        hostile = new HostileToken();

        // setTrustedCaller owner-only.
        splitter.setTrustedCaller(address(esc), true);

        // Vendor creates the invoice with the hostile token. Hostile token
        // is funded on the buyer side; buyer approves the escrow.
        vm.prank(vendor);
        esc.createInvoice(
            ID, address(hostile), AMOUNT, uint64(block.timestamp + 7 days), keccak256("meta")
        );

        hostile.mint(buyer, AMOUNT * 2);
        vm.prank(buyer);
        hostile.approve(address(esc), type(uint256).max);
    }

    function test_AcceptAndPay_BlocksReentrantCall() public {
        // Buyer signs the EIP-712 acceptance.
        bytes32 typeHash = esc.ACCEPTANCE_TYPEHASH();
        bytes32 structHash = keccak256(
            abi.encode(
                typeHash,
                ID,
                vendor,
                address(hostile),
                AMOUNT,
                uint64(block.timestamp + 7 days),
                keccak256("meta"),
                bytes32(0)
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", esc.domainSeparator(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(buyerPk, digest);
        bytes memory sig = abi.encodePacked(r, s, v);

        // Arm the hostile token to re-enter acceptAndPay mid-transfer.
        hostile.arm(esc, ID, sig, buyer);

        // First call: the outer acceptAndPay runs. transferFrom fires, hostile
        // calls back, ReentrancyGuard reverts the inner call, hostile asserts
        // `require(!ok)`, returns true, outer succeeds.
        vm.prank(buyer);
        esc.acceptAndPay(ID, sig, buyer);

        // Escrow balance should be exactly AMOUNT — not 2x AMOUNT (re-entry drain).
        assertEq(hostile.balanceOf(address(esc)), AMOUNT, "escrow balance must equal one payment");
    }
}
