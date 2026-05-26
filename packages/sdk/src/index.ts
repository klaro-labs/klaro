/**
 * @klaro/sdk — TypeScript SDK for the Klaro payment OS on Arc.
 * Quick start:
 * import { KlaroClient } from "@klaro/sdk";
 * const klaro = new KlaroClient({
 * escrow: "0x...", // InvoiceEscrow address (after deploy)
 * receipt: "0x...", // AuditReceipt address
 * account: walletClient.account,
 * publicClient,
 * walletClient,
 * });
 * const inv = await klaro.invoices.create({ amount: 4_200_000_000n, dueAt: ... });
 * const acceptanceSig = await klaro.invoices.signAcceptance(inv.id, buyer);
 * Versioning: SDK v1.0 pins to contract ABI v1.0 in
 * `packages/contracts/abis/v1.0/`. Drift between this version + the
 * deployed addresses = bug in either side; ALWAYS-CHECK-DOCS rule applies.
 */

export {
  ARC_TESTNET_CHAIN_ID,
  ARC_TESTNET_RPC_URL,
  ARC_EXPLORER,
  ADDRESSES,
} from "./config";
export {
  INVOICE_ESCROW_ABI,
  AUDIT_RECEIPT_ABI,
  ERC20_ABI,
  ACCEPTANCE_EIP712_TYPES,
} from "./abis";
export { Invoices, type InvoiceCreateInput, type InvoiceRead } from "./invoice";
export { Receipt, type ReceiptVerifyResult } from "./receipt";
export { Cashout, type CashoutQuoteInput, type CashoutRead } from "./cashout";

import { Invoices } from "./invoice";
import { Receipt } from "./receipt";
import { Cashout } from "./cashout";
import type { Address, PublicClient, WalletClient } from "viem";

export interface KlaroClientConfig {
  escrow: Address;
  receipt: Address;
  cashout?: Address;
  publicClient: PublicClient;
  walletClient?: WalletClient;
}

export class KlaroClient {
  invoices: Invoices;
  receipt: Receipt;
  cashout?: Cashout;

  constructor(cfg: KlaroClientConfig) {
    this.invoices = new Invoices(
      cfg.escrow,
      cfg.publicClient,
      cfg.walletClient,
    );
    this.receipt = new Receipt(cfg.receipt, cfg.publicClient);
    if (cfg.cashout) {
      this.cashout = new Cashout(
        cfg.cashout,
        cfg.publicClient,
        cfg.walletClient,
      );
    }
  }
}
