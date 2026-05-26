// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import { Test } from "forge-std/Test.sol";
import { RoutePolicyEngine } from "../src/RoutePolicyEngine.sol";
import { ReasonCodes } from "../src/lib/ReasonCodes.sol";
import { KlaroConfig } from "../src/KlaroConfig.sol";

contract RoutePolicyEngineTest is Test {
    RoutePolicyEngine engine;
    address operator = address(0xA11CE);
    address rando = address(0xBEEF);

    bytes32 constant INR = keccak256("INR");
    bytes32 constant BRL = keccak256("BRL");

    function setUp() public {
        vm.chainId(KlaroConfig.ARC_TESTNET_CHAIN_ID);
        engine = new RoutePolicyEngine(operator);
    }

    function test_DefaultPolicyBlocks() public {
        vm.expectRevert(
            abi.encodeWithSelector(RoutePolicyEngine.CorridorDisabled.selector, INR, bytes32(0))
        );
        engine.checkRoute(INR, 50_000_000, true);
    }

    function test_OperatorEnablesCorridor() public {
        vm.prank(operator);
        engine.setPolicy(INR, true, 100_000_000, false); // $100 cap
        engine.checkRoute(INR, 50_000_000, false); // $50 passes
    }

    function test_NonOperatorCannotSetPolicy() public {
        vm.prank(rando);
        vm.expectRevert(RoutePolicyEngine.NotOperator.selector);
        engine.setPolicy(INR, true, 0, false);
    }

    function test_AmountOverCapReverts() public {
        vm.prank(operator);
        engine.setPolicy(INR, true, 100_000_000, false);
        vm.expectRevert(
            abi.encodeWithSelector(
                RoutePolicyEngine.AmountOverCap.selector, INR, 200_000_000, 100_000_000
            )
        );
        engine.checkRoute(INR, 200_000_000, true);
    }

    function test_ZeroCapMeansUnlimited() public {
        vm.prank(operator);
        engine.setPolicy(INR, true, 0, false);
        engine.checkRoute(INR, type(uint256).max, false);
    }

    function test_RequiresScreeningWhenFlagSet() public {
        vm.prank(operator);
        engine.setPolicy(INR, true, 0, true);
        vm.expectRevert(abi.encodeWithSelector(RoutePolicyEngine.ScreeningRequired.selector, INR));
        engine.checkRoute(INR, 50_000_000, false);
        engine.checkRoute(INR, 50_000_000, true); // passes
    }

    function test_PauseAndResume() public {
        vm.prank(operator);
        engine.setPolicy(INR, true, 0, false);
        engine.checkRoute(INR, 1, false);

        vm.prank(operator);
        engine.pauseCorridor(INR, ReasonCodes.PAUSE_PARTNER_OUTAGE);
        vm.expectRevert(
            abi.encodeWithSelector(
                RoutePolicyEngine.CorridorDisabled.selector, INR, ReasonCodes.PAUSE_PARTNER_OUTAGE
            )
        );
        engine.checkRoute(INR, 1, false);

        vm.prank(operator);
        engine.resumeCorridor(INR);
        engine.checkRoute(INR, 1, false);
    }

    function test_PauseRejectsUnknownReason() public {
        vm.prank(operator);
        engine.setPolicy(INR, true, 0, false);

        bytes32 fake = keccak256("klaro.reason.BOGUS");
        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(ReasonCodes.UnknownReason.selector, fake));
        engine.pauseCorridor(INR, fake);
    }

    function test_CorridorsAreIndependent() public {
        vm.startPrank(operator);
        engine.setPolicy(INR, true, 100_000_000, false);
        engine.setPolicy(BRL, false, 0, false);
        vm.stopPrank();

        engine.checkRoute(INR, 50_000_000, false);
        vm.expectRevert(
            abi.encodeWithSelector(RoutePolicyEngine.CorridorDisabled.selector, BRL, bytes32(0))
        );
        engine.checkRoute(BRL, 50_000_000, true);
    }

    function test_GetPolicyReturnsFullStruct() public {
        vm.prank(operator);
        engine.setPolicy(INR, true, 500_000_000, true);
        RoutePolicyEngine.Policy memory p = engine.getPolicy(INR);
        assertTrue(p.enabled);
        assertEq(p.maxPerOrderUsdc, 500_000_000);
        assertTrue(p.requiresScreening);
    }

    // regression: resumeCorridor + pauseCorridor must
    // reject a corridor that was never configured via setPolicy. Before
    // the fix, `resumeCorridor(<typo>)` flipped enabled=true on a
    // never-touched key whose default policy (`maxPerOrderUsdc=0
    // (= no cap), requiresScreening=false`) silently opened an
    // unlimited unscreened path.
    bytes32 constant NEW_CORRIDOR = keccak256("NEVER_CONFIGURED");

    function test_ResumeUnconfiguredCorridor_Reverts() public {
        vm.prank(operator);
        vm.expectRevert(
            abi.encodeWithSelector(RoutePolicyEngine.CorridorNotConfigured.selector, NEW_CORRIDOR)
        );
        engine.resumeCorridor(NEW_CORRIDOR);
    }

    function test_PauseUnconfiguredCorridor_Reverts() public {
        vm.prank(operator);
        vm.expectRevert(
            abi.encodeWithSelector(RoutePolicyEngine.CorridorNotConfigured.selector, NEW_CORRIDOR)
        );
        engine.pauseCorridor(NEW_CORRIDOR, ReasonCodes.PAUSE_PARTNER_OUTAGE);
    }

    function test_ConfiguredFlagSetByPolicy() public {
        assertFalse(engine.configured(INR));
        vm.prank(operator);
        engine.setPolicy(INR, true, 0, false);
        assertTrue(engine.configured(INR));
        // Once configured, pause + resume work as before.
        vm.prank(operator);
        engine.pauseCorridor(INR, ReasonCodes.PAUSE_PARTNER_OUTAGE);
        vm.prank(operator);
        engine.resumeCorridor(INR);
    }
}
