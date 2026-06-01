// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import { Test } from "forge-std/Test.sol";
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import { RetainerStream } from "../src/RetainerStream.sol";
import { AgentEscrow } from "../src/AgentEscrow.sol";
import { AgentRegistry } from "../src/AgentRegistry.sol";
import { NoopACPHook } from "../src/IACPHook.sol";
import { CashoutOrderProcessor } from "../src/CashoutOrderProcessor.sol";
import { ProofRegistry } from "../src/ProofRegistry.sol";
import { LPStaking } from "../src/LPStaking.sol";
import { LPRegistry } from "../src/LPRegistry.sol";
import { FeeSplitter } from "../src/FeeSplitter.sol";
import { KlaroConfig } from "../src/KlaroConfig.sol";

/// @notice Phase 4 (#104) — reentrancy harnesses for every money-flow contract
/// that holds USDC. Pattern is identical to InvoiceEscrowReentrancy:
/// deploy contract with a hostile token, arm the hostile token to
/// re-enter the same fund-moving function during `transferFrom` /
/// `transfer`, assert the inner call reverts (ReentrancyGuard) and
/// the outer call still settles cleanly with no double-spend.
contract HostileToken is ERC20 {
    address public target;
    bytes public reentryArgs;
    bool public armed;

    constructor() ERC20("Hostile", "EVIL") { }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amt) external {
        _mint(to, amt);
    }

    function arm(address t, bytes calldata args) external {
        target = t;
        reentryArgs = args;
        armed = true;
    }

    function _attempt() internal {
        if (!armed) return;
        armed = false;
        (bool ok,) = target.call(reentryArgs);
        require(!ok, "reentry should have reverted");
    }

    function transferFrom(address from, address to, uint256 amt) public override returns (bool) {
        _attempt();
        return super.transferFrom(from, to, amt);
    }

    function transfer(address to, uint256 amt) public override returns (bool) {
        _attempt();
        return super.transfer(to, amt);
    }
}

contract RetainerStreamReentrancyTest is Test {
    RetainerStream stream;
    HostileToken hostile;
    address payer = address(0xA1);
    address recipient = address(0xB2);
    address operator = address(0xCAFE);
    bytes32 constant ID = keccak256("stream-1");
    uint256 constant DEPOSIT = 100_000_000;

    function setUp() public {
        vm.chainId(KlaroConfig.ARC_TESTNET_CHAIN_ID);
        stream = new RetainerStream(operator);
        hostile = new HostileToken();
        hostile.mint(payer, DEPOSIT * 2);
        vm.prank(payer);
        hostile.approve(address(stream), type(uint256).max);
    }

    function test_CreateStream_BlocksReentrantCall() public {
        bytes memory args = abi.encodeWithSelector(
            RetainerStream.createStream.selector,
            ID,
            recipient,
            address(hostile),
            DEPOSIT,
            uint64(block.timestamp),
            uint64(block.timestamp + 30 days)
        );
        hostile.arm(address(stream), args);

        vm.prank(payer);
        stream.createStream(
            ID,
            recipient,
            address(hostile),
            DEPOSIT,
            uint64(block.timestamp),
            uint64(block.timestamp + 30 days)
        );

        assertEq(hostile.balanceOf(address(stream)), DEPOSIT, "single deposit only");
    }
}

contract AgentEscrowReentrancyTest is Test {
    AgentEscrow escrow;
    AgentRegistry registry;
    HostileToken hostile;

    NoopACPHook noop;
    address principal = address(0xA1);
    address agent = address(0xB2);
    // keyed operator for AgentRegistry signed auth.
    address operator;
    uint256 operatorPk;
    bytes32 constant AGENT_ID = keccak256("agent-1");
    bytes32 constant JOB_ID = keccak256("job-1");
    uint256 constant AMOUNT = 100_000_000;

    function setUp() public {
        vm.chainId(KlaroConfig.ARC_TESTNET_CHAIN_ID);
        (operator, operatorPk) = makeAddrAndKey("mf-reentry-operator");
        registry = new AgentRegistry(operator);
        hostile = new HostileToken();
        noop = new NoopACPHook();
        escrow = new AgentEscrow(address(hostile), registry, operator, operator);

        uint64 deadline = uint64(block.timestamp + 10 minutes);
        uint256 nonce = registry.registerNonce(AGENT_ID);
        bytes32 structHash =
            keccak256(abi.encode(registry.REGISTER_TYPEHASH(), AGENT_ID, agent, deadline, nonce));
        bytes32 digest = keccak256(
            abi.encodePacked("\x19\x01", registry.registrationDomainSeparator(), structHash)
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(operatorPk, digest);
        bytes memory auth = abi.encodePacked(r, s, v);
        vm.prank(agent);
        registry.registerAgent(AGENT_ID, agent, "Aki", "https://aki.dev/p", 100, deadline, auth);

        vm.prank(principal);
        escrow.createJob(JOB_ID, AGENT_ID, agent, AMOUNT, noop);
    }

    function test_FundJob_BlocksReentrantCall() public {
        uint256 needed = AMOUNT + ((AMOUNT * 100) / 10_000);
        hostile.mint(principal, needed * 2);
        vm.prank(principal);
        hostile.approve(address(escrow), type(uint256).max);

        bytes memory args = abi.encodeWithSelector(AgentEscrow.fundJob.selector, JOB_ID);
        hostile.arm(address(escrow), args);

        vm.prank(principal);
        escrow.fundJob(JOB_ID);

        assertEq(hostile.balanceOf(address(escrow)), needed, "single fund only");
    }
}

contract CashoutOrderProcessorReentrancyTest is Test {
    CashoutOrderProcessor cashout;
    ProofRegistry proofs;
    LPStaking staking;
    LPRegistry registry;
    HostileToken hostile;

    address vendor = address(0xA1);
    address operator = address(0xCAFE);
    bytes32 constant ID = keccak256("cashout-1");
    uint256 constant AMOUNT = 100_000_000;

    function setUp() public {
        vm.chainId(KlaroConfig.ARC_TESTNET_CHAIN_ID);
        hostile = new HostileToken();
        proofs = new ProofRegistry(operator);
        registry = new LPRegistry(operator);
        staking = new LPStaking(address(hostile), operator);
        cashout = new CashoutOrderProcessor(
            address(hostile), proofs, staking, registry, operator, operator
        );

        hostile.mint(vendor, AMOUNT * 2);
        vm.prank(vendor);
        hostile.approve(address(cashout), type(uint256).max);
    }

    function test_RequestAndLock_BlocksReentrantCall() public {
        bytes memory args = abi.encodeWithSelector(
            CashoutOrderProcessor.requestAndLock.selector,
            ID,
            AMOUNT,
            0, // klaroFee
            AMOUNT * 83,
            keccak256("INR"),
            uint64(block.timestamp + 1 hours),
            keccak256("quote")
        );
        hostile.arm(address(cashout), args);

        vm.prank(vendor);
        cashout.requestAndLock(
            ID,
            AMOUNT,
            0, // klaroFee
            AMOUNT * 83,
            keccak256("INR"),
            uint64(block.timestamp + 1 hours),
            keccak256("quote")
        );

        assertEq(hostile.balanceOf(address(cashout)), AMOUNT, "single lock only");
    }
}

contract FeeSplitterReentrancyTest is Test {
    FeeSplitter splitter;
    HostileToken hostile;
    address operator = address(0xCAFE);
    address payee1 = address(0xB1);
    address payee2 = address(0xB2);
    bytes32 constant SPLIT_ID = keccak256("split-1");
    uint256 constant AMOUNT = 100_000_000;

    function setUp() public {
        vm.chainId(KlaroConfig.ARC_TESTNET_CHAIN_ID);
        splitter = new FeeSplitter(operator);
        hostile = new HostileToken();

        FeeSplitter.Split[] memory items = new FeeSplitter.Split[](2);
        items[0] = FeeSplitter.Split({ payee: payee1, bps: 7000 });
        items[1] = FeeSplitter.Split({ payee: payee2, bps: 3000 });
        vm.prank(operator);
        splitter.setSplit(SPLIT_ID, items);

        // setTrustedCaller owner-only.
        splitter.setTrustedCaller(address(this), true);
        hostile.mint(address(splitter), AMOUNT);
    }

    function test_Distribute_BlocksReentrantCall() public {
        bytes memory args = abi.encodeWithSelector(
            FeeSplitter.distribute.selector, address(hostile), AMOUNT, SPLIT_ID
        );
        hostile.arm(address(splitter), args);

        splitter.distribute(address(hostile), AMOUNT, SPLIT_ID);

        assertEq(hostile.balanceOf(payee1) + hostile.balanceOf(payee2), AMOUNT, "exact fan-out");
        assertEq(hostile.balanceOf(address(splitter)), 0, "no residual");
    }
}
