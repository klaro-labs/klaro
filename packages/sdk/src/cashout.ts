import type { Address, Hex, PublicClient, WalletClient } from "viem";
import { ARC_TESTNET_CHAIN_ID } from "./config";

export interface CashoutQuoteInput {
  usdcAmount: bigint;
  currency: string; // ISO 4217, e.g. "INR"
}

export interface CashoutRead {
  vendor: Address;
  usdcAmount: bigint;
  payoutMinor: bigint;
  currency: string;
  status: number;
  quoteHash: Hex;
  quoteExpiresAt: bigint;
}

/** Minimal ABI — the Cashout flow has many states; SDK consumers usually
 * only need `requestAndLock` + `confirmReceived` + `openDispute` + view. */
const CASHOUT_ABI = [
  {
    type: "function",
    name: "requestAndLock",
    stateMutability: "nonpayable",
    inputs: [
      { name: "cashoutId", type: "bytes32" },
      { name: "usdcAmount", type: "uint256" },
      { name: "inrAmount", type: "uint256" },
      { name: "corridor", type: "bytes32" },
      { name: "quoteExpiresAt", type: "uint64" },
      { name: "quoteHash", type: "bytes32" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "confirmReceived",
    stateMutability: "nonpayable",
    inputs: [{ name: "cashoutId", type: "bytes32" }],
    outputs: [],
  },
  {
    type: "function",
    name: "openDispute",
    stateMutability: "nonpayable",
    inputs: [
      { name: "cashoutId", type: "bytes32" },
      { name: "openingEvidenceHash", type: "bytes32" },
    ],
    outputs: [],
  },
] as const;

export class Cashout {
  constructor(
    private addr: Address,
    private publicClient: PublicClient,
    private walletClient?: WalletClient,
  ) {}

  async requestAndLock(args: {
    cashoutId: Hex;
    usdcAmount: bigint;
    inrAmount: bigint;
    corridor: Hex;
    quoteExpiresAt: bigint;
    quoteHash: Hex;
  }): Promise<Hex> {
    if (!this.walletClient?.account) throw new Error("walletClient required");
    return await this.walletClient.writeContract({
      address: this.addr,
      abi: CASHOUT_ABI,
      functionName: "requestAndLock",
      args: [
        args.cashoutId,
        args.usdcAmount,
        args.inrAmount,
        args.corridor,
        args.quoteExpiresAt,
        args.quoteHash,
      ],
      chain: { id: ARC_TESTNET_CHAIN_ID } as { id: number },
      account: this.walletClient.account,
    });
  }

  async confirmReceived(cashoutId: Hex): Promise<Hex> {
    if (!this.walletClient?.account) throw new Error("walletClient required");
    return await this.walletClient.writeContract({
      address: this.addr,
      abi: CASHOUT_ABI,
      functionName: "confirmReceived",
      args: [cashoutId],
      chain: { id: ARC_TESTNET_CHAIN_ID } as { id: number },
      account: this.walletClient.account,
    });
  }

  async openDispute(cashoutId: Hex, openingEvidenceHash: Hex): Promise<Hex> {
    if (!this.walletClient?.account) throw new Error("walletClient required");
    return await this.walletClient.writeContract({
      address: this.addr,
      abi: CASHOUT_ABI,
      functionName: "openDispute",
      args: [cashoutId, openingEvidenceHash],
      chain: { id: ARC_TESTNET_CHAIN_ID } as { id: number },
      account: this.walletClient.account,
    });
  }
}
