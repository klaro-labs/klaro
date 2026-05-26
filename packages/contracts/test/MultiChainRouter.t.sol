// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import { Test } from "forge-std/Test.sol";
import { MultiChainRouter } from "../src/MultiChainRouter.sol";
import { RoutePolicyEngine } from "../src/RoutePolicyEngine.sol";
import { KlaroConfig } from "../src/KlaroConfig.sol";

contract MultiChainRouterTest is Test {
    MultiChainRouter router;
    RoutePolicyEngine policy;

    address operator = address(0xA11CE);
    address rando = address(0xBEEF);
    bytes32 constant INR = keccak256("INR");

    function setUp() public {
        vm.chainId(KlaroConfig.ARC_TESTNET_CHAIN_ID);
        policy = new RoutePolicyEngine(operator);
        router = new MultiChainRouter(policy, operator);

        // Enable INR corridor uncapped, no screening required
        vm.prank(operator);
        policy.setPolicy(INR, true, 0, false);
    }

    function test_DecideSameChain() public view {
        assertEq(
            uint8(router.decide(KlaroConfig.ARC_TESTNET_CHAIN_ID, 100_000_000)),
            uint8(MultiChainRouter.RouteKind.SAME_CHAIN)
        );
    }

    function test_DecideCCTPFastUnderThreshold() public view {
        assertEq(
            uint8(router.decide(84_532, 5_000_000_000)), // 5,000 USDC, Base
            uint8(MultiChainRouter.RouteKind.CCTP_V2_FAST)
        );
    }

    function test_DecideCCTPStandardAboveThreshold() public view {
        assertEq(
            uint8(router.decide(84_532, 50_000_000_000)), // 50,000 USDC, Base
            uint8(MultiChainRouter.RouteKind.CCTP_V2_STANDARD)
        );
    }

    function test_DecideGatewayForNonEVM() public view {
        assertEq(
            uint8(router.decide(5, 1_000_000_000)), // Solana domain
            uint8(MultiChainRouter.RouteKind.GATEWAY)
        );
    }

    function test_DecideNoneForUnsupported() public view {
        assertEq(uint8(router.decide(9999, 1_000_000_000)), uint8(MultiChainRouter.RouteKind.NONE));
    }

    // caller-supplied `screeningPassed` bool dropped from
    // checkAndDecide signature (defect class /75 closed in
    // initiateBridge + StableFXAdapterRegistry.swap).

    function test_CheckAndDecide_RevertsWhenCorridorDisabled() public {
        bytes32 BRL = keccak256("BRL");
        vm.expectRevert(
            abi.encodeWithSelector(RoutePolicyEngine.CorridorDisabled.selector, BRL, bytes32(0))
        );
        router.checkAndDecide(84_532, 1_000_000_000, BRL);
    }

    function test_CheckAndDecide_RevertsWhenUnsupportedSource() public {
        vm.expectRevert(abi.encodeWithSelector(MultiChainRouter.UnsupportedSource.selector, 9999));
        router.checkAndDecide(9999, 1_000_000_000, INR);
    }

    function test_CheckAndDecide_HappyPath() public view {
        // INR corridor is enabled in setUp with requiresScreening=false, so
        // the view passes without operator attestation.
        MultiChainRouter.RouteKind k = router.checkAndDecide(84_532, 100_000_000, INR);
        assertEq(uint8(k), uint8(MultiChainRouter.RouteKind.CCTP_V2_FAST));
    }

    function test_RecordExecution_StampsAuditTrail() public {
        bytes32 routeId = keccak256("route-1");
        bytes32 sourceTx = keccak256("src-tx");
        bytes32 attest = keccak256("iris-attest");

        vm.prank(operator);
        router.recordExecution(
            routeId,
            MultiChainRouter.RouteKind.CCTP_V2_FAST,
            84_532,
            100_000_000,
            INR,
            sourceTx,
            attest
        );

        MultiChainRouter.Execution memory e = router.getExecution(routeId);
        assertEq(uint8(e.kind), uint8(MultiChainRouter.RouteKind.CCTP_V2_FAST));
        assertEq(e.sourceTxHash, sourceTx);
        assertEq(e.attestationHash, attest);
        assertEq(e.amountUsdc, 100_000_000);
    }

    function test_RecordExecution_RejectsReplay() public {
        bytes32 routeId = keccak256("route-1");
        vm.startPrank(operator);
        router.recordExecution(
            routeId,
            MultiChainRouter.RouteKind.CCTP_V2_FAST,
            84_532,
            100_000_000,
            INR,
            bytes32(0),
            bytes32(0)
        );
        vm.expectRevert(abi.encodeWithSelector(MultiChainRouter.AlreadyRecorded.selector, routeId));
        router.recordExecution(
            routeId,
            MultiChainRouter.RouteKind.CCTP_V2_FAST,
            84_532,
            100_000_000,
            INR,
            bytes32(0),
            bytes32(0)
        );
        vm.stopPrank();
    }

    function test_RecordExecution_NonOperatorReverts() public {
        vm.prank(rando);
        vm.expectRevert(MultiChainRouter.NotOperator.selector);
        router.recordExecution(
            bytes32(uint256(1)),
            MultiChainRouter.RouteKind.CCTP_V2_FAST,
            84_532,
            100,
            INR,
            bytes32(0),
            bytes32(0)
        );
    }

    function test_OperatorCanAddSourceChain() public {
        vm.prank(operator);
        router.setSourceChain(56, true, false); // BNB Chain
        assertEq(
            uint8(router.decide(56, 100_000_000)), uint8(MultiChainRouter.RouteKind.CCTP_V2_FAST)
        );
    }

    function test_OperatorCanFlipFastThreshold() public {
        // Lower the Fast threshold to 100 USDC — 1,000 USDC now routes Standard
        vm.prank(operator);
        router.setFastTierThreshold(100_000_000);
        assertEq(
            uint8(router.decide(84_532, 1_000_000_000)),
            uint8(MultiChainRouter.RouteKind.CCTP_V2_STANDARD)
        );
    }

    function test_DefaultsSeededOnDeploy() public view {
        // Mainnet chain ids must not appear in the constructor seed (Klaro is
        // testnet-only today). The operator adds them via setSourceChain when
        // mainnet routes ship.
        assertFalse(router.evmSourceSupported(1)); // Ethereum mainnet — no
        assertFalse(router.evmSourceSupported(8453)); // Base mainnet — no
        assertTrue(router.evmSourceSupported(84_532)); // Base Sepolia
        assertTrue(router.evmSourceSupported(11_155_111)); // Ethereum Sepolia
        assertTrue(router.evmSourceSupported(11_155_420)); // Optimism Sepolia
        assertTrue(router.evmSourceSupported(421_614)); // Arbitrum Sepolia
        assertTrue(router.gatewayOnlySource(5));
    }
}
