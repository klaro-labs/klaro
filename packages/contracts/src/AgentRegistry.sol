// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { Ownable2Step } from "@openzeppelin/contracts/access/Ownable2Step.sol";
import { EIP712 } from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import { SignatureChecker } from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";

import { KlaroConfig } from "./KlaroConfig.sol";
import { ReasonCodes } from "./lib/ReasonCodes.sol";

/// @title AgentRegistry
/// @notice Thin Klaro-side metadata layer over Arc's ERC-8004 IdentityRegistry
/// (canonical at `KlaroConfig.ERC_8004_IDENTITY`).
/// Off-chain daemon resolves the agent DID via ERC-8004; this contract
/// adds Klaro business metadata (display name, pricing endpoint URL,
/// protocol fee schedule, active flag) so consumer surfaces can render
/// a useful agent marketplace without round-tripping the agent's owner.
/// Owner-vs-operator dual gate: the agent's `owner` (typically the
/// dev / vendor who registered) controls metadata + can deactivate;
/// the Klaro `operator` can force-deactivate for abuse (logged with
/// ReasonCodes-validated reason hash).
contract AgentRegistry is EIP712, Ownable2Step {
    struct Agent {
        address owner; // wallet that registered this agent
        string displayName; // human-readable label (off-chain UI)
        string pricingEndpointUrl; // GET endpoint returning {endpoint, priceUsdcMicro}[]
        uint16 feeBps; // Klaro protocol fee per job, 0..10_000
        bool active;
        uint64 registeredAt;
        uint64 lastStatusChangeAt;
        bytes32 lastReasonHash;
    }

    mapping(bytes32 => Agent) private _agents;
    address public klaroOperator;
    uint16 public maxAgentFeeBps = 2000; // 20% upper bound — operator-tunable

    event AgentRegistered(
        bytes32 indexed agentId, address indexed owner, string displayName, uint16 feeBps
    );
    event AgentUpdated(
        bytes32 indexed agentId, string displayName, string pricingEndpointUrl, uint16 feeBps
    );
    event AgentDeactivated(bytes32 indexed agentId, address indexed by, bytes32 indexed reason);
    event AgentReactivated(bytes32 indexed agentId);
    event AgentOwnerTransferred(
        bytes32 indexed agentId, address indexed previous, address indexed next
    );
    event MaxAgentFeeBpsChanged(uint16 previous, uint16 next);
    event OperatorChanged(address indexed previous, address indexed next);

    error NotOperator();
    error NotAgentOwner();
    error AlreadyRegistered();
    error UnknownAgent();
    error AgentNotActive(bytes32 agentId);
    error FeeBpsTooHigh(uint16 fee, uint16 cap);
    error ZeroAddress();
    // same EIP-712 signed-auth pattern as
    // LPStaking.register. Without this, anyone could front-run a
    // legitimate agent's registration by pinning the ERC-8004 agentId
    // with attacker-owned metadata; AgentEscrow.createJob then
    // resolves the squatter as the agent → funds misrouted.
    error BadOperatorAuth();
    error CallerNotAuthorizedOwner(address expected);

    /// @notice EIP-712 type hash for the operator's registration auth.
    /// Operator co-signs (agentId, owner, deadline, nonce) so a
    /// legitimate agent dev can prove ERC-8004 ownership offchain
    /// (Arc IdentityRegistry resolution, ERC-8004 DID check, etc.)
    /// and have the operator gate the on-chain pin.
    bytes32 public constant REGISTER_TYPEHASH = keccak256(
        "RegisterAuthorization(bytes32 agentId,address owner,uint64 deadline,uint256 nonce)"
    );

    /// @notice Per-(agentId) nonce so a leaked operator signature cannot be
    /// reused after the agent is intentionally deactivated.
    mapping(bytes32 => uint256) public registerNonce;

    modifier onlyOperator() {
        if (msg.sender != klaroOperator) revert NotOperator();
        _;
    }

    constructor(address operator_) EIP712("Klaro AgentRegistry", "1") Ownable(msg.sender) {
        KlaroConfig.requireArcTestnet();
        klaroOperator = operator_;
        emit OperatorChanged(address(0), operator_);
    }

    // ─── Registration / mutation ───────────────────────────────────────

    /// @notice Register a new agent. previously
    /// permissionless apart from `msg.sender == owner_`, which
    /// let any attacker squat any ERC-8004 agentId by claiming
    /// to be the owner. Now: operator co-signs an EIP-712 auth
    /// binding (agentId, owner, deadline, nonce); the bound
    /// owner must call register themselves so the signature is
    /// not relayable to a different msg.sender. Same pattern as
    /// LPStaking.register.
    function registerAgent(
        bytes32 agentId,
        address owner_,
        string calldata displayName,
        string calldata pricingEndpointUrl,
        uint16 feeBps,
        uint64 deadline,
        bytes calldata operatorAuth
    ) external {
        if (owner_ == address(0)) revert ZeroAddress();
        if (_agents[agentId].owner != address(0)) revert AlreadyRegistered();
        if (feeBps > maxAgentFeeBps) {
            revert FeeBpsTooHigh(feeBps, maxAgentFeeBps);
        }
        if (msg.sender != owner_) revert CallerNotAuthorizedOwner(owner_);
        if (block.timestamp > deadline) revert BadOperatorAuth();

        uint256 nonce = registerNonce[agentId];
        bytes32 structHash =
            keccak256(abi.encode(REGISTER_TYPEHASH, agentId, owner_, deadline, nonce));
        bytes32 digest = _hashTypedDataV4(structHash);
        if (!SignatureChecker.isValidSignatureNow(klaroOperator, digest, operatorAuth)) {
            revert BadOperatorAuth();
        }
        unchecked {
            registerNonce[agentId] = nonce + 1;
        }

        _agents[agentId] = Agent({
            owner: owner_,
            displayName: displayName,
            pricingEndpointUrl: pricingEndpointUrl,
            feeBps: feeBps,
            active: true,
            registeredAt: uint64(block.timestamp),
            lastStatusChangeAt: uint64(block.timestamp),
            lastReasonHash: bytes32(0)
        });
        emit AgentRegistered(agentId, owner_, displayName, feeBps);
    }

    /// @notice EIP-712 domain separator exposed for off-chain signer code.
    function registrationDomainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    function updateAgent(
        bytes32 agentId,
        string calldata displayName,
        string calldata pricingEndpointUrl,
        uint16 feeBps
    ) external {
        Agent storage a = _agents[agentId];
        if (a.owner == address(0)) revert UnknownAgent();
        if (msg.sender != a.owner) revert NotAgentOwner();
        if (feeBps > maxAgentFeeBps) {
            revert FeeBpsTooHigh(feeBps, maxAgentFeeBps);
        }
        a.displayName = displayName;
        a.pricingEndpointUrl = pricingEndpointUrl;
        a.feeBps = feeBps;
        emit AgentUpdated(agentId, displayName, pricingEndpointUrl, feeBps);
    }

    function transferOwner(bytes32 agentId, address next) external {
        Agent storage a = _agents[agentId];
        if (a.owner == address(0)) revert UnknownAgent();
        if (msg.sender != a.owner) revert NotAgentOwner();
        if (next == address(0)) revert ZeroAddress();
        emit AgentOwnerTransferred(agentId, a.owner, next);
        a.owner = next;
    }

    function deactivate(bytes32 agentId, bytes32 reason) external {
        Agent storage a = _agents[agentId];
        if (a.owner == address(0)) revert UnknownAgent();
        // Owner OR operator may deactivate. Operator must pass a valid reason.
        if (msg.sender != a.owner) {
            if (msg.sender != klaroOperator) revert NotAgentOwner();
            ReasonCodes.require_(reason);
        }
        a.active = false;
        a.lastStatusChangeAt = uint64(block.timestamp);
        a.lastReasonHash = reason;
        emit AgentDeactivated(agentId, msg.sender, reason);
    }

    function reactivate(bytes32 agentId) external {
        Agent storage a = _agents[agentId];
        if (a.owner == address(0)) revert UnknownAgent();
        if (msg.sender != a.owner && msg.sender != klaroOperator) {
            revert NotAgentOwner();
        }
        a.active = true;
        a.lastStatusChangeAt = uint64(block.timestamp);
        a.lastReasonHash = bytes32(0);
        emit AgentReactivated(agentId);
    }

    /// @notice Hard ceiling on the max agent fee bps.
    /// P0-2: was uncapped; a compromised operator could let agents take 100%.
    uint16 internal constant FEE_BPS_HARD_CAP = 5000; // 50%

    function setMaxAgentFeeBps(uint16 next) external onlyOperator {
        if (next > FEE_BPS_HARD_CAP) {
            revert FeeBpsTooHigh(next, FEE_BPS_HARD_CAP);
        }
        emit MaxAgentFeeBpsChanged(maxAgentFeeBps, next);
        maxAgentFeeBps = next;
    }

    error ZeroOperatorAddress();

    function setOperator(address next) external onlyOwner {
        if (next == address(0)) revert ZeroOperatorAddress();
        emit OperatorChanged(klaroOperator, next);
        klaroOperator = next;
    }

    // ─── Consumer-facing gates ──────────────────────────────────────────

    function assertActive(bytes32 agentId) external view {
        Agent storage a = _agents[agentId];
        if (a.owner == address(0) || !a.active) revert AgentNotActive(agentId);
    }

    // ─── Views ──────────────────────────────────────────────────────────

    function getAgent(bytes32 agentId) external view returns (Agent memory) {
        return _agents[agentId];
    }

    function feeBpsOf(bytes32 agentId) external view returns (uint16) {
        return _agents[agentId].feeBps;
    }

    function ownerOf(bytes32 agentId) external view returns (address) {
        return _agents[agentId].owner;
    }
}
