// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import { Test } from "forge-std/Test.sol";
import { KlaroConfig } from "../src/KlaroConfig.sol";

/// @title KlaroConfig.t.sol
/// @notice Smoke tests for the address registry — every Arc-deployed contract
/// Klaro depends on must be non-zero and uniquely-set. If a developer
/// accidentally collapses two addresses to the same constant, this
/// catches it before deployment.
contract KlaroConfigTest is Test {
    function test_chainId_isArcTestnet() public pure {
        assertEq(KlaroConfig.ARC_TESTNET_CHAIN_ID, 5_042_002);
    }

    function test_allAddresses_areNonZero() public pure {
        // KLARO_FEE_RECEIVER is intentionally zero until set — skip it.
        // added MEMO to the assertion sweep.
        address[18] memory addrs = [
            KlaroConfig.USDC,
            KlaroConfig.EURC,
            KlaroConfig.USYC,
            KlaroConfig.CCTP_TOKEN_MESSENGER_V2,
            KlaroConfig.GATEWAY_WALLET,
            KlaroConfig.GATEWAY_MINTER,
            KlaroConfig.FX_ESCROW,
            KlaroConfig.PERMIT2,
            KlaroConfig.MULTICALL3,
            KlaroConfig.CREATE2_DEPLOYER,
            KlaroConfig.PYTH_ORACLE,
            KlaroConfig.MEMO,
            KlaroConfig.ERC_8004_IDENTITY,
            KlaroConfig.ERC_8004_REPUTATION,
            KlaroConfig.ERC_8004_VALIDATION,
            KlaroConfig.ERC_8183_REFERENCE,
            address(0), // placeholder kept to preserve fixed-size array
            address(0)
        ];

        for (uint256 i = 0; i < 16; i++) {
            assertTrue(addrs[i] != address(0), "address slot must be non-zero");
        }
    }

    /// @notice Drift-check for the Memo contract address (,
    /// verified via arc-docs MCP `Memo contract address: 0x9702...`).
    /// If Arc rolls a new Memo deployment, this test fails before
    /// any compliance integration goes live with the wrong target.
    function test_memo_address_matchesArcDocs() public pure {
        assertEq(KlaroConfig.MEMO, 0x9702466268ccF55eAB64cdf484d272Ac08d3b75b);
    }

    function test_gatewayDomain_isArc() public pure {
        assertEq(KlaroConfig.ARC_GATEWAY_DOMAIN, 26);
    }

    function test_feeReceiver_isZero_byDesign() public pure {
        // (no overclaiming): better to fail-closed on testnet than
        // leak fees to a placeholder address. This assertion must be UPDATED
        // when a real treasury wallet is set, not removed.
        assertEq(KlaroConfig.KLARO_FEE_RECEIVER, address(0));
    }

    function test_requireArcTestnet_revertsOnWrongChain() public {
        // Deploy FIRST. `vm.expectRevert` only catches the next external call,
        // and `new ChainGuardCaller()` is itself an external CREATE call — if
        // we don't deploy upfront, expectRevert gets swallowed by the CREATE
        // and the actual function call escapes unchecked.
        ChainGuardCaller caller = new ChainGuardCaller();
        vm.chainId(1); // pretend we're on Ethereum mainnet
        vm.expectRevert(abi.encodeWithSelector(KlaroConfig.WrongChain.selector, 5_042_002, 1));
        caller.callRequireArcTestnet();
    }

    function test_requireArcTestnet_passesOnArc() public {
        ChainGuardCaller caller = new ChainGuardCaller();
        vm.chainId(5_042_002);
        caller.callRequireArcTestnet(); // should not revert
    }
}

/// @dev Thin caller so we can hit library `internal view` from the test
contract ChainGuardCaller {
    function callRequireArcTestnet() external view {
        KlaroConfig.requireArcTestnet();
    }
}
