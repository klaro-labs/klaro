/**
 * Arc-chain viem clients + on-chain read helpers.
 * **Adapter principle:** every helper here either hits a live contract
 * (when `NEXT_PUBLIC_INVOICE_ESCROW_ADDRESS` etc. are set) or returns
 * a clearly-marked simulated fallback. UI surfaces inspect the
 * `simulated` flag and render a badge so reviewers always know which
 * mode they're in (: no silent mock/live mixing).
 * Chain: `arcTestnet` from `viem/chains`. ChainId 5_042_002. USDC ERC-20
 * interface at `0x3600…0000` uses 6 decimals (verified iter M4 fix).
 */

import {
  createPublicClient,
  http,
  type Address,
  type PublicClient,
} from "viem";
import { arcTestnet } from "viem/chains";
import {
  ARC_TESTNET_RPC_URL,
  INVOICE_ESCROW_ADDRESS,
  AUDIT_RECEIPT_ADDRESS,
  REPUTATION_MANAGER_ADDRESS,
  COUNTERPARTY_REGISTRY_ADDRESS,
  supabaseLive,
} from "./env";
import { keccak256, toBytes, parseAbiItem } from "viem";
import { mockGetInvoice } from "./mockData";
import { getInvoice as getStoredInvoice } from "./repo/invoices";
import type { Hex, Invoice, ReceiptAnchor } from "./types";
import {
  CANONICAL_INVOICE_ESCROW_ABI,
  CANONICAL_AUDIT_RECEIPT_ABI,
  assertSliceMatchesCanonical,
} from "./abiCanonical";
import { captureError } from "./sentry";

let _cachedClient: PublicClient | null = null;
/** Cached read-only viem client for Arc testnet. */
export function getArcPublicClient(): PublicClient {
  if (!_cachedClient) {
    _cachedClient = createPublicClient({
      chain: arcTestnet,
      transport: http(ARC_TESTNET_RPC_URL),
    });
  }
  return _cachedClient;
}

/** Tiny on-chain status map mirroring `InvoiceEscrow.Status`. */
const STATUS_NAMES = [
  "NONE",
  "CREATED",
  "ACCEPTED",
  "PAID",
  "SETTLED",
  "REFUNDED",
  "CANCELLED",
] as const;

export interface OnChainInvoiceResult {
  /** `live-arc`: real chain read · `simulated`: env-gated mock (no live address set)
   * · `error`: live read attempted and crashed — caller MUST treat as unknown,
   * not silently fall back. . */
  source: "live-arc" | "simulated" | "error";
  invoice: Invoice | null;
  error?: string;
}

/**
 * Get an invoice. Falls through:
 * 1. Try on-chain via viem → InvoiceEscrow.getInvoice() when address is set
 * 2. Otherwise return mock data + `simulated: 'simulated'` source label
 * On-chain path returns `null` if the invoice has Status.NONE (never created).
 */
export async function getInvoiceWithSource(
  id: Hex,
): Promise<OnChainInvoiceResult> {
  if (!INVOICE_ESCROW_ADDRESS) {
    const inv = await mockGetInvoice(id);
    return { source: "simulated", invoice: inv };
  }

  try {
    const client = getArcPublicClient();
    const raw = await client.readContract({
      address: INVOICE_ESCROW_ADDRESS as Address,
      abi: INVOICE_ESCROW_GET_INVOICE_ABI,
      functionName: "getInvoice",
      args: [id],
    });
    // raw is the Invoice struct. Bail if NONE.
    // tuple shape was missing `splitsHash`
    // (added when InvoiceEscrow gained the splits[] path). Drift would
    // have shifted `status` by one slot — every fetched invoice would
    // read as the wrong state.
    const r = raw as {
      vendor: Address;
      token: Address;
      amount: bigint;
      dueAt: bigint;
      acceptedAt: bigint;
      acceptedBy: Address;
      metadataHash: Hex;
      screeningHash: Hex;
      splitsHash: Hex;
      status: number;
    };
    if (r.status === 0) return { source: "live-arc", invoice: null };

    // Customer and line-item fields are intentionally off-chain. Never mix
    // live contract state with simulator data: hydrate only from live storage.
    const offchain = supabaseLive() ? await getStoredInvoice(id) : null;

    const inv: Invoice = {
      id,
      vendorId: offchain?.vendorId ?? "unknown",
      vendorWallet: r.vendor as Hex,
      token: r.token as Hex,
      amount: r.amount,
      dueAt: new Date(Number(r.dueAt) * 1000),
      status: STATUS_NAMES[r.status] as Invoice["status"],
      customer: offchain?.customer ?? { email: "unknown@" },
      lineItems: offchain?.lineItems ?? [],
      metadataHash: r.metadataHash,
      splitsHash:
        r.splitsHash ===
        "0x0000000000000000000000000000000000000000000000000000000000000000"
          ? undefined
          : r.splitsHash,
      acceptedBy:
        r.acceptedBy === "0x0000000000000000000000000000000000000000"
          ? undefined
          : (r.acceptedBy as Hex),
      acceptedAt:
        r.acceptedAt > 0n ? new Date(Number(r.acceptedAt) * 1000) : undefined,
      createdAt: offchain?.createdAt ?? new Date(),
    };
    return { source: "live-arc", invoice: inv };
  } catch (err) {
    // don't silently degrade live → simulated.
    // Caller decides whether to retry, show an error toast, or display
    // last-known state. Mock fallback only when address never set.
    const msg = (err as Error).message ?? String(err);
    console.error("[arcClient] on-chain getInvoice failed:", msg);
    captureError(err, {
      where: "arcClient.getInvoiceWithSource",
      invoiceId: id,
    });
    return { source: "error", invoice: null, error: msg };
  }
}

export interface OnChainReceiptResult {
  source: "live-arc" | "simulated" | "error";
  exists: boolean;
  anchor: ReceiptAnchor | null;
  error?: string;
}

/** Verify a receipt hash exists on-chain (AuditReceipt.verify). */
export async function verifyReceipt(
  receiptHash: Hex,
): Promise<OnChainReceiptResult> {
  if (!AUDIT_RECEIPT_ADDRESS) {
    return { source: "simulated", exists: true, anchor: null };
  }
  try {
    const client = getArcPublicClient();
    const exists = (await client.readContract({
      address: AUDIT_RECEIPT_ADDRESS as Address,
      abi: AUDIT_RECEIPT_VERIFY_ABI,
      functionName: "verify",
      args: [receiptHash],
    })) as boolean;
    return { source: "live-arc", exists, anchor: null };
  } catch (err) {
    const msg = (err as Error).message ?? String(err);
    console.error("[arcClient] verifyReceipt failed:", msg);
    captureError(err, { where: "arcClient.verifyReceipt", receiptHash });
    return { source: "error", exists: false, anchor: null, error: msg };
  }
}

export function isLiveOnChain(): boolean {
  return Boolean(INVOICE_ESCROW_ADDRESS);
}

/** Specific per-contract liveness — the loop-iter-38 reputation page needs
 * this gate because it's possible to have InvoiceEscrow deployed but not
 * ReputationManager yet (early-stage testnet ordering). */
export function isReputationLiveOnChain(): boolean {
  return Boolean(REPUTATION_MANAGER_ADDRESS);
}

// ─── ReputationManager.computeScore() ────────────────────────────────
// turns 's honest-but-mock claim into an actual on-chain
// read when the contract address is set. Mirrors the ReputationManager
// contract enum: 0=EMERGING, 1=ACTIVE, 2=ESTABLISHED, 3=PRIORITY.

const REPUTATION_TIERS = [
  "EMERGING",
  "ACTIVE",
  "ESTABLISHED",
  "PRIORITY",
] as const;
export type OnChainReputationTier = (typeof REPUTATION_TIERS)[number];

export interface OnChainReputationResult {
  source: "live-arc" | "simulated" | "error";
  score: number;
  tier: OnChainReputationTier;
  rawSum: bigint;
  error?: string;
}

const REPUTATION_MANAGER_COMPUTE_ABI = [
  {
    type: "function",
    name: "computeScore",
    stateMutability: "view",
    inputs: [{ name: "vendorId", type: "bytes32" }],
    outputs: [
      { name: "score", type: "uint16" },
      { name: "tier", type: "uint8" },
      { name: "rawSum", type: "int256" },
    ],
  },
] as const;

/** Read ReputationManager.computeScore for the given off-chain vendor id.
 * The contract takes bytes32 — we keccak the off-chain id so the chain
 * side stays PII-free (Klaro ). Falls back to simulated when
 * the address is unset. */
export async function readReputationScore(
  vendorId: string,
): Promise<OnChainReputationResult> {
  if (!REPUTATION_MANAGER_ADDRESS) {
    return { source: "simulated", score: 0, tier: "EMERGING", rawSum: 0n };
  }
  try {
    const client = getArcPublicClient();
    const onChainId = keccak256(toBytes(vendorId));
    const [score, tier, rawSum] = await client.readContract({
      address: REPUTATION_MANAGER_ADDRESS as Address,
      abi: REPUTATION_MANAGER_COMPUTE_ABI,
      functionName: "computeScore",
      args: [onChainId],
    });
    return {
      source: "live-arc",
      score: Number(score),
      tier: REPUTATION_TIERS[Math.min(Number(tier), 3)],
      rawSum: rawSum as bigint,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    captureError(err, { where: "arcClient.readReputationScore", vendorId });
    return {
      source: "error",
      score: 0,
      tier: "EMERGING",
      rawSum: 0n,
      error: msg,
    };
  }
}

// ─── Minimal ABIs (only what we read here) ─────────────────────────

const INVOICE_ESCROW_GET_INVOICE_ABI = [
  {
    type: "function",
    name: "getInvoice",
    stateMutability: "view",
    inputs: [{ name: "invoiceId", type: "bytes32" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "vendor", type: "address" },
          { name: "token", type: "address" },
          { name: "amount", type: "uint256" },
          { name: "dueAt", type: "uint64" },
          { name: "acceptedAt", type: "uint64" },
          { name: "acceptedBy", type: "address" },
          { name: "metadataHash", type: "bytes32" },
          { name: "screeningHash", type: "bytes32" },
          { name: "splitsHash", type: "bytes32" },
          { name: "status", type: "uint8" },
        ],
      },
    ],
  },
] as const;

const AUDIT_RECEIPT_VERIFY_ABI = [
  {
    type: "function",
    name: "verify",
    stateMutability: "view",
    inputs: [{ name: "receiptHash", type: "bytes32" }],
    outputs: [{ type: "bool" }],
  },
] as const;

// Module-load drift assertion. Throws loudly if a future contract edit
// reshapes getInvoice/verify without updating these slices to match.
assertSliceMatchesCanonical(
  "InvoiceEscrow",
  INVOICE_ESCROW_GET_INVOICE_ABI,
  CANONICAL_INVOICE_ESCROW_ABI,
);
assertSliceMatchesCanonical(
  "AuditReceipt",
  AUDIT_RECEIPT_VERIFY_ABI,
  CANONICAL_AUDIT_RECEIPT_ABI,
);

// ─── CounterpartyRegistry.denylist enumeration (loop ) ────────
// Reads past DenylistAdded events via eth_getLogs to enumerate currently-
// denied addresses. DenylistRemoved events would un-deny; we apply both
// in order so the final set reflects the net effective denylist.

export function isCounterpartyLiveOnChain(): boolean {
  return Boolean(COUNTERPARTY_REGISTRY_ADDRESS);
}

export interface DenylistEntry {
  buyer: Hex;
  reasonHash: Hex;
  blockNumber: bigint;
  txHash: Hex;
}

export interface DenylistReadResult {
  source: "live-arc" | "simulated" | "error";
  entries: DenylistEntry[];
  error?: string;
}

const DENYLIST_ADDED_EVENT = parseAbiItem(
  "event DenylistAdded(address indexed buyer, bytes32 indexed reason)",
);
const DENYLIST_REMOVED_EVENT = parseAbiItem(
  "event DenylistRemoved(address indexed buyer, bytes32 indexed reason)",
);

export async function readDenylistEntries(): Promise<DenylistReadResult> {
  if (!COUNTERPARTY_REGISTRY_ADDRESS) {
    return { source: "simulated", entries: [] };
  }
  try {
    const client = getArcPublicClient();
    const address = COUNTERPARTY_REGISTRY_ADDRESS as Address;
    const [added, removed] = await Promise.all([
      client.getLogs({
        address,
        event: DENYLIST_ADDED_EVENT,
        fromBlock: 0n,
        toBlock: "latest",
      }),
      client.getLogs({
        address,
        event: DENYLIST_REMOVED_EVENT,
        fromBlock: 0n,
        toBlock: "latest",
      }),
    ]);

    // Apply add/remove pairs in block order so the final denied set is correct.
    const ordered = [
      ...added.map((l) => ({ kind: "add" as const, log: l })),
      ...removed.map((l) => ({ kind: "remove" as const, log: l })),
    ].sort(
      (a, b) =>
        Number((a.log.blockNumber ?? 0n) - (b.log.blockNumber ?? 0n)) ||
        Number((a.log.logIndex ?? 0) - (b.log.logIndex ?? 0)),
    );

    const current = new Map<Hex, DenylistEntry>();
    for (const { kind, log } of ordered) {
      const buyer = log.args.buyer as Hex | undefined;
      if (!buyer) continue;
      if (kind === "remove") {
        current.delete(buyer);
        continue;
      }
      current.set(buyer, {
        buyer,
        reasonHash: (log.args.reason ?? "0x" + "0".repeat(64)) as Hex,
        blockNumber: log.blockNumber ?? 0n,
        txHash: log.transactionHash as Hex,
      });
    }

    return { source: "live-arc", entries: [...current.values()] };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    captureError(err, { where: "arcClient.readDenylistEntries" });
    return { source: "error", entries: [], error: msg };
  }
}
