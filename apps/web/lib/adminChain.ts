/**
 * Server-only admin on-chain control (build #7). The /api/admin/pause route used
 * to throw `pause_not_yet_wired` in live mode — false confidence during an
 * incident (green UI while escrows kept accepting tx). This signs the real
 * `pause()` / `unpause()` against each deployed Pausable contract.
 *
 * `pause()` is onlyOwner; on testnet the owner is the deployer EOA (0xAD57…),
 * the same key, so a dedicated ADMIN_PAUSE_PRIVATE_KEY (server-only) signs it.
 * NEVER import from client code — it reads a private key.
 */
import { createWalletClient, http, parseAbi, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arcTestnet } from "viem/chains";
import { ARC_TESTNET_RPC_URL } from "./env";
import { getArcPublicClient } from "./arcClient";

const PAUSABLE_ABI = parseAbi([
  "function pause() external",
  "function unpause() external",
  "function paused() view returns (bool)",
]);

// Maps the admin enum → deployed Pausable addresses (DEPLOYMENT.md). The new
// fee-bearing CashoutOrderProcessor is the live one. NEXT_PUBLIC vars win when
// set (so the address can rotate without a code change).
function addresses(contract: string): Hex[] {
  const E = (k: string, fallback: string) =>
    (process.env[k]?.trim() || fallback) as Hex;
  const map: Record<string, Hex> = {
    invoice: E(
      "NEXT_PUBLIC_INVOICE_ESCROW_ADDRESS",
      "0xA76edAd6e1c0D0854a21BF527086CA44b620c4e2",
    ),
    cashout: E(
      "NEXT_PUBLIC_CASHOUT_ORDER_PROCESSOR_ADDRESS",
      "0x347935A89B95fD2baD736dbADe4C14b0a5e9E6bd",
    ),
    agent: E(
      "NEXT_PUBLIC_AGENT_ESCROW_ADDRESS",
      "0xedCd31c0B7f40585342047c90fB0f8Eabb99AcdD",
    ),
    retainer: E(
      "NEXT_PUBLIC_RETAINER_STREAM_ADDRESS",
      "0xD6891F3E074F80Ea54a25E68009eDA1a1AdC360A",
    ),
    fx: E(
      "NEXT_PUBLIC_STABLEFX_REGISTRY_ADDRESS",
      "0x9B8336c7a0B593A829A9b7F2eA83f7b7BB51A936",
    ),
  };
  return contract === "all"
    ? Object.values(map)
    : [map[contract]].filter(Boolean);
}

export function adminPauseLive(): boolean {
  return Boolean(process.env.ADMIN_PAUSE_PRIVATE_KEY);
}

export interface PauseResult {
  address: Hex;
  txHash?: Hex;
  status: "paused" | "unpaused" | "already" | "failed";
  error?: string;
}

/** Operator-signed pause/unpause over the targeted Pausable contracts. Each is
 * idempotent (skips if already in the desired state) and isolated (one revert
 * doesn't abort the rest — the result array reports per-contract outcome). */
export async function setContractsPaused(
  contract: string,
  action: "pause" | "unpause",
): Promise<PauseResult[]> {
  const key = process.env.ADMIN_PAUSE_PRIVATE_KEY as Hex | undefined;
  if (!key)
    throw new Error(
      "admin_pause_not_configured: ADMIN_PAUSE_PRIVATE_KEY unset",
    );
  const account = privateKeyToAccount(key);
  const wallet = createWalletClient({
    account,
    chain: arcTestnet,
    transport: http(ARC_TESTNET_RPC_URL),
  });
  const pub = getArcPublicClient();
  const want = action === "pause";

  const out: PauseResult[] = [];
  for (const address of addresses(contract)) {
    try {
      const isPaused = (await pub.readContract({
        address,
        abi: PAUSABLE_ABI,
        functionName: "paused",
      })) as boolean;
      if (isPaused === want) {
        out.push({ address, status: "already" });
        continue;
      }
      const txHash = await wallet.writeContract({
        address,
        abi: PAUSABLE_ABI,
        functionName: action,
        gas: 120_000n,
      });
      const rcpt = await pub.waitForTransactionReceipt({ hash: txHash });
      if (rcpt.status !== "success") throw new Error("tx reverted");
      out.push({
        address,
        txHash: txHash as Hex,
        status: want ? "paused" : "unpaused",
      });
    } catch (e) {
      out.push({ address, status: "failed", error: (e as Error).message });
    }
  }
  return out;
}
