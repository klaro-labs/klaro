/**
 * StableFX adapter worker — executes an on-chain USDC<->EURC swap through the
 * deployed StableFXAdapterRegistry (operator-gated `swap`). Until Circle
 * StableFX TEST access lands, the registry routes USDC<->EURC to the
 * MockStableFXAdapter, which pays the destination token (MockEURC on testnet)
 * from a seeded liquidity pool. The exact `registry.swap(...)` call this worker
 * signs is proven end-to-end on Arc testnet by
 * apps/web/scripts/qa-fx-swap-proof.mjs.
 *
 * Custody model (mirrors StableFXAdapterRegistry NatSpec): the PAYER still owns
 * the funds — they pre-approve the REGISTRY for `srcAmount`, and the registry
 * pulls + forwards into the adapter, which pays `recipient`. The operator never
 * takes custody; it only gates which swaps execute (screening attested
 * off-chain). The single-use allowance is the natural anti-replay guard; for
 * DB-tracked quotes we also short-circuit on an already-executed row.
 *
 * Consumes queue('fx-execute'). The producer is responsible for obtaining the
 * on-chain quote (registry.quote → the adapter `quoteHash`) and ensuring the
 * payer has approved the registry before enqueueing.
 */
import { parseAbi, keccak256, toHex, type Hex } from "viem";
import { startWorker } from "../queue.js";
import { sb } from "../db.js";
import { log } from "../log.js";
import { arcWallet, arcPublic, requireArcWalletInProd } from "../arc.js";
import { env } from "../env.js";

/// Arc's USDC is the native precompile ERC-20 at a fixed address; EURC is the
/// MockEURC deployment (env-pinned). USYC has no testnet token yet, so a USYC
/// pair fails loud rather than silently skipping a money move.
const TOKENS: Record<string, Hex | undefined> = {
  USDC: "0x3600000000000000000000000000000000000000",
  EURC: env.EURC_ADDRESS as Hex | undefined,
  USYC: undefined,
};

const ZERO_BYTES32 =
  "0x0000000000000000000000000000000000000000000000000000000000000000";

export const FX_REGISTRY_ABI = parseAbi([
  "function swap(address payer, address srcToken, address dstToken, uint256 srcAmount, uint256 minDstAmount, bytes32 expectedQuoteHash, bytes32 corridor, address recipient) returns (uint256 dstAmount)",
]);

export interface FxExecuteJob {
  /** Owning vendor (for logs + the optional DB quote row). */
  vendorId: string;
  /** fx_quotes.id — when present, gives the worker DB-backed idempotency. */
  quoteId?: string;
  /** Wallet that approved the registry + is debited `srcAmount`. */
  payer: string;
  /** Wallet that receives the destination token. */
  recipient: string;
  src: "USDC" | "EURC" | "USYC";
  dst: "USDC" | "EURC" | "USYC";
  /** 6-dp source amount (string to avoid JSON bigint loss). */
  srcAmount: string;
  /** Quoted destination amount; doubles as the slippage floor unless minDstAmount is set. */
  dstAmount: string;
  /** Optional explicit slippage floor (6-dp); defaults to dstAmount. */
  minDstAmount?: string;
  /** The adapter quote hash from registry.quote() — registry refuses bytes32(0). */
  quoteHash: string;
  /** Corridor label hashed into the policy check (defaults to the dst symbol). */
  corridor?: string;
}

export function startStableFxAdapter() {
  startWorker<FxExecuteJob>(
    "fx-execute",
    async (job) => {
      const {
        vendorId, quoteId, payer, recipient, src, dst,
        srcAmount, dstAmount, minDstAmount, quoteHash, corridor,
      } = job.data;
      log.info("fx.execute.step", { vendorId, src, dst, srcAmount, dstAmount });

      const wallet = arcWallet();
      const registry = env.STABLEFX_REGISTRY_ADDRESS;
      if (!wallet || !registry) {
        // No signer/registry. In prod this must fail loud — a configured FX
        // deployment with no operator signer would silently drop a settlement.
        requireArcWalletInProd(`stableFxAdapter.execute(${vendorId} ${src}->${dst})`);
        return; // dev with no chain wiring: nothing to mirror
      }

      // DB-backed idempotency: a BullMQ retry after a successful swap must never
      // re-execute (a second transfer = double-spend). A quote already stamped
      // 'executed' with a tx_hash is terminal.
      if (quoteId) {
        const { data: q, error } = await sb()
          .from("fx_quotes")
          .select("status, tx_hash")
          .eq("id", quoteId)
          .maybeSingle();
        if (error) throw error;
        if (q?.status === "executed" && q?.tx_hash) {
          log.info("fx.execute.already", { quoteId, tx: q.tx_hash });
          return;
        }
      }

      const srcToken = TOKENS[src];
      const dstToken = TOKENS[dst];
      if (!srcToken || !dstToken) {
        throw new Error(
          `fx_unsupported_token: ${src}->${dst} has no on-chain token address (only USDC<->EURC are live on testnet)`,
        );
      }
      if (!quoteHash || quoteHash === ZERO_BYTES32) {
        // The registry rejects the zero sentinel (EmptyQuoteHash) so the
        // adapter's stale-quote check can't be bypassed. Surface the real cause.
        throw new Error("fx_empty_quote_hash: producer must forward the adapter quoteHash from registry.quote()");
      }

      const floor = BigInt(minDstAmount ?? dstAmount);
      const corridorHash = keccak256(toHex(corridor ?? dst));
      const hash = await wallet.writeContract({
        address: registry as Hex,
        abi: FX_REGISTRY_ABI,
        functionName: "swap",
        args: [
          payer as Hex,
          srcToken,
          dstToken,
          BigInt(srcAmount),
          floor,
          quoteHash as Hex,
          corridorHash,
          recipient as Hex,
        ],
        chain: null,
        account: wallet.account!,
      });
      await arcPublic().waitForTransactionReceipt({ hash });
      log.info("fx.execute.onchain", { vendorId, src, dst, srcAmount, dstAmount, hash });

      // Mirror the settlement onto the DB quote (best-effort; the money already
      // moved on-chain, so a mirror blip must not fail the job into a re-swap —
      // the idempotency guard above keys on status+tx_hash, which we set here).
      if (quoteId) {
        const up = await sb()
          .from("fx_quotes")
          .update({
            status: "executed",
            tx_hash: hash,
            settled_at: new Date().toISOString(),
          })
          .eq("id", quoteId);
        if (up.error) {
          log.warn("fx.execute.mirror_failed", { quoteId, hash, err: up.error.message });
        }
      }
    },
    2,
  );
}
