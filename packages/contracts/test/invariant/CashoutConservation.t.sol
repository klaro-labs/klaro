// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import { Test, StdInvariant } from "forge-std/Test.sol";
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { CashoutOrderProcessor } from "../../src/CashoutOrderProcessor.sol";
import { ProofRegistry } from "../../src/ProofRegistry.sol";
import { LPStaking } from "../../src/LPStaking.sol";
import { LPRegistry } from "../../src/LPRegistry.sol";
import { KlaroConfig } from "../../src/KlaroConfig.sol";

/// Foundry-native invariants for THREAT_MODEL I2 (CashoutOrderProcessor):
///  A. CONSERVATION — the escrow holds EXACTLY the sum of still-locked orders.
///     Every wei that enters via requestAndLock either stays escrowed (LOCKED/
///     CLAIMED/PROOF_SUBMITTED) or fully leaves on a terminal transition
///     (release → LP+fee == amount; cancel → vendor == amount). The contract can
///     never accrue dust or mint value.
///  B. NO-DOUBLE-RELEASE — once an order is RELEASED, operatorConfirmReceived on
///     it again MUST revert. A second release would double-pay the LP.
///
/// Replaces the unwired Echidna `cashout_no_double_release` stub with live forge
/// coverage. The happy/cancel paths need no LPStaking.register (no EIP-712), so
/// the handler can drive the whole lifecycle directly as operator+vendor.

contract MockToken is ERC20 {
    constructor() ERC20("Mock USDC", "USDC") { }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amt) external {
        _mint(to, amt);
    }
}

contract CashoutHandler is Test {
    CashoutOrderProcessor public immutable cop;
    MockToken public immutable usdc;
    ProofRegistry public immutable proofs;

    bytes32 public constant LP_ID = keccak256("inv.lp");
    address public constant LP_WALLET = address(0xBEEF11);
    address public constant FEE_RECEIVER = address(0xFEE222);
    bytes32 public constant CORRIDOR = keccak256("INR");

    // ghost: USDC that SHOULD still be escrowed (sum of live orders).
    uint256 public outstanding;
    bool public doubleReleaseViolation;

    // pending orders by stage: 1 = LOCKED (cancellable), 2 = PROOF_SUBMITTED (releasable).
    struct P {
        bytes32 id;
        uint256 amount;
        uint8 stage;
    }
    P[] public pend;
    uint256 private nonce;

    constructor(CashoutOrderProcessor c, MockToken t, ProofRegistry p) {
        cop = c;
        usdc = t;
        proofs = p;
    }

    function _newId() internal returns (bytes32) {
        nonce++;
        return keccak256(abi.encode("inv.cashout", nonce));
    }

    // Lock a fresh order (stays LOCKED). Escrow grows by `amount`.
    function openLocked(uint256 amountSeed, uint256 feeSeed) external {
        uint256 amount = bound(amountSeed, 1, 1e12);
        uint256 fee = bound(feeSeed, 0, amount - 1);
        bytes32 id = _newId();
        usdc.mint(address(this), amount);
        usdc.approve(address(cop), amount);
        cop.requestAndLock(
            id,
            amount,
            fee,
            amount * 80,
            CORRIDOR,
            uint64(block.timestamp + 1 hours),
            keccak256("q")
        );
        outstanding += amount;
        pend.push(P({ id: id, amount: amount, stage: 1 }));
    }

    function _find(uint256 idxSeed, uint8 stage) internal view returns (int256) {
        if (pend.length == 0) return -1;
        uint256 start = bound(idxSeed, 0, pend.length - 1);
        for (uint256 k = 0; k < pend.length; k++) {
            uint256 i = (start + k) % pend.length;
            if (pend[i].stage == stage) return int256(i);
        }
        return -1;
    }

    function _remove(uint256 i) internal {
        pend[i] = pend[pend.length - 1];
        pend.pop();
    }

    // LOCKED -> CLAIMED -> PROOF_SUBMITTED (escrow unchanged; now releasable).
    function advanceToProof(uint256 idxSeed) external {
        int256 si = _find(idxSeed, 1);
        if (si < 0) return;
        uint256 i = uint256(si);
        bytes32 id = pend[i].id;
        cop.claimByLP(id, LP_ID);
        cop.recordProof(
            id,
            ProofRegistry.Proof({
                cashoutId: id,
                lpId: LP_ID,
                vendorId: keccak256("inv.vendor"),
                inrAmount: pend[i].amount * 80,
                usdcAmount: pend[i].amount,
                utrReferenceHash: keccak256("utr"),
                screenshotHash: keccak256("ss"),
                submittedAt: 0,
                lpSignatureHash: keccak256("lp"),
                verifierSignatureHash: keccak256("v")
            })
        );
        pend[i].stage = 2;
    }

    // PROOF_SUBMITTED -> RELEASED. Escrow shrinks by `amount`. Then assert a
    // SECOND release reverts (no-double-release).
    function release(uint256 idxSeed) external {
        int256 si = _find(idxSeed, 2);
        if (si < 0) return;
        uint256 i = uint256(si);
        bytes32 id = pend[i].id;
        uint256 amount = pend[i].amount;
        cop.operatorConfirmReceived(id, address(this));
        outstanding -= amount;
        // B: a re-release MUST revert. If it somehow succeeds, the LP is double-paid.
        try cop.operatorConfirmReceived(id, address(this)) {
            doubleReleaseViolation = true;
        } catch { /* expected */ }
        _remove(i);
    }

    // LOCKED -> CANCELLED (vendor == this). Escrow shrinks by `amount`.
    function cancelLocked(uint256 idxSeed) external {
        int256 si = _find(idxSeed, 1);
        if (si < 0) return;
        uint256 i = uint256(si);
        cop.cancel(pend[i].id);
        outstanding -= pend[i].amount;
        _remove(i);
    }
}

contract CashoutConservationInvariant is StdInvariant, Test {
    CashoutOrderProcessor cop;
    MockToken usdc;
    ProofRegistry proofs;
    LPStaking staking;
    LPRegistry registry;
    CashoutHandler handler;

    function setUp() public {
        vm.chainId(KlaroConfig.ARC_TESTNET_CHAIN_ID);
        address operatorAndVendor; // = handler (set after deploy)
        usdc = new MockToken();
        proofs = new ProofRegistry(address(this));
        staking = new LPStaking(address(usdc), address(this));
        registry = new LPRegistry(address(this));
        // Deploy COP with a placeholder operator, then hand operator to the
        // handler so it can drive vendor + operator legs from one address.
        cop = new CashoutOrderProcessor(
            address(usdc), proofs, staking, registry, address(this), handler_feeReceiver()
        );
        handler = new CashoutHandler(cop, usdc, proofs);
        operatorAndVendor = address(handler);

        // Wire: ProofRegistry operator = COP (recordProof), COP operator = handler.
        proofs.setOperator(address(cop));
        cop.setOperator(operatorAndVendor);
        // Admit the LP the handler claims for (no LPStaking.register needed for
        // the release path — that EIP-712 leg is only used by SLASH_LP).
        registry.registerLP(
            handler.LP_ID(), handler.LP_WALLET(), 2, keccak256("kyb"), keccak256("payout")
        );
        registry.admit(handler.LP_ID());

        targetContract(address(handler));
    }

    function handler_feeReceiver() internal pure returns (address) {
        return address(0xFEE222); // must match CashoutHandler.FEE_RECEIVER
    }

    /// A: escrow holds exactly the sum of still-locked orders (no dust, no mint).
    /// B: no order was ever released twice.
    function invariant_cashoutConservesAndNoDoubleRelease() public view {
        assertEq(
            usdc.balanceOf(address(cop)),
            handler.outstanding(),
            "COP escrow != sum of outstanding locked orders (conservation broken)"
        );
        assertEq(handler.doubleReleaseViolation(), false, "an order was released twice");
    }
}
