// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import { Test } from "forge-std/Test.sol";

import { MultiChainRouter } from "../src/MultiChainRouter.sol";
import { RoutePolicyEngine } from "../src/RoutePolicyEngine.sol";
import { KlaroConfig } from "../src/KlaroConfig.sol";

contract MultiChainRouterBridgeTest is Test {
    MultiChainRouter router;
    RoutePolicyEngine policy;
    address operator = address(0xCAFE);
    address requester = address(0xB0B);
    bytes32 constant CORRIDOR = keccak256("USDC.BASE.ARC");
    bytes32 constant INVOICE_ID = keccak256("inv-bridge-1");

    function setUp() public {
        vm.chainId(KlaroConfig.ARC_TESTNET_CHAIN_ID);
        policy = new RoutePolicyEngine(operator);
        router = new MultiChainRouter(policy, operator);
        // Allow the corridor with a high cap so the policy gate doesn't fail.
        vm.prank(operator);
        policy.setPolicy(
            CORRIDOR,
            /*enabled=*/
            true,
            1_000_000_000_000,
            /*requiresScreening=*/
            false
        );
    }

    function test_InitiateBridge_BaseSepolia_EmitsFast() public {
        // initiateBridge is operator-only.
        // now takes explicit mintRecipient so the
        // BridgeInitiated event carries the recipient the daemon needs
        // for the CCTP burn (was previously side-looked-up).
        uint256 amount = 100 * 10 ** 6;
        vm.recordLogs();
        vm.prank(operator);
        MultiChainRouter.RouteKind kind = router.initiateBridge(
            INVOICE_ID, CORRIDOR, 84_532, KlaroConfig.ARC_TESTNET_CHAIN_ID, amount, requester
        );
        assertEq(uint8(kind), uint8(MultiChainRouter.RouteKind.CCTP_V2_FAST));
    }

    function test_InitiateBridge_SameChain_Reverts() public {
        vm.prank(operator);
        MultiChainRouter.RouteKind kind = router.initiateBridge(
            INVOICE_ID,
            CORRIDOR,
            KlaroConfig.ARC_TESTNET_CHAIN_ID,
            KlaroConfig.ARC_TESTNET_CHAIN_ID,
            100 * 10 ** 6,
            requester
        );
        assertEq(uint8(kind), uint8(MultiChainRouter.RouteKind.SAME_CHAIN));
    }

    function test_InitiateBridge_UnsupportedSource_Reverts() public {
        vm.prank(operator);
        vm.expectRevert(
            abi.encodeWithSelector(MultiChainRouter.UnsupportedSource.selector, uint256(999))
        );
        router.initiateBridge(
            INVOICE_ID, CORRIDOR, 999, KlaroConfig.ARC_TESTNET_CHAIN_ID, 100 * 10 ** 6, requester
        );
    }

    /// @notice regression: caller-supplied screeningPassed bypass
    /// is closed — non-operator caller is rejected outright.
    function test_InitiateBridge_NonOperator_Reverts() public {
        vm.prank(requester);
        vm.expectRevert(MultiChainRouter.NotOperator.selector);
        router.initiateBridge(
            INVOICE_ID, CORRIDOR, 84_532, KlaroConfig.ARC_TESTNET_CHAIN_ID, 100 * 10 ** 6, requester
        );
    }
}
