/**
 * Arc public client (read-only) + operator wallet (signs txs from daemon).
 * Arc has deterministic single-shot finality, so we don't add a reorg buffer —
 * we act on the first commit.
 */
import {
  createPublicClient,
  createWalletClient,
  http,
  type PublicClient,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arcTestnet } from "viem/chains";
import { env } from "./env.js";

let _public: PublicClient | null = null;
export function arcPublic(): PublicClient {
  if (_public) return _public;
  _public = createPublicClient({
    chain: arcTestnet,
    // `arcTestnet` chain def omits `blockTime`, so viem's `watchEvent`
    // defaults to 4s polling (Ethereum block time). Arc has sub-second
    // deterministic finality, so we poll at 500ms — `screen-and-settle`
    // fires ~1s after `InvoicePaid` instead of ~4-8s.
    pollingInterval: 500,
    // RPC request-level timeout.
    // Without this a silently-dropped RPC connection blocks the worker
    // for Node's default fetch timeout while holding the BullMQ
    // concurrency slot. 15s ceiling + 2 retries keeps the worker
    // moving without blowing budget on a single bad node.
    transport: http(env.ARC_TESTNET_RPC_URL, {
      timeout: 15_000,
      retryCount: 2,
    }),
  });
  return _public;
}

let _wallet: WalletClient | null = null;
export function arcWallet(): WalletClient | null {
  if (_wallet) return _wallet;
  const pk = env.DAEMON_OPERATOR_PRIVATE_KEY;
  if (!pk) return null; // running in Circle Wallets mode (uses DAEMON_OPERATOR_WALLET_ID instead)
  const account = privateKeyToAccount(pk as `0x${string}`);
  _wallet = createWalletClient({
    account,
    chain: arcTestnet,
    // RPC request-level timeout.
    // Without this a silently-dropped RPC connection blocks the worker
    // for Node's default fetch timeout while holding the BullMQ
    // concurrency slot. 15s ceiling + 2 retries keeps the worker
    // moving without blowing budget on a single bad node.
    transport: http(env.ARC_TESTNET_RPC_URL, {
      timeout: 15_000,
      retryCount: 2,
    }),
  });
  return _wallet;
}

/// require an operator wallet OR a
/// Circle Wallets wallet id to be configured. In NODE_ENV=production,
/// fail-loud if neither is set — silent null return previously caused
/// workers to flip DB state to SETTLED/RELEASED without ever signing a
/// chain tx. Throwing here makes BullMQ retry the job + surface to DLQ
/// where PagerDuty fires (per Klaro — boring infra mandatory).
/// distinguish three failure
/// modes so the error message + operator runbook routing is honest:
/// 1. No wallet of any kind in prod → `operator_wallet_not_provisioned`
/// 2. Circle Wallets configured but daemon hasn't wired that signer
/// path yet → `circle_wallets_signer_not_wired` (a known gap, not
/// a misconfig — operator should run with PRIVATE_KEY until that
/// lands or skip this worker)
/// 3. Dev with no wallet → `arcWallet_unavailable` (developer task)
export function requireArcWalletInProd(where: string): WalletClient {
  const w = arcWallet();
  if (w) return w;
  const hasCircleWallet = Boolean(env.DAEMON_OPERATOR_WALLET_ID);
  if (env.NODE_ENV === "production" && hasCircleWallet) {
    throw new Error(
      `circle_wallets_signer_not_wired: ${where} — DAEMON_OPERATOR_WALLET_ID is set but the daemon-side Circle Wallets signer integration is pending. Set DAEMON_OPERATOR_PRIVATE_KEY for now or disable this worker.`,
    );
  }
  if (env.NODE_ENV === "production") {
    throw new Error(
      `operator_wallet_not_provisioned: ${where} requires DAEMON_OPERATOR_PRIVATE_KEY or DAEMON_OPERATOR_WALLET_ID in production`,
    );
  }
  throw new Error(`arcWallet_unavailable: ${where}`);
}
