// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import { Test, StdInvariant } from "forge-std/Test.sol";
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { InvoiceEscrow } from "../../src/InvoiceEscrow.sol";
import { FeeSplitter } from "../../src/FeeSplitter.sol";
import { KlaroConfig } from "../../src/KlaroConfig.sol";

/// Foundry-native invariant for THREAT_MODEL I1 (InvoiceEscrow conservation):
/// the escrow holds EXACTLY the sum of PAID-but-not-yet-settled/refunded invoice
/// amounts. Buyer USDC enters via acceptAndPay (CREATED→PAID) and leaves in full
/// on settle (→ vendor) or refund (→ buyer). No path can leave dust escrowed or
/// release more than was paid. Replaces the unwired Echidna escrow_conservation
/// stub with live forge coverage. Sole-vendor path (splitsHash==0) keeps the
/// handler self-contained (no FeeSplitter trusted-caller wiring needed).

contract MockUSDC is ERC20 {
    constructor() ERC20("Mock USDC", "USDC") { }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amt) external {
        _mint(to, amt);
    }
}

contract InvoiceHandler is Test {
    InvoiceEscrow public immutable escrow;
    MockUSDC public immutable usdc;
    uint256 public immutable buyerPk;
    address public immutable buyer;

    uint64 constant DUE_AT = 2_500_000_000;
    bytes32 constant META = keccak256("inv.inv.metadata");

    uint256 public outstanding; // USDC that should be escrowed (sum of PAID invoices)
    bytes32[] public paid; // PAID invoice ids not yet settled/refunded
    uint256 private nonce;

    constructor(InvoiceEscrow e, MockUSDC u, uint256 pk, address b) {
        escrow = e;
        usdc = u;
        buyerPk = pk;
        buyer = b;
    }

    function _sign(bytes32 id, uint256 amount) internal view returns (bytes memory) {
        bytes32 structHash = keccak256(
            abi.encode(
                escrow.ACCEPTANCE_TYPEHASH(),
                id,
                address(this), // vendor == handler
                address(usdc),
                amount,
                DUE_AT,
                META,
                bytes32(0) // splitsHash: sole-vendor path
            )
        );
        bytes32 digest =
            keccak256(abi.encodePacked("\x19\x01", escrow.domainSeparator(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(buyerPk, digest);
        return abi.encodePacked(r, s, v);
    }

    // CREATED -> PAID. Escrow grows by `amount`.
    function openAndPay(uint256 amountSeed) external {
        uint256 amount = bound(amountSeed, 1, 1e12);
        nonce++;
        bytes32 id = keccak256(abi.encode("inv.inv", nonce));
        escrow.createInvoice(id, address(usdc), amount, DUE_AT, META); // vendor = this
        usdc.mint(buyer, amount); // keep the buyer funded
        escrow.acceptAndPay(id, _sign(id, amount), buyer);
        outstanding += amount;
        paid.push(id);
    }

    function _take(uint256 idxSeed) internal returns (bytes32 id, uint256 amount, bool ok) {
        if (paid.length == 0) return (bytes32(0), 0, false);
        uint256 i = bound(idxSeed, 0, paid.length - 1);
        id = paid[i];
        amount = escrow.getInvoice(id).amount;
        paid[i] = paid[paid.length - 1];
        paid.pop();
        ok = true;
    }

    // PAID -> SETTLED (record screening first, as the contract requires). Escrow shrinks.
    function settle(uint256 idxSeed) external {
        (bytes32 id, uint256 amount, bool ok) = _take(idxSeed);
        if (!ok) return;
        escrow.recordScreening(id, keccak256("screen.ok")); // operator == this
        escrow.settle(id);
        outstanding -= amount;
    }

    // PAID -> REFUNDED (handler is the configured refundCaller). Escrow shrinks.
    function refund(uint256 idxSeed) external {
        (bytes32 id, uint256 amount, bool ok) = _take(idxSeed);
        if (!ok) return;
        escrow.refund(id); // msg.sender == refundCaller == this
        outstanding -= amount;
    }
}

contract InvoiceConservationInvariant is StdInvariant, Test {
    InvoiceEscrow escrow;
    FeeSplitter splitter;
    MockUSDC usdc;
    InvoiceHandler handler;

    uint256 constant BUYER_PK = 0xB0BB1E;

    function setUp() public {
        vm.chainId(KlaroConfig.ARC_TESTNET_CHAIN_ID);
        address buyer = vm.addr(BUYER_PK);
        splitter = new FeeSplitter(address(this));
        escrow = new InvoiceEscrow(address(this), splitter); // operator = this (then handed to handler)
        usdc = new MockUSDC();
        handler = new InvoiceHandler(escrow, usdc, BUYER_PK, buyer);

        // The handler drives vendor + operator + refundCaller legs from one address.
        escrow.setOperator(address(handler));
        escrow.setRefundCaller(address(handler));

        // Buyer pre-approves the escrow once; the handler tops up the buyer's
        // balance per acceptAndPay so funding never runs out.
        vm.prank(buyer);
        usdc.approve(address(escrow), type(uint256).max);

        targetContract(address(handler));
    }

    /// I1: escrow balance == sum of PAID-but-unsettled invoice amounts. No dust, no mint.
    function invariant_invoiceEscrowConservesValue() public view {
        assertEq(
            usdc.balanceOf(address(escrow)),
            handler.outstanding(),
            "InvoiceEscrow balance != sum of outstanding PAID invoices (conservation broken)"
        );
    }
}
