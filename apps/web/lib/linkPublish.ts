/**
 * Server-only relayer that publishes a Klaro Link payment's invoice on-chain
 * via InvoiceEscrow.createInvoiceFor, using the vendor's pre-signed
 * LinkInvoiceAuthorization.
 *
 * Why a relayer at all: a normal invoice is published on-chain by the vendor at
 * creation (vendor == msg.sender). A link's invoice doesn't exist until a buyer
 * pays, and the vendor isn't present then — so createInvoiceFor sets the on-chain
 * invoice vendor from the *signature*, not msg.sender. It's permissionless (the
 * contract verifies the vendor's EIP-712 auth), so this wallet needs only gas —
 * NEVER operator privilege. Prod should use a dedicated low-privilege funded
 * wallet, not the operator key.
 *
 * Idempotent: if the invoice already exists on-chain (double-tap, retry, or a
 * concurrent publish of the same deterministic id), it returns success without
 * re-sending. NEVER import this from client code — it reads a private key.
 */
import {
  createWalletClient,
  http,
  parseAbi,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arcTestnet } from "viem/chains";
import {
  ARC_TESTNET_RPC_URL,
  INVOICE_ESCROW_ADDRESS,
  LINK_PUBLISHER_PRIVATE_KEY,
  linkPublisherLive,
} from "./env";
import { getArcPublicClient } from "./arcClient";
import { captureError } from "./sentry";
import type { Hex } from "./types";

// Standalone fragment (kept off the canonical INVOICE_ESCROW_ABI so the ABI
// drift-guard stays scoped to the buyer-facing surface). Mirrors the deployed
// createInvoiceFor signature verified live in scripts/qa-link-onchain.mjs.
const CREATE_FOR_ABI = parseAbi([
  "function createInvoiceFor(bytes32 invoiceId, address vendor, address token, uint256 amount, uint64 dueAt, bytes32 metadataHash, bytes32 linkId, uint64 authDeadline, bytes vendorAuthSig) external",
  "function invoices(bytes32) view returns (address vendor,address token,uint256 amount,uint64 dueAt,uint64 acceptedAt,address acceptedBy,bytes32 metadataHash,bytes32 screeningHash,bytes32 splitsHash,uint8 status)",
]);

export interface LinkPublishArgs {
  invoiceId: Hex;
  vendor: Hex;
  token: Hex;
  amount: bigint;
  dueAtUnix: bigint;
  metadataHash: Hex;
  linkChainId: Hex;
  authDeadline: bigint;
  vendorAuthSig: Hex;
}

export type LinkPublishResult =
  | { status: "published"; txHash: Hex }
  | { status: "already-onchain" }
  | { status: "skipped-simulator" };

async function readOnChainStatus(escrow: Address, invoiceId: Hex): Promise<number | null> {
  try {
    const inv = await getArcPublicClient().readContract({
      address: escrow,
      abi: CREATE_FOR_ABI,
      functionName: "invoices",
      args: [invoiceId],
    });
    return Number(inv[9]); // Status enum: 0 = NONE
  } catch {
    return null; // RPC hiccup — caller decides whether to attempt the write
  }
}

/**
 * Publish (or confirm-already-published) the link's invoice on-chain. Returns
 * `skipped-simulator` when no relayer/escrow is configured (the pay flow then
 * runs the in-memory simulator like every other Klaro adapter). Throws only on
 * a genuine, unrecoverable failure — an AlreadyExists revert is treated as
 * success because the invoice IS on-chain.
 */
export async function publishLinkInvoiceOnChain(
  a: LinkPublishArgs,
): Promise<LinkPublishResult> {
  if (!linkPublisherLive()) return { status: "skipped-simulator" };
  const escrow = INVOICE_ESCROW_ADDRESS as Address;

  // Idempotency: skip the write entirely if the invoice already exists.
  const pre = await readOnChainStatus(escrow, a.invoiceId);
  if (pre !== null && pre !== 0) return { status: "already-onchain" };

  const account = privateKeyToAccount(LINK_PUBLISHER_PRIVATE_KEY as Hex);
  const wallet = createWalletClient({
    account,
    chain: arcTestnet,
    transport: http(ARC_TESTNET_RPC_URL),
  });
  const pub = getArcPublicClient();

  try {
    const txHash = await wallet.writeContract({
      address: escrow,
      abi: CREATE_FOR_ABI,
      functionName: "createInvoiceFor",
      args: [
        a.invoiceId,
        a.vendor,
        a.token,
        a.amount,
        a.dueAtUnix,
        a.metadataHash,
        a.linkChainId,
        a.authDeadline,
        a.vendorAuthSig,
      ],
      gas: 500_000n,
    });
    const rcpt = await pub.waitForTransactionReceipt({ hash: txHash });
    if (rcpt.status !== "success") throw new Error("createInvoiceFor tx reverted");
    return { status: "published", txHash: txHash as Hex };
  } catch (e) {
    // On any write failure, re-check chain state: a concurrent publish of the
    // same deterministic id reverts AlreadyExists, but the invoice IS on-chain
    // → success. Only a genuine failure (no invoice) propagates. This avoids
    // decoding custom-error selectors (the fragment omits the error defs).
    const post = await readOnChainStatus(escrow, a.invoiceId);
    if (post !== null && post !== 0) return { status: "already-onchain" };
    captureError(e, { action: "link.publishOnChain", invoiceId: a.invoiceId });
    throw e;
  }
}
