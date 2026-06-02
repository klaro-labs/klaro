/**
 * CCTP V2 integration — canonical cross-chain USDC for Arc (domain 26).
 *
 * Arc uses Circle's burn-and-mint CCTP V2 (no wrapped USDC). Two contracts:
 *   • TokenMessengerV2    — outbound: depositForBurn burns Arc USDC, targets a
 *                           destination domain; Circle attests the message.
 *   • MessageTransmitterV2 — inbound: receiveMessage(message, attestation)
 *                           mints native USDC to the recipient on Arc.
 *
 * Direction of the two legs:
 *   - OUTBOUND (Arc → other chain): burnOnArc(). Fully exercisable on Arc with
 *     only Arc USDC; proven live by apps/web/scripts/qa-cctp-burn-proof.mjs.
 *   - INBOUND  (other chain → Arc): receiveOnArc(). This is how a buyer pays
 *     from Base/Ethereum and the vendor receives native USDC on Arc — the
 *     buyer burns on the source chain, Circle attests, and the daemon submits
 *     the (message, attestation) here to mint on Arc. The Arc-side call is
 *     identical in shape to the outbound one and uses the same operator signer;
 *     its end-to-end live verification needs a real source-chain burn (external
 *     testnet USDC), which is the one leg that cannot be produced from Arc
 *     alone.
 *
 * Addresses are Arc-chain constants (docs.arc.io/integrate/infrastructure/bridges).
 */
import { parseAbi, keccak256, encodeAbiParameters, decodeEventLog, type Hex } from "viem";
import { arcWallet, arcPublic, requireArcWalletInProd } from "./arc.js";
import { log } from "./log.js";

/** Arc's CCTP domain id (used as destination/source in messages). */
export const ARC_DOMAIN = 26;

/** Canonical CCTP V2 contracts on Arc testnet. */
export const CCTP = {
  tokenMessengerV2: "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA" as Hex,
  messageTransmitterV2: "0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275" as Hex,
  usdc: "0x3600000000000000000000000000000000000000" as Hex,
} as const;

/** Circle Iris attestation service — sandbox for all testnets. */
export const IRIS_SANDBOX = "https://iris-api-sandbox.circle.com";

/** CCTP V2 domain ids for the chains a buyer might pay Klaro from. */
export const DOMAIN = {
  ethereum: 0,
  avalanche: 1,
  optimism: 2,
  arbitrum: 3,
  base: 6,
  polygon: 7,
  arc: 26,
} as const;

export const TOKEN_MESSENGER_ABI = parseAbi([
  "function depositForBurn(uint256 amount, uint32 destinationDomain, bytes32 mintRecipient, address burnToken, bytes32 destinationCaller, uint256 maxFee, uint32 minFinalityThreshold) external returns (uint64 nonce)",
]);
export const MESSAGE_TRANSMITTER_ABI = parseAbi([
  "function receiveMessage(bytes message, bytes attestation) external returns (bool)",
  "event MessageSent(bytes message)",
]);
const ERC20_ABI = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
]);

/** Left-pad a 20-byte EVM address into a CCTP 32-byte recipient/caller field. */
export function addressToBytes32(addr: string): Hex {
  return encodeAbiParameters([{ type: "address" }], [addr as Hex]);
}

/** Standard (finalized) finality threshold; 1000 would be fast/soft-finality. */
export const FINALITY_STANDARD = 2000;

export interface BurnResult {
  txHash: Hex;
  /** The raw CCTP message (from the MessageSent event) — feed to fetchAttestation. */
  message: Hex;
  messageHash: Hex;
}

/**
 * OUTBOUND: burn Arc USDC and emit a CCTP message targeting `destinationDomain`.
 * Operator-signed. The caller is responsible for the economics (this burns the
 * operator/treasury's USDC); for a user-funded cross-chain cashout the burn
 * would pull from a pre-approved vendor allowance instead.
 */
export async function burnOnArc(params: {
  amount: bigint;
  destinationDomain: number;
  mintRecipient: string;
  destinationCaller?: string;
  maxFee?: bigint;
  minFinalityThreshold?: number;
}): Promise<BurnResult> {
  const wallet = arcWallet();
  if (!wallet) {
    requireArcWalletInProd(`cctp.burnOnArc(${params.destinationDomain})`);
    throw new Error("arcWallet_unavailable");
  }
  const pub = arcPublic();

  // depositForBurn pulls USDC via transferFrom, so the TokenMessenger needs an
  // allowance. Approve exactly the burn amount (single-use, no standing grant).
  const allowance = await pub.readContract({
    address: CCTP.usdc, abi: ERC20_ABI, functionName: "allowance",
    args: [wallet.account!.address, CCTP.tokenMessengerV2],
  });
  if (allowance < params.amount) {
    const ah = await wallet.writeContract({
      address: CCTP.usdc, abi: ERC20_ABI, functionName: "approve",
      args: [CCTP.tokenMessengerV2, params.amount],
      chain: null, account: wallet.account!,
    });
    await pub.waitForTransactionReceipt({ hash: ah });
  }

  const hash = await wallet.writeContract({
    address: CCTP.tokenMessengerV2,
    abi: TOKEN_MESSENGER_ABI,
    functionName: "depositForBurn",
    args: [
      params.amount,
      params.destinationDomain,
      addressToBytes32(params.mintRecipient),
      CCTP.usdc,
      params.destinationCaller
        ? addressToBytes32(params.destinationCaller)
        : ("0x0000000000000000000000000000000000000000000000000000000000000000" as Hex),
      params.maxFee ?? 0n,
      params.minFinalityThreshold ?? FINALITY_STANDARD,
    ],
    chain: null,
    account: wallet.account!,
  });
  const receipt = await pub.waitForTransactionReceipt({ hash });

  const message = extractMessageSent(receipt.logs);
  if (!message) {
    throw new Error(`cctp_no_message_sent: burn ${hash} emitted no MessageSent`);
  }
  log.info("cctp.burn.onchain", { hash, destinationDomain: params.destinationDomain });
  return { txHash: hash, message, messageHash: keccak256(message) };
}

/** Pull the CCTP message bytes out of the MessageTransmitter's MessageSent log. */
export function extractMessageSent(
  logs: readonly { address: string; data: Hex; topics: readonly Hex[] }[],
): Hex | null {
  for (const lg of logs) {
    if (lg.address.toLowerCase() !== CCTP.messageTransmitterV2.toLowerCase()) continue;
    try {
      const e = decodeEventLog({
        abi: MESSAGE_TRANSMITTER_ABI,
        data: lg.data,
        topics: lg.topics as [Hex, ...Hex[]],
      });
      if (e.eventName === "MessageSent") return e.args.message as Hex;
    } catch {
      /* not the MessageSent event */
    }
  }
  return null;
}

export interface Attestation {
  status: string;
  message: Hex;
  attestation: Hex;
}

/**
 * Poll Circle's Iris sandbox for the attestation of a burn, by source domain +
 * source-chain tx hash (CCTP V2 endpoint). Returns once `status === "complete"`
 * (a usable signature) or null on timeout. Source = Arc (domain 26) for an
 * outbound burn; for an inbound transfer it is the buyer's source domain.
 */
export async function fetchAttestation(
  sourceDomain: number,
  txHash: string,
  opts: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<Attestation | null> {
  const deadline = Date.now() + (opts.timeoutMs ?? 180_000);
  const interval = opts.intervalMs ?? 4_000;
  const url = `${IRIS_SANDBOX}/v2/messages/${sourceDomain}?transactionHash=${txHash}`;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        const body = (await res.json()) as {
          messages?: { message: Hex; attestation: Hex; status: string }[];
        };
        const m = body.messages?.[0];
        if (m && m.status === "complete" && m.attestation && m.attestation !== "0x") {
          return { status: m.status, message: m.message, attestation: m.attestation };
        }
      }
    } catch (e) {
      log.warn("cctp.attestation.poll_error", { err: (e as Error).message });
    }
    await new Promise((r) => setTimeout(r, interval));
  }
  return null;
}

/**
 * INBOUND: mint native USDC on Arc from a burn that happened on a source chain.
 * `message` + `attestation` come from fetchAttestation against the SOURCE
 * domain. Operator-signed; the recipient was fixed as the mintRecipient in the
 * source-chain burn, so this call cannot redirect funds. Idempotent at the
 * protocol level — MessageTransmitterV2 rejects a replayed nonce, so a retry
 * after a successful mint reverts rather than double-minting.
 */
export async function receiveOnArc(message: Hex, attestation: Hex): Promise<Hex> {
  const wallet = arcWallet();
  if (!wallet) {
    requireArcWalletInProd("cctp.receiveOnArc");
    throw new Error("arcWallet_unavailable");
  }
  const hash = await wallet.writeContract({
    address: CCTP.messageTransmitterV2,
    abi: MESSAGE_TRANSMITTER_ABI,
    functionName: "receiveMessage",
    args: [message, attestation],
    chain: null,
    account: wallet.account!,
  });
  await arcPublic().waitForTransactionReceipt({ hash });
  log.info("cctp.receive.onchain", { hash });
  return hash;
}
