/**
 * Receipt generator — once an invoice settles on Arc, anchor a Stenn-Proof
 * receipt by calling AuditReceipt.mint(), then persist the contract-returned
 * hash to Supabase so /receipt/[hash] is verifiable end-to-end.
 *
 * **QA-024 fix**: previous version computed a custom keccak256(`r:invoiceId:tx:metadataHash`)
 * and stored it in `receipts.receipt_hash` — but the on-chain contract's
 * `mint()` derives `receiptHash = keccak256(abi.encode(invoiceId, acceptanceHash, settlementTx))`.
 * Those hashes never matched, so `AuditReceipt.verify(daemon_hash)` always
 * returned false — breaking the "Verified on Arc" claim. AND `mint()` was
 * never actually called from the daemon; the worker only wrote a DB row.
 *
 * Now: call mint() on-chain with the Anchor struct → use the receiptHash
 * the contract returned → persist that → DB and on-chain agree.
 */
import {
  keccak256,
  parseAbi,
  decodeEventLog,
  encodeAbiParameters,
  type Hex,
} from "viem";
import { startWorker } from "../queue.js";
import { sb } from "../db.js";
import { log } from "../log.js";
import { arcPublic, requireArcWalletInProd } from "../arc.js";
import { env } from "../env.js";

export interface ReceiptJob {
  invoiceId: string;
  settlementTx: string;
}

const RECEIPT_ABI = parseAbi([
  "function mint((bytes32 invoiceId, bytes32 invoiceHash, bytes32 acceptanceHash, bytes32 screeningHash, bytes32 settlementTx, uint64 settledAt, uint32 sourceChainId, address vendor) a) external returns (uint256 tokenId, bytes32 receiptHash)",
  "function verify(bytes32 receiptHash) view returns (bool)",
  "event ReceiptMinted(uint256 indexed tokenId, bytes32 indexed receiptHash, bytes32 indexed invoiceId, address vendor)",
]);

const ZERO_BYTES32 =
  "0x0000000000000000000000000000000000000000000000000000000000000000" as Hex;

const ARC_SOURCE_CHAIN_ID = 5_042_002;

export function startReceiptGenerate() {
  startWorker<ReceiptJob>(
    "receipt-generate",
    async (job) => {
      const { invoiceId, settlementTx } = job.data;

      // Pull the fields needed to assemble the on-chain Anchor.
      // metadata_hash + acceptance_sig were captured by the web action +
      // listener (acceptance_sig comes off the buyerSignature arg in the
      // acceptAndPay tx); vendor wallet via the joined vendors row.
      const { data: inv, error: invErr } = await sb()
        .from("invoices")
        .select(
          "metadata_hash,acceptance_sig,vendors!inner(wallet),settled_tx_hash",
        )
        .eq("id", invoiceId)
        .single();
      if (invErr) throw invErr;
      if (!inv)
        throw new Error(`receipt-generate: invoice ${invoiceId} not found`);

      // 3-of-3 screening hash from screening_results. Mirror the
      // canonical layout the contract expects (3 provider results
      // hashed together); the screen-and-settle worker uses the
      // same composition.
      const { data: screens } = await sb()
        .from("screening_results")
        .select("provider,result,evidence_hash")
        .eq("invoice_id", invoiceId);
      const screeningHash = screens?.length
        ? keccak256(
            encodeAbiParameters(
              screens.map(() => ({ type: "string" })),
              screens.map(
                (s) => `${s.provider}.${s.result}` as string,
              ) as never,
            ),
          )
        : ZERO_BYTES32;

      const acceptanceHash = (inv.acceptance_sig ?? ZERO_BYTES32) as Hex;
      // PostgREST returns nested foreign-key rows as arrays (one entry per
      // matched row). For an !inner single-relation join we always get
      // exactly one entry — unwrap defensively.
      const vendorsField = inv.vendors as
        | { wallet: string | null }[]
        | { wallet: string | null }
        | null
        | undefined;
      const vendor = Array.isArray(vendorsField)
        ? vendorsField[0]?.wallet
        : vendorsField?.wallet;
      if (!vendor) {
        throw new Error(
          `receipt-generate: invoice ${invoiceId} has no vendor wallet`,
        );
      }
      if (!env.AUDIT_RECEIPT_ADDRESS) {
        throw new Error(
          "receipt-generate: AUDIT_RECEIPT_ADDRESS env not configured",
        );
      }

      const anchor = {
        invoiceId: invoiceId as Hex,
        invoiceHash: inv.metadata_hash as Hex,
        acceptanceHash,
        screeningHash,
        settlementTx: settlementTx as Hex,
        settledAt: BigInt(Math.floor(Date.now() / 1000)),
        sourceChainId: ARC_SOURCE_CHAIN_ID,
        vendor: vendor as Hex,
      };

      // Mint on-chain — the contract returns the receiptHash it derived
      // (keccak256(abi.encode(invoiceId, acceptanceHash, settlementTx))).
      // We use THAT hash, not a daemon-computed one, so DB and on-chain
      // agree per QA-024.
      const wallet = requireArcWalletInProd("receipt-generate");
      const pub = arcPublic();
      const mintHash = await wallet.writeContract({
        address: env.AUDIT_RECEIPT_ADDRESS as Hex,
        abi: RECEIPT_ABI,
        functionName: "mint",
        args: [anchor],
        chain: wallet.chain ?? undefined,
        account: wallet.account!,
      });
      const rcpt = await pub.waitForTransactionReceipt({ hash: mintHash });
      if (rcpt.status !== "success") {
        throw new Error(`receipt-generate: mint tx reverted ${mintHash}`);
      }

      // Extract the receipt hash the contract derived (3rd indexed topic
      // is the invoiceId; 2nd is the receiptHash).
      let receiptHash: Hex | undefined;
      for (const lg of rcpt.logs) {
        try {
          const decoded = decodeEventLog({
            abi: RECEIPT_ABI,
            data: lg.data,
            topics: lg.topics,
          });
          if (decoded.eventName === "ReceiptMinted") {
            receiptHash = (decoded.args as { receiptHash: Hex }).receiptHash;
            break;
          }
        } catch {
          // Not the event we care about; keep looking.
        }
      }
      if (!receiptHash) {
        // Defense-in-depth: compute the same hash off-chain in case event
        // decoding bumped against a chain reorg surprise.
        receiptHash = keccak256(
          encodeAbiParameters(
            [
              { type: "bytes32" },
              { type: "bytes32" },
              { type: "bytes32" },
            ],
            [anchor.invoiceId, anchor.acceptanceHash, anchor.settlementTx],
          ),
        );
      }

      // Idempotent upsert keyed on the contract-derived hash.
      const upRcpt = await sb()
        .from("receipts")
        .upsert(
          {
            invoice_id: invoiceId,
            receipt_hash: receiptHash,
            invoice_hash: anchor.invoiceHash,
            acceptance_hash: anchor.acceptanceHash,
            screening_hash: anchor.screeningHash,
            settlement_tx: settlementTx,
            settled_at: new Date().toISOString(),
            source_chain_id: ARC_SOURCE_CHAIN_ID,
          },
          { onConflict: "receipt_hash", ignoreDuplicates: true },
        );
      if (upRcpt.error) throw upRcpt.error;

      const upInv = await sb()
        .from("invoices")
        .update({ receipt_hash: receiptHash })
        .eq("id", invoiceId);
      if (upInv.error) throw upInv.error;

      log.info("receipt.minted", {
        invoiceId,
        receiptHash,
        mintTx: mintHash,
      });
    },
    4,
  );
}
