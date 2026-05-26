import type { Address, Hex, PublicClient } from "viem";
import { AUDIT_RECEIPT_ABI } from "./abis";

export interface ReceiptVerifyResult {
  exists: boolean;
  anchor?: {
    invoiceId: Hex;
    invoiceHash: Hex;
    acceptanceHash: Hex;
    screeningHash: Hex;
    settlementTx: Hex;
    settledAt: bigint;
    sourceChainId: bigint;
    vendor: Address;
  };
}

export class Receipt {
  constructor(
    private auditReceipt: Address,
    private publicClient: PublicClient,
  ) {}

  /** True iff the receipt hash exists in `AuditReceipt`. */
  async verify(receiptHash: Hex): Promise<boolean> {
    return (await this.publicClient.readContract({
      address: this.auditReceipt,
      abi: AUDIT_RECEIPT_ABI,
      functionName: "verify",
      args: [receiptHash],
    })) as boolean;
  }

  /** Full anchor struct or `{ exists: false }`. */
  async load(receiptHash: Hex): Promise<ReceiptVerifyResult> {
    const exists = await this.verify(receiptHash);
    if (!exists) return { exists: false };
    const anchor = (await this.publicClient.readContract({
      address: this.auditReceipt,
      abi: AUDIT_RECEIPT_ABI,
      functionName: "anchorOf",
      args: [receiptHash],
    })) as ReceiptVerifyResult["anchor"];
    return { exists: true, anchor };
  }
}
