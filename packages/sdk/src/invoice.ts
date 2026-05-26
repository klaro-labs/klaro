import type { Address, Hex, PublicClient, WalletClient } from "viem";
import { INVOICE_ESCROW_ABI, ACCEPTANCE_EIP712_TYPES } from "./abis";
import { ARC_TESTNET_CHAIN_ID } from "./config";

export interface InvoiceCreateInput {
  invoiceId: Hex;
  token: Address;
  amount: bigint;
  dueAt: bigint; // unix seconds
  metadataHash: Hex;
}

export interface InvoiceRead {
  vendor: Address;
  token: Address;
  amount: bigint;
  dueAt: bigint;
  acceptedAt: bigint;
  acceptedBy: Address;
  metadataHash: Hex;
  screeningHash: Hex;
  splitsHash: Hex;
  status: number; // 0..6 mirrors InvoiceEscrow.Status enum
}

export class Invoices {
  constructor(
    private escrow: Address,
    private publicClient: PublicClient,
    private walletClient?: WalletClient,
  ) {}

  async create(input: InvoiceCreateInput): Promise<Hex> {
    if (!this.walletClient?.account)
      throw new Error("walletClient with account required for create");
    return await this.walletClient.writeContract({
      address: this.escrow,
      abi: INVOICE_ESCROW_ABI,
      functionName: "createInvoice",
      args: [
        input.invoiceId,
        input.token,
        input.amount,
        input.dueAt,
        input.metadataHash,
      ],
      chain: { id: ARC_TESTNET_CHAIN_ID } as { id: number },
      account: this.walletClient.account,
    });
  }

  async get(invoiceId: Hex): Promise<InvoiceRead> {
    const raw = await this.publicClient.readContract({
      address: this.escrow,
      abi: INVOICE_ESCROW_ABI,
      functionName: "getInvoice",
      args: [invoiceId],
    });
    return raw as InvoiceRead;
  }

  /** Sign buyer acceptance off-chain. Buyer's wallet returns the EIP-712 sig.
   * Pass to `acceptAndPay()` along with the buyer address. */
  async signAcceptance(invoiceId: Hex, buyer: Address): Promise<Hex> {
    if (!this.walletClient?.account)
      throw new Error("walletClient required for sign");
    const inv = await this.get(invoiceId);
    return await this.walletClient.signTypedData({
      account: this.walletClient.account,
      domain: {
        name: "Klaro Invoice",
        version: "1",
        chainId: ARC_TESTNET_CHAIN_ID,
        verifyingContract: this.escrow,
      },
      types: ACCEPTANCE_EIP712_TYPES,
      primaryType: "InvoiceAcceptance",
      message: {
        invoiceId,
        vendor: inv.vendor,
        token: inv.token,
        amount: inv.amount,
        dueAt: inv.dueAt,
        metadataHash: inv.metadataHash,
        splitsHash: inv.splitsHash,
      },
    });
  }

  async acceptAndPay(
    invoiceId: Hex,
    signature: Hex,
    buyer: Address,
  ): Promise<Hex> {
    if (!this.walletClient?.account) throw new Error("walletClient required");
    return await this.walletClient.writeContract({
      address: this.escrow,
      abi: INVOICE_ESCROW_ABI,
      functionName: "acceptAndPay",
      args: [invoiceId, signature, buyer],
      chain: { id: ARC_TESTNET_CHAIN_ID } as { id: number },
      account: this.walletClient.account,
    });
  }
}
