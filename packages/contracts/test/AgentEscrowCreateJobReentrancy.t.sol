// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import { Test } from "forge-std/Test.sol";
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import { AgentEscrow } from "../src/AgentEscrow.sol";
import { AgentRegistry } from "../src/AgentRegistry.sol";
import { IACPHook } from "../src/IACPHook.sol";
import { KlaroConfig } from "../src/KlaroConfig.sol";

/// @notice Regression for loop fix: AgentEscrow.createJob was
/// missing `nonReentrant` AND called the user-supplied IACPHook
/// BEFORE writing the Job struct. A hostile hook re-entering
/// createJob with the same jobId would pass the AlreadyExists
/// check (status still NONE) and either spawn duplicate JobCreated
/// events or overwrite the struct with attacker-chosen params.
/// Now: storage write happens before the hook call (CEI), and
/// ReentrancyGuard is the second layer.

contract MockUSDC is ERC20 {
    constructor() ERC20("Mock USDC", "USDC") { }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amt) external {
        _mint(to, amt);
    }
}

contract HostileHook is IACPHook {
    AgentEscrow public target;
    bytes32 public reentryJobId;
    bytes32 public reentryAgentId;
    address public reentryAgent;
    uint256 public reentryAmount;
    bool public reentryAttempted;
    bytes public reentryRevertData;

    constructor(AgentEscrow t) {
        target = t;
    }

    function arm(bytes32 jobId, bytes32 agentId, address agent, uint256 amount) external {
        reentryJobId = jobId;
        reentryAgentId = agentId;
        reentryAgent = agent;
        reentryAmount = amount;
    }

    function beforeAction(bytes4, bytes32, address, address, uint256) external {
        if (reentryJobId == bytes32(0)) return;
        reentryAttempted = true;
        // Try to re-enter createJob with the SAME jobId. Must revert
        // (either via nonReentrant or AlreadyExists if effects-first
        // wrote the struct already).
        try target.createJob(
            reentryJobId, reentryAgentId, reentryAgent, reentryAmount, IACPHook(address(this))
        ) {
            revert("reentry succeeded - fix broken");
        } catch (bytes memory data) {
            reentryRevertData = data;
        }
    }

    function afterAction(bytes4, bytes32, address, address, uint256) external pure { }
}

contract AgentEscrowCreateJobReentrancyTest is Test {
    AgentEscrow esc;
    AgentRegistry reg;
    MockUSDC usdc;

    // keyed operator for AgentRegistry signed auth.
    address operator;
    uint256 operatorPk;
    address principal = address(0xB2);
    address agentOwner = address(0xC3);
    address agentWallet = address(0xC4);
    address feeReceiver = address(0xFE);

    bytes32 constant AID = keccak256("agent.test");
    bytes32 constant JID = keccak256("job-reentry");
    uint256 constant AMOUNT = 1_000_000_000;

    function setUp() public {
        vm.chainId(KlaroConfig.ARC_TESTNET_CHAIN_ID);
        (operator, operatorPk) = makeAddrAndKey("ae-reentry-operator");
        reg = new AgentRegistry(operator);
        usdc = new MockUSDC();
        esc = new AgentEscrow(address(usdc), reg, feeReceiver, operator);

        uint64 deadline = uint64(block.timestamp + 10 minutes);
        uint256 nonce = reg.registerNonce(AID);
        bytes32 structHash =
            keccak256(abi.encode(reg.REGISTER_TYPEHASH(), AID, agentOwner, deadline, nonce));
        bytes32 digest =
            keccak256(abi.encodePacked("\x19\x01", reg.registrationDomainSeparator(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(operatorPk, digest);
        bytes memory auth = abi.encodePacked(r, s, v);
        vm.prank(agentOwner);
        reg.registerAgent(AID, agentOwner, "Aki", "https://aki.dev/pricing", 500, deadline, auth);

        usdc.mint(principal, AMOUNT * 10);
        vm.prank(principal);
        usdc.approve(address(esc), type(uint256).max);
    }

    function test_HostileHookReentryDoesNotSucceed() public {
        HostileHook hostile = new HostileHook(esc);
        hostile.arm(JID, AID, agentWallet, AMOUNT);

        vm.prank(principal);
        esc.createJob(JID, AID, agentWallet, AMOUNT, IACPHook(address(hostile)));

        // Exactly one job exists at JID; principal is set; not overwritten.
        AgentEscrow.Job memory j = esc.getJob(JID);
        assertEq(j.principal, principal);
        assertEq(j.amountUsdc, AMOUNT);

        // The hook DID attempt re-entry (the catch block ran).
        assertTrue(hostile.reentryAttempted());
        // And the re-entry was rejected — revertData non-empty.
        bytes memory rd = hostile.reentryRevertData();
        assertGt(rd.length, 0);
    }
}
