// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import { Test } from "forge-std/Test.sol";
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { Pausable } from "@openzeppelin/contracts/utils/Pausable.sol";

import { CashoutOrderProcessor } from "../src/CashoutOrderProcessor.sol";
import { ProofRegistry } from "../src/ProofRegistry.sol";
import { LPStaking } from "../src/LPStaking.sol";
import { LPRegistry } from "../src/LPRegistry.sol";

/// @notice Regression for loop — `openDispute` and `cancel` were
/// missing `whenNotPaused`. During emergency pause, a vendor
/// could still flip an order to DISPUTED (locking it
/// indefinitely while the operator scrambles) or `cancel` to
/// drain escrow back to themselves. /64 patched
/// `confirmReceived`; these two were missed.

contract MockUSDC is ERC20 {
    constructor() ERC20("Mock USDC", "USDC") { }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amt) external {
        _mint(to, amt);
    }
}

contract CashoutOrderProcessorPauseGuardsTest is Test {
    CashoutOrderProcessor proc;
    ProofRegistry proofs;
    LPStaking staking;
    LPRegistry registry;
    MockUSDC usdc;

    address vendor = address(0xA1);
    address lpWallet = address(0xA2);
    address operator;

    bytes32 constant CO_ID = keccak256("co-pause-1");
    bytes32 constant LP_ID = keccak256("lp-pause-1");
    bytes32 constant CORRIDOR = keccak256("INR");
    uint256 constant USDC_AMT = 2_400_000_000;
    uint256 constant INR_AMT = 20_136_000;

    // register requires an EIP-712 op-signed auth.
    address signingOperator;
    uint256 signingOperatorPk;

    function setUp() public {
        vm.chainId(5_042_002);
        operator = address(this);
        (signingOperator, signingOperatorPk) = makeAddrAndKey("staking-signing-operator");

        usdc = new MockUSDC();
        proofs = new ProofRegistry(operator);
        staking = new LPStaking(address(usdc), signingOperator);
        registry = new LPRegistry(operator);
        proc =
            new CashoutOrderProcessor(address(usdc), proofs, staking, registry, operator, operator);
        proofs.setOperator(address(proc));

        usdc.mint(vendor, USDC_AMT * 10);
        usdc.mint(lpWallet, 5_000_000_000);
        vm.prank(vendor);
        usdc.approve(address(proc), type(uint256).max);
        vm.prank(lpWallet);
        usdc.approve(address(staking), type(uint256).max);

        // Register LP + transfer staking operator to proc so slash works.
        _registerStaked(LP_ID, lpWallet, 500_000_000);
        staking.setSlasher(address(proc));
        registry.registerLP(LP_ID, lpWallet, 2, keccak256("kyb"), keccak256("payout"));
        registry.admit(LP_ID);
    }

    function _registerStaked(bytes32 lpId, address wallet, uint256 amount) internal {
        uint64 deadline = uint64(block.timestamp + 10 minutes);
        uint256 nonce = staking.registerNonce(lpId);
        bytes32 structHash =
            keccak256(abi.encode(staking.REGISTER_TYPEHASH(), lpId, wallet, deadline, nonce));
        bytes32 digest = keccak256(
            abi.encodePacked("\x19\x01", staking.registrationDomainSeparator(), structHash)
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signingOperatorPk, digest);
        bytes memory auth = abi.encodePacked(r, s, v);
        vm.prank(wallet);
        staking.register(lpId, wallet, amount, deadline, auth);
    }

    function _lockedOrder() internal {
        vm.prank(vendor);
        proc.requestAndLock(
            CO_ID,
            USDC_AMT,
            0,
            INR_AMT,
            CORRIDOR,
            uint64(block.timestamp + 5 minutes),
            keccak256("q")
        );
    }

    function test_Pause_BlocksCancel() public {
        _lockedOrder();
        proc.pause();
        vm.prank(vendor);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        proc.cancel(CO_ID);
    }

    function test_Pause_BlocksOpenDispute() public {
        _lockedOrder();
        vm.prank(operator);
        proc.claimByLP(CO_ID, LP_ID);

        proc.pause();
        vm.prank(vendor);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        proc.openDispute(CO_ID, keccak256("ev"));
    }

    // regression: operator-only state-machine functions
    // must respect the pause too. Previously claimByLP / recordProof
    // could walk LOCKED → CLAIMED → PROOF_SUBMITTED during an
    // emergency pause, then the moment owner unpauses a vendor's
    // confirmReceived settles without operator review.
    function test_Pause_BlocksClaimByLP() public {
        _lockedOrder();
        proc.pause();
        vm.prank(operator);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        proc.claimByLP(CO_ID, LP_ID);
    }

    function test_Pause_BlocksRecordProof() public {
        _lockedOrder();
        vm.prank(operator);
        proc.claimByLP(CO_ID, LP_ID);
        proc.pause();
        ProofRegistry.Proof memory p = ProofRegistry.Proof({
            cashoutId: CO_ID,
            lpId: LP_ID,
            vendorId: keccak256("vendor"),
            inrAmount: INR_AMT,
            usdcAmount: USDC_AMT,
            utrReferenceHash: keccak256("utr"),
            screenshotHash: keccak256("ss"),
            submittedAt: 0,
            lpSignatureHash: keccak256("lp"),
            verifierSignatureHash: keccak256("v")
        });
        vm.prank(operator);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        proc.recordProof(CO_ID, p);
    }
}
